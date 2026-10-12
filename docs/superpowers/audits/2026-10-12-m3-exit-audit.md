# M3 分析交互 · 退出标准审计（视图切换七项 + 通用门禁）

日期：2026-10-12
里程碑：M3（分析交互，TypeScript 插件轨）
判据来源：`docs/superpowers/specs/2026-10-12-m3-analysis-interaction-design.md` §9（七项逐条）+ §9 末「通用门禁」

- 插件仓 HEAD：`6149d2b`（M3-T5）+ 本 M3-T6 提交（smoke 扩展 + 本审计）；证据采集于该工作树，提交推送后与 `origin/qoder/general-session-y35a2v` 齐平。
- ETL 仓 HEAD：`master`，`git status --porcelain` 空（工作树干净）；`schemas/` 最近改动为 M0 期 `0828e4f`，M3 全程未写。

## 审计结论：7/7 全部通过（PASS）+ 通用门禁全绿

| # | 标准（spec §9） | 验证命令 | 证据 | 判定 |
|---|---|---|---|---|
| 1 | chart_type 切换：line/area/bar/table/calendar 按 `panel.chart_types` 渲染，切换不动底层数据 | `npx jest tests/chart/option.spec.ts` + `node scripts/smoke.mjs` | option 断言 line/area/bar/calendar 结构；冒烟：切『表格』主图隐藏 `rows=209` 不变，切『折线』主图恢复 `rows=209` 不变 | PASS |
| 2 | 变换 transform：level/yoy/mom 切换；yoy 消费 `_yoy` 衍生序列；禁用项置灰零抛错 | `npx jest tests/analysis/transform.spec.ts tests/toolbar.spec.ts` + 冒烟 | transform.spec：yoy 有 sibling 用 sibling / 无则自算 / mom 环比 / null 保留全绿；toolbar mom `disabled` 零触发；冒烟：切同比 状态生效 + 主图重画 + `rows=209` 不变 | PASS |
| 3 | overlay 单轴叠加：supported+axis_mode=single+≥min_overlap_months → 单轴叠加；不满足 → 置灰 + reason | `npx jest tests/analysis/overlay.spec.ts` | golden 三用例全绿：`retail_sales_total`+`cpi_national_yoy`(single,重叠≥36)→single；重叠<36→blocked `INSUFFICIENT_HISTORY`；`cpi_national_yoy`+`retail_sales_total`→blocked `UNIT_MISMATCH` | PASS |
| 4 | 跨 region 拆分双图：overlay 目标 `INCOMPATIBLE_REGION` → 两图并列各自刻度，不单轴混叠 | `npx jest tests/analysis/chartModel.spec.ts tests/chart/option.spec.ts tests/detail.spec.ts` | chartModel：`retail_sales_sh_yoy`+overlay→`layout:'dual'` 两条独立；option：双 grid / 双 yAxis；detail：`.mcd-chart--dual` + 2×`.mcd-chart__pane` + 2×`.mcd-chart__svg`（真实 vault 无跨 region 序列，活体不可触发 → 单测覆盖，见诚实保留 #1） | PASS |
| 5 | 平滑 + 春节合并：平滑默认关、切换生效且断线不跨点；春节 markArea + 强制浅琥珀注释条 | `npx jest tests/analysis/smoothing.spec.ts tests/analysis/springFestival.spec.ts tests/detail.spec.ts` | smoothing on/off；springFestival span 检测（1 月缺/2 月 null → 该年 span）；detail：春节序列→`.mcd-note--amber` 含「春节」文案，golden（Jan+Feb 齐）→无注释条；`connectNulls:false` 恒定 | PASS |
| 6 | 范围 range：近1年/近3年/近5年/全部 切换 → dataZoom 窗口随之变化 | `npx jest tests/analysis/range.spec.ts tests/chart/option.spec.ts` | range 裁剪 1y=12 / 3y=36 / 5y=60 / all=全量 / 空序列=[]；option dataZoom start/end 收窄 | PASS |
| 7 | ECharts + view_state（G6/G7）：主图 ECharts 渲染（canvas/svg 存在 + 控制台无错）；view_state 全 7 字段持久化重载恢复；U4 体积实测关闭 | `node scripts/smoke.mjs` + `npx jest tests/chart/echartsView.spec.ts tests/detailView.spec.ts` + `node -e "…statSync('main.js').size"` | 冒烟：主图 canvas 存在、控制台无错误、`setState` 全 7 字段→`getState` 原样往返；echartsView：init+setOption / 抛错回退 SVG 不抛；main.js=`703635`B=`687.1KB`<700KB → `isDesktopOnly=false` | PASS |

## 通用门禁（spec §9 末）

| 门禁 | 命令 | 结果 | 判定 |
|---|---|---|---|
| verify 全绿 | `npm run verify` | lint 0 errors（1 既有 `settings.ts:30` warning，非 M3 引入）+ tsc clean + esbuild OK + `288` tests / `24` suites，exit 0 | PASS |
| golden 字节不变 | `npx jest tests/checksums.spec.ts` | `23` tests / 1 suite，exit 0（CHECKSUMS.sha256 全绿） | PASS |
| 无对 ETL `schemas/` 的写 | `git -C D:/Codex/MacroDataETL status --porcelain` | 空输出（工作树干净），exit 0 | PASS |
| 契约只读 | 插件仅 `loadData`/adapter 读 `MacroData/processed/*.json`，无写 | 无写路径 | PASS |
| L2 冒烟（真实 Obsidian） | `npm run build` + `node scripts/smoke.mjs` | `SMOKE PASS (23/23)`，exit 0 | PASS |

## 诚实保留项（未粉饰）

1. **overlay 单轴叠加 / 跨 region 双图无法活体冒烟**：真实 vault 仅 `retail_sales_total` + `retail_sales_total_yoy` 两个 CN 序列，所有 panel `overlays={}` 无候选、且无跨 region 序列文件。故 §9-3/§9-4 由单测覆盖（`overlay.spec` golden 三用例、`chartModel` dual、`option` 双 grid、`detail` 双 pane），冒烟只断言「叠加下拉在无候选时诚实禁用（`select.disabled=true`）」，**不虚构第二条序列**（D-M3-5/D-M3-6）。
2. **U4 无真机移动渲染测试**：以 tree-shaken `main.js` 体积实测（`687.1KB`<700KB）+ 桌面 Obsidian 冒烟为证据，`isDesktopOnly` 保持 `false`（D-M3-2）。移动端渲染待 M4/发布前真机复验。
3. **seasonal_compare 最小实现**：M3 以「按年分组」最小实现同月跨年对比，未做完整季节热力图（spec §10-5）。

## 里程碑签署

M3（分析交互）退出标准 **7/7 PASS** + 通用门禁全绿（verify 288/24、checksums 23、smoke 23/23、ETL 零写）。主图已由 ECharts 渲染（G6 关闭）、view_state 全字段持久化重载恢复（G7 关闭）、U4 以体积实测关闭。M3 **验收通过**，可进入 M4（调度 / drop-folder UI / 发布日历 UI / 端到端）。
