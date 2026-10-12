# M4 运行与验收 设计 spec

日期：2026-10-12
里程碑：M4（运行与验收，双仓共同轨）
判据来源：`docs/宏观数据面板_开发计划_v1.0.md` §4 M4 行 + §5 WBS T2-6/T2-7 + §7 line 226（macOS 验收四件事）；UI-UX §5/§6/§7（S5 发布日历与采集状态）。
上游：M0（契约冻结）、M1（数据闭环）、M2（插件 MVP）、M3（分析交互）均已验收通过并推送。

---

## 1. 目标与范围

把 M1–M3 的产物变成「可无人值守运行 + 可视的采集状态」，并做端到端验收。

**本轮自决可完成（in-scope）：**

1. **发布日历与采集状态 UI（S5，契约安全版）**：插件新增一个工作区视图，从**已冻结的 manifest/series**渲染 (a) 月度发布时间线 + (b) 采集状态列表（五列）。这是 M4 唯一的新增前端特性。
2. **调度交付物（ship-don't-register）**：为已存在且已 G30 正确的 `run_etl.bat`/`run_etl.sh` 补齐 OS 调度**配置文件**——Windows 任务计划程序注册脚本 + macOS launchd plist + 一份 runbook。**只交付脚本/plist 文件，不在用户机器上注册任何计划任务**（用户 Q2 决策）。
3. **`run_etl.bat` 绿色验证**：在 Windows 上验证调度外壳能正确解析 `.env` 的 `MCD_PYTHON` 并进入 `run_etl.py`（不触发真实抓取，用 `--help`/dry 路径或既有 `tests/test_run_etl.py`）。
4. **M4 退出审计**：把 §4 M4 退出标准逐条映射到证据，如实标注哪些现在可关、哪些因物理约束延后。

**延后（诚实保留，非本轮可关）：**

- **连续两周无人值守稳定运行**：需 14 天真实墙钟时间，任何单次会话都无法关闭。本轮交付可运行的调度机制 + 失败重试 + 日志轮转（M1 已验证），并给出启动 soak 的确切步骤；soak 本身记为**运维验收待办**。
- **macOS 端到端验收（§6.1 四件事）**：需一台 Mac。开发机为 Windows 25H2，本轮只能对 launchd plist 做**静态校验**（结构/键/plist 语法），真机 e2e 记为延后。
- **权威发布日 `release.expected_day/window_days`（G9）**：只存在于 ETL 仓 `registry/indicators.yaml`，**不在冻结的 vault 契约内**（`manifest_v1` `additionalProperties:false`）。用户 Q1 决策＝**契约安全推导**，故发布日历的「下次发布」按 `frequency` 从 `last_date` 推导并显式标注「预计」，**不改冻结 schema**。

---

## 2. 数据诚实边界（不可妥协，UI-UX §6）

冻结契约能/不能告诉我们的，必须分清，绝不虚构：

| 事实来源 | 能提供 | 不能提供（→ 不渲染，不伪造） |
|---|---|---|
| `manifest_v1.indicators[]` | `key/region/frequency/unit/status/last_date/freshness` | 具体发布日、发布窗口 |
| `manifest_v1.generated_at` | ETL 生成时刻（时间线锚点） | — |
| `indicator_series_v1` | `title`、`source`（含 `manual`）、`quality.last_date` | 采集运行历史 |
| **无法从 vault 获得** | — | **轮询中 / 重试 (n/m) / 告警已触发 / 下次运行 08:00 等调度运行时态**——ETL `logs/` 按 G13 **不落 vault**，`signals/` 只出信号态 |

**推论**：S5 原型的 `polling`（蓝点虚线）、`retry (2/5)`、`Failed · Alert Triggered`、`Next Run: Tomorrow 08:00` 属**调度运行时态**，冻结契约无此数据 → 契约安全版**只渲染 freshness 派生态**（最新/临近截止/已过期/待采集），运行时态留待未来一个「运行历史」契约产品（需人工确认，不在 M4）。此边界写入退出审计，供人工复核。

**推导规则（显示层，不落盘，与平滑/春节同类）：**

