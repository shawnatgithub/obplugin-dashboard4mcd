# M2 插件 MVP · 设计规格

日期：2026-10-12
里程碑：M2（插件 MVP，TypeScript 轨）
上游：`docs/宏观数据面板_开发计划_v1.0.md` §4/§5（T3-*）、`docs/宏观数据面板_UI-UX设计指导.md`、M1 产物（`<Vault>/MacroData/`）
判据基线：契约 = ETL 仓 `schemas/`（冻结，本里程碑**只读消费**，绝不改）

> 本 spec 在用户「自主规划、测试、验收」授权下自审通过并直接进入实现；凡涉及**冻结契约/schema/golden fixtures/策略阈值**的变更一律不自作主张，登记为「需人工确认」（手册 §4 / M1 §13 #14）。

---

## 1. 目标与范围

**目标**：让插件从「展示内置示例数据」升级为「只读消费 M1 真实产物并正确渲染」，交付 v0.1 §5 的 MVP 底线（默认回退 `calendar + line + level`）。

**范围（WBS T3-1..T3-6、T3-9）**：
- T3-2 契约读取层（vault adapter 读 manifest/indicators/capabilities，未知 schema 降级横幅 G8）
- T3-3 总览仪表盘接真实数据（示例数据降级为 fallback）
- T3-4 单指标详情页（line/table + 新鲜度标注 + 缺目录 onboarding）
- T3-5 capabilities 置灰引擎 + reason_code → 文案（7 种）
- T3-1 settings 扩展（数据目录、默认视图、onboarding 标记）
- T3-6 view_state（自定义 View 的 getState/setState）；**图表库见 D-M2-4**
- T3-9 `npm run verify` + Obsidian CLI 冒烟覆盖真实数据路径

**非目标（延后 M3/M4）**：overlay 叠加、跨 region 拆分双图、平滑开关、春节合并显示、chart_type 全量切换（M3，T3-7/T3-8）；调度、drop-folder UI、发布日历 UI（M4）。

---

## 2. 现状与差距

现有（commit `cd9f8c6` 起）：`renderOverview` 已能渲染分组卡片网格 + sparkline + 空态，但 `McdOverviewView` 直接喂 `data/overview.ts` 的**示例数据**；`sparkline.ts` 的 `shape(seed)` 是**确定性伪随机占位**，非真实数据。

差距：
1. 无契约读取层——不读 vault 里的真实 JSON。
2. 无详情页（S2/S3）。
3. capabilities 未消费——无置灰、无 reason_code 文案。
4. `types.ts` 的 `Fresh` 只有 3 态，契约（G16）是 4 态（含 `unknown`）。
5. 卡片无稳定 `key`，无法导航到详情。

---

## 3. 架构：契约读取层（纯映射 + 薄 IO）

沿用现有「纯逻辑 / DOM / Obsidian 胶水」三层分离（`sparkline.ts` vs `sparklineView.ts` vs `overviewView.ts`；`logic.ts` vs `main.ts`）：

```
Obsidian vault adapter (IO, 薄)
        │  read <dataDir>/processed/{manifest,capabilities,<key>}.json
        ▼
contract/loader.ts ──► contract/parse.ts (纯: JSON→typed, schema_version 守卫 G8, 不抛错)
        │
        ▼
contract/mapper.ts (纯: typed contract ─► 视图模型 MetricGroup[] / DetailModel)
contract/reasonText.ts (纯: reason_code ─► 中文文案)
        │
        ▼
ui/overview.ts · ui/detail.ts (纯 DOM 合成) ──► ui/overviewView.ts · ui/detailView.ts (ItemView 胶水)
```

**可测性**：`parse/mapper/reasonText` 无 Obsidian / DOM 依赖，用 `tests/golden/contract/` fixtures 直接单测（契约测试，T3-2 验收）。`loader` 只做 adapter 读取 + JSON.parse 包装，薄到无需单测（冒烟覆盖）。DOM 合成用 jsdom 测。

