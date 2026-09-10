# LOCAL_PATCHES — 本地补丁与维护记录

> 本文件记录本仓库相对于上游 main 的**本地手动合入与自定义修复**,供日后升级、排查、回退时查阅。
> 基线:上游 tag **v1.0.0-rc.36**(commit `ea7cb0ba4`)。

---

## 1. 当前版本与命名方案

- 镜像 tag / VERSION 采用 **`v1.0.0-rc.36-<序号>`** 增量命名,每次在此分支上新增改动后构建,序号递增。
- 当前为 **`v1.0.0-rc.36-1`**(基于官方 rc.36,合入 PR 6808 + PR 6904 + fix6649 + 快速路径 + 概览页设置引导开关)。
- 后续改动后依次 `-2`、`-3`…
- **跟进记录**: 本次由 rc.32 → rc.36(官方连发 rc.33/rc.34/rc.35/rc.36,区间 40 个 commit),基于官方 `v1.0.0-rc.36` 重建本地维护分支 `lisrain/rc36-patched` 并重新 cherry-pick 全部本地补丁。上游 rc.32→rc.36 期间**未改动** `relay/common/stream_status.go`、`relay/helper/stream_scanner.go`、`relay/channel/openai/relay_responses.go`、`setting/console_setting/config.go`、`use-status-data.ts` 及 system-settings/i18n 各文件,且 #6808/#6904 仍未合入 main,故四个补丁均顺利应用。两处自动合并:`stream_scanner_test.go`(官方仅 `for i:=0;i<n;i++` → `for i:=range n` 风格改动,与本地新增测试函数无冲突)、`controller/misc.go`(官方重构 `SendEmailVerification`、新增 `telegram_oauth_configured` 键,与本地 status map 尾部新增 `setup_guide_enabled` 键无重叠)。一处手动解决:`overview-dashboard.tsx` 官方重构为 `<SectionPageLayout>` 三段式结构(标题栏完成态切换按钮 + `hidden` 展开容器 + 折叠提示条,并新增 `useId`/`useRef`/aria 可访问性),本地 `setupGuideEnabled &&` 守卫在**三个渲染位置**逐一重放(标题栏按钮条件前置、展开容器加 `hidden={!setupGuideExpanded || !setupGuideEnabled}` 且内部条件前置、折叠条条件前置),效果与原补丁一致:管理员关闭开关时三种形态均不渲染。注意官方 tag 的 `VERSION` 为空文件(官方靠 CI 注入),本地构建必须自行写入。

---

## 2. 合入的上游 PR(官方 main **尚未合并**,处于 OPEN)

### 2.1 PR #6808 — 正常完成的流不被误标 client_gone
- **上游状态**: OPEN(未合入 main)
- **本地 rc.32 分支 commit**: `a38949e1`;**rc.36 分支重新 cherry-pick**: `f9c13cb0e`
- **改动文件**:
  - `relay/common/stream_status.go` — `SetEndReason` 由 `sync.Once` 改为 mutex + `reasonSet`,允许正常完成(`Done`/`EOF`)纠正早先记录的 `client_gone`
  - `relay/helper/stream_scanner.go` — scanner 错误处理 + 客户端断开分支守卫
  - `relay/helper/stream_scanner_test.go` — 回归测试
