# 年度粒度（年度总额）实施计划 · CR-2026-10-13

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 详情图年度趋势只体现年度总额（12 月累计官方口径），消除按年迷你折线误读。

**Architecture:** ETL 抓取路径新增 `<key>_annual` 键（column_map 映射「累计」列），
normalize 年度规则抽 12 月行；契约最小扩展（frequency 枚举 + annual）；插件消费端过滤
annual 卡片/日历行，详情工具栏加 grain 段，年度视图渲染年份柱状图。

**Tech Stack:** Python 3 (ETL, pytest) / TypeScript (plugin, jest+ts-jest) / 冻结 JSON schemas。

**Spec:** `docs/superpowers/specs/2026-10-13-annual-grain-design.md`

## Global Constraints

- 冻结面零写，除用户批准的三处 frequency 枚举 + golden 清单扩展（spec §3）。
- null_not_zero；不插值不填 0 不补点；非 12 月行静默排除（caliber），12 月 null 保留 null。
- 提交格式 ai-git-version-control：English、无双引号、Agent-Task/Decision/Limitation、
  **不写 Agent-Model**；commit message 写 `.mcd-stage/commit-msg-*.txt` 后 `git commit -F`。
- PowerShell：`;` 分隔；stderr 噪声以 exit code 判真败。
- ETL 仓提交需 `required_permissions='all'`（workspace 外）；插件仓推送
  `origin/qoder/general-session-y35a2v`。

---

### Task 1: ETL schema 枚举 + normalize 年度规则 + manifest year freshness（TDD）

**Files:**
- Modify: `D:\Codex\MacroDataETL\schemas\indicator_series_v1.schema.json`（frequency += "annual"）
- Modify: `D:\Codex\MacroDataETL\schemas\manifest_v1.schema.json`（同上）
- Modify: `D:\Codex\MacroDataETL\schemas\indicators_v1.schema.json`（同上）
- Modify: `D:\Codex\MacroDataETL\etl\normalize.py`
- Modify: `D:\Codex\MacroDataETL\etl\manifest.py`
- Test: `D:\Codex\MacroDataETL\tests\test_normalize.py`、`tests\test_manifest.py`

- [ ] **Step 1: 写失败测试**（test_normalize：annual 抽取）
  记录含 `{'月份': '2023年12月份', '累计': 471495.0}`、`{'月份': '2023年11月份', '累计': 434000.0}`、
  `{'月份': '2024年02月份', '累计': 80000.0}`、`{'月份': 'bad', '累计': 1}`：
  断言 frequency='annual' 时 series == [{'date':'2023','value':471495.0,'revision':1}]
  （11 月静默排除、2 月排除、bad 进 quality.errors）；12 月累计 null → value None。
  test_manifest：compute_freshness(last_date='2025', frequency='annual', now='2026-10-13')
  == 'fresh'；now='2026-01-05' 且 last='2024' → 'aging'；last=None → 'unknown'。
- [ ] **Step 2: 跑测试确认 FAIL**：`python -m pytest tests/test_normalize.py tests/test_manifest.py -q`
- [ ] **Step 3: 实现**
  schemas 三处枚举追加 "annual"。normalize.py：`_DATE_GRAIN["annual"]="year"`；
  新增 `_year_month_parts(label)`（复用 `_YEAR_MONTH_RE`）；canonical_month 改用它；
  normalize_series 循环内：`grain=="year"` 时 parts=None→errors+continue；
  parts.month!=12→continue（不计 errors）；否则 date=f"{parts.year:04d}"。
  manifest.py：`_COMPUTABLE_GRAINS=("month","quarter","year")`；`_period_index` year→year；
  `_index_from_label` 增 `_YEAR_LABEL_RE = ^(\d{4})$` 分支（grain year）。
- [ ] **Step 4: 全量 ETL 测试绿**：`python -m pytest tests/ -q`
- [ ] **Step 5: 提交**（ETL 仓，permissions=all）：feat(etl): add the annual frequency and the december-cumulative normalize rule

### Task 2: registry 键 + pipeline 集成测试

**Files:**
- Modify: `D:\Codex\MacroDataETL\registry\indicators.yaml`（追加 retail_sales_total_annual）
- Test: `D:\Codex\MacroDataETL\tests\test_pipeline.py`

- [ ] **Step 1: 写失败测试**：注入假 fetcher 返回含「累计」列记录（2023-12、2024-12、2025-12、
  2026-02…），registry 含 annual 键 → run_pipeline 后 processed/retail_sales_total_annual.json
  存在、frequency annual、date_grain year、3 个年点；manifest indicators 含该键 frequency annual。
- [ ] **Step 2: FAIL** → **Step 3: 实现**：yaml 追加条目（spec §4 字段；notes 记口径；无 provenance）。
- [ ] **Step 4: `python -m pytest tests/ -q` 绿**（registry schema 校验测试覆盖 yaml 合法性）。
- [ ] **Step 5: 提交**：feat(etl): register the retail annual-total indicator on the cumulative column

