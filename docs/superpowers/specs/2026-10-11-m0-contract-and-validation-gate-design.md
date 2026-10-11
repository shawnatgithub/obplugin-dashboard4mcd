# M0 契约与验证门禁 · 设计定稿

日期：2026-10-11
状态：已获用户逐批确认（第 1/2/3 批全部采纳）；2026-10-11 第 4 轮修订——双虚拟环境方案 B（G29/G30）、§7.5 阈值的前端影响注释、§4.2 落位确认
范围：开发计划 v1.0 §4 的 **M0 里程碑**（工作包 T1-1 ~ T1-4）
决策基线：[宏观数据面板_对话总结与定稿_v0.1.md](../../宏观数据面板_对话总结与定稿_v0.1.md)（下称 v0.1，A 类，不可改）

---

## 1. 摘要

M0 的目标是**把数据契约冻结成机器可校验的工件，并用实测证据关闭 U1/U2/U3**，从而让 Python 轨（M1）与插件轨（M2）可以完全并行。

本设计确立四件事：

1. 新建 ETL 仓并落地 v0.1 §2 目录树（**venv 移到仓库外，双环境隔离**，G29/G30），数据输出按精化后的 G2/G13 分层落位。
2. 7 份 JSON Schema（四契约 + `signal_state_v1` + registry 两份）定稿，消解 v0.1 内部 9 处不一致。
3. 验证脚本按四组分批跑 §1.5 九项门禁，**判据先声明、执行全自动**：端点自动选定、U1 用算术自动关闭、registry 自动回写并带 provenance。
4. golden fixtures 分 `real/` 与 `contract/` 两套冻结，双仓校验和一致。

执行顺序遵循手册 §7：T1-1 → T1-2 → T1-3 → T1-4（方案 B：T1-2 分四批）。

## 2. 权威源与文档链

| 关注点 | 权威源 |
|---|---|
| 产品与数据规则（A 类） | v0.1 定稿。冲突时 v0.1 优先 |
| 里程碑 / WBS | 开发计划 v1.0 §4、§5 |
| 工作流程（验证金字塔、闭环、边界） | Agent 自动化开发手册 |
| 编码过程约束 | Agent 编程原则（D1–D10） |
| 视觉与组件规格 | UI/UX 设计指导 + `prototype/mcd-console/src/`（数值以源码为准，不以截图为准） |

v0.1 已从 `docs/ArchivedDocs-DoNotRead/` 恢复到 `docs/`，4 份现行文档指向它的相对链接已重新生效。归档目录中那份字节相同的副本**已删除**（删前经 SHA256 比对确认一致：`5F34B34E…BCCD`），不再存在双份漂移（D8）。

## 3. 范围

**做**：T1-1 schemas、T1-2 验证脚本与四组验证、T1-3 registry v1、T1-4 fixtures 冻结；ETL 仓引导（**双 venv + 两套锁文件 + 激活门禁**，见 §4.5）；`npm run verify`（G27 提前）；文档回写。

**不做**（M0 明确排除，留给后续里程碑）：

- 任何真实 fetcher 实现（T2-1，M1）
- `normalize` 的 column_map 映射与 revision diff（T2-3，M1）
- `capabilities` 完整生成逻辑（T2-4，M1）
- `freshness` 真实计算（T2-5，M1）
- 调度、日志轮转、drop-folder（T2-6/T2-7，M4）
- 一切插件 UI（T3-2 ~ T3-8，M2/M3）
- ECharts 集成（G6，M2）
- DR007/FDR007 抓取（产品简介 §8 非目标含日度数据；U3 只写口径说明，见 G22）
- G24（总览卡片门面绑定字段）——登记为 M2 待裁决

## 4. §A 仓库拓扑与数据落位

### 4.1 ETL 仓

```
D:\Codex\MacroDataETL\              G1（用户未否决，视为采纳）
  requirements-pandas2.txt          环境A 锁文件，见 §4.4（必须入 Git）
  requirements-akshare.txt          环境B 锁文件，见 §4.4（必须入 Git）
                                    注：venv 本体在仓库外，见 §4.5（G29）
  pyproject.toml                    ruff + pytest 配置
  .env.example                      VAULT_ROOT / DATA_ROOT / MCD_PYTHON / SCHEDULER_NAME / BACKUP_TARGET
  .env                              本机实际值，不入 Git
  .gitattributes                    v0.1 §6.1 换行规则
  .gitignore                        .env data/ logs/ __pycache__/ .pytest_cache/ .ruff_cache/
  registry/
    indicators.yaml                 T1-3 全量指标清单
    signals.yaml                    T1-3
    validation_policy.yaml          G19′/G20′ 判据声明（人工确认后方可改阈值）
  schemas/                          T1-1，契约唯一权威源
    raw_snapshot_v1.schema.json
    indicator_series_v1.schema.json
    manifest_v1.schema.json
    capabilities_v1.schema.json
    signal_state_v1.schema.json
    indicators_v1.schema.json       G10
    signals_v1.schema.json          G10
  etl/
    core.py  registry_io.py  normalize.py  validate.py  capabilities.py  export.py
    paths.py                        G12 数据根目录单一解析点
    fetchers/ __init__.py  akshare_nbs.py  akshare_eastmoney.py  manual.py
  tools/
    assert_env.py                   G30 激活门禁：校验 sys.prefix 是否等于期望 venv
    validate_sources.py             G11 T1-2 验证脚本（--discover / --group）
    apply_verdicts.py               G19′ 自动回写 registry
  reports/                          G11 入 Git，是关闭 U1/U3 的证据
  data/
    raw/                            G13 留仓内，不入 Git、不进 vault
    probe/                          验证脚本的原始响应证据，不入 Git、不进 vault
  logs/                             留仓内，不入 Git
  tests/
    golden/                         T1-4 权威 fixtures + CHECKSUMS.sha256
    test_schemas.py  test_policy.py  test_apply_verdicts.py  test_paths.py
    test_assert_env.py              G30 门禁的正反用例（对的 venv 放行、错的 venv 退出 1）
  run_etl.py  run_etl.bat  run_etl.sh    .bat 直连 MCD_PYTHON，不依赖 activate（G30）
```

### 4.2 数据落位（G13 精化 G2）

```
D:\Codex\MacroEcoData\MacroData\     ← vault 内，插件唯一读取面
  processed/                          插件经 this.app.vault.adapter 只读
  signals/                            派生状态；MVP 不消费但先落位
```

`raw/`、`probe/`、`logs/` **不进 vault**。理由：`raw/` 是只追加的原始快照，随每次抓取增长，放进 vault 会让 Obsidian 索引与文件监听持续膨胀；而 §2.1 读写边界表明插件只读 `processed/`，`raw/` 是 ETL 内部证据，没有进 vault 的理由。

**此落位已于 2026-10-11 经用户明确确认**（原话：「我认为不把 raw probe 和 logs 放进 vault 是对的，就这么改」），不再是待否决的 G 类默认值。

### 4.3 路径解析（G12）

