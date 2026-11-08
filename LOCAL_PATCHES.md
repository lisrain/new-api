# LOCAL_PATCHES — 本地补丁与维护记录

> 当前维护基线:上游已发布 tag **v1.0.0-rc.48**(`706144769e5bed5a47b78721e3bb11da3cf4c0b9`)。
> 当前分支 **`lisrain/rc48-patched`**,版本 **`v1.0.0-rc.48-1`**。下方“当前记录”优先于末尾保留的 rc.39 历史快照。

## 当前记录 — 2026-11-08 跟进 rc.48

### 版本选择与执行边界

- 用 `gh release view --repo QuantumNous/new-api` 核实最新发布为 **v1.0.0-rc.48**,发布时间 `2026-11-04T15:40:15Z`;GitHub 标记 `isDraft=false`、`isPrerelease=false`。名称虽含 rc,本次按官方已发布 release 选择,不是跟随 main 的未发布代码。
- rc.39 → rc.48 共 **236 个提交**。此次查询时 `origin/main` 在 rc.48 后另有 13 个提交,**没有合入这些未发布提交**。
- 本地仅获取 Git 对象、审阅差异、迁移补丁、格式化和整理提交;**不执行本地 go test/go build、前端测试/构建或 docker build**。所有运行时验证统一由 GitHub Actions 完成。
- 本仓库 Git 远程按用户要求统一使用 **SSH**: `origin = git@github.com:QuantumNous/new-api.git`(仅 fetch)、`fork = git@github.com:lisrain/new-api.git`(维护分支 push);fetch/push 地址均已核实,SSH 认证账号为 `lisrain`。仅修改本仓库配置,不添加全局 URL 重写。`gh` 查询 release/PR/Actions 仍使用 GitHub 的正常 API。
- 旧分支 `lisrain/rc39-patched` 保留;备份 tag **`backup/lisrain-rc39-patched`** 指向 `4de90e19f94da7dfae0940d8d35e0d3743834ad0`。本次不删除历史分支,不修改运行中容器或上级 `docker-compose.yml`。

### PR 合入核实与补丁存废

`gh api graphql` 查询 PR 的 `state/merged/mergedAt/mergeCommit/headRefOid/updatedAt`,再用固定 tag 的源码和祖先关系核对是否包含实际修复。**CLOSED 不等于 MERGED;OPEN 也不能据此断言缺少等价修复。**

| PR / 本地改动 | 2026-11-08 上游状态及实际代码 | 本次处理 |
|---|---|---|
| #6808 正常流覆盖 client_gone | CLOSED、未直接 merge;维护者明确由 **#7956** 整合替代 | 不回放旧 `mutex + reasonSet` 及 Done/EOF 的广义覆盖;沿用官方更窄的 join 后纠正 |
| #6904 Responses 终态 Done | CLOSED、未直接 merge;整合至 **#7956** | 退役旧本地提交,保留官方“Observe → 成功写出终态 → Done” |
| #6951 同源终态修复 | CLOSED、未直接 merge;整合至 **#7956** | 无需另合 |
| **#7956** 综合流生命周期修复 | **MERGED**,`2026-10-22T05:06:59Z`,commit `0c2af9780e45f6f9073528fb0fcbdcd64b5d9495`;rc.46 不含、**rc.47/rc.48 已含** | 官方代码完整保留 |
| **#7088** output_item.added 缺失集合 | **OPEN**,head `ff3418a1e43efe7d53737d6def0e7e230b2bef80`;rc.48 原生 HTTP SSE 仍未补数组 | **保留并迁移**,新提交 `5b8b49204` |
| fix6649 500ms grace + 快速路径 | 官方现改为立即关闭已取消请求的上游,并仅纠正成功送达完成事件的取消竞争 | **退役**,不恢复断开后的尾部继续生成窗口 |
| 借自 #7178 的通用 nil 写守卫 | #7178 仍 OPEN;rc.48 的终态判据依赖真正的下行写入/flush 成功 | **退役**,不把“丢弃未写出的帧”伪装为成功;不合入 60s drain |
| #7419 终态诊断 | OPEN,head `15997510897394c96e9a75ca8b3d86d406a84a79`;未被 rc.48 合入 | 继续观察,不扩大此次变更为错误来源/日志体系重构 |
| #6960 分组限流隔离 | OPEN | 单用户部署未启用该分组限流场景,不新增合入 |
| #6927 异常流错误日志 | OPEN | 继续观察,不新增合入 |
| #7066 流失败终态事件 | OPEN、CONFLICTING;当前 diff 仍对 Responses 发送 chat 形状错误块,且 Chat 失败分支早于 usage 估算返回 | 不合入 |
| #7033 Chat 首帧直发 | OPEN,9/22 更新为仅原生 Chat 直发、转换路径仍缓冲并补了测试 | 当前方案较旧评估改善,但非本地 Codex 原生 Responses 路径,不扩展合入 |
| #6913 订阅溢出钱包结算 | OPEN | 本地不使用订阅,不合入 |
| #6979 同套餐续费接续 | OPEN | 本地不使用订阅,不合入 |
| #7092 空 function_call.name | CLOSED、未合并 | 不合入 |
| #7195 保留断流预扣 | CLOSED、未合并 | 沿用官方 #7427 及后续累加器 |
| #7427 断流 usage 估算 | MERGED,`55a6cd2a44eaf189bbd565dd2cdfa591d19b06d6`,当前 tag 已含 | 保留官方实现 |
| #5062 Responses WebSocket | MERGED,`9fe0457ee1f4b9de407a254500d54f5a8f41ee29`,当前 tag 已含 | 保留官方实现 |

**官方 #7956 取代旧三层防线的理由:**终态 usage 先观察,只有 completed/done 事件成功写入并 flush 后才 `sr.Done()`;所有 worker join 后,仅对协议 completed、明确 `context.Canceled` 且无错误的 client_gone 纠正为 Done。裸 EOF、deadline、协议失败和真正的下行写失败不被改成正常结束。旧 grace、通用 nil 写守卫和广义 EOF 覆盖会破坏这些条件,尤其可能把未送达终态误记成功,或影响中断图片降量。此次没有另行改动官方 `stream_status.go` / `stream_scanner.go` / `helper/common.go`。

### 当前仍维护的补丁

