# LOCAL_PATCHES — 本地补丁与维护记录

> 本文件记录本仓库相对于上游 main 的**本地手动合入与自定义修复**,供日后升级、排查、回退时查阅。
> 基线:上游 tag **v1.0.0-rc.38**(commit `2906e4f77`)。

---

## 1. 当前版本与命名方案

- 镜像 tag / VERSION 采用 **`v1.0.0-rc.38-<序号>`** 增量命名,每次在此分支上新增改动后构建,序号递增。
- 当前为 **`v1.0.0-rc.38-1`**(基于官方 rc.38,合入 PR 6808 + PR 6904 + fix6649 + 快速路径 + 概览页设置引导开关 + 构建换行修复)。
- **2026-09-19 本次跟进未编译镜像**:仅拉取代码、完成补丁存废判定与合入、同步文档。构建与冒烟步骤见第 5 节,下次直接执行即可。
- **跟进记录**: rc.32 → rc.36 → rc.38(本次跨官方 rc.37、rc.38 两个 release)。

### 1.1 rc.38 补丁存废判定(2026-09-19)

官方 rc.38 引入了一套**协议结果分类**体系(`relay/common/stream_status.go` 新增 `ResponseOutcome` 常量、`MarkCompleted/MarkFailed/MarkIncomplete/MarkCancelled/RequireTerminal` 方法与 `OutcomeSnapshot`),表面上看会取代本地补丁,**实际不能取代**——二者处在不同层:

| 本地补丁 | 官方 rc.38 现状 | 判定 |
|---|---|---|
| PR #6808(`SetEndReason` 由 `sync.Once` 改为 mutex + `reasonSet`,允许正常完成纠正早先的 `client_gone`) | `SetEndReason` **仍是 `sync.Once`**;新增的 `ResponseOutcome` 是独立字段,**不写 `EndReason`** | **保留** |
| PR #6904(Responses 终态事件标记 `sr.Done()`) | 原 `case "response.completed", "response.done":` switch 被删除,改为 `service.ResponsesUsageAccumulator`;`ObserveResponsesOutcome` 只调 `MarkCompleted()`(写 `ResponseOutcome`,**不写 `EndReason`**) | **保留,且必须迁移**(见 2.2) |
| fix6649(`scannerDone` + 500ms 宽限期) | `StreamScannerHandler` 主 select 的 `client_gone` 分支**原样未动**,仍是立即 `SetEndReason(ClientGone)` | **保留** |
| 快速路径(`IsNormalEnd()` 守卫) | `IsNormalEnd()` 仍在,语义未变 | **保留** |
| 概览页设置引导开关(本地功能) | 官方未改 `system-settings/content/` 目录 | **保留**(另有一处前端规范对齐,见 3.3) |

**为什么 `ResponseOutcome` 替代不了本地补丁**:它当前的唯一消费者是 `pkg/perf_metrics/outcome.go`(渠道健康度分类)。而 `EndReason` 另有更硬的消费点,误标有实际后果:

- `relay/channel/openai/relay_image.go:174,187` —— `EndReason == Done` 决定是否给客户端补发 `data: [DONE]`,以及 `upstreamFinished` 是否采纳实际完成张数(`UpdateImageCount`)。误标会同时影响图片计费口径与客户端终止感知。
- `relay/channel/gemini/relay-gemini.go:265`(`isGeminiDownstreamStop`)、`relay/channel/gemini/relay_responses.go:160`。
- `service/log_info_generate.go:168` —— 消费日志的 `end_reason` 字段。

**官方自身的遗漏(本次最值得关注的发现)**:rc.38 新增的 WebSocket 路径 `relay/responses_websocket.go:428,462` **自己就调用了** `info.StreamStatus.SetEndReason(relaycommon.StreamEndReasonDone, nil)` —— 官方给 WS 路径做了终态标记,**却没有同步到 HTTP SSE 路径**(`relay/channel/openai/relay_responses.go`)。本地 #6904 补的正是这个缺口。
另:社区存在与 #6904 方案相同的同源 PR **#6951**(`fix(openai): 正确结束 Responses 流`,2026-08-20),至今 OPEN 未被吸收。

**官方本区间修掉的相关问题(与本地补丁互补,不冲突)**:

