# M3 分析交互 设计 spec（插件轨道）

> 本 spec 在用户「自主规划、测试、验收」授权下自审通过并直接进入实现；凡涉及**冻结契约 / schema / golden fixtures / policy 阈值**的变更，一律不在此自决，须人工确认（唯一例外）。
> 上游事实来源：`docs/宏观数据面板_开发计划_v1.0.md`（§4 里程碑、§5 WBS T3-6/T3-7/T3-8、G6/U4）、`docs/宏观数据面板_UI-UX设计指导.md`（§5 组件、§6 数据诚实、§7 布局、§8 翻译规则）。M2 交接见 `docs/superpowers/specs/2026-10-12-m2-plugin-mvp-design.md`。

**目标**：把 M2「渲染 + 置灰但不切换」的详情页工具栏，升级为**可交互的分析视图**——图型/变换/模式/范围切换、overlay 单轴叠加、跨 region 拆分双图、平滑开关、春节合并注释——并按 G6 用 ECharts 替换 M2 的零依赖 SVG 主图（关闭 U4）。

**架构**：新增**纯分析层**（`src/analysis/*`，无 DOM/Obsidian/ECharts 依赖）把「视图状态 + 契约序列」计算成一个**渲染器无关的 ChartModel**；新增**纯 ECharts option 构造器**（`src/ui/chart/option.ts`）把 ChartModel 映射成 ECharts option 对象（可单测）；只有 `echarts.init().setOption()` 是胶水（`src/ui/chart/echartsView.ts`），由 L2 冒烟在真实 Obsidian 里验证。三层分离与可测性延续 M2。

**技术栈**：TypeScript（strict, noUncheckedIndexedAccess）+ esbuild + jest(jsdom) + **echarts 6.x（按需引入，tree-shaken）**。

---

## 1. 范围与非目标

**M3 范围（dev plan §4 line 162 + WBS T3-6/T3-7/T3-8）**：
1. **yoy 衍生序列消费**：变换=同比时消费 `_yoy` 兄弟序列（`panel.transforms.yoy.source` / `panel.modes.yoy.source`）。
2. **overlay 单轴叠加**：叠加下拉选中一个 `supported && axis_mode==='single'` 且重叠期数 ≥ `min_overlap_months` 的指标，主图以 `--wire` 虚线叠加第二条序列（单 y 轴）。
3. **跨 region 拆分双图**：overlay 目标为 `INCOMPATIBLE_REGION` 时，提供「拆分双图」并列对比（两张独立刻度的图），绝不单轴混叠。
4. **平滑开关**：主图折线 `smooth` 布尔切换（默认关），`connectNulls` 恒为 false（断线不跨点）。
5. **春节合并显示**：检测 1–2 月春节合并口径，渲染**强制浅琥珀注释条**说明口径；缺失期保持断线，**不插值、不填 0、不虚构合并值**（D5/D10）。
6. **chart_type 切换**：line / area / bar / table / calendar 按 `panel.chart_types` 白名单渲染，切换不动数据（T3-6 验收）。
7. **ECharts 集成（G6/T3-6）+ view_state（G7）**：主图用 ECharts；详情 leaf 的 view_state 持久化 `{key, mode, chartType, transform, overlay, range, smoothing}`，重载恢复。
8. **范围（range）分段器**：UI-UX §7 工具栏第五维——近1年/近3年/近5年/全部（dataZoom），纯客户端视图约束，不受 capabilities 门禁。

**非目标（延后 M4 或不做）**：调度、drop-folder UI、发布日历 UI、macOS 端到端验收（M4）；seasonal_compare 的「同月跨年」专属图型在 M3 以「按年分组的折线/柱」最小实现，不做完整季节热力图（记为 Agent-Limitation）。

---

## 2. M2 交接现状（只读事实）