v0.1 §7.3/§7.10 骨架把路径写成 `ROOT / "data" / "processed"`，与 G2（输出到 vault）、§6.1（代码不猜机器、不写死路径）冲突。消解：

- 新增 `etl/paths.py`，是**唯一**的数据根目录解析点（D8）。
- 从 `.env` 读 `DATA_ROOT`；若只给了 `VAULT_ROOT`，则 `DATA_ROOT = VAULT_ROOT / "MacroData"`（子目录名 `MacroData` 为常量，只在此处定义一次）。
- 配置缺失时**明确报错并指出缺哪个键**（D10），不静默回退到仓内 `data/`。
- 暴露 `processed_dir()` / `signals_dir()` / `raw_dir()` / `probe_dir()` / `logs_dir()`；`raw_dir`/`probe_dir`/`logs_dir` 指向 ETL 仓内，`processed_dir`/`signals_dir` 指向 `DATA_ROOT`。
- 骨架代码中所有 `ROOT / "data" / ...` 一律替换为 paths 模块调用。

### 4.4 依赖锁定（两套，实测结果见 §16）

两个环境各自独立锁定，**不共用一份 requirements**——共用就等于放弃隔离。各自装完跑一次 `pip freeze` 固化。

**环境A `D:\Codex\venv-pandas2`** → `requirements-pandas2.txt`

| 包 | 约束 | 依据 |
|---|---|---|
| `akshare` | `==1.19.1` | 已实测可与 `pandas<3` 共同解析（§16） |
| `pandas` | `==2.3.3` | 已实测存在 `pandas-2.3.3-cp314-cp314-win_amd64.whl` |
| `pytz` | `==2026.5` | pandas 2.x 传递依赖，随 wheel 一并实测到 |
| `numpy` | `==2.5.4` | 显式钉住，防止在 pandas 2/3 之间被动漂移 |
| `curl_cffi` | `==0.16.3` | NBS 指纹会话依赖，不自模拟（v0.1 §1.2） |
| `tzdata` | `==2026.5` | v0.1 §1.2 要求 Windows 装 tzdata |
| `PyYAML` / `jsonschema` / `python-dotenv` | freeze 固化 | registry 读取 / 契约校验 / `.env` 读取（§6.1） |
| `pytest` / `ruff` | freeze 固化 | L1 / L0（G26） |

**环境B `D:\Codex\venv-akshare`** → `requirements-akshare.txt`

| 包 | 约束 | 依据 |
|---|---|---|
| `akshare` | `==1.19.1` | 此环境唯一硬钉项 |
| `pandas` | **不设上界**，交解析器（预期 `3.0.6`） | 用户明确要求此环境不装 `pandas<3` |
| 其余 27 包 | freeze 固化 | 全有 cp314 wheel，零源码编译（§16） |

两环境共同点：全部依赖均有 cp314 wheel，**零源码编译**；`mini-racer`（V8，JS 加密接口）由 akshare 传递引入。

`fastapi` / `uvicorn` / `aiofiles`（`AKShareWebapp` 的 web 栈）**不进这两个环境**——那是另一个项目的依赖，M0 不碰。环境A 之所以与它兼容，是因为它声明的是 `akshare>=1.12` + `pandas>=2.0`，环境A 两者都满足；但 M0 不负责替它装 web 栈。

### 4.5 双虚拟环境（G29，方案 B）

**为什么要两个而不是一个**：本机既有的 pandas 消费者与新 ETL 仓对 pandas 大版本的偏好可能分岔，且 pandas 2→3 含破坏性变更。隔离后任一环境装坏都不会污染另一个，也让「M0 到底该跑在 pandas 2 还是 3 上」变成一个可以用证据回答的问题，而不是先验选择。

**为什么不是最初提出的划分**（pandas2 环境禁装 akshare）：全盘扫描 `D:\Codex`（depth 4，排除 `node_modules`/`venv`/`site-packages`/`__pycache__`）后确认，本机**不存在只用 pandas、不用 akshare 的业务代码**——

