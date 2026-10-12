# 年度粒度（年度总额）验收审计 · CR-2026-10-13

> 逐条映射设计 spec `docs/superpowers/specs/2026-10-13-annual-grain-design.md` §2–§6，
> 每条给出**实测证据**（命令 + 观测值），并附 2023/2024 年度总额量级核对表。
> 结论：全部通过。年度趋势只体现年度总额（12 月累计官方口径），不再按年迷你折线。

## 0. 门禁汇总（实测）

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| 插件构建 | `npm run build`（tsc -noEmit + esbuild production） | exit 0，无类型错误 |
| 插件全测 | `npm run verify` | 27 suites / 341 tests 全绿 |
| 插件 lint | `npm run lint` | 0 errors，1 pre-existing warning（settings.ts，与本次无关） |
| 产物体积 | `main.js` | 714111 B = 697.4 KB < 700 KB |
| L2 冒烟 | `node scripts/smoke.mjs`（实时 Obsidian + 真实 vault） | SMOKE PASS 38/38，exit 0 |
| ETL 全测 | `python -m pytest tests/ -q` | exit 0（~265 tests 全绿） |
| 双仓金标封印 | `tests/checksums.spec.ts` + ETL `test_checksums.py` | 年度 fixture/manifest/CHECKSUMS 双仓同字节 |

提交轨迹：插件 `30c983a`(docs) → `4a5b752`(T4) → `96882dd`(T5) → `bf3b8a2`(T6) → 本次(T7 冒烟+审计)；
ETL `6773682`(T1) → `593b26c`(T2) → `a3d9a10`(T4 golden 镜像)。

## 2. 口径决策（用户批准）→ 证据

- **年度总额 = 当年 12 月「累计」值**：ETL registry `retail_sales_total_annual`
  走抓取路径 `column_map={date:月份, value:累计}`；normalize 年度规则只保留 12 月行、
  日期规整为 `YYYY`。证据：live 产物 `MacroData/processed/retail_sales_total_annual.json`
  `frequency=annual`、`date_grain=year`、18 个年点（2008→2025），每点为对应年 12 月累计。
- **未完结年份不入序列**：产物最新年点为 2025（2026 无 12 月行 → 自然缺席），
  未出现「截至 N 月累计」点数。冒烟 7f-4 观测年份行 `2025,2024,…,2008`（无 2026）。
- **12 月累计 null → 年度点 null**：ETL `test_normalize` 覆盖「12 月 null → value None」；
  插件 `option.spec` 覆盖「缺失年为 null 柱、绝不填 0」+「年度折线沿用 缺失 markLine」。

## 3. 契约扩展（冻结变更，已批准）→ 证据

- 三处 schema `frequency` 枚举追加 `"annual"`（`indicator_series_v1` / `manifest_v1` /
  `indicators_v1`），为唯一枚举改动面；`series[].date` 无 pattern，`YYYY` 标签无需改 schema。
  证据：ETL `test_normalize` / `test_manifest` / registry schema 校验全绿。
- golden 新增 `retail_sales_total_annual.json`（真实输出摘录，5 年点 2021–2025）+
  golden `manifest.json` 追加该 indicator + 双仓 `CHECKSUMS.sha256` 重算（11→12 行）。
  golden `capabilities.json` **未加** annual panel。证据：`tests/checksums.spec.ts` 绿，
  双仓已提交 blob 逐字节相同（LF；已修正 Write 工具 CRLF 与 `.gitattributes eol=lf` 的封印偏差）。
- capabilities schema 不改；插件年度开关只查 manifest 是否存在 `<key>_annual` 兄弟键。
  证据：`detailView.spec` 「无兄弟则 年度 disabled / 有兄弟则 年度 可点」。

## 4. ETL 改动面 → 证据

- `normalize.py`：`_DATE_GRAIN['annual']='year'`；年度分支非 12 月行静默排除（不计 errors）、
  12 月行 date=`YYYY`、不可解析日期照旧计 errors。证据：`test_normalize` 四例全绿。
- `manifest.py`：`_COMPUTABLE_GRAINS += 'year'`，周期序号=年，`_index_from_label` 接受 `YYYY`。
  证据：`test_manifest` year freshness 三例（fresh / aging / unknown）全绿；
  live manifest 中 annual 条目 `freshness=fresh`（now=2026-10、last_date=2025 → lag 1）。