---

## 4. 关键决策（M2 内做的工程判断，可否决）

| ID | 决策 | 取值 | 理由 |
|---|---|---|---|
| D-M2-1 | 总览卡片门面绑定（**关闭 G24 / UI-UX §9#1**） | 卡片 1:1 绑定 manifest `indicators[].key`，按 `region` 分组 | 冻结 manifest 无 `layer`/`presentation`/`family` 字段；加分组字段 = 改冻结 schema（需人工确认）。region 是 manifest 唯一可用分组维度 |
| D-M2-2 | 未知 schema_version 处理（G8） | `parse` 返回 `{ok:false, error:{kind:'unknown_schema', got}}`，UI 顶部降级横幅，**不崩溃、不抛错** | v0.1「不抛错，只禁用或警告」 |
| D-M2-3 | 新鲜度四态中文文案（**关闭 UI-UX §9#2**） | fresh=最新 / aging=临近截止 / stale=已过期 / unknown=待采集；沿用现有 3 态既测文案，仅补 `unknown` | 机器枚举 G16 已冻结；文案 M2 定稿，最小改动不破坏 tokens/format 既测 |
| D-M2-4 | 图表库（**G6 精化，非否决**） | M2 详情页主图用**零依赖 SVG**（扩展 `sparkline.ts` 几何为 `chart.ts`），遵循 UI-UX §5 EconomistChart 视觉规则；ECharts  adoption **延到 M3**，届时用真实冒烟证据评估 U4（移动端体积）后再定 | AGENTS.md「保持插件精简、避免大依赖」与 G6（~1MB）张力；M2 退出标准不要求 ECharts；SVG 复用既测基建（DRY），主图置于可替换 `renderLineChart(container, ChartSpec)` 接口后，M3 换 ECharts 局部化不返工 |
| D-M2-5 | 示例数据去留 | `data/overview.ts` 降级为 **fallback/demo**：未配置数据目录或读取失败时展示，并保留 amber「示例数据」横幅（UI-UX §6 数据诚实） | 首次运行/无数据时仍可用、可测 |
| D-M2-6 | reason_code → 文案 | 见 §7 表（7 种，自拟诚实可执行文案） | v0.1 §5 模板在归档文档，不在工作文档集；按 reason 语义自拟，属 G 类填补 |
| D-M2-7 | 卡片主值口径 | 每张卡展示**该 manifest 指标自身**的 value/unit（level 卡显示原值，_yoy 卡显示同比），不跨指标换算 | G18：base 存原值、`_yoy` 存比率；忠实契约，不前端临时乱算（v0.1） |

---

## 5. 契约类型（`src/contract/types.ts`，镜像冻结 schema，只读）

```ts
export type Region = 'CN' | 'SH' | 'SC' | 'CD';
export type Frequency = 'monthly' | 'quarterly' | 'daily';
export type Unit = 'yoy_pct' | 'mom_pct' | 'index_2020_100' | 'level_cny' | 'unknown';
export type Status = 'active' | 'planned' | 'paused';
export type Freshness = 'fresh' | 'aging' | 'stale' | 'unknown';   // G16 四态
export type ReasonCode =
  | 'INSUFFICIENT_HISTORY' | 'MISSING_MONTHS' | 'INCOMPATIBLE_FREQUENCY'
  | 'INCOMPATIBLE_REGION' | 'UNIT_MISMATCH' | 'DERIVED_NOT_FOUND' | 'SOURCE_UNSUPPORTED';

export interface ManifestIndicator {
  key: string; file: string; schema: string; region: Region;
  frequency: Frequency; unit: Unit; status: Status;
  last_date: string | null; freshness: Freshness;
}
export interface ManifestV1 {
  schema_version: 'manifest_v1'; generated_at?: string; timezone?: string;
  capabilities_file: string; indicators: ManifestIndicator[];
}
export interface SeriesPoint { date: string; value: number | null; revision: number }
export interface IndicatorSeriesV1 {
  schema_version: 'indicator_series_v1'; key: string; title?: string;
  region: Region; frequency: Frequency; date_grain: string; unit: Unit;
  null_policy: 'null_not_zero'; status: Status; source?: string; generated_at?: string;
  series: SeriesPoint[]; quality: { last_date: string | null; errors?: string[] };
}
export interface ModeEntry { supported: boolean; warnings?: string[]; reason_code?: ReasonCode; source?: string }
export interface OverlayEntry { supported: boolean; axis_mode?: string; min_overlap_months?: number; reason_code?: ReasonCode }
export interface FullPanel {
  modes: { calendar: ModeEntry; seasonal_compare: ModeEntry; yoy: ModeEntry };
  overlays: Record<string, OverlayEntry>; chart_types: string[];
  transforms: { level: ModeEntry; yoy: ModeEntry; mom: ModeEntry };
}
export interface StubPanel { source_supported: false; reason_code: ReasonCode }
export interface CapabilitiesV1 {
  schema_version: 'capabilities_v1'; generated_at?: string;
  panels: Record<string, FullPanel | StubPanel>;
}
```

