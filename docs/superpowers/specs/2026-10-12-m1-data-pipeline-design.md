# M1 数据闭环设计（T2-*）

日期：2026-10-12
状态：M0 已冻结契约后启动；本 spec 只覆盖 M1（Python 数据产品轨），不含插件轨（M2/T3-*）。
上游依据：[开发计划 v1.0](../../../宏观数据面板_开发计划_v1.0.md) §5 T2-1~T2-7、§4 M1 行；[M0 设计](2026-10-11-m0-contract-and-validation-gate-design.md)（契约、门禁、G/U 决策全表）。
基线事实：契约（7 份 schema）+ registry（30 指标，全 `planned`）+ golden fixtures（12 文件，双仓校验和一致）+ 验证脚本 + 双 venv 隔离均已在 M0 落地并提交。

---

## 0. M1 目标与边界

**目标**：把 M0 冻结的契约「喂活」——从真实接口抓取，经 raw→processed 全链路，产出通过 schema 校验、落 vault `MacroData/` 的 `processed/`、`manifest`、`capabilities`、`signals`，并具备修订追加、失败可重试、手动录入的能力。M1 结束时，插件（M2）能读到真实产物。

**边界（不做）**：
- 不做任何插件/UI 代码（属 M2/T3-*）。
- 不改契约 schema、不改判据阈值、不改 golden fixtures（手册 §4 硬约束）；若确需改，走人工确认。
- 不实现利率通道抓取（G22：U3 只登记不实现）。
- 不做日度粒度、交叉分析等 v0.1 非目标。
- 移动端只读、发布日历 UI 属 M4。

**继承的硬约束**：G12（路径从 `.env` 解析）、G13（只有 `processed/`+`signals/` 落 vault，`raw/`/`probe/`/`logs/` 留 ETL 仓）、G30（每入口过 `assert_env`）、D5（不伪造）、D9（provenance 幂等）、D10（不猜端点/叶子名/口径）。

---

## 1. 现状盘点（M0 交付物 = M1 起点）

| 已有 | 位置 | M1 如何用 |
|---|---|---|
| 7 份 schema | `schemas/*.schema.json` | 产物落盘前必须过校验（jsonschema） |
| registry 30 指标 | `registry/indicators.yaml` | fetcher/normalize 的驱动清单；`status/source/params.column_map` 由 `apply_verdicts.py` 依判据回写（G19′） |
| 验证策略 | `registry/validation_policy.yaml` | 九项门禁阈值（冻结，不改） |
| 路径解析 | `etl/paths.py` | 所有产物落位经它取目录，不硬编码 |
| 入口骨架 | `run_etl.py`（只 bootstrap，不抓取） | M1 扩为真实管线编排 |
| 调度壳 | `run_etl.bat`/`.sh` | M1 补失败重试 + logs 轮转（T2-6） |
| 验证脚本 | `tools/validate_sources.py` | M0 discovery/门禁；M1 复用其 fetch 封装做 revision diff |
| golden fixtures | `tests/golden/{real,contract}/` | `real/raw/` 已有社零真实快照；`real/processed/` M0 留空，**M1 补齐**（T2-1 重放一致的基准） |

**关键缺口**：`etl/` 目前只有 `paths.py`。M1 要在 `etl/` 下建出完整管线模块。

---

## 2. 模块架构（etl/ 分解）

每个模块单一职责、可独立单测（手册「文件 <300 行」原则）：

```
etl/
  paths.py            （已有）配置与目录解析
  fetch/
    __init__.py
    base.py           Fetcher 协议 + 风控装饰（间隔/超时/重试，G23）
    eastmoney.py      akshare_eastmoney 端点封装（社零/餐饮/商品/货币）
    nbs.py            akshare_nbs 端点封装（网上零售/CPI/收入/地方）
    manual.py         drop-folder CSV 读取（G5/T2-7）
  raw.py              raw 快照落盘 + payload_hash + 只追加语义（T2-2）
  normalize.py        column_map 映射 + 类型规整 + 缺月/ null 处理（T2-3）
  revision.py         revision diff：新旧版本比对、追加、保留旧版（T2-3）
  derive.py           yoy/mom/index/剪刀差等衍生序列（G18；前端不算）
  capabilities.py     capabilities 生成：7 种 reason_code + overlay 规则（T2-4）
  manifest.py         manifest 生成 + freshness 计算（T2-5）
  signals.py          signal_state 生成（support/conflict/insufficient）
  validate.py         产物落盘前 schema 校验（复用 jsonschema）
  pipeline.py         编排：registry → fetch → raw → normalize → revision → derive → capabilities/manifest/signals → 落盘
  logs.py             结构化日志 + 轮转（T2-6）
```