- 声明 pandas 或 akshare 的依赖清单只有 1 个：`D:\Codex\AKShareWebapp\requirements.txt`（L4 `akshare>=1.12`、L5 `pandas>=2.0`，同一环境同时需要两者）；
- `import pandas` / `from pandas` 的 `.py` 只有 2 个，均在 `AKShareWebapp\Backend\`（`main.py`、`concept_cache.py`），且都同时用 akshare；
- pandas-only 的业务代码：**0 个**。

禁装 akshare 的环境承载不了任何现存项目，会立刻成为死环境兼长期陷阱。故环境A 同时装 akshare + pandas 2.3.3，两个环境都能承载真实工作。

| | 环境A | 环境B |
|---|---|---|
| 路径 | `D:\Codex\venv-pandas2` | `D:\Codex\venv-akshare` |
| 解释器 | Python 3.14.8（本机唯一） | 同左 |
| pandas | `2.3.3` | `3.0.6`（由解析器决定） |
| akshare | `1.19.1` | `1.19.1` |
| 创建 | `python -m venv D:\Codex\venv-pandas2` | `python -m venv D:\Codex\venv-akshare` |
| 角色 | AKShareWebapp 兼容区间；M0 ETL **候选** | M0 ETL **候选** |

两路径当前均不存在（已核实），且都在 vault 与插件仓之外，创建时需越出沙箱写权限。

**M0 ETL 用哪个——由冒烟证据决定，不预先假定**（用户已采纳）：

1. 两环境各跑 `python -c "import akshare, pandas; print(akshare.__version__, pandas.__version__)"`；
2. 两环境各跑一次真实抓取（社零总额，带 G23 限速）；
3. **两侧都通过 → M0 用环境A**：pandas 2 生态更成熟，且是 AKShareWebapp 已在运行的区间；
4. **环境A 失败、环境B 通过 → M0 用环境B**，并把 A 的失败堆栈与原因写进 §16 与运行环境文档；
5. **两侧都失败 → M0 阻塞**，如实报告不伪造（D5），触发 §15 的 Python 降级缓解项。

选定结果写入 `.env` 的 `MCD_PYTHON`，此后所有入口只认这一个值（D8 单一事实源）。此判定即 §14 退出标准第 13 条。

**激活门禁（G30）——把「记得激活」变成机器可检，不靠自觉**：

- `tools/assert_env.py <expected-venv>`：打印 `sys.executable` / `sys.prefix` / `pandas.__version__` / `akshare.__version__`；若 `sys.prefix` ≠ 期望路径则 **exit 1**，任务不启动。
- `run_etl.py`、`tools/validate_sources.py`、`tools/apply_verdicts.py` 与 `pytest` 入口第一行调用它。
- `run_etl.bat` **不依赖 `activate`**，直接用 `.env` 中 `MCD_PYTHON` 指定的解释器绝对路径——从根上消灭「忘了激活」这一类错误（D10）。
- 两环境的包**永不交叉安装**；任何 `pip install` 之前必须先经 `assert_env.py` 确认当前身处哪个环境。
- venv 在仓库外 → 仓库不再「clone 即可复现」，故两份 `requirements-*.txt` **必须入 Git**，且运行环境文档（§13 第 1 项）须写清 bootstrap 步骤。

## 5. §B 契约 schemas（T1-1）

格式：JSON Schema **draft 2020-12**。Python 侧用 `jsonschema` 校验；插件侧 jest 只做 fixtures 结构断言与 CHECKSUMS 比对，**不引入 ajv**（避免插件增依赖）。

### 5.1 通用策略

| 项 | 决策 |
|---|---|
| `additionalProperties` | **全域 `false`**（G14）。零漂移优先。**唯一例外**：`raw_snapshot_v1.records[]` 的值对象为 `true`——raw 层必须原样保留数据源列名（A 类），列名不可预知 |
| `quality.errors` | 显式纳入 schema：`{"type":"array","items":{"type":"string"}}`，可选。因为 §7.10 `core.py` 会写它（G14 消解冲突 1） |
| `$id` / `version` | 每份 schema 带 `$id`；契约版本写在 `schema_version` 常量子（`const`）里 |
| 时间戳 | `date-time` 格式，必须带 `+08:00` 偏移（§1.2 时区固定 Asia/Shanghai） |
| 破坏性变更 | 走 v2 新文件，不原地改（A 类） |

### 5.2 七份 schema 要点

**`raw_snapshot_v1`**：`schema_version`(const) / `key` / `source` / `endpoint` / `params`(object) / `fetched_at`(date-time) / `timezone`(const `Asia/Shanghai`) / `payload_hash`(`^sha256:` 前缀) / `records`(array，**保留原始列名**，值为 object 且 `additionalProperties: true`——raw 层不改口径，A 类)。

**`indicator_series_v1`**：必填集严格照 §3.2 字段规则表（`schema_version`/`key`/`region`/`frequency`/`date_grain`/`unit`/`series[].date`/`series[].value`/`series[].revision`/`quality.last_date`）。

- `region` 枚举：`CN | SH | SC | CD`（§3.2）
- `frequency` 枚举：`monthly | quarterly | daily`（§7.8 校验集）
- `unit` 枚举：`yoy_pct | mom_pct | index_2020_100 | level_cny`（§3.2）+ 允许 `unknown`（§7.7 骨架会写）
- `series[].value`：`["number","null"]`——**缺失存 null，不填 0**（A 类）
- `series[].revision`：整数 `>=1`
- `null_policy`：const `null_not_zero`
- `status` 枚举：`active | planned | paused`（G19）

**`manifest_v1`**：`indicators[]` 各条含 `key`/`file`/`schema`/`region`/`frequency`/`unit`/`status`/`last_date`(`["string","null"]`)/`freshness`；`capabilities_file` 必填。

**`capabilities_v1`**：`panels` 的每个值用 **`oneOf`**（G15，消解冲突 2）：

- 支 A（完整 panel）：`modes`（`calendar`/`seasonal_compare`/`yoy`，各含 `supported`，可选 `warnings[]`/`reason_code`/`source`）、`overlays`（各含 `supported`，true 时带 `axis_mode`/`min_overlap_months`，false 时带 `reason_code`）、`chart_types[]`、`transforms`（`level`/`yoy`/`mom`）
- 支 B（源不支持 stub）：`{"source_supported": false, "reason_code": "SOURCE_UNSUPPORTED"}`，`source_supported` 与 `reason_code` 均必填，`additionalProperties: false`

`reason_code` 枚举（A 类，照抄 §3.4，七种）：
`INSUFFICIENT_HISTORY | MISSING_MONTHS | INCOMPATIBLE_FREQUENCY | INCOMPATIBLE_REGION | UNIT_MISMATCH | DERIVED_NOT_FOUND | SOURCE_UNSUPPORTED`

**`signal_state_v1`**（关闭 U2，按计划 §3.3「结构最小化：key/status/values/generated_at」）：

```json
{ "schema_version": "signal_state_v1",
  "generated_at": "2026-10-11T11:31:00+08:00",
  "timezone": "Asia/Shanghai",
  "signals": [ { "key": "demand_weak_risk", "status": "insufficient",
                 "values": { "catering_vs_goods_gap": null } } ] }