- **解决的问题**: 客户端(codex 等)收到最后一个 SSE 事件后立即关闭连接,主 select 抢在 scanner 记录结束原因前写入 `client_gone`(issue #6649)。

### 2.2 PR #6904 — Responses 流在终态事件标记完成
- **上游状态**: OPEN(未合入 main)
- **本地 rc.30 分支 commit**: `e73fb75c`;rc.32 分支: `d1c222a9`;**rc.36 分支重新 cherry-pick**: `52793c6fd`
- **改动文件**:
  - `relay/channel/openai/relay_responses.go` — 收到 `response.completed`/`response.done` 时调用 `sr.Done()`
  - `relay/channel/openai/relay_responses_stream_test.go` — 回归测试
- **解决的问题**: `/v1/responses` 的 SSE 没有 `data: [DONE]` 哨兵,上游发完终态事件后静默直到自己关连接;适配器层主动标记 `done`,不再依赖上游 EOF 与客户端关闭的赛跑。**治本修复**(上游连接不关闭时也有效)。
- **兼容注意**: 官方 rc.32(#7137)已把本文件 usage 归一改为 `relayconvert.NormalizeResponsesUsage` + `dto.MergeUsageNonZero`,本补丁只补终态标记,二者共存;回归测试在官方 usage 重构代码上通过。

---

## 3. 本地自定义修复(上游无此改动)

### 3.1 fix6649 — stream_scanner.go 宽限期(client_gone 残留竞争)
- **文件**: `relay/helper/stream_scanner.go`
- **rc.30 分支 commit**: `b0be69f3`;rc.32 分支: `fea6ed32`;**rc.36 分支重新 cherry-pick**: `bcc1a15d3`(仅代码+测试;`VERSION`/本文件不随该 commit,由文档维护提交统一更新)
- **原理**: PR 6808 只修复"scanner 已读到 Done/EOF 但记录晚"的竞争;仍存在"scanner 还没读到 Done/EOF 就被 `resp.Body.Close()` 强制中断"的窗口。修复:
  - 新增 `scannerDone chan struct{}`,scanner goroutine 退出时关闭
  - 新增 `streamClientGoneGrace = 500ms`
  - 主 select 的 `client_gone` 分支改为:等 `scannerDone` 或宽限期到期,再判 `client_gone`(而不是立即关闭 body)
- **测试**: `TestStreamScannerHandler_CompletedStreamNotRelabeledOnClientGone`(EOF 稍后到达场景)

### 3.2 快速路径 — 已标记 done 时不等 grace
- **文件**: `relay/helper/stream_scanner.go`
- **原理**: 合入 #6904 后,适配器已在终态事件标记 `done`;若此时客户端断开而 scanner 仍阻塞等 EOF(上游不关连接),`client_gone` 分支会白等 500ms。加回 `IsNormalEnd()` 守卫:已正常结束直接放行。
- **测试**: `TestStreamScannerHandler_CompletedStreamSkipsGraceOnClientGone`

### 3.3 本地功能:概览页设置引导显示开关
- **rc.30 分支 commit**: `9d998814`;rc.32 分支: `8d67c8db`;**rc.36 分支重新 cherry-pick**: `88cf31599`(含 overview-dashboard.tsx 手动冲突解决)
- **背景**: 概览页顶部"设置引导"组件(展开态含上手步骤卡片 + 推荐操作,折叠态为紧凑提示条)原本只受用户浏览器 localStorage 控制(展开/收起),管理员无法全局关闭。
- **改动**: 系统设置 → 内容 → 概览 新增"显示设置引导"开关;新增后端配置项 `console_setting.setup_guide_enabled`(bool,默认 `true`);`/api/status` 返回该标志;概览页据此隐藏整个设置引导组件(展开/折叠形态均不渲染),用量卡片等其余内容不受影响。
- **实现**: 完全沿用现有 `api_info_enabled` 等概览面板开关链路(后端反射配置 → `/api/status` → 前端 `useStatus` → 渲染条件),无需改动 option/config 通用层(`handleConfigUpdate` 按 json tag 反射读写 `console_setting.*`)。
  - 后端: `setting/console_setting/config.go`(新增字段)、`controller/misc.go`(status 返回)
  - 前端: `web/src/features/system-settings/content/overview-section.tsx`(新建,开关 UI)、`content/{index.tsx, section-registry.tsx, types.ts}`(注册与默认值)、`hooks/use-update-option.ts`(STATUS_RELATED_KEYS 加入该键,保存后立即刷新 status)、`dashboard/hooks/use-status-data.ts`(新增 setupGuide 可见性)、`dashboard/components/overview/overview-dashboard.tsx`(渲染条件)、i18n 全部语言文件
- **升级注意**: rc.36 官方把概览页设置引导重构为 `<SectionPageLayout>` 三段式(标题栏切换按钮 / `hidden` 展开容器 / 折叠条,新增 aria 可访问性);本地守卫已在三个渲染位置逐一重放。若官方后续再次重构概览页或系统设置面板,需重新评估/迁移该开关。

---

## 4. 三层防线(针对 client_gone 误标)

| 层 | 来源 | 作用 |
|----|------|------|
| 适配器标记 done | PR #6904 | 收到 `response.completed` 即完成,不依赖 EOF(治本) |
| grace 宽限 | fix6649 | 上游关连接但 EOF 慢时,给 scanner 500ms 读完 |
| override 纠正 | PR #6808 | 正常完成纠正早先的 client_gone 记录 |

---

## 5. 测试(统一在 docker 内执行)

> Windows 本机 `H:` 盘未加入 Docker 文件共享,且本机 Go 版本与项目要求可能不一致,**编译与测试一律在 docker build 内完成**(官方 Dockerfile 后端用 golang:1.26.1-alpine)。

```bash
# 1) 容器内跑后端回归测试 + relaykit 独立构建(临时 Dockerfile.test,用完即删)
docker build -f Dockerfile.test -t newapi-test:rc36 .
#    Dockerfile.test 内容(重要:FROM/ENV/ARG/ADD/RUN 链必须与官方 Dockerfile 的
#    builder2 阶段完全一致,go mod download 层才能与正式构建共享缓存;
#    2026-09-10 rc.36 跟进时因 ENV 链不一致,测试与正式构建各下载了一份 ~1.5GB 模块):
#
#    FROM golang:1.26.1-alpine@sha256:2389ebfa5b7f43eeafbd6be0c3700cc46690ef842ad962f6c5bd6be49ed82039 AS builder2
#    ENV GO111MODULE=on CGO_ENABLED=0 GOWORK=off
#    ARG TARGETOS
#    ARG TARGETARCH
#    ENV GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64}
#    ENV GOEXPERIMENT=greenteagc
#    WORKDIR /build
#    ADD go.mod go.sum ./
#    ADD relaykit/go.mod ./relaykit/go.mod
#    RUN go mod download
#    COPY . .
#    RUN go test ./relay/helper/...  -run "ClientGone|ClientCancel|CompletedStream|SkipsGrace" -v \
#     && go test ./relay/channel/openai/ -run "MarksDoneOnCompleted" -v \
#     && go test ./relay/common/... -count=1 \
#     && cd relaykit && go build ./...   (AGENTS.md 要求)
#
#    注意:上游发版若改了 go.mod/go.sum,go mod download 必然重新下载(层缓存失效),属正常现象。
#    测试镜像(newapi-test:*)用完即删(约 2.8GB);构建缓存可用
#    docker builder prune -a -f --filter until=48h 定期清理。

# 2) 构建正式镜像(前端 bun build + 后端 go build 全量编译)
docker build -t calciumion/new-api:v1.0.0-rc.36-1 .

# 3) 冒烟:临时容器探测 /api/status(不映射端口,避免占用 3000)
docker run -d --rm --name newapi-smoke calciumion/new-api:v1.0.0-rc.36-1
docker exec newapi-smoke wget -q -O - http://localhost:3000/api/status   # 应含 "success":true、"setup_guide_enabled":true
docker rm -f newapi-smoke

# 4) 替换部署:更新 C:\Users\Lenovo\Desktop\AIProxy\newapi\docker-compose.yml 的 image: 引用后 docker compose up -d
```

---

## 6. 维护方式(重要)

### 6.1 分支结构
- **官方 release**:用官方 tag 原样保留,不做任何改动(如 `v1.0.0-rc.36` → `ea7cb0ba4`)。
- **本地维护分支**:`lisrain/rcXX-patched`。当前 `lisrain/rc36-patched`,包含全部本地合入与自定义修复:
  - `f9c13cb0e` merge PR #6808(上游 OPEN)
  - `52793c6fd` merge PR #6904(上游 OPEN)
  - `bcc1a15d3` fix6649 + 快速路径 + 回归测试(本地自定义,上游无;`VERSION`/本文件统一在文档维护提交里更新)
  - `88cf31599` 概览页设置引导开关(本地功能,上游无,含 overview-dashboard.tsx 手动冲突解决)
  - 基线 `ea7cb0ba4`(v1.0.0-rc.36)
- 历史分支 `lisrain/rc32-patched`(→ `4756876f`,基于 rc.32,含 4 补丁)已删除,备份 tag **`backup/lisrain-rc32-patched`**(指向 `4756876f`)可随时恢复。
- 历史分支 `lisrain/rc30-patched`(→ `b0e476a0`,基于 rc.30,含 4 补丁)已删除,备份 tag **`backup/lisrain-rc30-patched`**(指向 `b0e476a0`)可随时恢复。
- 历史分支 `lisrain/rc27-patched`(→ `89ea2020`,基于 rc.27)已删除,备份 tag **`backup/lisrain-rc27-patched`**(指向 `89ea2020`)可随时恢复。

**在官方合入 #6808 / #6904 之前**,每次部署新版本都需**在本分支基础上**:

1. 以当前 HEAD 为基
2. 手动 `git merge`/`cherry-pick` 需要的上游 PR 分支(`gh pr diff <n>` 或 fetch `refs/pull/<n>/head`)
3. 保留本地 `relay/helper/stream_scanner.go` 的自定义改动(fix6649 + 快速路径)——与上游 PR 不冲突(不同文件)
4. `echo "v1.0.0-rc.36-N" > VERSION`(序号递增)→ `docker build -t calciumion/new-api:v1.0.0-rc.36-N .`
5. 更新 `C:\Users\Lenovo\Desktop\AIProxy\newapi\docker-compose.yml` 的 `image:` 引用

**待官方将 #6808、#6904 合入 main 后**,可直接切到官方新 release 基线,届时本地的 stream_scanner 自定义改动可作为对比参考逐步收敛。`stream_scanner.go`/`stream_scanner_test.go` 已随 `bcc1a15d3` 提交,概览引导开关已随 `88cf31599` 提交,工作区保持干净。

### 6.2 官方发新 release(如 rc.37/rc.38)时的跟进流程
1. `git fetch origin` 拉取官方新 tag
2. 基于官方新 tag 建本地分支:`git switch -c lisrain/rc37-patched v1.0.0-rc.37`
3. 按需 cherry-pick 本地补丁(以下 rc.36 分支 hash):`f9c13cb0e`(#6808)、`52793c6fd`(#6904)、`bcc1a15d3`(fix6649 + 快速路径)、`88cf31599`(概览页设置引导开关,本地功能,官方无);官方已合入的跳过对应 commit
4. 处理可能的冲突(尤其 `relay/helper/stream_scanner.go` 是本地改过的;`controller/misc.go` 若官方在 status map 新增键需留意上下文合并;`overview-dashboard.tsx` 官方 rc.36 已重构为三段式,若官方继续重构需保留三处 `setupGuideEnabled` 守卫;`relay/channel/openai/relay_responses.go` 若官方继续重构 usage/终态处理需保留 `sr.Done()` 语义)
5. 递增 VERSION 序号 → 构建镜像 → 更新 compose

---

## 7. 其他值得关注的上游开放 PR(未合入,按需评估)

> 2026-09-10 复查(rc.36 跟进):以下除注明外仍全部 OPEN,官方 rc.36 均未吸收。

- #7092 ~~codex 非法工具调用导致"继续就断流"(relaykit)~~ — **已 CLOSED**(未合并,标题改为 drop empty `function_call.name` in Responses conversion;上游未吸收,功能诉求后续另行评估)
- #7066 上游流中途失败时向客户端发终态错误事件
- #6960 模型限流器静默失效不恢复(稳定性)
- #6913 / #6979 订阅计费修复
- #7088 Responses item 集合规范化
- #7033 SSE 帧立即转发(首字延迟优化)