依赖方向单向向下：`pipeline` → 各阶段模块 → `paths`/`fetch/base`。无环。

---

## 3. T2-1 真实 fetcher

**驱动**：`registry/indicators.yaml` 中 `status != paused` 且 `source` 已落地的条目。

**Fetcher 协议**（`fetch/base.py`）：
```python
class Fetcher(Protocol):
    source: str                      # akshare_eastmoney | akshare_nbs | manual
    def fetch(self, endpoint: str, params: dict) -> pd.DataFrame: ...
```
- 风控（G23）：调用间隔 ≥3s、超时 30s、重试 2 次指数退避；参数可经 `.env` 覆盖。装饰器实现，所有 fetcher 共用。
- akshare 版本锁 `1.19.1`（requirements-pandas2.txt，已锁）。
- **不猜端点/叶子名（D10）**：M0 discovery 已产出真实候选（见 `reports/verdicts.json` groups）。M1 只对**已确认真实列结构**的端点建 fetcher；未确认的（cpi 29 候选、retail_detail 3 候选、网上零售叶子名）先跑一次真实抓取拿到列结构，再登记 `column_map`，仍无法确认的维持 `planned` 并在 capabilities 输出 stub。

**M1 首批可落地端点**（已有真实列结构证据）：
- `macro_china_consumer_goods_retail`（东财）→ retail_sales_total（列：月份/当月/同比增长/环比增长/累计/累计-同比增长，209 行实测）。
- money 组候选 `macro_china_m2_yearly`/`macro_china_money_supply`（M0 discovery 已列，M1 抓一次定列结构）。

**验收（T2-1）**：对 fixtures 指标「全量重放一致」——用 `tests/golden/real/raw/` 的冻结真实快照重放 normalize→processed，产出与 `real/processed/` 基准逐字节一致（M1 补齐该基准）。

---

## 4. T2-2 raw 落盘 + payload_hash + 只追加

- raw 落 ETL 仓 `data/raw/<source>/<endpoint>/<YYYY-MM-DD>.json`（G13：不入 vault）。
- 结构过 `raw_snapshot_v1.schema.json`（已有）：含 `endpoint/params/fetched_at/payload/payload_hash`。
- `payload_hash` = 对 `payload`（规范化 JSON，键排序）取 SHA256。
- **只追加语义**：同数据重复抓取 → 相同 hash → 不产生新文件（幂等）；数据变化 → 新 hash → 新文件，**绝不覆盖**旧快照。
- `fetched_at` 用抓取时刻；但 provenance 写入产物时用 `payload_hash` 而非墙钟（D9 幂等）。

**验收（T2-2）**：同数据重复抓取产生相同 hash 不新增文件；改动数据产生新 hash 且旧文件保留（golden test）。

---

## 5. T2-3 normalize + column_map + revision diff

### 5.1 column_map 映射
- `normalize.py` 读 registry `params.column_map`（`{date: <列名>, value: <列名>}`）把原始列映射到契约字段 `date`/`value`。
- 日期规整为 `YYYY-MM`（月度）/`YYYY-Qn`（季度）；数值转 float；**null 保留为 null，绝不填 0**（UI/UX §6、契约要求）。
- 缺月不补（缺失由 capabilities/manifest 的 `missing_months` 表达，report_only）。

### 5.2 U1 口径裁决（M1 关闭，从 M0 escalate 承接）
M0 算术判别：东财「同比增长」列是**可比口径同比**（cm_hits 114/182，非全中），与用当月原值重建的**名义同比**不相等。M0 依 D5/D10 escalate、未回填 column_map。