- **#7427**(rc.38 已合入,owner @Calcium-Ion):`fix(responses): estimate usage for streams cut before terminal usage` —— 修的是"Responses 流在终态事件前断开且无 usage 时估算为 0、预扣全额退回"的**计费侧**问题,改动 `service/responses_usage.go`。与本地补丁不在同一层,可共存。
- **#5062**(rc.38 已合入):`Add Responses WebSocket relay support` —— 新增 `/v1/responses` WebSocket 中继。注意它**不走** `helper.StreamScannerHandler`,自带 inbox/idle timer 与 `SetEndReason` 逻辑,因此 fix6649 的宽限期**只覆盖 HTTP SSE 路径**,不影响 WS 路径。

---

## 2. 合入的上游 PR(官方 main **尚未合并**,处于 OPEN)

### 2.1 PR #6808 — 正常完成的流不被误标 client_gone
- **上游状态**: OPEN(未合入 main)
- **本地 rc.32 分支 commit**: `a38949e1`;rc.36 分支: `f9c13cb0e`;**rc.38 分支重新 cherry-pick**: `2eeb86632`
- **改动文件**:
  - `relay/common/stream_status.go` — `SetEndReason` 由 `sync.Once` 改为 mutex + `reasonSet`,允许正常完成(`Done`/`EOF`)纠正早先记录的 `client_gone`;`IsNormalEnd()`/`Summary()` 一并加锁
  - `relay/helper/stream_scanner.go` — scanner 错误处理(`err != nil && err != io.EOF` 才记 scanner_error,否则记 EOF)+ 客户端断开分支守卫
  - `relay/helper/stream_scanner_test.go` — 回归测试