- `src/chart.ts`：纯 SVG 几何（niceScale/buildLinePath/gapIndices/…），136 行，**保留**为 ECharts 不可用时的兜底几何来源，但主图默认走 ECharts。
- `src/ui/chartView.ts`：`renderLineChart(container, spec)` 零依赖 SVG 渲染，152 行。M3 把它降为**兜底渲染器**，新增 ECharts 渲染器实现同一 `renderChart` 接口（D-M2-4「swappable」兑现）。
- `src/ui/detail.ts`：`renderDetail` 组合页头/元信息/双时间戳/横幅/工具栏/主图/数据表/脚注，212 行。M3 让它接收 `viewState` 并把工具栏接成**受控**（onChange → 更新 viewState → 重渲染）。
- `src/ui/toolbar.ts`：`buildToolbar({panel})` 渲染 4 段（模式/图型/变换/叠加）+ 置灰引擎，180 行，**当前不切换**。M3 加 range 段 + 平滑开关 + overlay 下拉，并接 onChange。
- `src/ui/detailView.ts`：`McdDetailView`（ItemView），getState/setState 已存 `{key}`。M3 扩展 view_state 字段。
- 契约能力矩阵（golden `capabilities.json`，**冻结只读**）：overlay 仅 `retail_sales_total→cpi_national_yoy`（supported, axis_mode=single, min_overlap_months=36）；`cpi_national_yoy→retail_sales_total` UNIT_MISMATCH；`retail_sales_sh_yoy→retail_sales_total` INCOMPATIBLE_REGION（双图用例）。

---

## 3. 关键决策（M3 内工程判断，可否决）

| ID | 事项 | 决策 | 理由 |
|---|---|---|---|
| **D-M3-1** | 图表库（**关闭 G6 / U4**） | 引入 **echarts 6.x**，`echarts/core` 按需注册（LineChart/BarChart/CustomChart/HeatmapChart + Grid/Tooltip/Legend/DataZoom/MarkLine/MarkArea/VisualMap + Canvas/SVG renderer），esbuild 打包进 main.js | G6 冻结决策 = ECharts；T3-6 明确要求；双轴/dataZoom/markLine/markArea/calendar 是 M3 刚需，ECharts 原生支持，手写 SVG 成本与错误率高 |
| **D-M3-2** | U4 移动端体积 | 构建后**实测 main.js 字节数**写进退出审计；tree-shaken 后若 ≤ ~700KB 则维持 `isDesktopOnly:false`（G6「移动端兼容」），并在 commit 记「未做真机渲染测试」为 Agent-Limitation | U4 只问体积是否可接受；无真机时以体积实测 + 桌面冒烟为证据，诚实标注局限 |
| **D-M3-3** | 可测性 | ECharts **option 构造为纯函数** `buildChartOption(ChartModel): EChartsOption`，单测断言 option 结构（series 类型/数据/yAxis 数/markArea/smooth）；`echarts.init` 仅胶水，jsdom 不测渲染，由 L2 冒烟在真实 Obsidian 验证 | jsdom 无 canvas/尺寸，直接测 ECharts 渲染脆弱；纯 option 层保住 TDD |
| **D-M3-4** | 兜底 | ECharts `init`/`setOption` 抛错或容器无尺寸时，回退 M2 的 `renderLineChart` SVG（line 型），页面不崩 | 失败不静默 + 稳健；复用已验证的 SVG |
| **D-M3-5** | overlay 单轴 vs 双轴 | 忠实消费 `axis_mode`：`single` → 单 y 轴叠加；其它/缺失 → 不叠加并置灰。**不前端改判** capabilities 的轴决策（D5/D10） | capabilities 是契约权威；retail(level) 叠 cpi(yoy) 的 single 判定属 ETL 决策，插件照渲并记观察 |
| **D-M3-6** | 跨 region 双图触发 | overlay 目标 `reason_code===INCOMPATIBLE_REGION` → 叠加下拉该项**可选但标注「拆分双图」**，选中渲染两张并列图（各自刻度），而非单轴 | T3-7 item 4；UI-UX §6 禁止跨区单轴混叠 |
| **D-M3-7** | 平滑语义 | `smooth` = ECharts line `smooth:true`（样条），仅影响**相邻非空点**之间的曲线；`connectNulls:false` 恒定，缺失仍断线 | 数据诚实优先；平滑不得跨缺口连线 |
| **D-M3-8** | 春节合并 | **只注释、不虚构**：检测到某年 1 月缺失/2 月为 null 的春节合并模式时，主图加 markArea 高亮 1–2 月区间 + 详情注释条（浅琥珀）说明「1–2 月因春节合并口径，2 月不单独发布」；绝不合成合并值 | null_not_zero + D5/D10：不猜口径、不填值 |
| **D-M3-9** | view_state 形状 | `{key:string, mode:ModeKey, chartType:string, transform:TransformKey, overlay:string\|null, range:RangeKey, smoothing:boolean}`；缺字段回退默认（calendar/line/level/none/all/false） | G7 重载恢复；向后兼容 M2 的 `{key}` |
| **D-M3-10** | table 型 | chart_type=table 时主图区隐藏 ECharts、仅显数据表（M2 已有表），工具栏其余维度仍可用但不影响图 | table 本就是非图型；最小实现 |