| 当前提交 | 来源 | 落点及升级要求 |
|---|---|---|
| `f7083c5ab` | rc.39 `2a46b57a1` | 概览设置引导全局开关;保留后端配置/status、设置 UI、STATUS_RELATED_KEYS、七种翻译及概览四个守卫 |
| `f53aa58e7` | rc.39 `41d23ee9f` | 概览开关沿用 `handleServerError`,不恢复固定错误 Toast |
| `d45b29420` | rc.39 `8b7d7317b` | `.gitattributes` 保留 `Dockerfile* text eol=lf` / `VERSION text eol=lf` |
| `1a6872b91` + `09e87c83e` | rc.39 `e0d95433e` + `7d840ed76` | fork 工作流仓库守卫和 GHCR 工作流;定长 `${GITHUB_SHA:0:9}`、不监听 tag、不推 latest |
| `79fe01830` | rc.39 `af343ad83` | README 本仓库说明,位于官方顶部 `</div>` + `---` 之后;版本和补丁说明已另行更新 |
| **`5b8b49204`** | #7088 / rc.39 `b02f61252` | `relay/channel/openai/relay_responses.go` 使用现有 `ojson.SetRawBytes` 补缺失 `item.summary` / `item.content`;不重引 gjson/sjson,不覆盖存在字段或显式 null |
| `4964853fb` | 本次新增回归 | 复用概览既有测试文件,覆盖全局关闭时的完成/未完成/展开/折叠状态、用量区域不受影响、恢复个人展开偏好 |

#7088 仅覆盖原生 **HTTP SSE**。复用 `relay_responses_billing_test.go` 新增表测,覆盖缺失/空/非空/null 集合、其他 item、非 added 事件、原始大整数与扩展字段、终态帧及 7+5=12 usage 不变。它观察原始计量事实后规范化下行 JSON,不修改官方终态判据或计费累加器。WebSocket 的 item 规范化和终态发送时序不在本次本地扩展范围。

### 云端验证与镜像发布

工作流: [ghcr-build.yml](.github/workflows/ghcr-build.yml),触发 `push lisrain/**` 或手动运行。

1. **后端 job**:Go 版本取自 rc.48 `go.mod`(1.26.10);根模块、`relaykit`、新增的 `tokenkit` 分别 `go vet ./...` / `go build ./...`;`make test` 全模块测试;Responses 完成/兼容及 scanner/status 的定向 `-race -parallel=1` 回归。
2. **前端 job**:与官方同步 Bun **1.4.4**;冻结 lock 安装,`bun check -b`、本地补丁 JS/TS 文件强制 lint、补丁 JS/TS/JSON 格式检查、Vitest 全量测试及生产构建;手动版本覆盖与最终镜像版本一致。lint/格式检查通过 `git diff` 与对应官方 tag 比较选取文件,不关闭任何规则。既有版权头保护格式脚本仅增加可选文件参数,无参数时仍处理全目录;格式错误只在云端生成差异供修正,不会自动修改仓库远程。首次全量 lint 报出的错误均位于 rc.48 官方未修改文件;本次不额外引入无关的上游风格清理,类型/测试/生产构建仍保持全量。
3. **数据库 job**:临时 MySQL 8.0 / PostgreSQL 15 service 与真实 SQLite;接通 `TEST_*_DSN` 和 `AUDIT_*_DSN`,不同包使用不同空库并串行运行。用 Go JSON 测试事件断言三库新建/升级子测试实际 PASS,不能靠被 SKIP 的普通 CI 绿灯认定兼容。实际 `SELECT version()` / `sqlite_version()` 写入运行摘要。
4. **rc.39 实际升级样本**:云端检出并编译固定旧补丁提交 `4de90e19f...`;由旧二进制真实创建三种数据库 schema,放入代表性 user/token/channel/历史日志与已关闭的概览开关;目标二进制在同一批数据库启动两次,验证数据、令牌默认权限、用户名唯一性和开关持久化。MySQL/PostgreSQL 同时覆盖独立日志库,不连接任何部署数据库。
5. **发布门禁**:上述三个 job 全成功后才构建 linux/amd64 候选镜像;先容器冒烟断言 `/api/status` success、默认开关 true、版本精确一致,再登录 GHCR 推送双 tag。**冒烟失败不会发布版本 tag**。保留 `gha scope=newapi-image,mode=max` 层缓存,不改官方 Dockerfile/PGO/镜像工具链。容器刚启动时 Docker 端口代理可能先返回 connection reset;readiness 使用有界 `curl --retry-all-errors`(单次最多5秒、总窗口90秒),任何超时或断言失败仍输出容器日志并阻止发布,不把启动瞬态误当作应用故障。

