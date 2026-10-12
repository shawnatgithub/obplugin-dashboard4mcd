# 年度粒度（年度总额）设计 spec · CR-2026-10-13

> 变更请求（M0–M4 完成后的产品变更）。用户裁决：详情图若表现年度趋势，应只体现
> **年度总额**，而非每年一段月精度迷你折线。本 spec 定义口径、契约扩展与双仓改动面。
> 冻结契约变更已由用户于 2026-10-13 明确批准（Frequency 枚举 + golden 清单扩展）。

## 1. 诊断（实测，非推测）

- 真实 vault `retail_sales_total`：209 个月度点（2008-01→2026-08），**2012 起每年 1 月行
  缺失、2 月行 value=null**（NBS「1—2 月合并发布」，registry `jan_feb_combined: true`）。
  `connectNulls:false` → 主图被切成 15 段按年迷你折线 + 15 条「缺失」虚线（用户截图）。
- registry `column_map = {value: 当月}`；合并值只存在于源端「累计」列（M0 报告列名实测：
  月份/当月/同比增长/环比增长/累计/累计-同比增长），**从未进入契约**。
- 算术证明：已存月份求和 2023 = 394,428 亿元 ≠ 官方年度 471,495 亿元；差额 ≈ 丢失的
  1—2 月合并值。故插件侧「月份求和 = 年度总额」会少计约 16% → 属伪造（D5/D10），否决。

## 2. 口径决策（用户批准）

- **年度总额 = 当年 12 月「累计」值**（国家统计局官方全年口径，不经算术发明）。
- ETL 新增 registry 键 `<key>_annual`（首支：`retail_sales_total_annual`），走**抓取路径**
  （`column_map = {date: 月份, value: 累计}`），normalize 年度规则只保留 12 月行、
  日期规整为 `YYYY`。衍生路径（derive from 父序列）不可用：父月度序列无合并值。
- **未完结年份不入年度序列**（无 12 月行 → 自然缺席），不展示「截至 N 月累计」点数，
  避免与全年总额并列造成断崖误读；口径说明落详情脚注。
- 12 月「累计」为 null 的年份 → 年度点 value=null（null_not_zero，Badge「缺失」）。

## 3. 契约扩展（冻结变更，已批准）

- `schemas/{indicator_series_v1,manifest_v1,indicators_v1}.schema.json`：
  `frequency` 枚举追加 `"annual"`（三处，唯一枚举改动面）。
- `series[].date` 无 pattern 约束 → `YYYY` 标签无需改 schema。
- golden：新增 `tests/golden/contract/processed/retail_sales_total_annual.json`（真实输出
  摘录）+ golden `manifest.json` 追加该 indicator 条目 + 双仓 `CHECKSUMS.sha256` 重算。
  golden `capabilities.json` **不加** annual panel（插件对缺失 panel 容忍为 null）。
- capabilities schema 不改：插件年度开关不查 capabilities，只查 manifest 是否存在
  `<key>_annual` 兄弟键（命名约定即契约的一部分，写入本 spec 与 registry notes）。

## 4. ETL 改动面

- `etl/normalize.py`：`_DATE_GRAIN['annual']='year'`；normalize_series 年度分支：
  解析 (年,月)；非 12 月行**静默排除**（ caliber 排除，不计入 quality.errors）；
  12 月行 → date=`YYYY`；无法解析日期 → 照旧计 errors。
- `etl/manifest.py`：freshness 支持 year 粒度（`_COMPUTABLE_GRAINS += 'year'`；
  周期序号 = 年；`_index_from_label` 接受 `YYYY`；expected_lag 默认 1，发布窗口规则仅月度）。
  例：now=2026-10、last_date='2025' → lag 1 → fresh。
- `registry/indicators.yaml`：追加 `retail_sales_total_annual`
  （frequency annual / unit level_cny / status planned / source akshare_eastmoney /
  params endpoint+column_map{月份,累计}+`annual_caliber: dec_cumulative` /
  notes 记口径；**不写 provenance**（非 apply_verdicts 流程，不伪造门禁结论））。
- 测试：test_normalize（12 月抽取/非 12 月静默排除/12 月 null/不可解析）、
  test_manifest（year freshness 三例）、test_pipeline（注入含累计列的假 fetcher →
  落盘 `<key>_annual.json` + manifest 含 annual 条目）。

## 5. 插件改动面

- `src/contract/types.ts`：`Frequency += 'annual'`（镜像）。
- **消费端过滤**（annual 是一等 processed 产物，但不是独立卡片/采集目标）：
  overview 卡片与 release 日历行均排除 `frequency === 'annual'`（既有计数断言保持 6/2 不变）。
- `src/analysis/viewState.ts`：view_state 增第 8 字段 `grain: 'monthly' | 'annual'`
  （默认 monthly；持久化重载恢复，G7 模式延续）。载入时 grain=annual 但 manifest 无兄弟键
  → 诚实回退 monthly（不渲染空年度图）。
- 详情工具栏：新增「月度/年度」grain 段（月度键页：年度可选当且仅当 manifest 有
  `<key>_annual`；年度键页：段显示且锁定年度 + 可回月度）。**年度粒度下隐藏**
  transform/overlay/smoothing/range 段（年度视图仅 level 口径；隐藏而非置灰，
  避免 reason 文案错配；脚注说明）。chart_type 年度下保留 柱状/折线/表格。
- `src/ui/chart/option.ts`：年度渲染 = 类目轴年份标签 + 默认柱状；缺失年虚线沿用 missingLine。
- `src/ui/detail.ts`：年度脚注：「年度总额 = 当年 1—12 月累计（12 月累计口径），
  来源：国家统计局经本地 ETL；未完结年份不纳入。」表格行日期原样 `YYYY`。
- 冒烟：详情切「年度」→ 柱数 = 年度点数、脚注含「年度总额」、切回「月度」行数不变。

## 6. 诚实边界（不变量）

- 月度视图的 1—2 月缺失**保持如实标注**，不用年度视图掩盖 gaps。
- 不用已存月份求和冒充年度总额；不插值、不填 0、不补点（D5/D10、§6）。
- annual 序列不参与 overlay/变换/信号；capabilities 不为 annual 虚构 modes 结论。
- ETL `schemas/` 本次改动 = 用户批准的枚举扩展一项，其余冻结面零写。

## 7. 验收

- ETL：`python -m pytest tests/ -q` 全绿；live `run_etl.bat` 产出
  `retail_sales_total_annual.json`，2023=471,495±、2024=483,395± 亿元量级核对通过。
- 插件：`npm run verify` 全绿（既有 323 + 新增）；checksums+tokens 全绿；
  L2 冒烟含年度段全绿；main.js < 700KB。
- 审计：`docs/superpowers/audits/2026-10-13-annual-grain-audit.md` 逐条映射本 spec §2–§6。
