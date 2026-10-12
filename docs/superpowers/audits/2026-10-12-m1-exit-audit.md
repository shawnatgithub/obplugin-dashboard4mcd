# M1 数据闭环 · 退出标准审计（14 项）

日期：2026-10-12
里程碑：M1（数据闭环，Python 轨）
判据来源：`docs/superpowers/specs/2026-10-12-m1-data-pipeline-design.md` §13

- ETL 仓 HEAD：`03392b0`（master，工作树干净；该仓无远端 → push 不适用）
- 插件仓 HEAD：`e09ffbc`（qoder/general-session-y35a2v，已与 origin 同步）

## 审计结论：14/14 全部通过（PASS）

| # | 标准 | 验证命令 | 证据 | 判定 |
|---|---|---|---|---|
| 1 | 各模块单测全绿 | `python -m pytest -m "not network"` | 259 passed | PASS |
| 2 | 真实抓取跑通不崩，产出四产物 | `python run_etl.py` | EXIT=2（部分失败非崩溃）；写入 vault 5 产物 | PASS |
| 3 | 所有产物过 schema 校验 | probe_validate_products | 5/5 validate | PASS |
| 4 | capabilities 7 种 reason_code 有测试 | `pytest -k capabilit` | 全绿 | PASS |
| 5 | revision diff 旧留新追递增 | `pytest -k revision` | golden 全绿 | PASS |
| 6 | freshness 四态真实计算 | `pytest -k fresh` | 全绿 | PASS |
| 7 | 手动 drop-folder 带 manual 标记 | `pytest -k manual` | golden 全绿 | PASS |
| 8 | raw payload_hash 只追加幂等 | `pytest -k payload/hash` | golden 全绿 | PASS |
| 9 | 失败注入写日志可重试不停跑 | `pytest -k pipeline` | 全绿 | PASS |
| 10 | U1 关闭：column_map 回填 + caliber 标注 | registry diff + 报告 | `03392b0`：caliber:comparable，最小 48+/1- diff | PASS |
| 11 | columns_stable 第九门禁 ≥2 次抓取 | validate_sources min_runs=2 | 报告 runs:2 pass | PASS |
| 12 | apply_verdicts 回写幂等 | 连跑两次 byte-identical | run2 == run1（SHA256） | PASS |
| 13 | L0 全绿 | `ruff check . && ruff format --check .` | All checks passed；56 files formatted | PASS |
| 14 | 契约未改（schemas/fixtures/policy 字节不变） | `git diff --stat 284d0c6~1 HEAD -- schemas/ registry/validation_policy.yaml tests/golden/contract/` | 空 diff，exit 0 | PASS |

## 真实产物（写入 `<Vault>/MacroData/`，不入插件仓 Git）

- `processed/retail_sales_total.json`（209 观测，2008-01 → 2026-08）
- `processed/retail_sales_total_yoy.json`
- `processed/manifest.json`（freshness:aging，real）
- `processed/capabilities.json`（33 panels，reason_code 覆盖）
- `signals/signal_state.json`（retail_sales_total_yoy:0.4）

## 诚实保留项（未粉饰）

- `frequency_true` 门禁对 Jan-Feb 合并发布仍 **FAIL**（irregular_ratio 0.0721 > 冻结阈值 0.05）；如实保留，未放宽阈值。已在 registry `params.jan_feb_combined:true` + 报告 + capabilities report_only 说明。
- 4 个 manual 指标（household_deposits / household_loan_short / household_loan_midlong / institution_quarterly_credit）因缺 `data/manual/<key>.csv` 而失败 → EXIT=2（部分失败，允许）。未伪造数据，未静默跳过。
- U1 算术口径 escalate（cm_hits 114/182，可比口径 ≠ 名义）如实保留；§5.2 裁决记录为独立可审计 `resolution` 块。

## 延后项（需人工确认，非 M1 阻塞）

- **caliber 传播到 processed 产物**：`indicator_series_v1` 与 `manifest_v1` 均 `additionalProperties:false` 且无 caliber 槽位；写入需改**冻结 schema**（手册 §4 / 退出 #14 / spec §5.2 line 119 → 人工确认）。exit #10 的既定验证（registry diff + 报告，均带 caliber:comparable）已满足，故 M1 不阻塞。
- **t21b：`tests/golden/real/processed/` 重放基准 + CHECKSUMS 重生成**：属**新增 golden fixtures**，须双仓同步 + 人工确认（spec §11 line 210）。M1 首抓已建 raw 基线；processed 重放基准延后到需要离线重放门禁时补齐。

## 里程碑签署

M1（数据闭环）退出标准 **14/14 PASS**，产物真实落 vault 且全部过 schema。M1 **验收通过**，可进入 M2（插件 MVP）。
