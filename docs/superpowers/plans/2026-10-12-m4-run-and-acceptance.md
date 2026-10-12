# M4 运行与验收 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:executing-plans 逐任务实现。步骤用 `- [ ]` 复选框跟踪。
> **Spec:** `docs/superpowers/specs/2026-10-12-m4-run-and-acceptance-design.md`（设计权威；本计划只给执行顺序与测试用例，签名以 spec §4/§5 为准）。

**Goal:** 交付 S5「发布日历与采集状态」插件视图（契约安全版）+ 两平台调度配置文件（ship-don't-register），并做 M4 端到端验收（如实延后 macOS e2e 与两周 soak）。

**Architecture:** 延续 M2/M3 三层分离——纯映射 `contract/releaseMapper.ts` → `ReleaseModel` → 纯 DOM composer `ui/release.ts` → 视图胶水 `ui/releaseView.ts` → 注册 `main.ts`/`constants.ts`。逻辑全单测，渲染进真实 Obsidian 由 L2 冒烟验证。ETL 调度只补 `deploy/` 配置文件，不写契约、不在用户机器注册任务。

**Tech Stack:** TypeScript strict + esbuild + jest(jsdom) + 既有 `--mcd-*` 令牌（不新增）；ETL 侧 `schtasks`/launchd plist（静态文件）。

## Global Constraints（逐字复制自 spec / dev plan / AGENTS.md）

- 契约**只读**：不改 `schemas/`、不改 golden fixtures 字节（`tests/checksums.spec.ts` 守卫）、不改 policy 阈值、不新增令牌（`tests/tokens.spec.ts` 守卫）。发布权威日落 vault = 人工确认项，不在 M4（spec §10-3）。
- 数据诚实（UI-UX §6，spec §2，不可妥协）：调度运行时态（轮询/重试/告警/下次运行时刻）**契约无 → 不渲染不伪造**；「下次发布」按频率推导且显式标注「预计」；stale→overdue 行浅红底，**不冒充**运行时 fail；manual→Badge「手动」。
- 用户 Q1＝契约安全推导；用户 Q2＝ship-don't-register（**绝不**在用户机器 `schtasks /Create` 或 `launchctl load`）。
- 颜色不硬编码，走 `styles.css` 令牌；类名 `mcd-` 前缀。
- 每任务 `npm run verify` 绿后独立提交；commit 英文无双引号，`git commit -F .mcd-stage/commit-msg-*.txt`，含 Agent-Task/Agent-Decision/Agent-Limitation，**省略 Agent-Model**。
- PowerShell 用 `;` 不用 `&&`；不用 `tail`/`grep`/`2>/dev/null`（用 `Select-Object -Last N`、Grep 工具、`2>&1`）。
- 分支 `qoder/general-session-y35a2v`，推送 `origin`；ETL 仓无远端（本地提交即可）。

---

## Task 1: 纯映射 releaseMapper

**Files:**
- Create: `src/contract/releaseMapper.ts`
- Test: `tests/releaseMapper.spec.ts`

**Interfaces:** 见 spec §4（`ReleaseModel`/`StatusRow`/`TimelineMarker`/`ReleaseTone`/`toReleaseModel`/`deriveNextExpected`）。Consumes: `ManifestV1`/`ManifestIndicator`/`IndicatorSeriesV1`/`Frequency`/`Status`（`contract/types`）、`freshnessLabel`（`format`）。Produces: T2 composer、T3 view 依赖 `toReleaseModel`。

- [ ] **Step 1: 写失败测试**
  - `deriveNextExpected('2026-08','monthly')==='2026-09'`；`('2026-12','monthly')==='2027-01'`（跨年）；`('2026-Q2','quarterly')` 或月度末季→次季；`('2026-08-15','daily')==='2026-08-16'`；`(null,*)===null`；`('bad','monthly')===null`（坏格式不猜）。
  - `toReleaseModel(realManifest, seriesByKey)`（用 `tests/golden/contract/processed/manifest.json`）：`anchorMonth==='2026-10'`（generated_at 2026-10-12）；`months.length===13` 且以 anchor 前 11 月起、后 1 月止；`rows.length===indicators.length`；retail_sales_total 行 `tone==='aging'`、`lastDate==='2026-08'`、`nextExpected==='预计 2026-09'`、`overdue===false`。
  - stale 指标 → `overdue===true`；`source==='manual'` 序列 → `isManual===true` 且 `source==='手动'`；空 indicators → `empty===true`、`rows===[]`、`markers===[]`；缺 `generated_at` → anchor 回退 `max(last_date)`。
  - markers：每指标一枚，`month`=last_date 月锚、`nextMonth`=derived、`tone`=freshness。