### Task 3: live 跑管线产出真实年度序列 + 量级核对

- [ ] **Step 1**: ETL 仓 `.\run_etl.bat`（exit 0 或 2 均可，看 failures 列表无 annual 键失败）。
- [ ] **Step 2: 核对**：vault `processed/retail_sales_total_annual.json`：2023≈471495、
  2024≈483395（±1% 容差）；2026 缺席；manifest 含 annual 条目 freshness=fresh。
- [ ] **Step 3**: 失败则回 Task 1/2 修；成功不提交（vault 数据非 git 产物；raw 快照 gitignored）。

### Task 4: golden 扩展（双仓）+ 插件镜像与消费端过滤（TDD）

**Files:**
- Create: 双仓 `tests/golden/contract/processed/retail_sales_total_annual.json`（真实摘录 6 年点）
- Modify: 双仓 `tests/golden/contract/processed/manifest.json`（+ annual indicator 条目）
- Modify: 双仓 `tests/golden/CHECKSUMS.sha256`（重算，脚本见 tests/golden/README.md）
- Modify: `src/contract/types.ts`（Frequency += 'annual'）
- Modify: `src/contract/mapper.ts`（overview 卡片过滤 annual）
- Modify: `src/contract/releaseMapper.ts`（行过滤 annual）
- Test: `tests/contract/mapper.spec.ts`、`tests/releaseMapper.spec.ts`、`tests/checksums.spec.ts`

- [ ] **Step 1: 先写插件失败测试**：golden manifest 含 annual 后，overview 卡片数仍 6、
  release 行仍 6（过滤生效）；新增断言：annual 条目不产生卡片/行。
- [ ] **Step 2: 更新 golden 三件 + 重算 CHECKSUMS（双仓同字节）**；types/mapper/releaseMapper 过滤实现。
- [ ] **Step 3: `npm run verify` 绿**（checksums spec 校验双仓一致）。
- [ ] **Step 4: 提交插件仓**：feat(contract): mirror the annual frequency and filter annual siblings out of cards and calendar rows

### Task 5: view_state grain + 工具栏 grain 段 + detailView 接线（TDD）

**Files:**
- Modify: `src/analysis/viewState.ts`（+grain 字段，默认 monthly，往返保持）
- Modify: `src/ui/toolbar.ts`（grain 段：月度/年度；annual 下隐藏 transform/overlay/smoothing/range；
  chart_type 年度仅 柱状/折线/表格；onGrain 回调）
- Modify: `src/ui/detailView.ts`（grain 切换：manifest 查 `<key>_annual` 兄弟；无兄弟回退 monthly）
- Modify: `src/ui/detail.ts`（handlers.onGrain；年度脚注文案）
- Test: `tests/analysis/viewState.spec.ts`、`tests/toolbar.spec.ts`、`tests/detail.spec.ts`、`tests/detailView.spec.ts`

- [ ] **Step 1–4: TDD 循环**（先测试后实现；断言：view_state 8 字段往返；grain 段存在且无兄弟时
  年度 disabled；有兄弟时点击年度 → onGrain('annual')；年度态隐藏四段；脚注含「年度总额」）。
- [ ] **Step 5: `npm run verify` 绿** → 提交：feat(ui): add the monthly-annual grain segment with view_state persistence

### Task 6: 年度图表渲染（option.ts 年份类目轴 + 柱状默认）（TDD）

**Files:**
- Modify: `src/ui/chart/option.ts`（date_grain/year 或日期长度 4 → 类目轴年份标签；bar 默认；
  missingLine 沿用）
- Test: `tests/chart/option.spec.ts`
- [ ] **Step 1–3: TDD**（断言：年度点 → xAxis data = ['2008',…]; series[0].type='bar'；
  null 年 → markLine 缺失；月度点行为不变）。
- [ ] **Step 4: verify 绿** → 提交：feat(chart): render annual points on a year category axis as bars

### Task 7: 冒烟扩展 + 全门禁 + 审计 + 推送

- [ ] **Step 1**: `scripts/smoke.mjs` 增年度段：详情切「年度」→ `.mcd-chart` 柱数 = 年度点数
  （vault 真实值）、脚注含「年度总额」、切回「月度」`.mcd-table` 行数 = 209 不变、控制台无错。
- [ ] **Step 2**: `npm run build` + `node scripts/smoke.mjs` → SMOKE PASS。
- [ ] **Step 3**: `npm run verify` + checksums/tokens + main.js 体积 < 700KB。
- [ ] **Step 4**: 写 `docs/superpowers/audits/2026-10-13-annual-grain-audit.md`
  （spec §2–§6 逐条 → 证据；含 2023/2024 量级核对表）。
- [ ] **Step 5**: 提交（spec+plan+audit+smoke）→ `git push origin qoder/general-session-y35a2v`；
  ETL 仓 Tasks 1–2 已各自提交；确认双仓工作树干净。