镜像命名:`ghcr.io/lisrain/new-api:v1.0.0-rc.48-1` 及 `v1.0.0-rc.48-1-<9位提交>`。运行结果、精确数据库版本和镜像 digest 以 [fork Actions](https://github.com/lisrain/new-api/actions/workflows/ghcr-build.yml) 的对应提交记录为准;本文件不以本地执行结果代替云端验证。

### 下一次升级流程

1. `git fetch origin --tags`,用 `gh release view` 选择官方最新已发布 tag,不要默认采用 main。
2. 建 `lisrain/rcNN-patched` 新分支;首先重新核对 **#7088 是否已合入或有等价 raw item 规范化**。已吸收时退役 `5b8b49204`,不要重复回放。
3. 重放概览开关、错误处理、LF、fork 守卫、九位 SHA 和 README 说明;保留本次扩充的云端验证配置。新版本若继续使用 tokenkit,必须保留其独立验证。
4. **不再从 rc.39 回放 #6808/#6904、fix6649/grace 或 nil 写守卫**。未来终态/取消改动以官方 #7956 的成功送达契约为依据,不能仅为日志显示正常而改变账单/健康分类。
5. 更新 VERSION 与当前维护记录,提交、push 后用 `gh run list/view/watch` 跟踪云端;红灯按实际错误修正再提交,不在本机补跑测试。
6. 云端成功后部署更新仍是独立步骤;升级前备份数据库,多节点同时升级并保持相同 SESSION_SECRET/CRYPTO_SECRET。此次仅生成可部署镜像,不自动替换现有服务。

### 安全与验证范围说明

rc.48 包含 Redis 用户/令牌/会话缓存签名和新 access token 等官方认证变更;本次保留官方实现,没有自行重写认证流程。审阅参考 OWASP **ASVS 5.0.0**(2025-05-30 stable)、[Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) 和 [Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)。云端运行已有失败/撤销/迁移/缓存完整性回归;这不等于对整个项目作完整 ASVS 合规认证,也不涵盖真实供应商调用、生产数据全集或未配置的 ClickHouse 集成。

---

## 历史快照 — rc.39（2026-09-21,保留排查参考）

> **以下原文中的“当前”、OPEN 状态、三层防线、构建版本和升级命令均是 rc.39 当时的历史记录,不能直接套用到 rc.48。当前存废与升级步骤以上文为准。**
> 本文件记录本仓库相对于上游 main 的**本地手动合入与自定义修复**,供日后升级、排查、回退时查阅。
> 历史基线:上游 tag **v1.0.0-rc.39**(commit `9978ee1e2`)。

---

## 1. 当前版本与命名方案

- 镜像 tag / VERSION 采用 **`v1.0.0-rc.39-<序号>`** 增量命名,每次在此分支上新增改动后构建,序号递增。
- 当前为 **`v1.0.0-rc.39-1`**(基于官方 rc.39,合入 PR 6808 + PR 6904 + PR 7088 + fix6649 + 快速路径 + #7178 写入守卫 + 概览页设置引导开关 + 构建换行修复 + CI 化)。
- **2026-09-21 跟进 rc.39**:官方 rc.38 → rc.39 共 29 个提交,**未触及任何本地补丁落点**(见 1.2),十个代码补丁全部 cherry-pick 干净落地,仅 README 补充段与官方重写的 README 冲突,已手工合并。验证全部交给云端 CI(第 5 节),本地不跑测试与构建。
- 2026-09-19:拉取 rc.38、完成补丁存废判定与合入;合入 PR #7088 与 #7178 的写入守卫(见 2.3、3.5)。
- 2026-09-20:构建迁移到 GitHub Actions,代码推送到 fork `github.com/lisrain/new-api` 后由 `.github/workflows/ghcr-build.yml` 跑回归测试 → 构建 → 推 `ghcr.io/lisrain/new-api:<VERSION>` → 容器冒烟(见 3.6);本机 `docker build` 降级为离线/调试路径(第 5 节)。
- **跟进记录**: rc.32 → rc.36 → rc.38 → rc.39。

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

### 1.2 rc.39 跟进判定(2026-09-21)

官方 rc.38 → rc.39 共 29 个提交,主题集中在任务插件(OpenAI Images API 经插件、渠道绑定多插件、Seedance/Wan 分辨率定价)、计费配置(信任阈值与输入预扣倍率 `quota_setting.trust_quota_usd` / `pre_consume_multiplier`)、前端(渠道/密钥/日志页重构、logo 更新、对话框视口修复)。用 `git diff --stat v1.0.0-rc.38 v1.0.0-rc.39 -- <全部落点>` 核对,**本地补丁落点文件中只有一个被官方改动**:

| 落点 | rc.39 改动 | 影响 |
|---|---|---|
| `relay/common/stream_status.go`、`relay/helper/{stream_scanner,common}.go`、`relay/channel/openai/relay_responses.go`、`relay/responses_websocket.go`、`service/responses_usage.go` | 无 | #6808 / #6904 / #7088 / fix6649 / 写入守卫全部**原样保留** |
| `controller/misc.go`、`setting/console_setting/config.go`、`overview-dashboard.tsx`、`system-settings/content/`、`use-update-option.ts`、`use-status-data.ts` | 无 | 概览开关原样保留 |
| `web/src/features/system-settings/types.ts` | `general_setting.docs_link` 从 `BillingSettings` 挪到 `SiteSettings`;`BillingSettings` 删 `PreConsumedQuota`、加 `quota_setting.trust_quota_usd` / `pre_consume_multiplier` | 不在 `ContentSettings`,与 `console_setting.setup_guide_enabled` 键无关,自动合并 |
| `.gitattributes`、`Dockerfile*`、`.github/workflows/*`、`go.mod` / `go.sum` | 无 | 构建换行修复与 CI 化原样保留;Go 依赖未变 |
| `README.md`、`README.zh_CN.md` | 官方**整体重写**(-603/+281 行) | 本地"本仓库说明"段冲突,已手工放回官方新版 `</div>` 与 `---` 之后,并把基线与 `docker pull` 示例更新为 rc.39 |

十个代码补丁 cherry-pick 全部自动合并(`git diff lisrain/rc38-patched HEAD -- <落点>` 为空);唯一的手工处理是 `5efc0afab` 顺带修改过 `LOCAL_PATCHES.md`,该文件在新基线上不存在而报 modify/delete,已从该提交中剔除,文档改为在最后单独提交。

**第 7 节候选 PR 复查**(`gh pr view`):#6808、#6904、#7088、#6951、#7178、#7419、#6960、#6927、#7066、#7033、#6913、#6979 **全部仍 OPEN 且自上次核对后无更新**(#7419、#7033 最后更新仍为 9/17、9/15),结论不变。rc.39 未合入其中任何一个。

---

## 2. 合入的上游 PR(官方 main **尚未合并**,处于 OPEN)

### 2.1 PR #6808 — 正常完成的流不被误标 client_gone
- **上游状态**: OPEN(未合入 main)
- **本地 rc.32 分支 commit**: `a38949e1`;rc.36 分支: `f9c13cb0e`;rc.38 分支: `2eeb86632`;**rc.39 分支重新 cherry-pick**: `f758cff3d`(自动合并,无冲突)
- **改动文件**:
  - `relay/common/stream_status.go` — `SetEndReason` 由 `sync.Once` 改为 mutex + `reasonSet`,允许正常完成(`Done`/`EOF`)纠正早先记录的 `client_gone`;`IsNormalEnd()`/`Summary()` 一并加锁
  - `relay/helper/stream_scanner.go` — scanner 错误处理(`err != nil && err != io.EOF` 才记 scanner_error,否则记 EOF)+ 客户端断开分支守卫
  - `relay/helper/stream_scanner_test.go` — 回归测试
- **解决的问题**: 客户端(codex 等)收到最后一个 SSE 事件后立即关闭连接,主 select 抢在 scanner 记录结束原因前写入 `client_gone`(issue #6649)。
- **rc.38 冲突情况**: `stream_status.go`、`stream_scanner.go` 自动合并;`stream_scanner_test.go` 内容冲突(官方新增的 `TestNewStreamScannerCallerLimit` 与本地新增测试在同一位置),已手工保留**双方**测试。合并后 `StreamStatus` 结构为官方新增字段 + 本地 `reasonSet` 共存,**共用同一个 `mu`**。

### 2.2 PR #6904 — Responses 流在终态事件标记完成
- **上游状态**: OPEN(未合入 main);另有同源 OPEN PR #6951
- **本地 rc.30 分支 commit**: `e73fb75c`;rc.32 分支: `d1c222a9`;rc.36 分支: `52793c6fd`;rc.38 分支(已迁移): `52cc078e9`;**rc.39 分支重新 cherry-pick**: `10a5c5fc4`(自动合并,无冲突)
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

### 2.3 PR #7088 — Responses `output_item.added` 补齐空集合(codex 兼容)
- **上游状态**: OPEN(与 main 冲突,作者 @DoubleMice,2026-08-30;关联 issue #7087)
- **rc.38 分支 cherry-pick(已迁移)**: `eb6c5cab1`(源 commit `ff3418a1e`,`-x` 标注);**rc.39 分支**: `b02f61252`(自动合并,无冲突)
- **背景**: 部分 Responses 兼容上游(第三方 new-api 中转站等)在 `response.output_item.added` 阶段省略尚为空的集合字段——reasoning item 缺 `summary`,message item 缺 `content`。codex 按 OpenAI Responses item schema 严格反序列化,会丢弃该 item,随后的 `ReasoningSummaryDelta` / `OutputTextDelta` 全部报 "without active item"。**本机场景正是 codex → 本地 new-api → 第三方 new-api(Responses 上游)**,直接命中。
- **改动**: `relay/channel/openai/relay_responses.go` 新增 `normalizeResponsesOutputItemAdded`,只在键缺失时用 sjson 补 `"summary": []` / `"content": []`,已有字段、其他 item 类型、`sequence_number` 均不动;gjson/sjson 已在 go.mod。`OaiResponsesStreamHandler` 在 `sendResponsesStreamData` 前调用。
- **rc.38 迁移**: 原 PR 的 hunk 落在被官方删除的事件 switch 上,cherry-pick 冲突;手工保留 rc.38 的 `accumulator.Observe` 结构,把规范化调用插在发送之前、本地 #6904 终态标记之前(同一闭包内,互不影响)。
- **不影响的路径**: relaykit 的 chat→responses 转换路径(`to_oai_responses_resp.go`)自带这两个数组;WebSocket 中继(`relay/responses_websocket.go`)未改,codex 走 HTTP SSE。
- **测试**: `relay/channel/openai/relay_responses_compat_test.go`(`TestOaiResponsesStreamHandlerAddsMissingItemCollections`,直接沿用,复用本地已有的 `newResponsesChatTestContext`)
- **退役条件**: 官方合入 #7088 或等价规范化后跳过此 commit。

---

## 3. 本地自定义修复(上游无此改动)

### 3.1 fix6649 — stream_scanner.go 宽限期(client_gone 残留竞争)
- **文件**: `relay/helper/stream_scanner.go`
- **rc.30 分支 commit**: `b0be69f3`;rc.32 分支: `fea6ed32`;rc.36 分支: `bcc1a15d3`;rc.38 分支: `e0e87961e`;**rc.39 分支重新 cherry-pick**: `2c028df1a`(自动合并,无冲突)
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
- **rc.30 分支 commit**: `9d998814`;rc.32 分支: `8d67c8db`;rc.36 分支: `88cf31599`;rc.38 分支: `cdcdd9c4d`;**rc.39 分支重新 cherry-pick**: `2a46b57a1`(全部自动合并,无冲突;错误处理对齐 commit 为 `41d23ee9f`)
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
- **rc.38 分支 commit**: `cdf0109a1`;**rc.39 分支**: `8b7d7317b`
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

### 3.5 写入守卫:客户端已断开时下行写入返回 nil(借自 PR #7178,修 fix6649 副作用)
- **rc.38 分支 commit**: `a9a2c6d97`;**rc.39 分支**: `2022e27c9`
- **文件**: `relay/helper/common.go`(`StringData`、`ResponseChunkData` 两处 `requestContextDone` 分支由返回 `request context done` 错误改为返回 `nil`),`relay/helper/stream_scanner_test.go`(回归测试)
- **来源**: 只借用 PR #7178 的 `helper/common.go` 两处改动,**不采纳其 60s drain**(见第 7 节)。改后与官方已有的 `ClaudeData` / `ClaudeChunkData`(上下文取消时静默返回)语义一致。
- **修的问题**: fix6649 的 500ms 宽限期让 scanner 在客户端断开后继续把上游 chunk 交给 dataHandler。**在回调里直写客户端并把写失败视为致命**的适配器(`relay/channel/claude/relay-claude.go` 的 `sr.Stop(err)`、`relay/channel/openai/relay_image.go` 的 `sr.Stop(err)`)会把"客户端主动断开"变成 `HandlerStop` + `RecordError`,于是 `pkg/perf_metrics.ClassifyRelayOutcome` 从 `Ignored` 改判 `Failure`,污染渠道健康度。守卫后写入被静默丢弃,流按宽限期到期记 `client_gone`,无错误记录。
- **影响面核对**(2026-09-19): 改动的两个函数在 `relay/` 内共 20 余处调用。在 `StreamScannerHandler` 回调内且对错误做 `sr.Stop/Error` 的只有 claude、image、audio、baidu、dify、xai;非 scanner 的自有循环(tencent、cloudflare、cohere、zhipu、ollama)只打日志或忽略返回值;`HandleFinalResponse` / `Done` 本就忽略返回值。此外 `relay/responses_websocket.go` 不经这两个函数。`ClassifyRelayOutcome` 收到的是 `c.Request.Context()`,客户端取消时本就先返回 `Ignored`,守卫只是让 `StreamStatus` 也不再留下误导性的 `handler_stop`。
- **测试**: `TestStreamScannerHandler_ClientGoneWriteInGraceIsNotHandlerStop`——客户端断开后宽限期内上游再来一个 chunk,回调按 image/claude 的模式对写失败 `sr.Stop`;守卫前该用例实测失败(`handler_stop` + `HasErrors`),守卫后 `client_gone` 且无错误,断开后不再向客户端写任何字节。
- **退役条件**: 官方合入 #7178(含此改动)或 #7419(`streamDiagnosticWriter` 覆盖同一场景)后按官方版本处理。

### 3.6 CI 化:云端构建 ghcr 镜像 + 上游 workflow 仓库守卫(上游无此改动)
- **rc.38 分支 commit**: `5efc0afab` + `dda77a629`;**rc.39 分支**: `e0d95433e` + `7d840ed76`(rc.39 版已剔除对 `LOCAL_PATCHES.md` 的顺带改动,只含 workflow 文件)
- **背景**:原流程在本机 `docker build`(第 5 节),受本机 Docker 磁盘与网络限制;改为 GitHub Actions 构建并推送 `ghcr.io`。
- **新增文件**:`.github/workflows/ghcr-build.yml`
  - **触发**:`push` 到 `lisrain/**` 分支,以及手动 `workflow_dispatch`(可临时覆盖 VERSION)。**不监听 tag**——fork 里带着上游 tag,按 tag 构建会把本地补丁分支的内容刷成官方版本号。
  - **`test` job**:在 ubuntu-latest 上跑第 5 节那套回归(`relay/helper` 与 `relay/channel/openai` 的定向用例,加 `relay/channel/{openai,claude,gemini}`、`relay/`、`relay/common` 全量,以及 `service -run ResponsesUsage`),并 `cd relaykit && go build ./...`(AGENTS.md 要求)。失败即中止,不发镜像。顺带解决了"Windows 本机跑不了 `./relay/...` 全量"(第 5 节)。
  - **`build` job**:`docker/build-push-action` 构建 linux/amd64,推双 tag `:<VERSION>` 与 `:<VERSION>-<short sha>`;`<VERSION>` 取自仓库内 `VERSION` 文件(唯一版本源,**不推 `latest`**,避免部署端误升级)。
  - **冒烟**:起容器探 `/api/status`,断言 `"success":true` 与 `"setup_guide_enabled":true`——后者是 3.3 本地开关独有的键,用来确认镜像里确实是补丁版而非上游版。
  - **鉴权**:`GITHUB_TOKEN` + `packages: write`,无需任何自建 secret;不迁移上游的 cosign 签名与 provenance/sbom(`provenance: false`,保持单架构 manifest 干净)。
- **缓存策略(2026-09-20 核实)**:
  - 只有**层缓存**能跨 run 复用,固定用 `cache-from: type=gha,scope=newapi-image` + `cache-to: type=gha,mode=max,scope=newapi-image,ignore-error=true`。**`mode=max` 不可省**,否则只导出最终镜像里那几个层,`bun install`(约 1.5GB 依赖)与 `go mod download` 两层不会被缓存。
  - **不要加 `RUN --mount=type=cache`**:BuildKit 明确不把 cache mount 的内容导出到任何 `cache-to` 后端(见 [moby/buildkit#3011](https://github.com/moby/buildkit/issues/3011) 维护者答复、[docker/buildx#244](https://github.com/docker/buildx/issues/244)),GitHub runner 每次都是新机器,收益为 0,只会给人"已优化"的错觉。因此**不改 Dockerfile**——本机 docker 构建时 cache mount 虽有效,但不值得为此牺牲与上游的可合并性。
  - 现有 Dockerfile 的分层本来就是对层缓存友好的(`package.json`+`bun.lock` 先 COPY、`go.mod`/`go.sum` 先 ADD),后端改动不会打掉 `bun install` 与 `bun run build` 两层,无需调整。
  - `RUN go build` 那层的输入是 `COPY . .`,任何源码改动都会失效,每次都全量重编译(热缓存下约 2~4 分钟),这是剩余的主要耗时,无低成本解法(Go 不支持只编译依赖;改 Dockerfile 拆层会牺牲与上游的可合并性)。
  - gha 后端 **scope 默认取当前分支名**,且 GitHub 只允许读取"当前分支/基础分支/默认分支"的缓存 → 冷启动的边界是**换分支**(例如新建 `lisrain/rc39-patched` 后第一次构建必然冷),不是换 commit;同分支上连续构建则接近全命中。显式写死 `scope=newapi-image` 是为了避免同分支多构建互相覆盖。
  - gha 缓存按仓库计上限 10GB(LRU 淘汰)。若出现频繁淘汰或 `failed to reserve cache`,退回 `type=registry,ref=ghcr.io/lisrain/new-api:buildcache,mode=max`(无 10GB 限制,且 blob 与镜像同仓)。
- **上游 workflow 仓库守卫**:`docker-build.yml`(`build_single_arch`、`create_manifests`)、`release.yml`(`linux`/`macos`/`windows`)、`electron-build.yml`(`build`/`release`)各加 `if: github.repository == 'QuantumNous/new-api'`(job 已有 `if` 的用 `&&` 合并原条件)。这样在 fork 里推 tag 时这些 job 全部跳过,既不需要 Docker Hub 密钥,也不会白跑 macOS/Windows 构建;在官方仓库内守卫恒为真,不影响日后把该 commit 提回上游。**未加守卫的三处**:`docker-image-branch.yml`、`sync-release-to-gitcode.yml` 只在手动触发时运行,`ci.yml` 只响应 PR。
- **追踪 tag 定长(`dda77a629`)**:`SHORT_SHA` 必须用 `${GITHUB_SHA:0:9}`,不能图省事写 `git rev-parse --short HEAD`——checkout 默认 `fetch-depth: 1`,缩写长度取决于本地对象库大小,浅克隆下同一个 commit 只会缩成 **7 位**(首次构建实际推出的是 `v1.0.0-rc.38-1-9663300`),追踪 tag 长度会随检出深度漂移。
- **升级注意**:上游若改动这三个 workflow,合并冲突时保留守卫;`ghcr-build.yml` 是本地文件,上游不会碰,无需重放。

---

## 4. 三层防线(针对 client_gone 误标)

| 层 | 来源 | 作用 |
|----|------|------|
| 适配器标记 done | PR #6904 | 收到 `response.completed` 即完成,不依赖 EOF(治本) |
| grace 宽限 | fix6649 | 上游关连接但 EOF 慢时,给 scanner 500ms 读完 |
| override 纠正 | PR #6808 | 正常完成纠正早先的 client_gone 记录 |

> 官方 rc.38 的 `ResponseOutcome` 分类是**第四层、但只服务于渠道健康指标**(`pkg/perf_metrics`),不修正 `EndReason`,故不能替代上表任何一层。

> 3.5 的写入守卫不在这条链上,但为该链收尾:grace 宽限期会让 scanner 在客户端断开后继续回调 dataHandler,守卫保证此时的下行写入不会把 `ClientGone` 变成 `HandlerStop`(见 3.5)。

---

## 5. 构建与测试(云端 CI 为主,本机 docker 为离线兜底)

**云端路径(2026-09-20 起默认,2026-09-21 起为唯一常规路径)**:提交后 `git push fork lisrain/rc39-patched`,GitHub Actions 自动跑回归测试 → 构建镜像 → 推 `ghcr.io/lisrain/new-api:<VERSION>` → 容器冒烟(见 3.6)。绿灯后只需改 compose 的 `image:` 再 `docker compose up -d`。**跟进新 rc 时本机不跑 go test、go build、docker build**——本地只负责拉取 tag、cherry-pick 补丁、整理提交、推送;云端红灯时才回到本地看代码。

**离线/调试路径(仅在云端不可用时使用,以下命令均在本机 docker 内执行)**:Windows 本机 `H:` 盘未加入 Docker 文件共享,且本机 Go 版本与项目要求可能不一致,需要在本机验证时**编译与测试一律在 docker build 内完成**(官方 Dockerfile 后端用 golang:1.26.1-alpine)。

```bash
# 1) 容器内跑后端回归测试 + relaykit 独立构建(临时 Dockerfile.test,用完即删)
docker build -f Dockerfile.test -t newapi-test:rc39 .
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
#    RUN go test ./relay/helper/... -run "ClientGone|ClientCancel|CompletedStream|SkipsGrace|HandlerStop" -count=1 -v \
#     && go test ./relay/channel/openai/ -run "MarksDoneOnCompleted|AddsMissingItemCollections|ResponsesToChatStream|ImageStream" -count=1 -v \
#     && go test ./relay/channel/openai/ ./relay/channel/claude/ ./relay/channel/gemini/ ./relay/ -count=1 \
#     && go test ./relay/common/... -count=1 \
#     && go test ./service -run "ResponsesUsage" -count=1 \
#     && cd relaykit && go build ./...   (AGENTS.md 要求)
#
#    2026-09-19 第二次跟进起,本机 Go 已升到 1.27(项目 go.mod 为 1.25.1,官方镜像 1.26.1),
#    上述 go test 可先在本机快速跑通(约 1 分钟),docker 内再跑一遍作为正式验证;
#    `go test ./relay/...` 全量在 Windows 本机会因 relay/channel 的 HTTP/2 GOAWAY 用例
#    (wsarecv 平台差异)失败,与本地补丁无关,以 docker 结果为准。
#    go mod download 偶发 proxy.golang.org EOF(网络),重跑即可。
#
#    注意:rc.38 引入了 WebSocket 中继与请求策略,`go test ./service` 会比 rc.36 慢;
#    上游发版若改了 go.mod/go.sum,go mod download 必然重新下载(层缓存失效),属正常现象。
#    测试镜像(newapi-test:*)用完即删(约 2.8GB);构建缓存可用
#    docker builder prune -a -f --filter until=48h 定期清理。

# 2) 构建正式镜像(前端 bun build + 后端 go build 全量编译)
#    离线路径也统一用 ghcr 镜像名打 tag,compose 的 image: 引用无需分两套
docker build -t ghcr.io/lisrain/new-api:v1.0.0-rc.39-1 .

# 3) 冒烟:临时容器探测 /api/status(不映射端口,避免占用 3000)
docker run -d --rm --name newapi-smoke ghcr.io/lisrain/new-api:v1.0.0-rc.39-1
docker exec newapi-smoke wget -q -O - http://localhost:3000/api/status   # 应含 "success":true、"setup_guide_enabled":true
docker rm -f newapi-smoke

# 4) 替换部署:更新 C:\Users\Lenovo\Desktop\AIProxy\newapi\docker-compose.yml 的 image: 引用后 docker compose up -d
```

---

## 6. 维护方式(重要)

### 6.1 分支结构
- **官方 release**:用官方 tag 原样保留,不做任何改动(如 `v1.0.0-rc.39` → `9978ee1e2`)。
- **本地维护分支**:`lisrain/rcXX-patched`。当前 `lisrain/rc39-patched`,包含全部本地合入与自定义修复:
  - `f758cff3d` merge PR #6808(上游 OPEN)
  - `10a5c5fc4` merge PR #6904(上游 OPEN,**已迁移到官方新累加器结构**)
  - `b02f61252` merge PR #7088(上游 OPEN,**已迁移到官方新累加器结构**,codex 兼容)
  - `2c028df1a` fix6649 + 快速路径 + 回归测试(本地自定义,上游无)
  - `2022e27c9` 写入守卫(借自 PR #7178 两处改动,修 fix6649 副作用,上游未合入)
  - `2a46b57a1` 概览页设置引导开关(本地功能,上游无)
  - `41d23ee9f` 概览开关错误处理对齐官方 `handleServerError` 约定(本地,上游无)
  - `8b7d7317b` 固定 `VERSION` / `Dockerfile*` 为 LF(本地,上游无)
  - `e0d95433e` CI 化:新增 `.github/workflows/ghcr-build.yml` + 给上游三个 workflow 加仓库守卫(本地,上游无,见 3.6)
  - `7d840ed76` fix(ci): 追踪 tag 改用定长 9 位 sha(本地,上游无,见 3.6;cherry-pick CI 化时**必须一并带上**)
  - `af343ad83` README 开头补充本仓库说明(本地,上游无;官方每次重写 README 都会冲突,手工放回 `</div>` + `---` 之后即可)
  - 之后为 VERSION 与本文档的 docs 提交
  - 基线 `9978ee1e2`(v1.0.0-rc.39)
- **远程**:`origin` 指上游 `QuantumNous/new-api`(只 fetch,用来拉官方新 tag、发 PR),`fork` 指 `https://github.com/lisrain/new-api`(只 push 维护分支与备份 tag)。
- 历史分支 `lisrain/rc38-patched`(→ `a2f043237`,基于 rc.38,含全部补丁 + CI 化)已删除,备份 tag **`backup/lisrain-rc38-patched`**(指向 `a2f043237`)可随时恢复。
- 历史分支 `lisrain/rc36-patched`(→ `83b88378d`,基于 rc.36,含全部 4 补丁)已删除,备份 tag **`backup/lisrain-rc36-patched`**(指向 `83b88378d`)可随时恢复。
- 历史分支 `lisrain/rc32-patched`(→ `4756876f`,基于 rc.32,含 4 补丁)已删除,备份 tag **`backup/lisrain-rc32-patched`**(指向 `4756876f`)可随时恢复。
- 历史分支 `lisrain/rc30-patched`(→ `b0e476a0`,基于 rc.30,含 4 补丁)已删除,备份 tag **`backup/lisrain-rc30-patched`**(指向 `b0e476a0`)可随时恢复。
- 历史分支 `lisrain/rc27-patched`(→ `89ea2020`,基于 rc.27)已删除,备份 tag **`backup/lisrain-rc27-patched`**(指向 `89ea2020`)可随时恢复。

**在官方合入 #6808 / #6904 / #7088 之前**,每次部署新版本都需**在本分支基础上**:

1. 以当前 HEAD 为基
2. 手动 `git merge`/`cherry-pick` 需要的上游 PR 分支(`gh pr diff <n>` 或 fetch `refs/pull/<n>/head`)
3. 保留本地 `relay/helper/stream_scanner.go`(fix6649 + 快速路径)与 `relay/helper/common.go`(写入守卫)的自定义改动——与上游 PR 不冲突(不同文件)
4. `echo "v1.0.0-rc.39-N" > VERSION`(序号递增)→ 提交并 `git push fork lisrain/rc39-patched`,等 `ghcr-build` workflow 绿灯(测试 / 构建 / 冒烟三段);只想临时换个版本号时可手动 `workflow_dispatch` 并填 `version` 输入,不必改文件
5. 更新 `C:\Users\Lenovo\Desktop\AIProxy\newapi\docker-compose.yml` 的 `image:` 为 `ghcr.io/lisrain/new-api:v1.0.0-rc.39-N`(`docker compose up -d` 自动拉取)

**待官方将 #6808、#6904、#7088 合入 main 后**,可直接切到官方新 release 基线,届时本地的 stream_scanner 自定义改动可作为对比参考逐步收敛。工作区保持干净。

### 6.2 官方发新 release(如 rc.40)时的跟进流程
1. `git fetch origin --tags` 拉取官方新 tag
2. 基于官方新 tag 建本地分支:`git switch -c lisrain/rc40-patched v1.0.0-rc.40`
3. 按需 cherry-pick 本地补丁(以下 rc.39 分支 hash):`f758cff3d`(#6808)、`10a5c5fc4`(#6904)、`b02f61252`(#7088)、`2c028df1a`(fix6649 + 快速路径)、`2022e27c9`(写入守卫)、`2a46b57a1`(概览页设置引导开关)、`41d23ee9f`(错误处理对齐)、`8b7d7317b`(构建换行)、`e0d95433e` + `7d840ed76`(CI 化,须成对,见 3.6)、`af343ad83`(README 说明段,预期与官方 README 冲突);官方已合入的跳过对应 commit。**`LOCAL_PATCHES.md` 与 `VERSION` 不 cherry-pick**,最后从旧分支 `git show <旧分支>:LOCAL_PATCHES.md` 取来改好后单独提交
4. 处理可能的冲突,重点核对:
   - `relay/helper/stream_scanner.go` —— 本地改过主 select 与 scanner 错误分支;官方若动 `client_gone` 分支或退出时序需重新评估
   - `relay/common/stream_status.go` —— 本地把 `endOnce` 换成了 `mu + reasonSet`;官方持续在加 `ResponseOutcome` 系列方法,**若官方把 `SetEndReason` 也改成可覆盖,则 #6808 可退役**
   - `relay/channel/openai/relay_responses.go` —— 若官方再次重构事件处理,**重放 2.2 的终态标记与 2.3 的 `normalizeResponsesOutputItemAdded` 调用**(二者在同一闭包内);若官方自行给 HTTP SSE 路径补上 `SetEndReason(Done)`(参照其 WS 路径),则 #6904 可退役;官方合入 #7088 则跳过 2.3
   - `relay/helper/common.go` —— 本地把 `StringData` / `ResponseChunkData` 的上下文取消分支改为返回 nil;#7178、#7419 都会改此文件,谁先合入都要重新核对 3.5 是否仍需保留
   - `controller/misc.go` —— 官方若在 status map 新增键,注意与 `setup_guide_enabled` 的上下文合并
   - `overview-dashboard.tsx` —— 官方若继续重构概览页,**保留四处 `setupGuideEnabled` 守卫**
   - `system-settings/{types.ts, hooks/use-update-option.ts}` —— 官方改动频繁,注意 `setup_guide_enabled` 键与 STATUS_RELATED_KEYS 条目的存活
   - `.gitattributes` —— 本地在 Shell scripts 段后追加了 `Dockerfile* text eol=lf` 与 `VERSION text eol=lf`,官方若改该文件注意保留
   - `README.md` / `README.zh_CN.md` —— 官方重写 README 时"本仓库说明"段必冲突;放回官方新版顶部 `</div>` 与 `---` 之后,并同步基线版本号与 `docker pull` 示例
5. 递增 VERSION 序号 → `git push fork lisrain/rcNN-patched` 触发云端构建(3.6,新分支第一次构建是冷缓存,约 10 分钟)→ 更新 compose 的 `image:` 为 ghcr 地址。**本机不跑测试与构建**,红灯再看。旧分支删除前打 `backup/lisrain-rcXX-patched` tag 并推到 fork,再 `git push fork --delete lisrain/rcXX-patched`

---

## 7. 其他值得关注的上游开放 PR(未合入,按需评估)

> 2026-09-19 第二次复查(基于每个 PR 的完整 diff 与本地代码逐一对照;`origin/main` 当时领先 rc.38 七个提交,均未触及下列落点):**#7088 已合入(2.3),#7178 的写入守卫已借用(3.5)**,其余维持 OPEN、未合入本地。**2026-09-21 rc.39 跟进时用 `gh pr view` 复查状态:下列 PR 全部仍 OPEN 且无新更新,rc.39 未合入任何一个,结论不变**(见 1.2)。部署形态为单用户本地网关(codex → 本地 new-api → 第三方 new-api Responses 上游),不使用订阅、不启用分组限流,评估以此为前提。

- ~~**#7088** Responses item 集合规范化~~ —— **已合入本地**,见 2.3。
- **#6951** `fix(openai): 正确结束 Responses 流` —— **与本地 #6904 同源同方案**(终态事件后立即结束流,避免误记 `client_gone`),官方未吸收。经 2026-09-19 逐行核对,其写法(`sr.Done()` 挂在 `case "response.completed", "response.done":` 分支末尾)与本地 #6904 原版**完全一致,无更优之处**;本地迁移到 `ResponseOutcome()` 的版本更贴合 rc.38 新累加器结构。8 月 30 日后无更新。若该 PR 合入,可与 #6904 一并退役。
- **#7178** `fix(relay): drain upstream after client_gone to collect final usage` —— **与本地 fix6649 同落点**(`StreamScannerHandler` 主 select 的 `client_gone` 分支),只能二选一,不能叠加。2026-09-19 第二次核对:
  - 等待信号等价——它等 `stopChan`,本地等 `scannerDone`,scanner goroutine 退出时两者都会关闭;差异只在窗口长度(可配置 `CLIENT_GONE_DRAIN_TIMEOUT` 默认 60s vs 本地固定 500ms)和写入守卫。
  - **写入守卫已借用**(3.5)。drain 部分**不采纳**:rc.38 已合入 #7427,Responses 断流有估算,chat 断流走文本估算,不会记 0;它换来的是估算变精确,代价是用户主动取消后上游最多再跑一分钟 token。若日后要采纳,建议超时设 1~2s 并保留本地快速路径。
  - 与 #7419 同样在 `helper/common.go` 与 `stream_scanner.go` 相撞,谁先合谁得 rebase。
- **#7419** `fix(relay): correctly label estimated Responses stream usage`(2026-09-17,核心开发者 @seefs001,与 main 冲突待作者 rebase)—— **改动文件几乎覆盖本地全部补丁落点**(`stream_status.go`/`stream_scanner.go`/`helper/common.go`/`stream_result.go`/`responses_websocket.go`/`responses_usage.go`/`log_info_generate.go`),但:
  - **不影响本地补丁的必要性**——它**保留了 `endOnce sync.Once`**(不采纳 #6808 的"正常完成可覆盖 `client_gone`"),也**未改主 select 的 `client_gone` 分支逻辑**(仅给错误参数包上来源标记),更**未在 HTTP SSE 路径加终态标记**;
  - 其核心是**流错误诊断**:新增 `streamDiagnosticWriter` 包装 `c.Writer` 记录下行写失败、`WithStreamErrorSource` 标记错误来源(`downstream_write`/`upstream_read`/`request_context`/`stream_idle_timeout`)、`describeStreamError` 归类错误码,并把错误码与来源写进消费日志详情;
  - `streamDiagnosticWriter` 与本地 3.5 覆盖同一场景,其注释明确"不替换终态原因、不影响计费";
  - **不本地合入**,收益只是诊断信息,却要同时改 #6808、fix6649、3.5、#6904 四处。核心开发者提交,大概率进 rc.39 之后;若合入,本地 #6808 需重新适配(`SetEndReason` 内会多出 `EndErrorCode`/`EndErrorSource` 赋值),`ResponsesUsageAccumulator.Finish()` 签名将变为 `Finish(c *gin.Context)`,与本地 #6904 的 `sr.Done()` 相邻但不冲突。
- **#6960** `fix(rate-limit): isolate model rate limiter and scope counter keys by group`(与 main 冲突)—— rc.38 已把内存路径改成预留式计数(`Reserve/Complete`)并识别 `ResponseFailed`,但 PR 指出的两个根因仍在:计数 key 仍是 `userId` 不带 group;内存路径仍每请求调用共享单例 `Init`。本地 compose 启用 Redis,实际走 Redis 分支,该 hunk 只是 key 拼接加 group 可直接用;内存分支 diff 基于旧代码需重做(其零值守卫 rc.38 已有)。**只有后台开启模型限流、不同 group 配了不同限额、且同一用户持有多 group 令牌时才触发**;本地单用户网关不满足,**不合入**。key 变更后旧 Redis key 自然过期,无需迁移。
- **#6927** `修复:记录异常流中断到错误日志`(可合并)—— scanner 出错且客户端未断时 `RecordError`,流异常结束时写 type=5 错误日志,纯 `client_gone` 不写;`relay/helper` 已 import `service`,无循环依赖。本地 `ERROR_LOG_ENABLED=true`,收益是 `scanner_error`/`timeout`/`panic` 进后台错误日志页。**暂不合入**:落点正是 #6808 改过的 scanner 错误分支要手工重放;#7419 落地后会把错误码与来源写进消费日志详情,观测价值被部分覆盖。可选、低优先级。
- **#7066** `fix(relay): emit terminal error event when upstream stream fails mid-flight`(与 main 冲突,关联 issue #7059 仍 OPEN)—— 思路对但实现有三个问题,**不合入**:(1) 在 `/v1/responses` 路径发的是 `chat.completion.chunk` 形状的错误块而非 `response.failed`,codex 认不出(CodeRabbit 亦指出);(2) chat 路径命中后提前 `return usage, nil`,跳过了 rc.38 的文本估算、`applyUsagePostProcessing` 和工具调用计费,上游没发 usage 时返回空 usage,已转发的部分内容计 0 费,与 PR 描述"计费不受影响"不符;(3) `client_gone` 也算异常,会向已断开的客户端写错误块(无害但多余)。除非改落点并给 Responses 补 `response.failed`,否则不建议合。
- **#7033** `fix(relay): forward SSE frames immediately instead of lagging one frame behind`(与 main 冲突,作者 9/15 仍在更新)—— 收益是首字延迟:当前第 N 帧要等第 N+1 帧到达才下发,对先发 role 空帧再长时间静默的上游可感知;issue #7005 用两级网关串联量化了偏差,**本机恰好是两级 new-api 串联**,滞后会叠加。风险在于这是 chat 最热路径,rc.38 已在此函数加了 `RequireTerminal`、倒数第二帧 usage 回退、`applyUsagePostProcessing`、`observeStreamChoices`,PR 删掉的 `shouldSendLastResp` 逻辑在 rc.38 仍在且被上述改动依赖,需整体重写;行为变化:带 `choices` 与 `usage` 的终止帧原来会被吞,改后会发给未请求 usage 的客户端。**暂不合入**,等上游吸收;codex 走 Responses 路径不受此影响(Responses handler 本就逐帧直发)。
- **#6913** `fix(billing): 订阅最终结算溢出时扣除钱包差额`(与 main 冲突,关联 issue #6911 仍 OPEN)—— rc.38 的 `PostConsumeUserSubscriptionDelta` 在已用超过总额时直接报错,资金来源层原样透传,`wallet_quota_deducted` 硬编码 0,漏洞仍在:预扣成功后实际消费超出订阅剩余额度时结算失败,超出部分没人扣。PR 在同一事务里扣满订阅、差额扣钱包并拆分日志;CodeRabbit 标的 int64 溢出实际不可达(delta 来自 int32 饱和后的差值)。SQL 为方言中性 GORM 表达式,但 AGENTS.md 要求三库实测,PR 只跑了 SQLite。**本地不使用订阅,不合入**。
- **#6979** `fix(subscription): 同套餐续费从当前周期结束时刻接续`(可合并,是唯一能直接 apply 到本地分支的 PR;关联 issue #6978 仍 OPEN)—— 把同套餐未到期时再次购买改为排队接续,评论区已有人指出"额度用尽想立即恢复"的用户会被迫排队,维护者尚未表态,属产品设计决策而非纯 bug。**本地不使用订阅,不合入**;用订阅也建议等官方定夺。
- ~~#7092 codex 非法工具调用导致"继续就断流"(relaykit)~~ — **已 CLOSED**(未合并)
- ~~#7195 `fix(responses): preserve pre-consume when streamed output lacks usage`~~ — **已 CLOSED**,被官方 #7427 取代(rc.38 已合入)
- ~~issue #7062 流式请求中 client_gone 导致计费为 0~~ — **已 CLOSED**,Responses 入站路径由 #7427 修复;其中"Chat Completions 经 Responses 转换"的链路官方注明**另行处理**,尚无对应 PR

**fix6649 已知副作用的处置(2026-09-19)**:第一次跟进记录的"宽限期内回调直写客户端触发 `HandlerStop`,把客户端断开计入渠道健康 failure"(涉及 `relay-claude.go`、`relay_image.go`)已由 3.5 的写入守卫修复,并有回归测试实测覆盖(守卫前失败、守卫后通过)。