---

## 6. 模块接口（Produces / Consumes）

```ts
// contract/parse.ts —— 纯，不抛错（D-M2-2）
export type ParseOk<T> = { ok: true; value: T };
export type ParseErr = { ok: false; error: { kind: 'unknown_schema' | 'malformed'; got?: string; message: string } };
export function parseManifest(json: unknown): ParseOk<ManifestV1> | ParseErr;
export function parseSeries(json: unknown): ParseOk<IndicatorSeriesV1> | ParseErr;
export function parseCapabilities(json: unknown): ParseOk<CapabilitiesV1> | ParseErr;

// contract/reasonText.ts —— 纯（T3-5）
export function reasonText(code: ReasonCode): string;              // §7 表
export function isStub(p: FullPanel | StubPanel): p is StubPanel;
export function panelReason(p: FullPanel | StubPanel): ReasonCode | null; // stub → 其 code；full → null

// contract/mapper.ts —— 纯（T3-3/T3-4）
export interface OverviewModel { meta: OverviewMeta; groups: MetricGroup[] }
export function toOverview(
  manifest: ManifestV1,
  seriesByKey: Map<string, IndicatorSeriesV1>,
  caps: CapabilitiesV1 | null,
  opts?: { sample: boolean },
): OverviewModel;                                                  // 按 region 分组（D-M2-1）
export interface DetailModel {
  key: string; title: string; unit: Unit; region: Region; frequency: Frequency;
  freshness: Freshness; lastDate: string | null; source?: string;
  points: SeriesPoint[];                                           // 全history（表格/主图用）
  panel: FullPanel | StubPanel | null;                             // 供置灰
  statusBanner: string | null;                                     // 降级/过期/onboarding 文案
}
export function toDetail(
  key: string, manifest: ManifestV1,
  series: IndicatorSeriesV1 | null, caps: CapabilitiesV1 | null,
): DetailModel;

// contract/loader.ts —— IO（薄，Obsidian 依赖）
export type LoadOk = { ok: true; manifest: ManifestV1; seriesByKey: Map<string, IndicatorSeriesV1>; caps: CapabilitiesV1 | null };
export type LoadErr = { ok: false; reason: 'no_data_dir' | 'missing_manifest' | 'unreadable' | 'unknown_schema'; detail: string };
export function loadContract(adapter: DataAdapter, dataDir: string): Promise<LoadOk | LoadErr>;

// ui/chart.ts (纯几何) + ui/chartView.ts (DOM) —— 可替换接口（D-M2-4）
export interface ChartSpec { points: SeriesPoint[]; unit: string; source?: string; heightPx?: number }
export function renderLineChart(container: HTMLElement, spec: ChartSpec): void; // M2: SVG 实现

// types.ts 扩展：Fresh 增 'unknown'；MetricCard 增 key: string 与 spark?: (number|null)[]
```