---

## 4. 纯分析层（`src/analysis/*`，无依赖，全单测）

```ts
// transform.ts —— 变换：把「主序列 + 兄弟序列」算成要画的序列
export type TransformKey = 'level' | 'yoy' | 'mom';
export function applyTransform(
  base: SeriesPoint[],            // 已 collapseRevisions
  transform: TransformKey,
  sibling: SeriesPoint[] | null,  // panel.transforms[t].source 指向的 _yoy 序列
): SeriesPoint[];
// level → base 原样；yoy → sibling ?? 由 base 计算的同比（(v/v[-12]-1)*100，缺 12 期→null）；
// mom → 由 base 计算环比（(v/v[-1]-1)*100，首期→null）。计算出的点 revision 沿用源点。

// overlay.ts —— 叠加资格判定（忠实 capabilities）
export type OverlayDecision =
  | { kind: 'none' }
  | { kind: 'single'; targetKey: string; minOverlap: number }
  | { kind: 'dual';   targetKey: string }              // INCOMPATIBLE_REGION
  | { kind: 'blocked'; targetKey: string; reason: ReasonCode };
export function resolveOverlay(
  panel: Panel, targetKey: string | null,
  basePoints: SeriesPoint[], targetPoints: SeriesPoint[] | null,
): OverlayDecision;
// supported+axis_mode=single → 计算重叠月数，≥min_overlap_months→single，否则 blocked(INSUFFICIENT_HISTORY)；
// reason=INCOMPATIBLE_REGION → dual；其它 supported=false → blocked(reason)；targetKey=null → none。

// smoothing.ts —— 平滑（仅开关语义，实际曲线交给 ECharts smooth）
export function isSmoothingOn(view: { smoothing: boolean }): boolean;

// springFestival.ts —— 春节合并检测（只注释）
export interface SpringFestivalSpan { year: string; startIndex: number; endIndex: number }
export function detectSpringFestival(points: SeriesPoint[]): SpringFestivalSpan[];
// 返回所有「1 月缺失或 2 月为 null」的年份区间索引，供 markArea + 注释条使用；无则 []。

// range.ts —— 范围裁剪（dataZoom 的纯逻辑等价，用于 table/导出与初始窗口）
export type RangeKey = '1y' | '3y' | '5y' | 'all';
export function sliceByRange(points: SeriesPoint[], range: RangeKey): SeriesPoint[];
```

**ChartModel（渲染器无关，`src/analysis/chartModel.ts`）**：
```ts
export interface ChartSeries {
  name: string; points: SeriesPoint[]; unit: Unit;
  role: 'primary' | 'overlay'; smooth: boolean;
}
export interface ChartModel {
  chartType: 'line' | 'area' | 'bar' | 'calendar' | 'table';
  layout: 'single' | 'dual';                 // dual = 跨 region 双图
  series: ChartSeries[];                     // dual 时第二条独立成图
  yAxes: { unit: Unit; label: string }[];    // single 叠加同单位→1 轴；dual→2 轴
  springFestival: SpringFestivalSpan[];      // markArea + 注释条
  annotation: string | null;                 // 春节/口径注释文案（浅琥珀条）
  source?: string;
  empty: boolean;                            // 无可画点 → 兜底 wireframe
}
export function buildChartModel(
  detail: DetailModel, view: ViewState, siblingByKey: Map<string, SeriesPoint[]>,
): ChartModel;
```

---

## 5. ECharts option 映射（`src/ui/chart/option.ts`，纯函数，单测）

`buildChartOption(model: ChartModel, tokens: ChartTokens): EChartsOption`，对齐 UI-UX §5 EconomistChart 视觉规则：
- **网格**：仅水平分割线（`splitLine` 横向开、纵向关）；基线加粗（`axisLine` 用 `--text`）。
- **主线**：`--accent` 2.5px；叠加序列 `--wire` 1.5px 虚线 `[4,3]`；`smooth` 按 series.smooth；`connectNulls:false`；最新值端点 `symbol` 实心圆 3px（`showSymbol` 末点）。
- **缺失**：null 点自然断线；每个缺失期 `markLine`（虚竖线）+「缺失」标签（沿用 §6）。
- **春节**：每个 `springFestival` span 一个 `markArea`（浅琥珀 `--amber` 12% 底）+ 顶部注释条文案（composer 渲染，非 ECharts）。
- **x 轴**：`type:'category'`，`axisLabel.formatter` 每年 1 月显 `YYYY-MM`、其余 `MM`；刻度 4px。
- **图型**：line→`type:'line'`；area→line+`areaStyle`；bar→`type:'bar'`；calendar→`type:'heatmap'`+`calendar` 坐标（visualMap 连续色阶，缺失日留白）。
- **双图（dual）**：两个 `grid` + 两个 `xAxis/yAxis`，上下或左右并列，各自 `series`。
- **dataZoom**：`range` 映射为 `dataZoom` 的 start/end（1y/3y/5y/all）+ 底部滑块。
- **tooltip**：`trigger:'axis'`，缺失显「缺失」，数值带单位。
- `ChartTokens` 从 `styles.css` §2 令牌取值（accent/wire/amber/grid/text/muted），**不硬编码颜色**（UI-UX §8.5）；令牌值由 `tests/tokens.spec.ts` 守卫一致性。