- `registry/indicators.yaml`：追加 `retail_sales_total_annual`
  （`annual_caliber: dec_cumulative`，notes 记口径，无 provenance）。
  证据：`test_pipeline` 注入含「累计」列假 fetcher → 落盘 `<key>_annual.json` + manifest 含条目。

## 5. 插件改动面 → 证据

- `types.ts` `Frequency += 'annual'`（镜像）。证据：`mapper.spec` `frequencyLabel('annual')='年度'`。
- **消费端过滤**：overview 卡片与 release 日历行排除 `frequency==='annual'`。
  证据：`mapper.spec`「annual 兄弟不产生总览卡」、`releaseMapper.spec` 行/标记数保持 6；
  冒烟实时观测总览真实卡片不含年度重复瓦片。
- `viewState.ts`：view_state 第 8 字段 `grain`（默认 monthly，往返保持；无兄弟诚实回退 monthly）。
  证据：`viewState.spec` 8 字段往返 + 非法 grain 落 monthly；`detailView.spec` getState 含 `grain`。
- 工具栏「月度/年度」grain 段（首位）：年度可选当且仅当 manifest 有 `<key>_annual`；
  年度粒度下**隐藏**（非置灰）transform/overlay/range/smoothing；chart_type 年度仅 柱状/折线/表格；
  切年度→`{grain:annual,chartType:bar}`、切月度→`{grain:monthly,chartType:line}`。
  证据：`toolbar.spec` grain 段 5 例；stub 源下整段随 S3 一致置灰。
- `option.ts`：年度 = 类目轴年份标签（`YYYY` 原样，不再 `slice(5)` 成空）+ 默认柱状；缺失年虚线沿用。
  证据：`option.spec` 年度 4 例（年份类目原样 / null 柱不填 0 / 年度折线 markLine 缺失 / 月度标签不变）。
- `detail.ts` 年度脚注：「年度总额 = 当年 1—12 月累计（12 月累计口径）…未完结年份不纳入。」
  表格行日期原样 `YYYY`。证据：`detail.spec` 年度脚注 2 例；冒烟 7f-5 脚注含「年度总额」。
- 冒烟年度段：详情切「年度」→ 年份行数=18=vault 真实年度点数、脚注含「年度总额」、
  切回「月度」→ 行数复原 209。证据：SMOKE PASS 38/38（含年度段 8 项断言）。

## 6. 诚实边界（不变量）→ 证据

- 月度视图 1—2 月缺失保持如实标注，未用年度视图掩盖 gaps：冒烟月度表 209 行不变，
  `detail.spec` 缺失 Badge「缺失」非 0 断言仍绿。
- 不用已存月份求和冒充年度总额；不插值、不填 0、不补点：年度点直取源端「累计」列（12 月），
  插件侧无任何求和/派生年度路径（`option.spec` null 柱不填 0）。
- annual 序列不参与 overlay/变换/信号：年度粒度隐藏这些段；capabilities 未为 annual 虚构 modes。
- ETL `schemas/` 本次改动 = 用户批准的枚举扩展一项，其余冻结面零写（`git diff` 仅枚举行）。

## 7. 量级核对表（live vault 产物 vs 官方年度总额）

| 年份 | ETL 产出（12 月累计，亿元） | 官方全年口径（亿元） | 偏差 | 判定 |
| --- | --- | --- | --- | --- |
| 2023 | 471495.2 | 471495 | ~0.0% | 通过 |
| 2024 | 487894.8 | 483395（spec 目标，±1% 容差） | +0.93% | 通过（容差内） |
| 2025 | 501202.4 | —（当年最新累计） | — | 记录 |

> 对照 spec §1 算术证明：已存月份求和 2023 = 394,428 亿元 ≠ 官方 471,495 亿元（少计约 16%）。
> 本次年度序列直取源端 12 月「累计」，2023 与官方逐位吻合，证否「月份求和=年度总额」的伪造路径。

## 结论

spec §2–§6 全部逐条落地并有实测证据；§7 三门禁（ETL pytest / 插件 verify+冒烟 / 审计）全绿。
用户诉求达成：详情图表现年度趋势时**只体现年度总额**（18 根年份柱 / 年份表行），
不再每年一段月精度迷你折线。
