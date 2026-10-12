# M3 分析交互 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:executing-plans 逐任务实现。步骤用 `- [ ]` 复选框跟踪。
> **Spec:** `docs/superpowers/specs/2026-10-12-m3-analysis-interaction-design.md`（设计权威；本计划只给执行顺序与测试用例，签名以 spec §4/§5/§6 为准）。

**Goal:** 把 M2 的「渲染 + 置灰不切换」详情工具栏升级为可交互分析视图，并按 G6 用 ECharts 替换主图（关闭 U4）。

**Architecture:** 纯分析层（`src/analysis/*`）→ 渲染器无关 ChartModel → 纯 ECharts option 构造器（`src/ui/chart/option.ts`）→ ECharts 胶水（`echartsView.ts`，兜底回退 SVG）。三层分离延续 M2，逻辑全单测，ECharts 渲染由 L2 冒烟验证。

**Tech Stack:** TypeScript strict + esbuild + jest(jsdom) + echarts 6.1.0（按需 `echarts/core`，tree-shaken，spike 实测 678KB）。

## Global Constraints（逐字复制自 spec / dev plan / AGENTS.md）

- 契约**只读**：不改 `schemas/`、不改 golden fixtures 字节（`tests/checksums.spec.ts` 守卫）、不改 policy 阈值。overlay 的 `axis_mode`/`min_overlap_months` 只消费不改判（D-M3-5）。
- 数据诚实（UI-UX §6，不可妥协）：`connectNulls:false` 恒定；缺失 Badge「缺失」绝不填 0；春节合并**只注释不虚构值**（D-M3-8）；置灰控件 title=reasonText + aria-disabled，永不抛错。
- 颜色不硬编码，走 `styles.css` §2 令牌（UI-UX §8.5）；类名 `mcd-` 前缀。
- 每任务 `npm run verify` 绿后独立提交；commit 英文无双引号，`git commit -F .mcd-stage/commit-msg-*.txt`，含 Agent-Task/Agent-Decision/Agent-Limitation，**省略 Agent-Model**。
- PowerShell 用 `;` 不用 `&&`；不用 `tail`/`grep`/`2>/dev/null`（用 `Select-Object -Last N`、Grep 工具、`2>&1`）。
- 分支 `qoder/general-session-y35a2v`，推送 `origin`。

---

## Task 1: 纯分析层（transform / overlay / smoothing / springFestival / range）

**Files:**
- Create: `src/analysis/transform.ts`、`src/analysis/overlay.ts`、`src/analysis/smoothing.ts`、`src/analysis/springFestival.ts`、`src/analysis/range.ts`
- Test: `tests/analysis/transform.spec.ts`、`overlay.spec.ts`、`smoothing.spec.ts`、`springFestival.spec.ts`、`range.spec.ts`

**Interfaces:** 见 spec §4（`applyTransform`/`resolveOverlay`/`isSmoothingOn`/`detectSpringFestival`/`sliceByRange` 及其类型）。Consumes: `SeriesPoint`/`Unit`/`ReasonCode`（`contract/types`）、`Panel`（`ui/toolbar` 或抽到 `analysis/types`）。Produces: T2 的 `buildChartModel` 依赖这些。

- [ ] **Step 1: 写失败测试**（每函数一组）
  - transform：level 原样；yoy 有 sibling → 用 sibling；yoy 无 sibling → 自算 `(v/v[-12]-1)*100`，缺 12 期→null；mom → `(v/v[-1]-1)*100`，首期 null；null 输入点保持 null（不插值）。
  - overlay：golden 三用例——`retail_sales_total`+`cpi_national_yoy`(supported/single/36) 且重叠≥36 → `{kind:'single'}`；重叠<36 → `{kind:'blocked',reason:'INSUFFICIENT_HISTORY'}`；`retail_sales_sh_yoy`+`retail_sales_total`(INCOMPATIBLE_REGION) → `{kind:'dual'}`；`cpi_national_yoy`+`retail_sales_total`(UNIT_MISMATCH) → `{kind:'blocked',reason:'UNIT_MISMATCH'}`；targetKey=null → `{kind:'none'}`；stub panel → blocked(SOURCE_UNSUPPORTED)。
  - smoothing：`{smoothing:true}`→true；`{smoothing:false}`→false。
  - springFestival：构造 1 月缺失/2 月 null 的序列 → 返回该年 span（startIndex/endIndex 正确）；无春节模式 → `[]`。
  - range：`sliceByRange(points,'1y')` 只留最近 12 期（月度）；`'3y'`→36；`'5y'`→60；`'all'`→全量；空序列→`[]`。
- [ ] **Step 2: 跑测试确认失败** `npx jest tests/analysis` → FAIL（模块不存在）。
- [ ] **Step 3: 写最小实现**（纯函数，无 DOM/Obsidian/echarts 依赖；`noUncheckedIndexedAccess` 安全索引）。
- [ ] **Step 4: 跑测试确认通过** `npx jest tests/analysis` → PASS。
- [ ] **Step 5: `npm run verify`** 全绿。
- [ ] **Step 6: 提交** `feat(m3): add the pure analysis layer for transform, overlay, smoothing, spring-festival and range (T3-7/T3-8)`。