- **解决的问题**: 客户端(codex 等)收到最后一个 SSE 事件后立即关闭连接,主 select 抢在 scanner 记录结束原因前写入 `client_gone`(issue #6649)。
- **rc.38 冲突情况**: `stream_status.go`、`stream_scanner.go` 自动合并;`stream_scanner_test.go` 内容冲突(官方新增的 `TestNewStreamScannerCallerLimit` 与本地新增测试在同一位置),已手工保留**双方**测试。合并后 `StreamStatus` 结构为官方新增字段 + 本地 `reasonSet` 共存,**共用同一个 `mu`**。

### 2.2 PR #6904 — Responses 流在终态事件标记完成
- **上游状态**: OPEN(未合入 main);另有同源 OPEN PR #6951
- **本地 rc.30 分支 commit**: `e73fb75c`;rc.32 分支: `d1c222a9`;rc.36 分支: `52793c6fd`;**rc.38 分支重新 cherry-pick(已迁移)**: `52cc078e9`
- **rc.38 必须迁移,不能原样应用**: 官方把 `OaiResponsesStreamHandler` 中的整个事件 switch(即原补丁的落点)删除,改为调用 `service.NewResponsesUsageAccumulator(info)` + `accumulator.Observe(&streamResponse)`。原 `sr.Done()` 的位置已不存在。
- **迁移实现**(`relay/channel/openai/relay_responses.go`),挂在 `accumulator.Observe()` 之后,复用官方的协议分类结果而非重新判断事件类型:
  ```go
  sendResponsesStreamData(c, streamResponse, data)
  accumulator.Observe(&streamResponse)
  // Responses SSE 没有 data: [DONE] 哨兵:终态事件后上游只是静默直到关连接。
  // 若不在此处记录完成,结束原因会由"上游 EOF"与"客户端在终态事件后立即断开"
  // 之间的竞争决定,把正常完成的流误标为 client_gone(#6649)。
  // WebSocket 路径在 relay/responses_websocket.go 记录了相同原因。
  if info.StreamStatus.ResponseOutcome() == string(relaycommon.ResponseOutcomeCompleted) {
      sr.Done()
  }
  ```
  用 `ResponseOutcome()` 而非判断 `event.Type`,可同时覆盖官方 `MarkCompleted()` 的两种触发条件(`event.Type == "response.completed"/"response.done"` 或 `response.status == "completed"`);且 `MarkFailed` 会覆盖 `MarkCompleted`,不会把失败流误标为完成。
- **改动文件**:
  - `relay/channel/openai/relay_responses.go` — 终态标记(迁移后的写法)
  - `relay/channel/openai/relay_responses_stream_test.go` — 回归测试(未改动,直接沿用)
- **解决的问题**: `/v1/responses` 的 SSE 没有 `data: [DONE]` 哨兵,上游发完终态事件后静默直到自己关连接;适配器层主动标记 `done`,不再依赖上游 EOF 与客户端关闭的赛跑。**治本修复**(上游连接不关闭时也有效)。
- **兼容注意**: 官方 rc.32(#7137)已把 usage 归一改为 `relayconvert.NormalizeResponsesUsage` + `dto.MergeUsageNonZero`;rc.38 进一步搬进 `service.ApplyResponsesUsage`。本补丁只补终态标记,与上述重构共存;回归测试在官方新累加器代码上通过。

---

## 3. 本地自定义修复(上游无此改动)

### 3.1 fix6649 — stream_scanner.go 宽限期(client_gone 残留竞争)
- **文件**: `relay/helper/stream_scanner.go`
- **rc.30 分支 commit**: `b0be69f3`;rc.32 分支: `fea6ed32`;rc.36 分支: `bcc1a15d3`;**rc.38 分支重新 cherry-pick**: `e0e87961e`
- **原理**: PR 6808 只修复"scanner 已读到 Done/EOF 但记录晚"的竞争;仍存在"scanner 还没读到 Done/EOF 就被 `resp.Body.Close()` 强制中断"的窗口。修复:
  - 新增 `scannerDone chan struct{}`,scanner goroutine 退出时关闭
  - 新增 `streamClientGoneGrace = 500ms`
  - 主 select 的 `client_gone` 分支改为:等 `scannerDone` 或宽限期到期,再判 `client_gone`(而不是立即关闭 body)
- **测试**: `TestStreamScannerHandler_CompletedStreamNotRelabeledClientGone`(EOF 稍后到达场景)
- **rc.38 合并情况**: 自动合并成功。官方同期只给 `NewStreamScanner` 增加了可选 `maxBytes` 变参(用于有界任务状态),与本地改动**不冲突**且签名向后兼容。

### 3.2 快速路径 — 已标记 done 时不等 grace
- **文件**: `relay/helper/stream_scanner.go`
- **原理**: 合入 #6904 后,适配器已在终态事件标记 `done`;若此时客户端断开而 scanner 仍阻塞等 EOF(上游不关连接),`client_gone` 分支会白等 500ms。加回 `IsNormalEnd()` 守卫:已正常结束直接放行。
- **测试**: `TestStreamScannerHandler_CompletedStreamSkipsGraceOnClientGone`

### 3.3 本地功能:概览页设置引导显示开关
- **rc.30 分支 commit**: `9d998814`;rc.32 分支: `8d67c8db`;rc.36 分支: `88cf31599`;**rc.38 分支重新 cherry-pick**: `cdcdd9c4d`(全部自动合并,无冲突)
- **背景**: 概览页顶部"设置引导"组件(展开态含上手步骤卡片 + 推荐操作,折叠态为紧凑提示条)原本只受用户浏览器 localStorage 控制(展开/收起),管理员无法全局关闭。
- **改动**: 系统设置 → 内容 → 概览 新增"显示设置引导"开关;新增后端配置项 `console_setting.setup_guide_enabled`(bool,默认 `true`);`/api/status` 返回该标志;概览页据此隐藏整个设置引导组件(展开/折叠形态均不渲染),用量卡片等其余内容不受影响。
- **实现**: 完全沿用现有 `api_info_enabled` 等概览面板开关链路(后端反射配置 → `/api/status` → 前端 `useStatus` → 渲染条件),无需改动 option/config 通用层(`handleConfigUpdate` 按 json tag 反射读写 `console_setting.*`)。
  - 后端: `setting/console_setting/config.go`(新增字段)、`controller/misc.go`(status 返回)
  - 前端: `web/src/features/system-settings/content/overview-section.tsx`(新建,开关 UI)、`content/{index.tsx, section-registry.tsx}`(注册与默认值)、`types.ts`(ContentSettings 键)、`hooks/use-update-option.ts`(STATUS_RELATED_KEYS 加入该键,保存后立即刷新 status)、`dashboard/hooks/use-status-data.ts`(新增 setupGuide 可见性)、`dashboard/components/overview/overview-dashboard.tsx`(渲染条件)、i18n 全部语言文件
- **rc.38 合并情况**: 全部文件自动合并成功。官方对其中两个文件的改动与本补丁**不在同一 hunk**:
  - `overview-dashboard.tsx` — 官方改的是 `handleServerError`/`requireServerSuccess` 替换,与三处 `setupGuideEnabled` 守卫互不影响;
  - `controller/misc.go` — 官方改的是 passkey 相关键(`passkey_rp_ids` 等),与本补丁在 status map 尾部新增的 `setup_guide_enabled` 键无重叠。
- **规范对齐(rc.38 新增 commit `82ac1b9c8`)**: rc.37 起前端约定服务端错误统一走 `handleServerError(error, fallbackMessage)`(`web/AGENTS.md` 3.9),官方已把相邻 section 全部同步。本地新建的 `overview-section.tsx` 原为 `catch { toast.error(...) }` 旧写法,已改为一致写法,保留服务端具体原因而非固定文案。
- **升级注意**: rc.36 官方把概览页设置引导重构为 `<SectionPageLayout>` 三段式(标题栏切换按钮 / `hidden` 展开容器 / 折叠条,新增 aria 可访问性);本地守卫已在**四个渲染位置**逐一重放(标题栏按钮 `setupGuideEnabled && setupStatusReady && setupComplete`、展开容器 `hidden={!setupGuideExpanded || !setupGuideEnabled}`、展开容器内部条件、折叠条条件)。若官方后续再次重构概览页或系统设置面板,需重新评估/迁移该开关。

### 3.4 构建健壮性:固定 `VERSION` / `Dockerfile*` 为 LF(上游无此改动)
- **rc.38 分支 commit**: `cdf0109a1`
- **问题**: 本机 git 配置 `core.autocrlf=true`,而仓库 `.gitattributes` 只有 `* text=auto`,未给 `VERSION` 与 `Dockerfile*` 指定 `eol`。这两个文件因此会在 **checkout 时被转成 CRLF**:
  - `Dockerfile` 第 8 行 `VITE_REACT_APP_VERSION=$(cat /build/VERSION)` 与第 28 行 `-X '...common.Version=$(cat VERSION)'` 把版本号注入前端与二进制。容器内 sh 的 `$(...)` **只去除结尾换行、不去除 `\r`**,于是镜像内的版本号变成 `v1.0.0-rc.38-1\r`(14 字节变 15 字节)。
  - `Dockerfile` 自身为 CRLF 时,构建指令也会带 `\r`;新版本 Docker 通常容忍并告警,但不应依赖该行为。
  - 该问题在 Windows 本机的 Git Bash 中**会被掩盖**(MSYS 的 `$(cat VERSION)` 已吃掉 `\r`),只有把仓库挂载进 Linux 容器才复现。
- **修复**: `.gitattributes` 在 Shell scripts 段之后新增
  ```
  Dockerfile* text eol=lf
  VERSION text eol=lf
  ```
  并对 `Dockerfile`、`Dockerfile.dev`、`VERSION` 重新检出;`git check-attr eol <file>` 现返回 `lf`,三个文件均已是 `ASCII text`(不再含 CRLF)。
- **验证**(实测,已通过):
  ```bash
  docker run --rm -v "<repo>:/w:ro" -w /w alpine sh -c \
    'od -c VERSION; printf "%s" "$(cat VERSION)" | od -c'
  # 修复前: raw 以 \r\n 结尾,捕获结果为 15 字节(末尾 \r)
  # 修复后: raw 以 \n  结尾,捕获结果为 14 字节,无 \r
  ```
- **升级注意**: 这两行追加在 `.gitattributes` 的 Shell scripts 段之后;官方后续若修改该文件,注意保留。仓库内无 `.bat`/`.cmd`/`.ps1`,因此不存在必须保留 CRLF 的文件。

---

## 4. 三层防线(针对 client_gone 误标)

| 层 | 来源 | 作用 |
|----|------|------|
| 适配器标记 done | PR #6904 | 收到 `response.completed` 即完成,不依赖 EOF(治本) |
| grace 宽限 | fix6649 | 上游关连接但 EOF 慢时,给 scanner 500ms 读完 |
| override 纠正 | PR #6808 | 正常完成纠正早先的 client_gone 记录 |

> 官方 rc.38 的 `ResponseOutcome` 分类是**第四层、但只服务于渠道健康指标**(`pkg/perf_metrics`),不修正 `EndReason`,故不能替代上表任何一层。

---

## 5. 测试(统一在 docker 内执行)

> Windows 本机 `H:` 盘未加入 Docker 文件共享,且本机 Go 版本与项目要求可能不一致,**编译与测试一律在 docker build 内完成**(官方 Dockerfile 后端用 golang:1.26.1-alpine)。

```bash
# 1) 容器内跑后端回归测试 + relaykit 独立构建(临时 Dockerfile.test,用完即删)
docker build -f Dockerfile.test -t newapi-test:rc38 .
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
#     && go test ./service -run "ResponsesUsage" -count=1 \
#     && cd relaykit && go build ./...   (AGENTS.md 要求)
#
#    注意:rc.38 引入了 WebSocket 中继与请求策略,`go test ./service` 会比 rc.36 慢;
#    上游发版若改了 go.mod/go.sum,go mod download 必然重新下载(层缓存失效),属正常现象。
#    测试镜像(newapi-test:*)用完即删(约 2.8GB);构建缓存可用
#    docker builder prune -a -f --filter until=48h 定期清理。

# 2) 构建正式镜像(前端 bun build + 后端 go build 全量编译)
docker build -t calciumion/new-api:v1.0.0-rc.38-1 .

# 3) 冒烟:临时容器探测 /api/status(不映射端口,避免占用 3000)
docker run -d --rm --name newapi-smoke calciumion/new-api:v1.0.0-rc.38-1
docker exec newapi-smoke wget -q -O - http://localhost:3000/api/status   # 应含 "success":true、"setup_guide_enabled":true
docker rm -f newapi-smoke

# 4) 替换部署:更新 C:\Users\Lenovo\Desktop\AIProxy\newapi\docker-compose.yml 的 image: 引用后 docker compose up -d
```

---

## 6. 维护方式(重要)

### 6.1 分支结构
- **官方 release**:用官方 tag 原样保留,不做任何改动(如 `v1.0.0-rc.38` → `2906e4f77`)。
- **本地维护分支**:`lisrain/rcXX-patched`。当前 `lisrain/rc38-patched`,包含全部本地合入与自定义修复:
  - `2eeb86632` merge PR #6808(上游 OPEN)
  - `52cc078e9` merge PR #6904(上游 OPEN,**已迁移到官方新累加器结构**)
  - `e0e87961e` fix6649 + 快速路径 + 回归测试(本地自定义,上游无)
  - `cdcdd9c4d` 概览页设置引导开关(本地功能,上游无)
  - `82ac1b9c8` 概览开关错误处理对齐官方 `handleServerError` 约定(本地,上游无)
  - `cdf0109a1` 固定 `VERSION` / `Dockerfile*` 为 LF(本地,上游无)
  - 基线 `2906e4f77`(v1.0.0-rc.38)
- 历史分支 `lisrain/rc36-patched`(HEAD `83b88378d`,基于 rc.36,含全部 4 补丁)与 `lisrain/rc32-patched`(HEAD `4756876f`)在本分支建立后**仍留在本地**;两者的备份 tag **`backup/lisrain-rc36-patched`**、**`backup/lisrain-rc32-patched`** 均已建好,分支可随时安全删除。
- 历史分支 `lisrain/rc30-patched`(→ `b0e476a0`,基于 rc.30,含 4 补丁)已删除,备份 tag **`backup/lisrain-rc30-patched`**(指向 `b0e476a0`)可随时恢复。
- 历史分支 `lisrain/rc27-patched`(→ `89ea2020`,基于 rc.27)已删除,备份 tag **`backup/lisrain-rc27-patched`**(指向 `89ea2020`)可随时恢复。

**在官方合入 #6808 / #6904 之前**,每次部署新版本都需**在本分支基础上**:

1. 以当前 HEAD 为基
2. 手动 `git merge`/`cherry-pick` 需要的上游 PR 分支(`gh pr diff <n>` 或 fetch `refs/pull/<n>/head`)
3. 保留本地 `relay/helper/stream_scanner.go` 的自定义改动(fix6649 + 快速路径)——与上游 PR 不冲突(不同文件)
4. `echo "v1.0.0-rc.38-N" > VERSION`(序号递增)→ `docker build -t calciumion/new-api:v1.0.0-rc.38-N .`
5. 更新 `C:\Users\Lenovo\Desktop\AIProxy\newapi\docker-compose.yml` 的 `image:` 引用

**待官方将 #6808、#6904 合入 main 后**,可直接切到官方新 release 基线,届时本地的 stream_scanner 自定义改动可作为对比参考逐步收敛。工作区保持干净。

### 6.2 官方发新 release(如 rc.39)时的跟进流程
1. `git fetch origin --tags` 拉取官方新 tag
2. 基于官方新 tag 建本地分支:`git switch -c lisrain/rc39-patched v1.0.0-rc.39`
3. 按需 cherry-pick 本地补丁(以下 rc.38 分支 hash):`2eeb86632`(#6808)、`52cc078e9`(#6904)、`e0e87961e`(fix6649 + 快速路径)、`cdcdd9c4d`(概览页设置引导开关)、`82ac1b9c8`(错误处理对齐)、`cdf0109a1`(构建换行);官方已合入的跳过对应 commit
4. 处理可能的冲突,重点核对:
   - `relay/helper/stream_scanner.go` —— 本地改过主 select 与 scanner 错误分支;官方若动 `client_gone` 分支或退出时序需重新评估
   - `relay/common/stream_status.go` —— 本地把 `endOnce` 换成了 `mu + reasonSet`;官方持续在加 `ResponseOutcome` 系列方法,**若官方把 `SetEndReason` 也改成可覆盖,则 #6808 可退役**
   - `relay/channel/openai/relay_responses.go` —— 若官方再次重构事件处理,**重放 2.2 的终态标记**;若官方自行给 HTTP SSE 路径补上 `SetEndReason(Done)`(参照其 WS 路径),则 #6904 可退役
   - `controller/misc.go` —— 官方若在 status map 新增键,注意与 `setup_guide_enabled` 的上下文合并
   - `overview-dashboard.tsx` —— 官方若继续重构概览页,**保留四处 `setupGuideEnabled` 守卫**
   - `system-settings/{types.ts, hooks/use-update-option.ts}` —— 官方改动频繁,注意 `setup_guide_enabled` 键与 STATUS_RELATED_KEYS 条目的存活
   - `.gitattributes` —— 本地在 Shell scripts 段后追加了 `Dockerfile* text eol=lf` 与 `VERSION text eol=lf`,官方若改该文件注意保留
5. 递增 VERSION 序号 → 构建镜像 → 更新 compose

---

## 7. 其他值得关注的上游开放 PR(未合入,按需评估)

> 2026-09-19 复查(rc.38 跟进):以下除注明外仍全部 OPEN,官方 rc.38 均未吸收。

- **#6951** `fix(openai): 正确结束 Responses 流` —— **与本地 #6904 同源同方案**(终态事件后立即结束流,避免误记 `client_gone`),官方未吸收。若该 PR 合入,可与 #6904 一并退役。
- **#7178** `fix(relay): drain upstream after client_gone to collect final usage` —— 针对 issue #7062 的另一条思路(断连后继续读上游拿 usage);与本地"给 scanner 宽限期"的方向不同,若合入需重新评估 fix6649 的宽限期取值。
- **#7419** `fix(relay): correctly label estimated Responses stream usage`(2026-09-17,核心开发者 @seefs001)—— 修正部分情况下本地计算 usage 被标记为上游返回,并细化流错误信息。
- **#7066** 上游流中途失败时向客户端发终态错误事件
- **#6960** 模型限流器隔离与按 group 作用域计数(稳定性)
- **#6913** / **#6979** 订阅计费修复
- **#7088** Responses item 集合规范化
- **#7033** SSE 帧立即转发(首字延迟优化)
- **#6927** 记录异常流中断到错误日志
- ~~#7092 codex 非法工具调用导致"继续就断流"(relaykit)~~ — **已 CLOSED**(未合并)
- ~~#7195 `fix(responses): preserve pre-consume when streamed output lacks usage`~~ — **已 CLOSED**,被官方 #7427 取代(rc.38 已合入)
- ~~issue #7062 流式请求中 client_gone 导致计费为 0~~ — **已 CLOSED**,Responses 入站路径由 #7427 修复;其中"Chat Completions 经 Responses 转换"的链路官方注明**另行处理**,尚无对应 PR