**M1 裁决（工程判断，可见可否决）**：
- `retail_sales_total`（level）：`column_map = {date: 月份, value: 当月}`，正常落地，`unit: level_cny`。
- `retail_sales_total_yoy`：**直接采用东财发布的「同比增长」列作为 yoy 序列**，`column_map = {date: 月份, value: 同比增长}`，并在 processed 元数据标注 `caliber: comparable`（可比口径），**不**用 level 重建名义同比。理由：该列是官方发布的权威同比口径，展示它比展示自算名义值更诚实、更符合 NBS 实际发布方式；标注 caliber 消除口径歧义（呼应 UI/UX §9 #3）。
- **frequency_true 失败（Jan-Feb 合并）的处置**：社零 1 月系统性缺失是 NBS「1—2 月合并发布」真实日历特性。M1 在 normalize 层**显式建模合并期**：把 1—2 月合并观测标为 `period: 01-02`（或按发布口径落到 2 月并带 `combined_jan_feb: true` 标记），使 frequency 门禁按「合并期」而非「缺 1 月」判定；此为显示/建模约定，不改判据阈值（阈值仍 0.05，改的是序列构造口径）。若建模后仍 fail，则如实保留 fail 并在 capabilities 标注，不放宽阈值。
- `caliber` 字段：若 `indicator_series_v1.schema.json` 未预留，则**不在 M1 私改 schema**；改为写入 processed 的 `quality`/`notes`（schema 已含 `quality.errors`，G14）或 manifest 的元信息位。schema 变更须走人工确认（手册 §4）。

**回填方式**：column_map 由 `apply_verdicts.py` 依「已确认真实列结构 + 上述裁决」自动回写 registry，带 provenance、幂等（G19′）。人工裁决点仅在于「采用发布同比列」这一口径选择，已在本 spec 记录。

### 5.3 revision diff（T2-3 核心）
- 每次 normalize 后，与 processed 中该 key 的既有末版本比对：
  - 值未变 → 不追加。
  - 值变化（数据修订）→ **追加新版本**，`revision` 自增，旧版本**保留**（契约 `indicator_series_v1` 支持多 revision）。
- M0 门禁第 6 项 revision 恒 `undetermined`（G21，需两次带日期抓取）。M1 建立 revision diff 基础设施后，columns_stable（min_runs 2）与 revision 判定可真正执行——补齐 M0 未跑的第九项门禁。

**验收（T2-3）**：修订场景 golden test——旧版本保留、新版本追加、`revision` 递增；column_map 对 retail_sales_total 正确映射。

---

## 6. T2-4 capabilities 完整生成

- `capabilities.py` 依 registry + processed 实际状态，为每个指标产出 panel（`capabilities_v1.schema.json`，G15 `oneOf`：完整 panel 或源不支持 stub）。
- **7 种 reason_code 全覆盖**（契约枚举，M0 fixtures 已备样本）：
  | reason_code | 触发条件 |
  |---|---|
  | INSUFFICIENT_HISTORY | 历史长度 < 门禁 min（36） |
  | MISSING_MONTHS | 存在缺月（report_only，非禁用但标注） |
  | INCOMPATIBLE_FREQUENCY | 频率与视图不匹配（如季度指标进月度视图，disposable_income_yoy） |
  | INCOMPATIBLE_REGION | 跨 region 叠加请求（第一版拆分双图，不叠加） |
  | UNIT_MISMATCH | overlay 时单位不一致 |
  | DERIVED_NOT_FOUND | 衍生序列的 base 缺失 |
  | SOURCE_UNSUPPORTED | 源未落地（如 shanghai_finance_quarterly 未落源）→ stub |
- overlay 全规则（v0.1 §3.4）：同频同单位才允许单轴叠加，否则 UNIT_MISMATCH/INCOMPATIBLE_FREQUENCY。

**验收（T2-4）**：7 种 reason_code 各有测试覆盖（用 contract fixtures 触发）；禁用项含 reason_code；产物过 schema。

---

## 7. T2-5 manifest 生成 + freshness