---

## 6. 工具栏交互 + view_state（`src/ui/toolbar.ts` 升级 + `src/ui/detailView.ts`）

- `buildToolbar` 改为**受控**：`ToolbarProps` 增 `view: ViewState`、`siblingKeys`、`onChange(patch: Partial<ViewState>): void`。
- 新增第五段 **范围**（近1年/近3年/近5年/全部）+ **平滑**开关（`mcd-segmented__item` 或 switch，aria-pressed）。
- **叠加**从 segmented 改为 `select`（UI-UX §7「叠加下拉」）：选项 = `无` + overlay 候选；`INCOMPATIBLE_REGION` 项 label 追加「（拆分双图）」；不支持项 `disabled` + title=reasonText。
- 点击 enabled 项 → `onChange({chartType:'bar'})` 等 → detailView 更新 view_state → 重新 `buildChartModel` + `setOption`（或重渲染）。**disabled 项永不触发 onChange、永不抛错**（延续 M2 置灰零抛错）。
- `ViewState` 解析：`parseViewState(unknown): ViewState`（纯函数，缺字段回退默认，单测）。
- detailView `getState()` 返回完整 ViewState；`setState()` 解析并恢复。

---

## 7. 数据诚实性（UI-UX §6，不可妥协）

- **断线**：`connectNulls:false` 恒定；缺失期 markLine + 「缺失」标签；平滑不跨缺口（D-M3-7）。
- **双时间戳**：详情页级元信息行 `数据截至 {期} · 更新于 {时间} · {文件名}`（M2 已有，保留）。
- **春节合并**：markArea + **强制浅琥珀注释条**（D-M3-8）；不虚构合并值。
- **缺失/表格**：neutral Badge「缺失」，绝不填 0（M2 已有，保留）。
- **失败不静默**：每个置灰控件 title=reasonText + aria-disabled（M2 已有）；ECharts 兜底回退 SVG（D-M3-4）。
- **来源标注**：figcaption `来源：{source}`（M2 已有，ECharts 下由 composer 保留 figcaption）。

---

## 8. 任务分解（每任务独立可测 + 独立提交）

| 任务 | 交付 | 验收 |
|---|---|---|
| **M3-T1** 纯分析层 | `src/analysis/{transform,overlay,smoothing,springFestival,range}.ts` + 各自 `tests/analysis/*.spec.ts` | yoy 消费兄弟序列/自算同比；mom 环比；overlay single/dual/blocked 判定（golden 三用例）；春节检测；range 裁剪——全绿，无 DOM 依赖 |
| **M3-T2** ChartModel + option 构造器 | `src/analysis/chartModel.ts`、`src/ui/chart/option.ts`、`src/ui/chart/tokens.ts` + 测试 | buildChartModel 对 golden 指标产出正确 series/layout/yAxes/springFestival；buildChartOption 断言 ECharts option 结构（line/area/bar/calendar、单/双轴、markArea、smooth、dataZoom） |
| **M3-T3** ECharts 集成 | `npm i echarts`；`src/ui/chart/echartsView.ts`（init+setOption+兜底）；改 `detail.ts` 用 `renderChart` 接口；esbuild 打包；**实测 main.js 体积** | `npm run build` 绿；main.js 体积记录；冒烟在真实 Obsidian 渲染 ECharts canvas/svg 无控制台错误；ECharts 抛错时回退 SVG（单测 mock） |
| **M3-T4** 受控工具栏 + view_state | 升级 `toolbar.ts`（range 段 + 平滑 + overlay select + onChange）；`detailView.ts` view_state 扩展；`parseViewState` + 测试 | 点击 enabled 项切换图型/变换/范围/叠加/平滑并重渲染；disabled 零触发零抛错；view_state 持久化全字段并重载恢复（单测 + 冒烟） |
| **M3-T5** 双图 + 春节注释 | `chartModel`/`option` 的 dual layout；详情注释条（浅琥珀）；composer 接线 + 测试 | retail_sales_sh_yoy 选 retail_sales_total → 拆分双图（两 grid/两轴）；retail_sales_total 春节 span → markArea + 注释条；断线不跨点 |
| **M3-T6** 门禁 + 冒烟 + 退出审计 | 改 `scripts/smoke.mjs`（chart_type 切换 + overlay + view_state 恢复断言）；`npm run verify`；M3 退出审计 | 一键门禁全绿；冒烟断言图型切换不动数据 + overlay 渲染 + view_state 恢复；§9 七项逐条命令验证；提交 + 推送 |