```

`status` 枚举 = `support | conflict | insufficient`（A 类，§1.6）。`values` 为 object，值 `["number","string","null"]`。

**`indicators_v1` / `signals_v1`**（G10）：校验 registry YAML。`indicators_v1` 覆盖 §4 示例的全部字段，加 G9 补充（`release: {expected_day: int 1..31, window_days: int}`、`params.column_map: object`）、G18 的衍生标记（`derived_from: <base key>`，可选）、`presentation.card_key` **不在此版引入**（G24 延后）。

### 5.3 freshness 枚举（G16，消解冲突 3）

机器枚举钉死为 `fresh | aging | stale | unknown`——**「临期」的机器码是 `aging`**。

- `unknown` 必须保留：§7.8 骨架 `freshness()` 在真实实现（T2-5）之前返回 `unknown`。
- 中文**文案**（`最新/临近更新/已过期` vs `新鲜/临期/过期`，UI/UX §9 待裁决 #2）与机器枚举**解耦**：文案可延到 M2 定，枚举现在钉死，否则 fixtures 无法冻结。

## 6. §C registry v1（T1-3）

### 6.1 G18：base key 存原值，衍生 key 存比率

| key | unit | title |
|---|---|---|
| `retail_sales_total` | `level_cny` | 全国社会消费品零售总额 |
| `retail_sales_total_yoy` | `yoy_pct` | 全国社会消费品零售总额当月同比 |

命名约定固定：`<key>_yoy` / `<key>_mom` / `<key>_index`。这与 §7.9 骨架的 `{key}_yoy` 查找逻辑严丝合缝，也满足产品简介 §7 规则 3（前端不算衍生指标）。

v0.1 §3.2 那条例子（`key: retail_sales_total` 却 `unit: yoy_pct`）按 G18 重新归位为 `retail_sales_total_yoy`；**v0.1 原文不改**。

衍生条目在 registry 用 `derived_from: <base key>` 标记；契约层不区分（§4 说明：衍生指标仍用 `indicator_series_v1`）。

### 6.2 全量清单与 status

registry 是全部指标的单一事实来源，列**全量**（见下表，覆盖产品简介 §5 三层结构），用 `status` 控制实际抓取面（§7.10 只处理 `active`）。

**layer 枚举（G28）**：`macro_demand | macro_money | macro_price | local | auxiliary`。半自动/手工的收入与信贷指标归 `macro_demand`——依 v0.1 §4 示例把 `disposable_income_yoy` 放在 `layer: macro_demand`，**不新造 `macro_income`**。

**完整 key 清单**（G18 规则：每个要看比率的指标 = base 原值 + 衍生比率一对；标注「待 T1-2 定」的 unit 不预先臆断，由口径判别回填）：

| layer | key | unit | M0 status |
|---|---|---|---|
| `macro_demand` | `retail_sales_total` | `level_cny` | `planned` |
| `macro_demand` | `retail_sales_total_yoy` | `yoy_pct` | `planned` |
| `macro_demand` | `retail_sales_online` / `_yoy` | `level_cny` / `yoy_pct` | `planned` |
| `macro_demand` | `retail_sales_service_yoy` | `yoy_pct` | `planned` |
| `macro_demand` | `retail_sales_catering` / `_yoy` | `level_cny` / `yoy_pct` | `planned` |
| `macro_demand` | `retail_sales_goods` / `_yoy` | `level_cny` / `yoy_pct` | `planned` |
| `macro_demand` | `catering_vs_goods_gap` | `pct`（衍生，`derived_from` 双亲） | `planned` |
| `macro_demand` | `retail_sales_cat_<slug>` ×16（限上分类） | 待 T1-2 定 | **M0 只落网上零售 1 条** |
| `macro_money` | `money_supply_m0` / `m1` / `m2` | `level_cny` | `planned` |
| `macro_money` | `money_supply_m0_yoy` / `m1_yoy` / `m2_yoy` | `yoy_pct` | `planned` |
| `macro_money` | `m1_m2_scissors` | `pct`（衍生 = m1_yoy − m2_yoy） | `planned` |
| `macro_price` | `cpi_national` | 待 T1-2 定（`index_2020_100` 或 `yoy_pct`） | `planned` |
| `macro_price` | `cpi_national_yoy` | `yoy_pct` | `planned` |
| `macro_price` | `cpi_core_yoy` | `yoy_pct` | `planned` |
| `macro_demand` | `disposable_income_yoy`（quarterly，半自动） | `yoy_pct` | `planned` |
| `macro_demand` | `household_deposits` / `household_loan_short` / `household_loan_midlong`（手动） | `level_cny` | `planned` |
| `local` | `retail_sales_sh_yoy` / `retail_sales_sc_yoy` / `retail_sales_cd_yoy` | `yoy_pct` | `planned` |
| `local` | `catering_sh_yoy` / `catering_cd_yoy` | `yoy_pct` | `planned` |
| `auxiliary` | `metro_passenger_volume` | 待 T1-2 定 | `planned` |
| `auxiliary` | `shanghai_finance_*`（季度）/ `institution_quarterly_*`（手动摘录） | 待源验证 | `planned` |

- **M0 冻结时全部 `planned`**（G19）：§8.1 明确写「未实测」，标 `active` 即虚报。翻 `active` 由 `apply_verdicts.py` 依判据自动执行（G19′）。
- 社零分项限上 16 类中，**M0 只钉「网上零售额」一个叶子**（计划 §4 M0 范围即「社零分项·网上零售」）；其余 15 类的 NBS 叶子名**留空**，由 T1-2 `--discover` 探测出叶子名后按 `retail_sales_cat_<slug>` 命名规则自动追加（D10：不猜叶子名）。
- `signals.yaml` 照 §4 示例落 2 条（`demand_weak_risk`、`income_consumption_gap_watch`）。它们引用的 `catering_vs_goods_gap`、`disposable_income_yoy` 在 M0 均为 `planned`，故 `signal_state` 输出 `insufficient`——这是正确行为，不是缺陷。

## 7. §D 验证脚本与自动判定（T1-2）

### 7.1 四组分批（方案 B）

| 组 | 参数 | 覆盖指标 | 源 | 关闭 |
|---|---|---|---|---|
| 1 | `--group retail_total` | 社零总额（原值 + 当月同比 + 累计同比） | 东财 akshare | **U1** |
| 2 | `--group retail_detail` | 网上零售额、服务零售额 | NBS 叶子 | — |
| 3 | `--group money` | M0/M1/M2 及同比 | 东财 akshare | — |
| 4 | `--group cpi` | 全国 CPI、核心 CPI | akshare / NBS | — |

单组失败不阻塞其他组（风险登记册：「失败率未知」）。每组产出 `reports/M0-<group>-验证报告.md`，四组齐后汇总 `reports/M0-接口验证报告.md`。

### 7.2 两阶段：发现 → 判定

```
阶段 1  tools/validate_sources.py --discover <关键词>
        只枚举 ak.* 中函数名/docstring 命中的候选，不取数
        → 候选清单写入报告
        M0 固定关键词（对应四组）：
          retail_total   → consumer_goods_retail / retail
          retail_detail  → nbs / leaf
          money          → money_supply / m1 / m2
          cpi            → cpi / price_index
阶段 2  tools/validate_sources.py --group <组>
        对全部候选跑九项门禁（真实取数）→ verdicts.json + 报告
阶段 3  tools/apply_verdicts.py
        读 verdicts.json + validation_policy.yaml → 自动选定 + 回写 registry
```

G20′：候选**全部**实测，由 policy 的 `selection` 规则自动选定。端点选择依据从「人的印象」变成「先声明的判据 + 全量实测证据」。

### 7.3 九项门禁实现（v0.1 §1.5）

| # | 门禁 | 实现 | 判据来源 |
|---|---|---|---|
| 1 | 函数是否存在 | `hasattr(ak, name)` 且可调用 | `gates.function_exists` |
| 2 | 返回列名是否稳定 | 限速下连续 2 次调用，比对列名集合 | `gates.columns_stable.min_runs` |
| 3 | 数据起止日期 | 日期列 min/max，折算月数 | `gates.date_range.min_months` |
| 4 | 频率是否真实月度 | 相邻日期间隔众数是否 = 1 月；列出全部异常间隔 | `gates.frequency_true.max_irregular_ratio` |
| 5 | 单位是否稳定 | 数值量级 + 列名单位关键词，与 registry 声明 `unit` 比对 | `gates.unit_stable.magnitude_tolerance_pct` |
| 6 | 是否修订 | **恒输出 `undetermined`**（G21） | `gates.revision.m0_verdict` |
| 7 | 空值比例 | null/NaN 计数 ÷ 总行数 | `gates.null_ratio.max` |
| 8 | 连续缺月位置 | 生成期望月度序列，列出缺失区间与最长连续缺失 | `gates.missing_months.max_consecutive` |
| 9 | 触发风控或封禁 | 异常类型 + HTTP 状态 + 响应体特征 + 实际限速参数 | `gates.risk_control.max_block_count` |

**G21**：第 6 项在 M0 恒为 `undetermined`，报告须附说明「需两次不同日抓取比对，由 M1 的 revision diff 实测」。单次抓取物理上无法判定修订，伪造结论比留空更糟（D5）。

### 7.4 U1 的算术自动关闭

「东财『同比增长』列是当月同比还是累计同比」不需人判断——用算术判：

| 口径 | 公式 | 容差 |
|---|---|---|
| 当月同比 | `level[t] / level[t-12] - 1` | 0.15 个百分点 |
| 累计同比 | `sum(level[Jan..t, Y]) / sum(level[Jan..t, Y-1]) - 1` | 0.15 个百分点 |

从原值序列算出两条理论曲线，与接口返回列逐点比对。误差落在容差内的那个公式即该列口径。两者皆不匹配 → `escalate`。判定结果写入报告并自动回填 registry 的 `params.column_map`。

### 7.5 `validation_policy.yaml`（人工声明一次，此后全自动）

```yaml
version: validation_policy_v1

