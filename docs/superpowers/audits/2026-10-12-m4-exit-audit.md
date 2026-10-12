# M4 运行与验收 · 退出标准审计（六项 + 通用门禁）

日期：2026-10-12
里程碑：M4（运行与验收，双仓共同轨）
判据来源：`docs/superpowers/specs/2026-10-12-m4-run-and-acceptance-design.md` §9（六项逐条）+ §9 末「通用门禁」

- 插件仓 HEAD：`ef42bbf`（M4-T3）+ 本 M4-T5 提交（smoke 扩展 + 本审计）；证据采集于该工作树，提交推送后与 `origin/qoder/general-session-y35a2v` 齐平。
- ETL 仓 HEAD：`master` `b33775a`（M4-T4 deploy 交付物），`git status --porcelain` 空；`schemas/`+`registry/`+`etl/`+`tools/`+`tests/` 全程零写（`git status` 证明）。

## 审计结论：4/6 通过（PASS）+ 2/6 如实延后（DEFERRED，物理约束）+ 通用门禁全绿

| # | 标准（spec §9） | 验证命令 | 证据 | 判定 |
|---|---|---|---|---|
| 1 | 两平台调度入口存在且机器配置只从 `.env` 读（不写死路径） | `python -m pytest tests/test_run_etl.py`（ETL 仓）+ `python -c "import plistlib; plistlib.load(...)"` | `run_etl.bat`/`run_etl.sh` G30 正确（从 `.env` 读 `MCD_PYTHON`、`PYTHONUTF8=1`、缺则 exit 4）；`test_run_etl.py` 13 passed（bootstrap exit-4-on-missing-config + 离线管线）；新增 `deploy/register_task.bat`+`com.mcd.etl.plist`+`README.md`；plist 经 `plistlib` 静态校验合法（`Label=com.mcd.etl`、`StartCalendarInterval={Hour:8,Minute:0}`、`ProgramArguments=[/bin/bash, __MCD_ETL_REPO__/run_etl.sh]`、`RunAtLoad=False`）；机器路径一律 `__MCD_ETL_REPO__` 占位，无硬编码 | PASS |
| 2 | 失败重试 / 日志轮转 / 不静默停跑 | M1 审计 #9 + `deploy/README.md` §3 | M1 失败注入 PASS（`tests/test_pipeline.py`）+ `tests/test_logs.py` 滚动日志；M4 不重写，仅在 runbook §3 引用（重试经 `.env` `MCD_FETCH_RETRIES`/`MCD_FETCH_INTERVAL` 覆盖；单指标失败隔离为 exit 2；`FAILED <key>: <reason>` 原样打 stderr） | PASS（M1 已关） |
| 3 | 手动 drop-folder 带 manual 标记入库 | M1 审计 #7 + `npx jest tests/releaseMapper.spec.ts tests/release.spec.ts` | M1 `tests/test_manual_golden.py` PASS；插件侧 `releaseMapper.toStatusRow` 对 `source==='manual'` 置 `isManual=true`/`source='手动'`，`release.ts buildRow` 渲染 Badge「手动」；release.spec 断言 manual 行来源列含 `.mcd-badge`「手动」 | PASS（M1 已关 + S5 呈现） |
| 4 | 发布日历与采集状态可视（S5） | `npx jest tests/releaseMapper.spec.ts tests/release.spec.ts tests/releaseView.spec.ts` + `node scripts/smoke.mjs` | 三份 release 单测 33 passed（映射/composer/视图胶水）；冒烟：命令 `mcd:open-release-calendar` 已注册 → 视图挂载 `leaves=1` → `.mcd-release` present=true → 时间线 `ticks=13` → 状态列表 `rows=2`（真实 vault 2 指标，如实稀疏）→ 文案含「预计」→ 控制台无错误 | PASS |
| 5 | macOS 端到端（launchd 真机跑通四件事） | `plistlib` 静态校验（不 load、不 create） | 开发机 Windows 25H2，无 Mac；plist 仅静态校验合法。真机 e2e 延后。**关闭步骤**（需一台 Mac）：① `sed "s#__MCD_ETL_REPO__#$PWD#g" deploy/com.mcd.etl.plist > /tmp/com.mcd.etl.plist`；② `plutil -lint /tmp/com.mcd.etl.plist`；③ 填 `.env` 的 `MCD_PYTHON` 后 `bash run_etl.sh` 手动跑通一次（exit 0/2）；④ `cp` 到 `~/Library/LaunchAgents/` + `launchctl load`；⑤ `launchctl list \| grep com.mcd.etl` 确认登记；⑥ 次日 08:00 后查 `logs/launchd.*.log` 与 `processed/manifest.json` 的 `generated_at` 是否推进 | DEFERRED |
| 6 | 连续两周无人值守稳定运行 | 交付可运行调度机制 + soak 启动步骤 | 需 14 天真实墙钟，任何单次会话无法关闭。本轮交付：可运行调度配置（#1）+ 失败重试 + 日志轮转（#2，M1 已验证）。**关闭步骤**：① 按 `deploy/README.md` 在本机注册任务（Windows 运行 `register_task.bat` / macOS `launchctl load`）——此步由用户手动执行（Q2 ship-don't-register）；② 连续 14 天每日查退出码（0/2 正常，1/4 修环境/配置）；③ 确认 `processed/manifest.json` 的 `generated_at` 每日推进、无静默停跑；④ 记为运维验收待办关闭 | DEFERRED |