- [ ] **Step 2: 跑测试确认失败** `npx jest tests/releaseMapper.spec.ts` → FAIL（模块不存在）。
- [ ] **Step 3: 写最小实现**（纯函数，无 DOM/Obsidian；`noUncheckedIndexedAccess` 安全索引；月锚解析用 `^(\d{4})-(\d{2})` 正则，不识别→null）。
- [ ] **Step 4: 跑测试确认通过** `npx jest tests/releaseMapper.spec.ts` → PASS。
- [ ] **Step 5: `npm run verify`** 全绿。
- [ ] **Step 6: 提交** `feat(m4): add the contract-safe release-calendar mapper with a derived next-expected date (T2-6)`。

---

## Task 2: composer + 样式

**Files:**
- Create: `src/ui/release.ts`
- Modify: `styles.css`（`.mcd-release*`，仅复用现有令牌）
- Test: `tests/release.spec.ts`

**Interfaces:** spec §5。Consumes: T1 `ReleaseModel`、`el`/`clearEl`（`ui/dom`）、`freshnessDotClass`（`format`）。Produces: T3 view 用 `renderRelease`。

- [ ] **Step 1: 写失败测试**（jsdom，构造小 `ReleaseModel`）
  - `renderRelease(root, {model, handlers})` → `.mcd-release` 存在；`.mcd-release__timeline` 含 `months.length` 个刻度；每 marker 一个 `.mcd-release__marker`（实心）+ 有 nextMonth 者一个 `.mcd-release__marker--next`（空心）。
  - `.mcd-release__list` 行数 === `rows.length`；表头五列文案（指标/来源/状态/数据截至/预计下次）。
  - overdue 行含 `.is-overdue`；isManual 行来源列含 `.mcd-badge` 文案「手动」；「预计」出现在预计下次列。
  - 行尾「查看详情」按钮点击 → `handlers.onOpenDetail(key)` 被调（带正确 key）。
  - `model.empty===true` → `.mcd-release__empty`（「暂无指标」），不渲染列表行。
  - `honestyNote` 出现在 `.mcd-release__note`。
- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 写实现 + 样式**（时间线用 CSS grid/flex 月轴 + 绝对定位 marker；列表复用 `.mcd-table` 语义或 grid；overdue 行 `border-left:3px solid var(--mcd-red)` + 浅红底 `color-mix` 或既有 token；空态复用 `.mcd-empty` 风格）。
- [ ] **Step 4: 跑测试确认通过**；`npx jest tests/tokens.spec.ts` 仍绿（未新增令牌）。
- [ ] **Step 5: `npm run verify`** 全绿。
- [ ] **Step 6: 提交** `feat(m4): render the release calendar and collection-status view from the frozen manifest (S5)`。

---

## Task 3: 视图 + 注册 + 导航

**Files:**
- Create: `src/ui/releaseView.ts`
- Modify: `src/constants.ts`（3 常量）、`src/main.ts`（registerView + addCommand + `activateRelease`）、`src/ui/overview.ts`（页头入口）、`src/ui/detail.ts`（页头入口）
- Test: `tests/releaseView.spec.ts`；扩 `tests/overview.spec.ts`、`tests/detail.spec.ts`（入口按钮存在 + 触发 handler）

**Interfaces:** spec §7。Consumes: T2 `renderRelease`、`loadContract`（`contract/loader`）、`toReleaseModel`、`renderOnboarding`。Produces: 稳定的 `VIEW_TYPE_MCD_RELEASE` / `COMMAND_OPEN_RELEASE`。

- [ ] **Step 1: 写失败测试**
  - `McdReleaseView`：`getViewType()===VIEW_TYPE_MCD_RELEASE`；`onOpen` 后（mock loadContract 成功）`contentEl` 含 `.mcd-release`；loadContract 失败（no_manifest）→ `.mcd-onboarding`（degraded）；`getDisplayText()===RELEASE_VIEW_TITLE`。
  - overview/detail 页头有「发布日历」入口（`.mcd-*` 按钮，`aria-label`/title 含「发布日历」），点击 → 对应 handler（`onOpenRelease`）被调。
- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 写实现**（`releaseView.ts` 仿 `overviewView.ts`：`refresh()` loadContract→ok 则 `toReleaseModel`+`renderRelease`，否则 onboarding；`onClose` clear；`main.ts` 注册视图 + 命令 + `activateRelease()` 复用 leaf；overview/detail 页头各加入口按钮透传 `onOpenRelease: () => plugin.activateRelease()`）。
- [ ] **Step 4: 跑测试确认通过**。
- [ ] **Step 5: `npm run verify`** 全绿。
- [ ] **Step 6: 提交** `feat(m4): register the release-calendar view with a command and header navigation entry points (T2-6)`。

---

## Task 4: 调度交付物（ETL 仓，ship-don't-register）

**Files（均在 `D:\Codex\MacroDataETL`，工作区外）:**
- Create: `deploy/com.mcd.etl.plist`（launchd 每日调 `run_etl.sh`）、`deploy/register_task.bat`（`schtasks /Create` 脚本，**供用户自行运行**）、`deploy/README.md`（两平台注册/卸载/查日志 runbook + `.env` 必填 + 双 venv G29/G30）
- Test: 静态校验（plist XML 合法 + 必需键；不注册、不加载）