- `deriveNextExpected(last_date, frequency)`：monthly→次月；quarterly→次季；daily→次日；`last_date` 为 null 或格式不识别→ null（显示「—」，不猜）。
- 所有推导日期前缀**「预计」**，并在页脚声明其为按频率估算、非调度承诺（权威发布日未发布到 vault）。
- 状态色沿用 freshness 三态令牌：fresh=`--mcd-accent` / aging=`--mcd-amber` / stale=`--mcd-stale` / unknown=`--mcd-wire`（复用 `freshnessDotClass`/`freshnessLabel`，不新增令牌 → `tokens.spec.ts` 恒绿）。
- 「失败行浅红底」映射为 **freshness=stale（已过期）** 行——这是契约能诚实支撑的「需关注」态；用 `--mcd-red` 做行左边框 + 浅红底，**不冒充**运行时 fail。
- `source==='manual'` → Badge「手动」（UI-UX §6 手动数据）。

---

## 3. 架构（延续 M2/M3 三层分离）

```
纯映射 src/contract/releaseMapper.ts   →  ReleaseModel（无 DOM/Obsidian）
纯 DOM src/ui/release.ts               →  renderRelease(root, props)（.mcd-* + 令牌）
视图胶水 src/ui/releaseView.ts         →  McdReleaseView extends ItemView（loadContract → mapper → composer）
注册 src/main.ts + src/constants.ts    →  registerView + addCommand + 导航入口
样式 styles.css                        →  .mcd-release*（仅复用现有令牌）
```

- **纯映射**全单测（无 DOM）；**composer** jsdom 单测；**view** 用 `__mocks__/obsidian.ts` 单测（沿用 jest `moduleNameMapper`）；**渲染进真实 Obsidian** 由 L2 冒烟验证。
- 视图与 overview/detail 同构：`onOpen→refresh`、`onClose→clear`、degraded（无 manifest）→ onboarding，无指标 → 空态。

---

## 4. 数据模型（releaseMapper.ts 产出）

```ts
export type ReleaseTone = 'fresh' | 'aging' | 'stale' | 'unknown';

export interface StatusRow {
  key: string;
  metric: string;          // series.title ?? key
  source: string;          // '手动' | series.source | '本地 ETL'
  tone: ReleaseTone;       // = manifest.freshness（诚实映射，不引申）
  statusLabel: string;     // freshnessLabel(tone)
  lastDate: string;        // manifest.last_date ?? '—'
  nextExpected: string;    // '预计 YYYY-MM' | '—'（derived，显式标注）
  overdue: boolean;        // tone==='stale'
  isManual: boolean;       // series.source==='manual'
  lifecycle: Status;       // manifest.status（active/planned/paused）
}

export interface TimelineMarker {
  key: string;
  name: string;
  month: string;           // last_date 的月锚 'YYYY-MM' | null
  nextMonth: string | null;// derived 次期月锚
  tone: ReleaseTone;
}

export interface ReleaseModel {
  anchorMonth: string;     // generated_at 的月（时间线「当前月」锚，确定性、可测）
  months: string[];        // 时间线横轴：anchor 前 11 月 .. anchor .. 后 1 月（共 13）
  markers: TimelineMarker[];
  rows: StatusRow[];
  generatedAt: string;     // 双时间戳之一
  empty: boolean;          // 无指标
  honestyNote: string;     // 页脚：预计=按频率估算 + 权威发布日未落 vault + 运行时态不可得
}

export function toReleaseModel(
  manifest: ManifestV1,
  seriesByKey: Map<string, IndicatorSeriesV1>,
): ReleaseModel;              // 纯、全函数、不抛错
export function deriveNextExpected(lastDate: string | null, frequency: Frequency): string | null;
```

- `months` 由 `anchorMonth` 确定性展开（不读墙钟 → 测试稳定）；`anchorMonth` 缺 `generated_at` 时回退到 `max(last_date)`，再缺→ 空态。
- `toReleaseModel` 只吃 manifest + series（**不吃 caps**：S5 与能力矩阵无关）。

---

## 5. UI 规格（S5，契约安全版）