**MetricCard 扩展语义**：`key` = 契约指标键（详情导航）；`spark` = 真实最近 N 期原值（null=缺期）；`sparklineView` 优先用 `spark` 归一化绘线并在 null 处断笔，无 `spark` 时回退 `shape(seed)` 占位（示例数据）。

---

## 7. capabilities 置灰引擎 + reason_code 文案（T3-5，D-M2-6）

| reason_code | tooltip 文案（置灰项 hover/aria） |
|---|---|
| INSUFFICIENT_HISTORY | 历史数据不足，暂无法进行该分析 |
| MISSING_MONTHS | 存在连续缺月，该视图暂不可用（缺月按 null 保留，不插值） |
| INCOMPATIBLE_FREQUENCY | 数据频率不匹配（如季度 vs 月度），无法按此视图展示 |
| INCOMPATIBLE_REGION | 地区口径不一致，禁止跨区叠加；可拆分双图对比 |
| UNIT_MISMATCH | 单位不一致，无法在同一坐标轴叠加 |
| DERIVED_NOT_FOUND | 缺少对应衍生序列（同比/环比未生成） |
| SOURCE_UNSUPPORTED | 数据源暂不支持该指标，尚未接入采集 |

**置灰规则（UI-UX §6「失败不静默」）**：详情页工具栏的 模式（calendar/seasonal_compare/yoy）、图型（chart_types）、变换（level/yoy/mom）分段器，逐项读 panel：`supported:false` → 该选项 `disabled` + `title=reasonText(code)` + `aria-disabled`；stub panel（`source_supported:false`）→ 整页兜底横幅 + 主图区展示 Wireframe 空态 + 全文案。**禁用项零抛错**（T3-5 验收）。

---

## 8. 详情页（S2/S3）与 onboarding（S4b）

- **导航**：总览卡片 `onSelect(key)` → `plugin.openDetail(key)`（复用 overview 的 reveal 模式）；详情 View 的 `getState/setState` 存 `{key}`（T3-6 view_state），重载 leaf 恢复到同一指标。
- **详情结构（UI-UX S2）**：页头（title + region/frequency/unit/last_date/freshness dot）→ 主图（`renderLineChart`，SVG）→ 数据表（date/value/revision；缺失值用 neutral Badge「缺失」，**绝不填 0**，UI-UX §6）→ 来源脚注（`来源：{source}`）。
- **DetailLimited（S3）**：panel 为 stub 或 series 缺失时，同构但主图区 = Wireframe 兜底 + 横幅说明 reason_code 文案。
- **Onboarding（S4b）**：`loadContract` 返回 `no_data_dir`/`missing_manifest` → 详情与总览展示居中空态：标题 + 三步引导（1 配置数据目录 / 2 运行 ETL / 3 刷新）+ 主按钮「打开设置」+ 次按钮「查看示例数据」（fallback，D-M2-5）。

---

## 9. 测试策略（jest + jsdom + golden fixtures）

- **契约测试（T3-2）**：`tests/contract/*.spec.ts` 用 `tests/golden/contract/processed/*.json` 喂 `parse`/`mapper`/`reasonText`，断言：manifest 6 指标解析、freshness 四态映射、region 分组、level vs yoy 主值、7 reason_code 文案、stub panel 识别、未知 schema_version 降级、缺 series → null 值不崩。
- **DOM 测试**：`tests/detail.spec.ts`（jsdom）断言详情页结构、禁用项 `aria-disabled`+title、表格缺失 Badge、onboarding 空态。
- **既有测试**：`overview/format/sparkline/tokens/logic/checksums` 保持绿；`Fresh` 增 `unknown` 后补 format 断言；`checksums.spec.ts` 继续守卫 golden fixtures 不被改（G3）。
- **门禁**：`npm run verify`（lint+build+test）全绿；`scripts/smoke.mjs`（Obsidian CLI）扩为「配置真实数据目录 → 打开总览 → 断言渲染出真实指标卡片；打开详情 → 断言主图与表格」。