## 通用门禁（spec §9 末）

| 门禁 | 命令 | 结果 | 判定 |
|---|---|---|---|
| verify 全绿 | `npm run verify` | lint 0 errors（1 既有 `settings.ts:30` warning，非 M4 引入）+ tsc clean + esbuild OK + `323` tests / `27` suites，exit 0 | PASS |
| golden 字节不变 | `npx jest tests/checksums.spec.ts` | 绿（CHECKSUMS.sha256 全绿，与 tokens 合跑 `55` tests / `2` suites，exit 0） | PASS |
| 不新增令牌 | `npx jest tests/tokens.spec.ts` | 绿（`.mcd-release*`/`.mcd-nav` 仅复用现有 `--mcd-*`，无新增） | PASS |
| 无对 ETL `schemas/`+golden+policy 的写 | `git -C D:/Codex/MacroDataETL status --porcelain` | 提交 `b33775a` 后空输出（工作树干净）；仅新增 `deploy/` 三文件，`schemas/registry/etl/tools/tests` 零改动 | PASS |
| 契约只读 | 插件仅 `loadData`/adapter 读 `MacroData/processed/*.json`，无写 | release 视图 `loadContract` 只读；`toReleaseModel` 纯函数不落盘 | PASS |
| L2 冒烟（真实 Obsidian） | `npm run build` + `node scripts/smoke.mjs` | `SMOKE PASS (30/30)`，exit 0 | PASS |
| U4 体积 | `node -e "statSync('main.js').size"` | `main.js`=`712074`B=`695.4KB`<700KB → `isDesktopOnly=false` | PASS |

## 诚实保留项（未粉饰）

1. **#5 macOS e2e 延后**：开发机为 Windows，launchd 仅 `plistlib` 静态校验（XML 合法 + 必需键齐全），未在真机 `launchctl load`。关闭步骤见上表 #5（需一台 Mac）。此为运维验收待办，非开发缺口。
2. **#6 两周 soak 延后**：需 14 天真实墙钟。本轮交付可运行的调度机制 + 失败重试 + 日志轮转 + soak 启动步骤；soak 结果记为运维验收待办。关闭步骤见上表 #6。
3. **调度运行时态不渲染（§2 边界，供人工复核）**：S5 原型的 `polling`（蓝点虚线）/`retry (2/5)`/`Failed · Alert Triggered`/`Next Run: Tomorrow 08:00` 属调度运行时态，冻结契约（`manifest_v1` `additionalProperties:false`）无此数据，ETL `logs/` 按 G13 不落 vault。故契约安全版**只渲染 freshness 派生态**（最新/临近截止/已过期/待采集），「下次发布」按 `frequency` 从 `last_date` 推导并显式标注「预计」，页脚声明其为估算非调度承诺。**绝不虚构运行时态**；留待未来一个「运行历史」契约产品（需人工确认，不在 M4）。
4. **真实 vault 仅 2 个 CN retail 指标**：时间线/状态列表如实稀疏（`rows=2`、点稀疏即稀疏），**不凑数、不装饰、不补点**（D5/D10）。单测以 6 指标 golden fixture 覆盖多态（fresh/aging/stale/unknown + quarterly + manual）。
5. **U4 无真机移动渲染测试**：以 tree-shaken `main.js` 体积实测（`695.4KB`<700KB）+ 桌面 Obsidian 冒烟为证据，`isDesktopOnly` 保持 `false`。移动端渲染待发布前真机复验。

## 里程碑签署

M4（运行与验收）退出标准 **4/6 PASS**（#1 调度入口 + #2 重试/轮转 + #3 manual 入库 + #4 发布日历可视）+ **2/6 如实 DEFERRED**（#5 macOS e2e、#6 两周 soak，均为物理约束下的运维验收待办，关闭步骤已逐条给出）+ 通用门禁全绿（verify 323/27、checksums+tokens 55、smoke 30/30、main.js 695.4KB<700KB、ETL 契约零写）。发布日历与采集状态视图（S5 契约安全版）已从冻结 manifest 渲染月度时间线 + 五列采集状态，「预计」下次发布按频率推导且显式标注，调度运行时态如实不渲染。**开发侧全部交付并自动验证通过**；两项延后为运维待办而非开发缺口。至此 `docs/宏观数据面板_开发计划_v1.0.md` 的 M0–M4 全部里程碑开发工作完成。