# ── gates：九项门禁判据。每一项都直接决定前端能不能、以及怎样呈现一个指标；
#    改这里的阈值等于改产品行为，须人工确认（手册 §4，见 §13 第 3 项）。
gates:
  # 不通过 → registry 留 planned → 总览**整张卡不渲染**（不是显示为空，而是不出现）
  function_exists:  { required: true }
  # 不通过 → 无法定 column_map → 详情页数值列无从取值 → 卡片降级为不可用态（对应「MCD 不可用状态与原因提示」原型）
  columns_stable:   { required: true, min_runs: 2 }
  # 决定详情页 Sparkline 与经济学家图能画多长历史；<36 月则长周期视图空白
  date_range:       { required: true, min_months: 36 }
  # 不通过 → reason_code=INCOMPATIBLE_FREQUENCY → 详情页日历视图与同比/环比切换整体禁用
  frequency_true:   { required: true, expected: monthly, max_irregular_ratio: 0.05 }
  # 不通过 → reason_code=UNIT_MISMATCH → 卡片数值与单位标签不可信，禁止渲染 30px 主数字
  unit_stable:      { required: true, magnitude_tolerance_pct: 20 }
  # M0 不判定（G21）；M1 起影响详情页「数据已修订」角标是否出现
  revision:         { required: false, m0_verdict: undetermined }
  # 超阈值 → 数据表格空值格密度过高 + 「数据缺口」提示常驻 → 卡片标为质量不足
  null_ratio:       { required: true, max: 0.10 }
  # 超过 2 个连续缺月 → reason_code=MISSING_MONTHS → 折线图在断裂处显示缺口而非连线
  missing_months:   { report_only: true, max_consecutive: 2 }
  # 被封 → 采集状态页显示失败原因与重试时间；不影响已入库历史数据的展示
  risk_control:     { required: true, max_block_count: 0 }

# ── caliber_tests：U1 口径判别，决定 registry 的 params.column_map 取哪一列。
#    判错的后果是卡片上 30px 主数字的**语义**就错（把累计同比当当月同比），
#    属数据诚实性问题（UI/UX §7），比缺数据严重。
caliber_tests:
  - { name: yoy_current_month, formula: "level[t] / level[t-12] - 1", tolerance_pct_points: 0.15 }
  - { name: yoy_cumulative, formula: "sum(level[Jan..t,Y]) / sum(level[Jan..t,Y-1]) - 1", tolerance_pct_points: 0.15 }

# ── selection：候选端点自动选定规则（G20′）。
#    决定同一指标最终由哪个源供数 → 影响详情页「数据来源」标注与更新时间。
selection:
  on_single_pass: auto_select
  on_multi_pass:
    rank_by: [date_range_desc, null_ratio_asc, source_priority]
    source_priority: [akshare_eastmoney, akshare_nbs]
  on_zero_pass: escalate          # 升级人工：此时自动选一个就是猜（D10/D5）

# ── rate_limit：G23 风控防护。影响采集状态页的进度节奏与「上次采集失败」提示频率；
#    调得太激进会触发封禁 → 整组指标变不可用，反而比慢更差。
rate_limit:
  interval_seconds: 3
  timeout_seconds: 30
  max_retries: 2
  backoff: exponential
```

阈值默认值依据：`min_months: 36` 来自详情页 3–5 年长周期要求；`null_ratio.max: 0.10` 与 `max_consecutive: 2` 是工程经验值。

用户已确认（2026-10-11）：**对阈值暂无体感，先按上述默认值执行**。因此每项阈值对前端呈现的具体影响已就地注释在 YAML 里，日后调整时可据此判断后果，而不需重新推导一遍因果链。首次声明后阈值变更仍需人工确认（手册 §4）。

### 7.6 自动回写与幂等

`tools/apply_verdicts.py`：

- 输入 `reports/verdicts.json` + `registry/validation_policy.yaml`
- 写入 `registry/indicators.yaml` 的 `status`（`planned`→`active`）、`source`、`params.endpoint`、`params.column_map`
- 每条变更附 provenance：运行时间戳、报告文件名、九项各自结果、选定的候选与排序依据
- **幂等**（D9）：同样 verdicts 重跑产生零 diff；有专门单测断言此性质
- `escalate` 时**不写任何内容**，只输出待裁决清单

### 7.7 残留人工点（不假装能自动）

| 人工点 | 为什么不能去掉 |
|---|---|
| 首次声明 policy 阈值 | 「多少空值算可接受」是政策判断，不是事实发现。一次性，声明完长期自动 |
| `escalate` 分支 | 零候选达标 / 口径算术不确定 / 被封禁。此时自动选一个就是猜，D10 与 D5 禁止 |
| macOS 运行机验收四件事 | 物理动作，M4 |

### 7.8 产物落位

| 产物 | 位置 | 入 Git |
|---|---|---|
| 分组验证报告 + 汇总报告 | `reports/` | 是（关闭 U1/U3 的证据） |
| `verdicts.json` | `reports/` | 是（provenance 依据） |
| 原始响应快照 | `data/probe/<YYYY-MM-DD>/` | 否（G13） |
| `processed/` / `manifest` / `capabilities` | **绝不写入** | — |

T1-2 验收明写「只出报告不入库」：验证脚本不得生成任何 `processed/` 产物。

### 7.9 UTF-8 强制（实测要求）

- 所有脚本入口 `sys.stdout.reconfigure(encoding="utf-8")`
- `run_etl.bat` 与 probe 批处理设 `set PYTHONUTF8=1`
- 依据：实测 pip 输出含中文时在 cp1252 控制台抛 `UnicodeEncodeError` 崩溃（§12）。漏设会让定时任务静默失败，违反产品简介 §7 规则 4

## 8. §E golden fixtures（T1-4）

**G25：真实数据无法覆盖契约全部状态**——7 种 reason_code、4 个 freshness 值、`revision>1`、连续缺月、源不支持 stub，真实抓取不会按需产生。故 fixtures 分两套，**永久共存**：

```
tests/golden/
  CHECKSUMS.sha256              双仓校验和清单（G3）；不一致即阻断
  README.md                     说明两套用途差异
  real/                         真实 probe 数据派生，服务 T2-1「全量重放一致」
    raw/akshare_retail_sales_total.json      M0 冻结（真实 raw + payload_hash）
    processed/                               M1 normalize 完成后补；M0 留空并在 README 说明
  contract/                     合成契约边界样本，M0 即冻结
    processed/
      retail_sales_total.json        level_cny；含 null（不填 0）+ 连续缺月 2 个月
      retail_sales_total_yoy.json    yoy_pct；含 revision=2 修订追加（旧版本保留）
      cpi_national_yoy.json          freshness=stale 样本
      money_supply_m1_yoy.json       freshness=aging 样本（消费 G16 的 aging）
      disposable_income_yoy.json     frequency=quarterly → 触发 INCOMPATIBLE_FREQUENCY
      retail_sales_sh_yoy.json       region=SH → 给 INCOMPATIBLE_REGION 一个真实指涉对象
      manifest.json                  4 个 freshness 枚举值各至少一条（G17）
      capabilities.json              7 种 reason_code 全覆盖 + 源不支持 stub（G15 支 B）
    signals/signal_state.json        support / conflict / insufficient 各一条（U2）