**Interfaces:** spec §6。Consumes: 既有 `run_etl.sh`/`run_etl.bat`（G30 正确）。Produces: 可运行的调度配置文件 + runbook。

- [ ] **Step 1: 写 plist**（`Label=com.mcd.etl`、`ProgramArguments=[/bin/bash, <repo>/run_etl.sh]`、`StartCalendarInterval` 每日、`StandardOutPath`/`StandardErrorPath` 指 `logs/`、`RunAtLoad=false`）。用相对占位 + runbook 说明如何替换 `<repo>`（不写死用户路径，spec §6/v0.1 §6.1）。
- [ ] **Step 2: 写 register_task.bat**（`schtasks /Create /TN "MCD ETL" /TR "<repo>\run_etl.bat" /SC DAILY /ST 08:00`，参数从注释/`.env` 说明；顶部注释强调「本脚本由用户手动运行，M4 不自动注册」）。
- [ ] **Step 3: 写 runbook**（macOS：`launchctl load ~/Library/LaunchAgents/com.mcd.etl.plist` + 校验 + 卸载；Windows：运行 `register_task.bat` + `schtasks /Query` + 删除；`.env` 必填 `MCD_PYTHON`；双 venv 提示；失败重试/日志轮转引用 M1 实现）。
- [ ] **Step 4: 静态校验** plist：`node -e` 读文件断言含 `Label`/`ProgramArguments`/`StartCalendarInterval` 且为合法 XML（可用简单解析或 `plutil` 若有；无则结构断言）。**不 load、不 create。**
- [ ] **Step 5: `run_etl.bat` 解析 `.env` 绿色验证**：在 ETL 仓跑 `tests/test_run_etl.py`（既有）证明外壳解析 `MCD_PYTHON` 正确、缺则 exit 4；不触发真实网络抓取。
- [ ] **Step 6: ETL 仓提交**（本地，无远端）`feat(m4): add launchd and Task Scheduler deploy artifacts with a runbook (ship-don't-register)`；`git status` 证明 `schemas/`+golden+policy 零改动。

---

## Task 5: 冒烟扩展 + M4 退出审计 + 推送

**Files:**
- Modify: `scripts/smoke.mjs`（开发布日历视图：命令打开 → `.mcd-release` 存在 → 时间线刻度数 === months → 状态列表行数 === 真实指标数 → 「预计」出现 → 控制台无错）
- Create: `docs/superpowers/audits/2026-10-12-m4-exit-audit.md`（spec §9 六项逐条命令 + 证据；两项延后附关闭步骤；U4 体积复述；ETL 仓 `git status` 干净证明无 schema 写）

- [ ] **Step 1: 扩冒烟脚本**（真实 Obsidian：`executeCommandById('mcd:open-release-calendar')` → leaf 挂载 → `.mcd-release` + `.mcd-release__timeline` 刻度 + `.mcd-release__list` 行 ≥1 + 文案含「预计」→ 控制台无错）。
- [ ] **Step 2: `npm run build` + `node scripts/smoke.mjs`** → SMOKE PASS（全绿）。
- [ ] **Step 3: `npm run verify`** 全绿；`npx jest tests/checksums.spec.ts tests/tokens.spec.ts` 绿（golden + 令牌未改）。
- [ ] **Step 4: 写退出审计**（spec §9 六项逐条：#1-#4 PASS 带命令证据；#5 macOS e2e、#6 两周 soak 如实标 DEFERRED 并给确切关闭步骤；main.js 体积实测；插件仓 + ETL 仓 `git status`）。
- [ ] **Step 5: 提交** `test(m4): extend the smoke script to the release-calendar view and record the M4 exit audit (T2-6)`。
- [ ] **Step 6: 推送** `git push origin qoder/general-session-y35a2v`；确认 origin 与 HEAD 齐平。

---

## Self-Review（writing-plans 自检）

1. **Spec 覆盖**：spec §1 四件 in-scope → T1/T2/T3（S5 UI）、T4（调度交付物 + run_etl 验证）、T5（审计）；§9 六项退出 → T5 审计逐条（#1-#4 关、#5-#6 延后）。两项物理不可关（soak/macOS）在 spec §1/§9 + 计划 T5-Step4 如实登记。无遗漏。
2. **占位扫描**：每步有具体测试用例与命令；签名引用 spec §4/§5（权威来源，非占位）；plist/任务脚本给出具体键与 `schtasks` 参数。
3. **类型一致**：`ReleaseModel`/`StatusRow`/`TimelineMarker`/`ReleaseTone`/`toReleaseModel`/`deriveNextExpected` 在 T1 定义，T2/T3 一致引用；`renderRelease`/`ReleaseProps`/`handlers.onOpenDetail`/`onOpenRelease` T2 定义、T3 复用；`VIEW_TYPE_MCD_RELEASE`/`COMMAND_OPEN_RELEASE`/`RELEASE_VIEW_TITLE` T3 定义、T5 冒烟引用。命名跨任务一致。