- **页头**：标题「发布日历与采集状态」+ 月锚（`anchorMonth`）+ 图例（四态点：最新/临近截止/已过期/待采集）+ 返回总览 / 刷新 / 设置。
- **发布时间线（月度横轴）**：13 个月刻度；每个指标一枚实心点落在 `month`（freshness 色），一枚空心环落在 `nextMonth`（预计）；`anchorMonth` 处一条竖「当前月」线。点稀疏即稀疏（真实 vault 仅 2 指标），**不装饰、不补点**。
- **采集状态列表（五列 + 动作）**：`指标 | 来源 | 状态 | 数据截至 | 预计下次`；`overdue`（stale）行左边框 `--mcd-red` + 浅红底；`isManual` 行来源列 Badge「手动」；行尾动作＝「查看详情 →」（跳 `openDetail(key)`）。
- **诚实页脚**：`honestyNote`（预计口径 + 运行时态不可得 + 数据来源本地 ETL）。
- **降级**：无 manifest → onboarding（复用 `renderOnboarding`）；有 manifest 无指标 → 空态「暂无指标」。
- **类名**：全部 `.mcd-release*` / 复用 `.mcd-dot.is-*`、`.mcd-badge`、`.mcd-table`；颜色仅走令牌（§8-5）。

---

## 6. 调度交付物（ETL 仓，ship-don't-register）

`run_etl.bat`/`run_etl.sh` 已存在且 G30 正确（从 `.env` 读 `MCD_PYTHON`、`PYTHONUTF8=1`、不依赖 activate）。M4 只补 OS 调度**配置文件**：

- **Windows**：`deploy/register_task.bat`（或 `.ps1`）——用 `schtasks /Create` 注册每日任务的**脚本文件**，参数（.pythonw 路径、每日时刻、仓库路径）从 `.env`/注释读取；**本轮不执行注册**，仅在 runbook 说明「用户自行运行」。
- **macOS**：`deploy/com.mcd.etl.plist`——launchd 每日 `StartCalendarInterval` 调 `run_etl.sh` 的 **plist 文件**；`launchctl load` 步骤写入 runbook，本轮**静态校验** plist 结构（键齐全、XML 合法），不在真机加载。
- **runbook**：`deploy/README.md`——两平台注册/卸载/查日志步骤 + `.env` 必填项 + 双 venv（G29/G30）提示。
- 失败重试 / 日志轮转：M1 已实现并测试（`etl/pipeline.py`、`etl/logs.py`、`tests/test_pipeline.py` 失败注入 PASS、`tests/test_logs.py`）；M4 不重写，仅在 runbook 引用。

> ETL 仓在工作区外（`D:\Codex\MacroDataETL`，无远端，branch master）。写入若被沙箱拦截则请求提升权限；契约文件（`schemas/`、golden、policy）**一律不写**（退出审计以 `git status` 证明）。

---

## 7. 导航与命令（稳定 id，AGENTS.md）

- `constants.ts` 增：`VIEW_TYPE_MCD_RELEASE='mcd-release-view'`、`COMMAND_OPEN_RELEASE='open-release-calendar'`、`RELEASE_VIEW_TITLE='发布日历与采集状态'`。
- `main.ts`：`registerView(VIEW_TYPE_MCD_RELEASE, …)` + `addCommand({id:COMMAND_OPEN_RELEASE,…})` + `activateRelease()`（复用 leaf，不堆标签）。
- 入口：overview 页头 + detail 页头各加一个「发布日历」按钮（`handlers.onOpenRelease`）→ `plugin.activateRelease()`。既有命令 id 不改名。

---

## 8. 任务分解（每任务独立可测 + 独立提交）

| 任务 | 交付 | 验收 |
|---|---|---|
| **M4-T1** 纯映射 | `src/contract/releaseMapper.ts` + `tests/releaseMapper.spec.ts` | `deriveNextExpected` monthly/quarterly/daily/null/坏格式；`toReleaseModel` 对真实 golden manifest 产出正确 rows/markers/months/anchor；stale→overdue；manual→isManual；不抛错 |
| **M4-T2** composer + 样式 | `src/ui/release.ts` + `styles.css` `.mcd-release*` + `tests/release.spec.ts` | 渲染时间线 + 五列列表；stale 行浅红底；预计列带「预计」；manual Badge；空态；`tokens.spec.ts` 仍绿 |
| **M4-T3** 视图 + 注册 + 导航 | `src/ui/releaseView.ts`、改 `main.ts`/`constants.ts`/`overview.ts`/`detail.ts` + `tests/releaseView.spec.ts` | 视图挂载；命令注册；degraded→onboarding；overview/detail 页头入口触发导航；`getState`/`setState` 不崩 |
| **M4-T4** 调度交付物 | ETL 仓 `deploy/register_task.bat`、`deploy/com.mcd.etl.plist`、`deploy/README.md` | plist 静态校验（XML 合法 + 必需键）；`run_etl.bat` 解析 `.env` 绿色（不触发真实抓取）；ETL 契约文件零写（`git status` 证明） |
| **M4-T5** 冒烟 + 退出审计 + 推送 | 改 `scripts/smoke.mjs`（开发布日历视图断言时间线 + 行 + 控制台无错）；`docs/superpowers/audits/2026-10-12-m4-exit-audit.md` | `npm run verify` 全绿；`SMOKE PASS`；§9 退出标准逐条证据；soak/macOS e2e 如实延后并给关闭步骤；提交 + 推送 origin |