---

## Task 2: ChartModel + ECharts option 构造器（纯）

**Files:**
- Create: `src/analysis/chartModel.ts`、`src/analysis/viewState.ts`（`ViewState` 类型 + `parseViewState` + `DEFAULT_VIEW_STATE`）、`src/ui/chart/option.ts`、`src/ui/chart/tokens.ts`
- Test: `tests/analysis/chartModel.spec.ts`、`tests/analysis/viewState.spec.ts`、`tests/chart/option.spec.ts`

**Interfaces:** spec §4 ChartModel/ChartSeries、§5 buildChartOption、§6 ViewState/parseViewState。Consumes: T1 全部 + `DetailModel`（mapper）。Produces: T3 胶水、T4 工具栏、T5 双图依赖。

- [ ] **Step 1: 写失败测试**
  - viewState：`parseViewState({})`→默认（calendar/line/level/overlay=null/range=all/smoothing=false）；`parseViewState({key:'x',chartType:'bar',smoothing:true})`→保留合法字段、非法值回退默认；`parseViewState(null)`→默认。
  - chartModel：golden `retail_sales_total` + view(line/level/all) → `chartType:'line'`、`layout:'single'`、series[0].role='primary'、`empty:false`；transform=yoy → series 用 `_yoy` sibling；overlay=single → series 含第二条 role='overlay'；overlay=dual → `layout:'dual'` 两条独立；chartType=calendar → `chartType:'calendar'`；全 null 序列 → `empty:true`；春节序列 → `springFestival` 非空 + `annotation` 非空。
  - option：line → `series[0].type==='line'`、`connectNulls===false`、`smooth` 跟随 model；area → `areaStyle` 存在；bar → `type==='bar'`；calendar → `series[0].type==='heatmap'` + `calendar` 坐标 + visualMap；dual → 两个 grid/两个 yAxis；springFestival span → `markArea.data` 含区间；range='1y' → `dataZoom` start/end 收窄；缺失期 → `markLine.data` 含该 x。
- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 写最小实现**（`buildChartOption` 返回 `EChartsOption`，`import type { EChartsOption } from 'echarts'`；tokens 从常量对象取令牌名，值对齐 styles.css）。
- [ ] **Step 4: 跑测试确认通过**。
- [ ] **Step 5: `npm run verify`** 全绿（注意 echarts 类型引入后 tsc 仍绿）。
- [ ] **Step 6: 提交** `feat(m3): add the renderer-agnostic chart model and the pure ECharts option builder (T3-6)`。

---

## Task 3: ECharts 集成（胶水 + 兜底 + U4 体积）

**Files:**
- Create: `src/ui/chart/echartsView.ts`（`renderChart(container, model, tokens)`：init+setOption，try/catch 兜底回退 `renderLineChart`）、`src/ui/chart/index.ts`（导出 `renderChart` 接口）
- Modify: `src/ui/detail.ts`（主图改用 `renderChart`，传 ChartModel）、`src/ui/detailView.ts`（构建 siblingByKey + viewState → buildChartModel → renderChart）
- Test: `tests/chart/echartsView.spec.ts`（mock `echarts/core`：正常路径调 init+setOption；init 抛错 → 回退 SVG 且不抛）

**Interfaces:** spec §3 D-M3-3/D-M3-4。Consumes: T2 buildChartOption/buildChartModel。Produces: T4/T5 复用 renderChart。

- [ ] **Step 1: 写失败测试**（jest.mock('echarts/core')；断言 setOption 收到 buildChartOption 结果；mock init 抛错 → 容器出现 `.mcd-chart__svg` 兜底、无异常）。
- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 写实现**（`echarts/core` 按需 `use([...])`；`init(el,null,{renderer:'canvas'})`；容器无尺寸/抛错→兜底；`registerInterval`/dispose 由 detailView 的 onClose 清理，避免泄漏）。
- [ ] **Step 4: 跑测试确认通过**。
- [ ] **Step 5: `npm run build`** 绿；**实测 main.js 体积** `node -e "console.log(require('fs').statSync('main.js').size)"`，记录到退出审计；若 >700KB 考虑去 SVGRenderer/CustomChart 裁剪。
- [ ] **Step 6: `npm run verify`** 全绿。
- [ ] **Step 7: 提交**（含 package.json/package-lock.json echarts 依赖）`feat(m3): integrate tree-shaken ECharts behind a swappable renderChart with an SVG fallback (T3-6, closes G6/U4)`，Agent-Limitation 记「无真机移动渲染测试，U4 以 678KB 体积实测 + 桌面冒烟为证据」。

---

## Task 4: 受控工具栏 + view_state 持久化