- `manifest.py` 汇总所有 processed 指标的元信息：数据期、更新时间、文件名、行数、freshness、下次发布预期（registry `release.expected_day/window_days`，G9）。
- **freshness 计算**（G16 枚举 `fresh|aging|stale|unknown`）：按 `date_grain` 与发布节奏——
  - `fresh`：数据期在预期发布窗口内且是最新期。
  - `aging`：接近下次发布但当前期已偏旧。
  - `stale`：超过预期发布日 + window 仍未更新。
  - `unknown`：无法判定（缺 release 配置或首抓）。
  - M0 骨架恒返回 `unknown`；M1 实现真实计算，四态各有测试（G17 fixtures 已覆盖四枚举值）。

**验收（T2-5）**：fresh/aging/stale 三态测试（+unknown）；manifest 过 schema；freshness 由 date_grain 与发布节奏真实推导。

---

## 8. T2-6 调度壳 + 重试 + logs 轮转

- `run_etl.py` 扩为真实编排：bootstrap（载 .env→过 assert_env→校验配置，顺序不可换）→ pipeline.run() → 退出码。
- 退出码约定（沿用 M0）：0 正常 / 1 环境门禁失败 / 4 配置缺失 / 新增：2 部分指标失败但管线未整体崩（单组失败不阻塞其他组，风险册）。
- 失败重试：fetch 层已含指数退避（G23）；管线层对单指标失败隔离（try/except 记录后继续），失败写 logs + capabilities stub，不静默停跑（产品简介 §7 规则 4）。
- logs 轮转：`logs/` 留 ETL 仓（G13），`RotatingFileHandler`（大小 + 备份数上限）。
- `.env` 机器配置：`MCD_PYTHON`（已设）、`VAULT_ROOT`、`DATA_ROOT`、风控参数覆盖。

**验收（T2-6）**：失败注入测试——写日志、可重试、不静默停跑；logs 轮转按上限切割。

---

## 9. T2-7 手动 drop-folder

- `fetch/manual.py` 读 `data/manual/<key>.csv`（G5），校验列（date/value 必需）后入 normalize 同链路。
- 来源标注 `source: manual`，processed 元信息带 `manual: true`（UI/UX §6 badge「手动」的数据来源）。
- registry 中 `source: manual` 的条目（household_deposits、household_loan_short/midlong、institution_quarterly_credit）走此路径。

**验收（T2-7）**：golden test——手动 CSV 带 manual 标记入库、过 schema；缺列/格式错时明确报错不静默。

---

## 10. 产物落位与入库（G13）

| 产物 | 位置 | 入 vault | 入 Git |
|---|---|---|---|
| raw 快照 | ETL `data/raw/` | 否 | 否（probe/raw 留 ETL，但 `tests/golden/real/raw/` 冻结样本入 Git） |
| processed | `<Vault>/MacroData/processed/` | 是 | 否（数据产物不入插件仓 Git） |
| manifest/capabilities | `<Vault>/MacroData/processed/` | 是 | 否 |
| signals | `<Vault>/MacroData/signals/` | 是 | 否 |
| logs | ETL `logs/` | 否 | 否 |
| `tests/golden/real/processed/` | ETL 仓 | 否 | **是**（M1 补齐，重放基准） |

M0 验收明写「验证脚本只出报告不入库」；M1 起 pipeline **才**写 processed——但只写 vault `MacroData/`，绝不写插件仓或 vault 外（G12/G13）。

---

## 11. 测试策略（L0–L3，双 venv 下跑）

- L0：`ruff check . && ruff format --check .`（G26）。
- L1：`<py> -m pytest`——每个 etl 模块单测 + golden 重放测试。`<py>` = `MCD_PYTHON`（env A）。
- L2：`<py> run_etl.py` 真实跑通不崩，产出 processed/manifest/capabilities/signals 且全部过 schema 校验。
- L3：逐项核对 §13 退出标准。
- 网络依赖测试标记 `@pytest.mark.network`，默认跑（M1 需真实抓取证据）；离线重放测试用 golden fixtures，无网络也能跑（CI 友好）。
- 契约不变性：M1 **不得**改 `schemas/`、`tests/golden/contract/`、`validation_policy.yaml` 阈值。若 `real/processed/` 基准需补齐（M0 留空），属**新增** golden 文件，须重新生成 CHECKSUMS 并双仓同步（G3）——这是 fixtures 变更，走人工确认（手册 §4）。