---

## 10. 任务分解（每任务独立可测 + 独立提交）

| 任务 | 交付 | 验收 |
|---|---|---|
| **M2-T1** 契约类型 + parse（G8 守卫） | `contract/types.ts`、`contract/parse.ts` + `tests/contract/parse.spec.ts` | golden 三契约解析全绿；未知 schema → `unknown_schema` 不抛错 |
| **M2-T2** reasonText + capabilities 判定 | `contract/reasonText.ts` + 测试 | 7 reason_code 文案；stub/full 判别；panelReason |
| **M2-T3** mapper（overview + detail） | `contract/mapper.ts` + `tests/contract/mapper.spec.ts` | region 分组；4 态 freshness；level/yoy 主值；缺 series→null；MetricCard.key/spark 填充 |
| **M2-T4** loader（vault adapter IO） | `contract/loader.ts` | 冒烟：真实 vault 目录读出 6/2 指标；缺目录→`no_data_dir` |
| **M2-T5** 总览接真实数据 + fallback | 改 `ui/overviewView.ts`、`types.ts`、`format.ts`、`sparklineView.ts` | 有数据目录→渲染真实卡片；无→示例 fallback + amber 横幅；`unknown` 态渲染 |
| **M2-T6** 详情页 + 图表 + onboarding | `ui/detail.ts`、`ui/detailView.ts`、`ui/chart.ts`、`ui/chartView.ts` + `tests/detail.spec.ts` | line/table 渲染真实序列；置灰零抛错；缺数据 onboarding；view_state 存 key |
| **M2-T7** settings 扩展 + 导航 + 置灰接线 | 改 `settings.ts`、`main.ts`、`metricCard.ts` | 数据目录/默认视图持久化；卡片点击开详情；工具栏禁用项 title=文案 |
| **M2-T8** verify + 冒烟覆盖真实数据 | 改 `scripts/smoke.mjs`；`npm run verify` | 一键门禁全绿；冒烟断言真实渲染 |

---

## 11. M2 退出标准（可命令验证，dev plan §4）

1. 读 M1 真实产物渲染正确：配置 `dataDir` 指向 `<Vault>/MacroData` → 总览出现真实指标卡片、详情出现真实序列（`npm run smoke` 或手动 Obsidian CLI 断言）。
2. 禁用项零抛错：7 reason_code 单测全绿 + 详情页 stub/禁用渲染不抛（`npm test`）。
3. `npm run verify` 全绿（lint + build + test）。
4. 契约只读未改：`tests/checksums.spec.ts` 绿（golden fixtures 字节不变）；无对 ETL `schemas/` 的写。
5. G24 / UI-UX §9#1#2 关闭：卡片按 region 绑定、freshness 四态中文文案定稿（本 spec §4 记录）。

---

## 12. 假设与边界

1. **假设**：M1 已把真实产物写入 `<Vault>/MacroData/processed|signals/`（已验证，M1 §13 #2/#3）。当前真实 manifest 仅 2 个 retail 指标（其余 27 因缺 manual CSV/端点未确认而 skip/fail）；总览**如实只渲染 manifest 内的指标**，不凑数（D5/D10）。
2. **边界**：只覆盖 M2。overlay/跨区双图/平滑/春节合并/chart_type 全量切换 = M3；调度/drop-folder UI/发布日历 UI = M4。
3. **需人工确认（不在 M2 自决）**：任何写入 processed 产物的 caliber 字段、manifest 分组字段（layer/family）、`tests/golden/real/processed/` 重放基准——均属冻结 schema / golden fixtures 变更。
4. **边界**：ECharts（G6）在 M2 **不引入**；D-M2-4 记录延后理由与 U4 评估时点，用户可否决（否决则 M2 直接接 ECharts）。