**Files:**
- Modify: `src/ui/toolbar.ts`（受控：`view`+`onChange`；加 范围 段 + 平滑开关 + overlay 改 select）、`src/ui/detail.ts`（透传 view/onChange）、`src/ui/detailView.ts`（getState/setState 全字段；onChange → 更新 viewState → 重渲染）
- Test: 扩 `tests/toolbar.spec.ts`（点击 enabled 项触发 onChange 带正确 patch；disabled 项点击不触发；范围段 4 项；平滑 aria-pressed；overlay select 选项 + INCOMPATIBLE_REGION 项标注「拆分双图」）、扩 `tests/detail.spec.ts`、新增 `tests/detailView.spec.ts`（getState 返回全字段；setState 恢复）

**Interfaces:** spec §6。Consumes: T2 ViewState/parseViewState、T3 renderChart。

- [ ] **Step 1: 写失败测试**（受控行为 + view_state 往返）。
- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 写实现**（disabled 永不挂 onChange；onChange 只发合法 patch；detailView 重渲染幂等，先 dispose 旧 ECharts 实例）。
- [ ] **Step 4: 跑测试确认通过**。
- [ ] **Step 5: `npm run verify`** 全绿。
- [ ] **Step 6: 提交** `feat(m3): make the detail toolbar controlled and persist the full view_state (T3-6/T3-7)`。

---

## Task 5: 跨 region 双图 + 春节注释条

**Files:**
- Modify: `src/analysis/chartModel.ts`（dual layout 完善）、`src/ui/chart/option.ts`（双 grid/双轴）、`src/ui/detail.ts`（春节浅琥珀注释条 `.mcd-note--amber`）、`styles.css`（注释条 + 双图布局样式）
- Test: 扩 `tests/analysis/chartModel.spec.ts`（dual）、`tests/chart/option.spec.ts`（双 grid）、`tests/detail.spec.ts`（春节注释条存在 + 文案；dual 时两图容器）

**Interfaces:** spec §3 D-M3-6/D-M3-8、§5 双图、§7 春节。

- [ ] **Step 1: 写失败测试**（`retail_sales_sh_yoy`+overlay `retail_sales_total` → dual；`retail_sales_total` 春节 span → 注释条 + markArea）。
- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 写实现**。
- [ ] **Step 4: 跑测试确认通过**。
- [ ] **Step 5: `npm run verify`** 全绿。
- [ ] **Step 6: 提交** `feat(m3): add the cross-region split dual-chart and the spring-festival annotation (T3-7/T3-8)`。

---

## Task 6: 门禁 + 冒烟扩展 + M3 退出审计 + 推送

**Files:**
- Modify: `scripts/smoke.mjs`（chart_type 切换不动数据 + overlay 渲染 + view_state 重载恢复 + ECharts canvas/svg 存在断言）
- Create: `docs/superpowers/audits/2026-10-12-m3-exit-audit.md`（spec §9 七项逐条证据 + main.js 体积 + verify/jest/smoke 输出）

- [ ] **Step 1: 扩冒烟脚本**（真实 Obsidian：切 chartType→DOM 变但 tbody 行数不变；设 overlay→第二序列/双图出现；setState 全字段→getState 往返；ECharts 容器 canvas/svg 存在）。
- [ ] **Step 2: `npm run build` + `node scripts/smoke.mjs`** → SMOKE PASS（全绿）。
- [ ] **Step 3: `npm run verify`** 全绿；`npx jest tests/checksums.spec.ts` 绿（golden 未改）。
- [ ] **Step 4: 写退出审计**（spec §9 七项逐条命令 + 证据；U4 体积实测；ETL repo `git status` 干净证明无 schema 写）。
- [ ] **Step 5: 提交** `test(m3): extend the smoke script to the interactive chart paths and record the M3 exit audit (T3-9)`。
- [ ] **Step 6: 推送** `git push origin qoder/general-session-y35a2v`；确认 origin 与 HEAD 齐平。

---

## Self-Review（writing-plans 自检）

1. **Spec 覆盖**：spec §1 八项范围 → T1(yoy/overlay/双图/平滑/春节/range 逻辑)、T2(ChartModel/option/chart_type)、T3(ECharts/U4)、T4(工具栏/view_state)、T5(双图/春节注释)、T6(冒烟/审计)。§9 七项退出 → T6 审计逐条。无遗漏。
2. **占位扫描**：每步有具体测试用例与命令，无 TBD/TODO。签名引用 spec §4/§5/§6（非占位，是权威来源）。
3. **类型一致**：`ViewState`/`ChartModel`/`OverlayDecision`/`TransformKey`/`RangeKey`/`SpringFestivalSpan` 在 T1/T2 定义，T3/T4/T5 一致引用；`renderChart` 接口 T3 定义、T4/T5 复用。`buildChartOption`/`buildChartModel`/`parseViewState`/`resolveOverlay`/`applyTransform`/`detectSpringFestival`/`sliceByRange` 命名跨任务一致。