---

## 12. 风险与缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| 真实抓取被风控封禁 | 高 | G23 限速+重试；单指标失败隔离不阻塞；capabilities stub + logs |
| U1 口径裁决被否 | 中 | 本 spec §5.2 记录理由与备选（累计-同比增长列）；column_map 由 apply_verdicts 回写，改判只需改裁决记录重跑 |
| Jan-Feb 合并建模改动 frequency 判定 | 中 | 只改序列构造口径不改阈值；建模后仍 fail 则如实保留 fail |
| revision diff 需多次抓取，与风控冲突 | 中 | M1 首抓建基线，revision 判定随后续定时抓取累积；columns_stable min_runs=2 在第二次抓取后补跑 |
| `real/processed/` 基准补齐触发 fixtures 变更 | 中 | 属新增 golden，走 CHECKSUMS 重生成 + 双仓同步 + 人工确认 |
| pandas 2 vs 3 行为差异 | 低 | M0 已选 env A（pandas 2.3.3）；env B 保留作迁移候选，M1 不切 |

---

## 13. M1 退出标准（全部可命令验证）

| # | 标准 | 验证 |
|---|---|---|
| 1 | etl 管线各模块单测全绿 | `<py> -m pytest` |
| 2 | 真实抓取跑通不崩，产出 processed/manifest/capabilities/signals | `<py> run_etl.py` 退出 0 或 2（部分失败但非崩溃） |
| 3 | 所有产物过对应 schema 校验 | pipeline 内 validate 步骤 + `pytest tests/test_*` |
| 4 | capabilities 7 种 reason_code 全部有测试覆盖 | `pytest -k capabilities` |
| 5 | revision diff：旧版保留、新版追加、revision 递增 | golden test |
| 6 | freshness 四态真实计算有测试 | `pytest -k manifest or freshness` |
| 7 | 手动 drop-folder 带 manual 标记入库 | golden test |
| 8 | raw payload_hash 只追加、重复抓取幂等 | golden test |
| 9 | 失败注入：写日志、可重试、不静默停跑 | `pytest -k pipeline` 失败注入用例 |
| 10 | U1 关闭：retail_sales_total_yoy column_map 已回填 + caliber 标注 | registry diff + 报告更新 |
| 11 | columns_stable（第九项门禁）在 ≥2 次抓取后真实执行 | validate_sources min_runs=2 补跑 |
| 12 | apply_verdicts 回写幂等 | 连续两次 `git diff --exit-code registry/` |
| 13 | L0 全绿 | `ruff check . && ruff format --check .` |
| 14 | 契约未改：schemas/contract fixtures/policy 阈值字节不变（除非走人工确认的 golden 新增） | `git diff --exit-code schemas/ registry/validation_policy.yaml` |

---

## 14. 假设与边界

1. **假设**：本机可访问公网调用 akshare 东财/NBS 接口（同 M0）。若网络受限，T2-1 真实抓取受阻，M1 只能完成离线重放部分，须如实报告（D5）。
2. **假设**：`<Vault>/MacroData/` 可创建写入（G2 已采纳）。M0 时该目录不存在，M1 首跑创建。
3. **边界**：本 spec 只覆盖 M1。M2（插件 MVP/T3-*）、M3（分析交互）、M4（运行与验收）各自 spec 在里程碑启动前另写。
4. **边界**：U1 的口径裁决（§5.2）是本 spec 内做的工程判断，已记录理由与备选，用户可否决；否决则改裁决记录、重跑 apply_verdicts，不影响其余 T2 模块。
5. **边界**：cpi/retail_detail/网上零售叶子名等 M0 discovery-only 的端点，M1 尽力抓一次定列结构；仍无法确认的维持 `planned` + capabilities stub，不猜（D10），不因「凑齐指标数」而伪造。