---

## 9. M4 退出标准（映射 dev plan §4 M4 行；可关/延后如实标注）

> dev plan §4：M4 退出＝「v0.1 §6.1 验收四件事全过；连续两周无人值守稳定运行」。v0.1 原文在 `docs/ArchivedDocs-DoNotRead/`（用户标注勿读）；沿用 M3 §9 先例——**从允许阅读的文档重新推导**四件事，推导依据记此供人工复核：dev plan §7 line 226（macOS 验收四件事→M4 门禁）、Agent 手册 §4（验证金字塔 L0–L3：「单测绿≠验收过，L2/L3 不可跳过」）、M0 plan §6.1 派生约束（换行规则 / 相对路径 / `.env` 机器配置 / 双 venv G29-G30 / `run_etl.bat`+`.sh` 两平台入口）。

| # | 推导出的验收项 | 本轮可关？ | 证据 / 延后原因 |
|---|---|---|---|
| 1 | 两平台调度入口存在且机器配置只从 `.env` 读（不写死路径） | ✅ 可关 | `run_etl.bat`/`run_etl.sh` 已 G30 正确；M4 补 `deploy/` 注册脚本 + plist + runbook；`run_etl.bat` 解析 `.env` 绿色 |
| 2 | 失败重试 / 日志轮转 / 不静默停跑 | ✅ 已关（M1） | M1 审计 #9 失败注入 PASS（`tests/test_pipeline.py`）+ `tests/test_logs.py`；M4 runbook 引用 |
| 3 | 手动 drop-folder 带 manual 标记入库 | ✅ 已关（M1） | M1 审计 #7 PASS（`tests/test_manual_golden.py`）；插件侧 S5 列表以 Badge「手动」呈现 |
| 4 | 发布日历与采集状态可视（S5） | ✅ 可关 | 新增 release 视图，从冻结 manifest 渲染时间线 + 五列状态；契约安全推导「预计」；冒烟断言 |
| 5 | macOS 端到端（launchd 真机跑通四件事） | ⏸ 延后 | 开发机 Windows；plist 仅静态校验；真机 e2e 需 Mac，步骤写入 runbook |
| 6 | 连续两周无人值守稳定运行 | ⏸ 延后 | 需 14 天墙钟；本轮交付可运行调度机制 + soak 启动步骤，结果记为运维验收待办 |

**通用门禁**：`npm run verify` 全绿；`tests/checksums.spec.ts` 绿（golden 字节不变）；`tests/tokens.spec.ts` 绿（不新增令牌）；ETL `schemas/`+golden+policy 零写（`git status` 证明）；契约只读。

---

## 10. 假设与边界

1. **假设**：M1–M3 已交付并推送；真实 vault 仅 2 个 CN retail 指标（时间线/列表如实稀疏，不凑数 D5/D10）。
2. **边界**：只覆盖 M4 的自决可完成部分。调度运行时态（轮询/重试/告警）需未来一个「运行历史」契约产品（人工确认），不在 M4。
3. **需人工确认（不在 M4 自决）**：发布权威 `release.expected_day/window_days` 落 vault（新冻结契约 + golden，双仓同步）；任何写 `schemas/`/golden/policy；在用户机器上**注册**计划任务（用户 Q2 已选 ship-don't-register）。
4. **诚实保留**：#5 macOS e2e、#6 两周 soak 为**运维验收待办**，非开发缺口；开发侧全部交付并自动验证。
5. **令牌**：复用现有 `--mcd-*`，不新增（避免 `tokens.spec.ts` 双侧同步负担）。
