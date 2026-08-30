# LOCAL_PATCHES — 本地补丁与维护记录

> 本文件记录本仓库相对于上游 main 的**本地手动合入与自定义修复**,供日后升级、排查、回退时查阅。
> 基线:上游 tag **v1.0.0-rc.27**(commit `eb48396d`)。

---

## 1. 当前版本与命名方案

- 镜像 tag / VERSION 采用 **`v1.0.0-rc.27-<序号>`** 增量命名,每次在此分支上新增改动后构建,序号递增。
- 当前为 **`v1.0.0-rc.27-1`**(含 PR 6808 + PR 6904 + fix6649 + 快速路径)。
- 后续改动后依次 `-2`、`-3`…

---

## 2. 合入的上游 PR(官方 main **尚未合并**,处于 OPEN)

### 2.1 PR #6808 — 正常完成的流不被误标 client_gone
- **上游状态**: OPEN(未合入 main)
- **本地 merge commit**: `5a6f7957`
- **改动文件**:
  - `relay/common/stream_status.go` — `SetEndReason` 由 `sync.Once` 改为 mutex + `reasonSet`,允许正常完成(`Done`/`EOF`)纠正早先记录的 `client_gone`
  - `relay/helper/stream_scanner.go` — scanner 错误处理 + 客户端断开分支守卫
  - `relay/helper/stream_scanner_test.go` — 回归测试
- **解决的问题**: 客户端(codex 等)收到最后一个 SSE 事件后立即关闭连接,主 select 抢在 scanner 记录结束原因前写入 `client_gone`(issue #6649)。

### 2.2 PR #6904 — Responses 流在终态事件标记完成
- **上游状态**: OPEN(未合入 main)
- **本地 merge commit**: `6bb9ed81`
- **改动文件**:
  - `relay/channel/openai/relay_responses.go` — 收到 `response.completed`/`response.done` 时调用 `sr.Done()`
  - `relay/channel/openai/relay_responses_stream_test.go` — 回归测试
- **解决的问题**: `/v1/responses` 的 SSE 没有 `data: [DONE]` 哨兵,上游发完终态事件后静默直到自己关连接;适配器层主动标记 `done`,不再依赖上游 EOF 与客户端关闭的赛跑。**治本修复**(上游连接不关闭时也有效)。

---

## 3. 本地自定义修复(上游无此改动)

### 3.1 fix6649 — stream_scanner.go 宽限期(client_gone 残留竞争)
- **文件**: `relay/helper/stream_scanner.go`(本地未提交,工作区改动)
- **原理**: PR 6808 只修复"scanner 已读到 Done/EOF 但记录晚"的竞争;仍存在"scanner 还没读到 Done/EOF 就被 `resp.Body.Close()` 强制中断"的窗口。修复:
  - 新增 `scannerDone chan struct{}`,scanner goroutine 退出时关闭
  - 新增 `streamClientGoneGrace = 500ms`
  - 主 select 的 `client_gone` 分支改为:等 `scannerDone` 或宽限期到期,再判 `client_gone`(而不是立即关闭 body)
- **测试**: `TestStreamScannerHandler_CompletedStreamNotRelabeledOnClientGone`(EOF 稍后到达场景)

### 3.2 快速路径 — 已标记 done 时不等 grace
- **文件**: `relay/helper/stream_scanner.go`(本地未提交,工作区改动)
- **原理**: 合入 #6904 后,适配器已在终态事件标记 `done`;若此时客户端断开而 scanner 仍阻塞等 EOF(上游不关连接),`client_gone` 分支会白等 500ms。加回 `IsNormalEnd()` 守卫:已正常结束直接放行。
- **测试**: `TestStreamScannerHandler_CompletedStreamSkipsGraceOnClientGone`

---

## 4. 三层防线(针对 client_gone 误标)

| 层 | 来源 | 作用 |
|----|------|------|
| 适配器标记 done | PR #6904 | 收到 `response.completed` 即完成,不依赖 EOF(治本) |
| grace 宽限 | fix6649 | 上游关连接但 EOF 慢时,给 scanner 500ms 读完 |
| override 纠正 | PR #6808 | 正常完成纠正早先的 client_gone 记录 |

---

## 5. 测试

```bash
# 本地跑测试(GOWORK=off,go 在 C:\Program Files\Go\bin)
go test ./relay/helper/... -run "ClientGone|ClientCancel|CompletedStream|SkipsGrace" -v
go test ./relay/channel/openai/ -run "MarksDoneOnCompleted" -v
```

---

## 6. 维护方式(重要)

### 6.1 分支结构
- **官方 release**:用官方 tag 原样保留,不做任何改动(如 `v1.0.0-rc.27` → `eb48396d`)。
- **本地维护分支**:`lisrain/rcXX-patched`(当前 `lisrain/rc27-patched` → `0b16c372`),包含全部本地合入与自定义修复。
- **官方发新 release(如 rc28/rc29)时的跟进流程**:
  1. `git fetch origin` 拉取官方新 tag
  2. 基于官方新 tag 建本地分支:`git switch -c lisrain/rc28-patched v1.0.0-rc.28`
  3. 按需 cherry-pick 本地补丁:`5a6f7957`(#6808)、`6bb9ed81`(#6904)、`0b16c372`(fix6649 + 快速路径 + 文档);官方已合入的跳过对应 commit
  4. 处理可能的冲突(尤其 `relay/helper/stream_scanner.go` 是本地改过的)
  5. 递增 VERSION 序号 → 构建镜像 → 更新 compose

**在官方合入 #6808 / #6904 之前**,每次部署新版本都需**在本分支基础上**:

1. 以当前 HEAD(`v1.0.0-rc.27-1` 对应状态)为基
2. 手动 `git merge`/`cherry-pick` 需要的上游 PR 分支(`gh pr diff <n>` 或 fetch `refs/pull/<n>/head`)
3. 保留本地 `relay/helper/stream_scanner.go` 的自定义改动(fix6649 + 快速路径)——与上游 PR 不冲突(不同文件)
4. `echo "v1.0.0-rc.27-N" > VERSION`(序号递增)→ `docker build -t calciumion/new-api:v1.0.0-rc.27-N .`
5. 更新 `H:\Softs\newapi\docker-compose.yml` 的 `image:` 引用

**待官方将 #6808、#6904 合入 main 后**,可直接切到官方新 release 基线,届时本地的 stream_scanner 自定义改动可作为对比参考逐步收敛。**当前工作区未提交改动**(`stream_scanner.go`、`stream_scanner_test.go`、`VERSION`)建议及时 commit 存档。

---

## 7. 其他值得关注的上游开放 PR(未合入,按需评估)

- #7092 codex 非法工具调用导致"继续就断流"(relaykit)
- #7066 上游流中途失败时向客户端发终态错误事件
- #6960 模型限流器静默失效不恢复(稳定性)
- #6913 / #6979 订阅计费修复
- #7088 Responses item 集合规范化
- #7033 SSE 帧立即转发(首字延迟优化)