```

- **不往契约里加「合成」标记字段**（那等于改 A 类契约）；靠目录名 + `README.md` + CHECKSUMS 注明，满足 UI/UX §6「占位必须注明」而不污染契约。
- 同步机制：ETL 仓 `tests/golden/` 为权威源，插件仓 `tests/golden/` 持副本；两侧 `CHECKSUMS.sha256` 必须完全一致，插件侧 CI 校验不过即失败（G3）。
- `capabilities.json` 的 7 种 reason_code 覆盖是 T2-4 验收（「七种全部有测试覆盖」）的前置数据。

## 9. §F 双仓门禁（L0–L3）

**ETL 仓**（手册 §1：Python 轨 pytest 对应 JUnit，L2/L3 由产物 schema 校验与真实数据重放替代）：

所有命令均以 `.env` 中 `MCD_PYTHON` 指向的解释器执行，入口第一行过 `tools/assert_env.py`（G30）；下表用 `<py>` 代指该解释器。

| 层 | 命令 | M0 通过标准 |
|---|---|---|
| L0 | `ruff check . && ruff format --check .` | 0 error |
| L1 | `<py> -m pytest` | 7 份 schema 对全部 fixtures 全绿；policy 判据有单测；`apply_verdicts` 幂等有单测；`paths` 缺配置报错有单测；`assert_env` 正反用例各一 |
| L2 | `<py> tools/validate_sources.py --group retail_total` | 真实跑通不崩，产出报告与 verdicts.json |
| L3 | 逐项核对 §14 退出标准 | 全部可命令验证 |

**插件仓**（M0 只增 fixtures 接收侧，无 UI 变更）：

| 层 | 命令 | M0 通过标准 |
|---|---|---|
| L0 | `npm run lint && npm run build` | 0 error |
| L1 | `npm test` | 现有 `tokens.spec.ts` 仍绿；新增 CHECKSUMS 一致性测试 + fixtures 结构测试 |
| L2 | `node scripts/smoke.mjs` | reload 后控制台无错、命令仍注册（证明 fixtures 引入未破坏插件）。本脚本由 G27 从 T3-9 提前交付 |
| L3 | 双仓 CHECKSUMS 比对 | 两侧完全一致 |

**G27**：把 T3-9 的两项自动化基础设施**从 M2 提前到 M0**：`npm run verify`（= `lint && build && test`，3 行 `package.json` 改动）与最小可用的 `scripts/smoke.mjs`。提前 `smoke.mjs` 是**逻辑上被迫的**：手册 §2 规定 L2 不可跳过，而插件仓在 M0 确实有变更（fixtures 副本 + 校验测试 + verify 脚本），既然有变更就必须跑 L2，就需要冒烟脚本。M0 版本只做三件事：reload 插件、抓控制台错误、断言命令已注册；截图与视图验收留给 M2。

层级必须自下而上；任何一层失败，修复后重跑该层及以上（手册 §2）。L2/L3 不可跳过。

## 10. §G v0.1 内部不一致与空白消解表

v0.1 原文**一律不改**；以下 9 处按开发计划 §0 规则 2 登记为 G 类填补空白。

| # | 冲突 | 证据 | 消解 |
|---|---|---|---|
| 1 | `quality` 是否允许多余字段 | §3.2 示例 `quality` 只 5 键，但 §7.10 写入 `quality.errors` | G14：`additionalProperties: false` + 显式纳入 `quality.errors` |
| 2 | capabilities panel 有两种形态 | §3.4 是完整 panel；§7.10 对失败指标写 `{source_supported:false, reason_code}` | G15：`oneOf` 同时容纳两支 |
| 3 | `freshness` 枚举未定稿 | §3.3 出现 `fresh`；§7.8/§7.10 写 `unknown`；产品简介 §6 说「fresh/临期/stale」但**「临期」机器码从未给出** | G16：`fresh \| aging \| stale \| unknown` |
| 4 | M0 阶段 freshness 填什么 | §7.8 骨架恒返回 `unknown`，真实计算是 T2-5 | G17：fixtures 覆盖全部四个枚举值 |
| 5 | M1/M2 与 CPI 端点未钉死 | §8.1 只写「东财 akshare / 未实测 / 跑函数」；§4 registry 示例无这两组 | G20′：`--discover` 枚举 + policy 自动选定 |
| 6 | registry 无对应 schema | T1-3 验收要求「YAML 过 schema」，但 §2 的 `schemas/` 只列四契约 | G10：补 `indicators_v1` / `signals_v1` |
| 7 | 数据根目录硬编码 | §7.3/§7.10 写 `ROOT / "data" / ...`，与 G2（输出到 vault）、§6.1（不写死路径）冲突 | G12：`etl/paths.py` 从 `.env` 解析 |
| 8 | base key 的 unit 自相矛盾 | §3.2 示例 `retail_sales_total` 的 unit 是 `yoy_pct`，但 §7.9 又查找独立的 `{key}_yoy` 且 `transforms.level` 为 supported | G18：base 存原值，`<key>_yoy` 存比率 |
| 9 | `layer` 枚举未定义 | §4 两个示例分别用 `macro_demand`、`macro_demand`、`consumption_structure`（后者在 `signals.groups`），但 layer 取值域从未给出 | G28：`macro_demand \| macro_money \| macro_price \| local \| auxiliary` |

## 11. §H G 类决策全表（本设计新增 G10–G30）

| ID | 决策 |
|---|---|
| G10 | `schemas/` 增加 `indicators_v1` + `signals_v1` |
| G11 | 验证脚本落 `tools/validate_sources.py`，报告落 `reports/` 并入 Git |
| G12 | 新增 `etl/paths.py`，数据根目录从 `.env` 解析，不硬编码仓内 `data/` |
| G13 | G2 精化：只有 `processed/` 与 `signals/` 落 vault；`raw/`/`probe/`/`logs/` 留 ETL 仓 |
| G14 | schema 全域 `additionalProperties: false`，显式纳入 `quality.errors` |
| G15 | `capabilities_v1` panel 用 `oneOf`：完整 panel 或源不支持 stub |
| G16 | `freshness` 机器枚举 = `fresh \| aging \| stale \| unknown` |
| G17 | M0 fixtures 覆盖全部四个 freshness 枚举值 |
| G18 | base key 存原值，衍生 key `<key>_yoy`/`<key>_mom`/`<key>_index` 存比率 |
| G19 | `status` 枚举 = `active \| planned \| paused`；M0 冻结时第一批全部 `planned` |
| G19′ | status/source/params 由 `apply_verdicts.py` 依已声明判据**自动回写**，带 provenance 且幂等 |
| G20′ | 新增 `registry/validation_policy.yaml`；候选端点全量实测后自动选定，不人工挑选 |
| G21 | 门禁第 6 项「是否修订」M0 恒输出 `undetermined`，不伪造结论 |
| G22 | U3 关闭方式 = 报告内一节口径差异说明 + 启用条件建议，不实现 DR007 抓取 |
| G23 | 风控防护默认值：间隔 3s / 超时 30s / 重试 2 次指数退避，可经 `.env` 覆盖 |
| G24 | 总览卡片门面绑定字段（`presentation.card_key` 或 family 概念）——**延到 M2 裁决** |
| G25 | fixtures 分 `real/` 与 `contract/` 两套，永久共存 |
| G26 | Python L0 用 `ruff`（lint + format），不引入 flake8/black/mypy 组合 |
| G27 | `npm run verify` **与** 最小 `scripts/smoke.mjs` 从 M2 的 T3-9 提前到 M0（L2 不可跳过，插件仓有变更就得有冒烟脚本） |
| G28 | `layer` 枚举 = `macro_demand \| macro_money \| macro_price \| local \| auxiliary`；收入与信贷指标归 `macro_demand` |
| G29 | **双虚拟环境隔离**：`D:\Codex\venv-pandas2`（akshare 1.19.1 + pandas 2.3.3）与 `D:\Codex\venv-akshare`（akshare 1.19.1 + pandas 3.0.6），两者均在仓库外；M0 ETL 用哪个由双环境冒烟证据决定（§4.5） |
| G30 | **激活门禁**：`tools/assert_env.py` 在每个入口校验 `sys.prefix`，不符则 exit 1；`run_etl.bat` 硬编码 `MCD_PYTHON` 不依赖 `activate`；两环境包永不交叉安装 |

## 12. §I U 类关闭路径

| ID | 事项 | 关闭方式 | 关闭证据 |
|---|---|---|---|
| U1 | 东财「当月同比 vs 累计同比」列口径 | §7.4 算术判别，全自动 | `reports/M0-retail_total-验证报告.md` + 自动回填的 `params.column_map` |
| U2 | `signal_state_v1` schema 定稿 | §5.2 结构最小化定稿 | `schemas/signal_state_v1.schema.json` + `contract/signals/signal_state.json` 校验全绿 |
| U3 | DR007 主通道 vs FDR007 启用条件 | G22：报告内口径差异说明 + 启用条件建议，不抓取 | `reports/M0-接口验证报告.md` 附录一节 |
| U4 | ECharts 移动端体积 | **不在 M0 关闭**，M2 冒烟后 | — |

## 13. §J 文档回写清单（M0 完成后交付）

1. **新增 `docs/宏观数据面板_运行环境.md`**（用户上一轮问「是否需要修改文档对环境进行说明」，答案是**需要**——双 venv + 激活门禁不写进文档，下次冷启动必然踩坑）。必含：
   - **双虚拟环境矩阵**（§4.5 的表格原样搬过去）与两条 `python -m venv` 创建命令；
   - **M0 最终选定哪个环境、依据是哪次冒烟的输出**（§4.5 第 3–5 步的实际结果，包括失败侧的堆栈）；
   - `MCD_PYTHON` 的含义与填写方法；`assert_env.py` 的作用与失败时的处置；
   - Python 3.14.8（本机唯一解释器，无 conda/mamba/uv）、两份 `requirements-*.txt` 锁定集与 bootstrap 步骤；
   - **Windows 必须 `PYTHONUTF8=1`**（附 cp1252 崩溃实测证据，§16）；
   - macOS 须装同版本 Python（§6.1）；Node 24.14.1 / npm 11.11.0；echarts 未装（M2 才需，G6）；
   - Obsidian CLI 已注册但 **L2 冒烟要求 Obsidian 运行中**（实测未运行时报 "The CLI is unable to find Obsidian"）。
2. **开发计划 v1.0**：§3.2 增补 G10–G30；§3.3 更新 U1/U2/U3 关闭状态；G24 登记为 M2 待裁决；新增一节收录 §10 的消解表。
3. **手册 §4 边界收窄**为：
   > 不改契约：`schemas/`、`tests/golden/` 的任何变更须人工确认；`registry/validation_policy.yaml` 的**判据阈值**变更须人工确认。`registry/indicators.yaml` 的 `status`/`source`/`params` 允许由 `tools/apply_verdicts.py` 依据已声明判据自动回写，但必须附 provenance 且幂等；**禁止 Agent 为了让测试通过而修改判据阈值或 schema**。
4. **UI/UX §9 待裁决 #2 注明解耦**：机器枚举已按 G16 钉死为 `aging`，中文文案可延到 M2，不再阻塞 fixtures 冻结。
5. ~~删除归档目录中的 v0.1 副本~~ **已完成**（2026-10-11，随提交 `e28757b`）：删前经 SHA256 比对确认与 `docs/` 下正本字节相同（`5F34B34E…BCCD`），见 §2。

## 14. §K M0 退出标准（全部可命令验证）

| # | 标准 | 验证命令 |
|---|---|---|
| 1 | 7 份 schema 定稿，对全部 fixtures 全绿 | `<py> -m pytest tests/test_schemas.py` |
| 2 | 四组验证报告产出，含九项逐项结果 | `ls reports/M0-*-验证报告.md`（4 份）+ 汇总 1 份 |
| 3 | U1 关闭（口径算术判别有结论） | 报告 §U1 有明确判定 + registry `params.column_map` 已回填 |
| 4 | U2 关闭 | `schemas/signal_state_v1.schema.json` 存在且校验 fixtures 通过 |
| 5 | U3 关闭 | 汇总报告附录有 DR007/FDR007 口径差异与启用条件 |
| 6 | registry v1 全量清单过 schema | `<py> -m pytest tests/test_schemas.py -k registry` |
| 7 | fixtures 冻结入两仓，校验和一致 | ETL 侧 `sha256sum -c CHECKSUMS.sha256`；插件侧 `npm test -- -t checksums` |
| 8 | `validation_policy.yaml` 本身可解析且字段齐备 | `<py> -m pytest tests/test_policy.py`（spec 内 YAML 未经机器校验，此条是它的首道关卡） |
| 9 | ETL 仓 L0/L1 全绿 | `ruff check . && ruff format --check . && <py> -m pytest`（`<py>` = `MCD_PYTHON`，见 §9） |
| 10 | 插件仓 L0/L1/L2 全绿 | `npm run verify && node scripts/smoke.mjs` |
| 11 | `apply_verdicts` 幂等 | 连续两次运行 `git diff --exit-code registry/` |
| 12 | 文档回写五项完成（第 5 项已提前交付） | §13 逐项核对 |
| 13 | 双环境冒烟判定完成，`MCD_PYTHON` 已写入 `.env` | 两环境各一份 `import akshare, pandas` 版本输出 + 一次真实抓取结果；`<py> tools/assert_env.py` 对选定环境退出 0、对另一个退出 1 |

## 15. §L 风险与缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| akshare 1.19.1 在 pandas 2.3.3 上的**运行期**可用性未实测（依赖解析已实测通过，§16） | 中 | G29 双环境并列：两侧各跑 `import akshare` + 一次真实抓取，由证据决定 M0 用哪个（§4.5）；两侧都失败则 M0 阻塞并触发 Python 降级缓解项 |
| Python 3.14 生态覆盖不足导致运行期报错 | 中 | 全部依赖已确认有 cp314 wheel；若运行期失败，`py install 3.12` 降级并同步修订 §13 环境文档 |
| 东财/NBS 风控封禁 | 高 | G23 限速 + 重试上限；单组失败不阻塞其他组；门禁第 9 项如实记录；`escalate` 不猜 |
| 口径算术判别落在容差外（U1 无法自动关闭） | 中 | `escalate` 输出待裁决清单与全部证据，交人工判定；不静默选一个 |
| 双仓 fixtures 漂移 | 中 | G3 CHECKSUMS + 插件侧校验失败即阻断 |
| 自动回写被滥用于「让测试通过」 | 中 | §13 第 3 项收窄手册 §4：判据阈值与 schema 变更须人工确认；每次回写带 provenance |
| ETL 仓在 vault 外，与「不越 vault」约定的关系 | 低 | 「不越 vault」约束的是**插件代码**（手册 §4）；ETL 是独立交付物（计划 §2.1 双交付物），经 `.env` 显式声明写入 `MacroData/`，插件侧仍只经 vault adapter 只读 |
| venv 移到仓库外 →「clone 即可复现」失效 | 中 | 两份 `requirements-*.txt` 强制入 Git；运行环境文档写清 bootstrap；`assert_env.py` 在路径不符时直接 exit 1，不会静默用错环境 |
| 两环境包被交叉安装，隔离名存实亡 | 中 | G30：任何 `pip install` 前先过 `assert_env.py` 确认身处哪个环境；`.bat` 硬编码解释器路径，不依赖 `activate` |

## 16. §M 已实测的环境事实

| 项 | 实测结果 |
|---|---|
| Python | 3.14.8，本机唯一解释器；真实安装位于 `C:\Users\Pandora\AppData\Local\Python\pythoncore-3.14-64\`，`WindowsApps\python.exe` 与 `py.exe` 是其应用执行别名；无 conda/mamba/uv；`venv` 与 `ensurepip` 可用；pip 26.2.1 |
| akshare 依赖链 | `--dry-run` 解析通过，29 包全有 cp314 wheel，零编译：akshare 1.19.1 / pandas 3.0.6 / numpy 2.5.4 / curl_cffi 0.16.3 / mini-racer 0.14.1 / lxml 6.1.3 … |
| `pandas<3` | 解析为 **pandas 2.3.3**，`pandas-2.3.3-cp314-cp314-win_amd64.whl` 存在；附带 `pytz-2026.5` |
| **akshare + `pandas<3` 共存** | `pip install --dry-run --ignore-installed "akshare==1.19.1" "pandas<3"` → **EXITCODE=0**，`Would install akshare-1.19.1 … pandas-2.3.3 pytz-2026.5 …`（30 包，全 cp314 wheel）。证明 akshare 1.19.1 元数据**无** `pandas>=3` 约束；此前解析出 pandas 3.0.6 只是 pip 在无上界时偏好最新版。**注意：解析成功 ≠ 运行成功**，运行期待验（§17 假设 3） |
| akshare 可用版本 | `pip index versions akshare` → 最新 1.19.1（列表自 1.16.72 起） |
| 本机 pandas/akshare 消费者普查 | 扫 `D:\Codex` depth 4（排除 node_modules/venv/site-packages/__pycache__）：依赖清单仅 `AKShareWebapp\requirements.txt`（L4 `akshare>=1.12`、L5 `pandas>=2.0`，同环境同时需要）；`import pandas` 的 .py 仅 `AKShareWebapp\Backend\{main,concept_cache}.py` 且都用 akshare；**pandas-only 代码 0 个** |
| Windows 编码 | pip 输出含中文时 cp1252 抛 `UnicodeEncodeError`；设 `PYTHONUTF8=1` + `PYTHONIOENCODING=utf-8` 后正常 |
| Node | v24.14.1 / npm 11.11.0；`node_modules` 已装；**echarts 未装** |
| Obsidian CLI | 已注册；Obsidian 未运行时报 "The CLI is unable to find Obsidian" |
| 现有资产 | `styles.css` 令牌层 + `tests/tokens.spec.ts` 门禁已就位（提交 bf1aaa6）；`src/` 仍是 sample 骨架 |
| 数据侧 | `<Vault>/MacroData/` 不存在；`D:\Codex\MacroDataETL`、`D:\Codex\venv-pandas2`、`D:\Codex\venv-akshare` 均不存在；`D:\Codex` 下无任何现成 venv，akshare 未全局安装（`importlib.metadata.requires('akshare')` 抛 `PackageNotFoundError`） |
| 双环境运行期冒烟（退出标准 #13） | 环境A `pandas 2.3.3` → `SMOKE PASS via macro_australia_retail_rate_monthly rows=210`（exit `0`）；环境B `pandas 3.0.6` → `SMOKE PASS via macro_australia_retail_rate_monthly rows=210`（exit `0`）。按 §4.5 判定规则（两侧均 0 时选 A）选定 **环境A**，`MCD_PYTHON=D:\Codex\venv-pandas2\Scripts\python.exe`。`assert_env` 对选定环境退 0、对另一个退 1（已验证） |

## 17. §N 假设与边界

1. **假设**：本机可访问公网并调用 akshare 的东财/NBS 接口。若网络受限，T1-2 全部四组进入 `escalate`，M0 退出标准 #2/#3/#5 无法达成——此时 M0 只能部分完成，需如实报告而非伪造。
2. **假设**：`D:\Codex\MacroDataETL`、`D:\Codex\venv-pandas2`、`D:\Codex\venv-akshare` 可创建。三者均在 vault 与插件仓之外，属计划 §2.1「双交付物」的明确范围，已获用户采纳 G1；但创建时需越出沙箱写权限（已核实三路径当前均不存在）。
3. **假设（已部分实测，剩余部分转为退出标准 #13）**：akshare 1.19.1 与 pandas 2.3.3 **可共存于同一 venv**——已由 `pip install --dry-run` 证明（EXITCODE=0，§16），不再只是假设。仍**未实测**的是运行期可用性（元数据允许 ≠ 代码跑通）；该问题由 §4.5 的双环境冒烟判定回答，结果写入 `.env` 的 `MCD_PYTHON`；两侧都失败则 M0 阻塞并如实报告，不伪造（D5）。
4. **边界**：本设计只覆盖 M0。M1（T2-*）与 M2（T3-*）各自的 spec 在其里程碑启动前另行编写。
5. **边界**：插件侧 M0 只增加 `tests/golden/` 副本、校验测试、`npm run verify`、`scripts/smoke.mjs`（G27）；`src/` 的 sample 骨架清理属 T3-1（M2），M0 不动（D7 变更最小化）。
6. **边界**：G24（卡片门面绑定）不在 M0 决策范围，但 registry schema 需为它预留位置——`presentation` 为 object 且 `additionalProperties: false`，M2 引入 `card_key` 时按 G10 的 schema 变更流程走人工确认。