---

## 9. M3 退出标准（视图切换七项，可命令验证）

> v0.1 §8.2 原文档已不在仓库（`docs/ArchivedDocs-DoNotRead/` 仅余 4 文件）；以下七项按 dev plan §4 line 162 M3 范围 + §5 WBS T3-7/T3-8 的「§8.2 第 2/3/4/5 项」引用 + UI-UX §5/§6/§7 **重新推导**，作为 M3 的 L3 验收清单（推导依据记于此，供人工复核）。

1. **chart_type 切换**：line/area/bar/table/calendar 按 `panel.chart_types` 渲染，切换不动底层数据（`npm test` option 断言 + 冒烟 DOM 断言）。
2. **变换 transform**：level/yoy/mom 切换；yoy 消费 `_yoy` 衍生序列；禁用项置灰零抛错（`tests/analysis/transform.spec.ts` + `toolbar` 单测）。
3. **overlay 单轴叠加**：supported+axis_mode=single+≥min_overlap_months → 单轴 `--wire` 虚线叠加；不满足 → 置灰 + reason（`tests/analysis/overlay.spec.ts` golden 三用例）。
4. **跨 region 拆分双图**：overlay 目标 INCOMPATIBLE_REGION → 两图并列各自刻度，不单轴混叠（`chartModel` dual + option 双 grid 断言 + 冒烟）。
5. **平滑 + 春节合并**：平滑开关默认关、切换生效且断线不跨点；春节合并渲染 markArea + 强制浅琥珀注释条（`springFestival.spec.ts` + option markArea 断言）。
6. **范围 range**：近1年/近3年/近5年/全部 切换 → dataZoom 窗口随之变化（option dataZoom 断言）。
7. **ECharts + view_state（G6/G7）**：主图由 ECharts 渲染（冒烟真实 Obsidian 断言 canvas/svg 存在 + 控制台无错误）；view_state 持久化 `{key,mode,chartType,transform,overlay,range,smoothing}` 并重载恢复（单测 + 冒烟）；U4 以 main.js 体积实测关闭。

**通用门禁**：`npm run verify` 全绿；`tests/checksums.spec.ts` 绿（golden 字节不变）；无对 ETL `schemas/` 的写；契约只读。

---

## 10. 假设与边界

1. **假设**：M2 已交付总览/详情/置灰工具栏/view_state(key) 且冒烟 14/14 绿（已验证）。真实 manifest 当前仅 2 个 retail 指标；总览/详情如实只渲染 manifest 内指标，不凑数（D5/D10）。
2. **边界**：只覆盖 M3。调度/drop-folder UI/发布日历 UI/macOS 端到端 = M4。
3. **需人工确认（不在 M3 自决）**：任何写入 processed 产物的 caliber 字段、manifest 分组字段、golden fixtures 字节、policy 阈值——均属冻结 schema / golden 变更。overlay 的 `axis_mode`/`min_overlap_months` 由 ETL 决定，插件只消费不改判（D-M3-5）。
4. **U4 局限**：无真机移动渲染测试；以 tree-shaken main.js 体积实测 + 桌面冒烟为证据，`isDesktopOnly` 依体积阈值决定，局限记入 commit（D-M3-2）。
5. **seasonal_compare 局限**：M3 以「按年分组折线/柱」最小实现同月跨年对比，不做完整季节热力图（记 Agent-Limitation）。
6. **ECharts 版本**：6.x（registry 实测 latest=6.1.0）；按需 `echarts/core` 注册以控体积；若 6.x API 与 5.x 差异导致 option 不兼容，以 6.x 官方类型为准。
