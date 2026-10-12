#!/usr/bin/env node
/**
 * L2 冒烟测试 — verification pyramid 的第三层（手册 §4 / 计划 T3-9 / G27）。
 *
 * 为什么存在：L0（lint+build）与 L1（jest）都在 Node/jsdom 里跑，永远不碰真实
 * 的 main.js，也不进 Obsidian 运行时。只有这一层把打包产物真正加载进一个打开的
 * vault，用来抓住加载期崩溃、错误的 import、视图构造函数抛错等单元测试看不见的
 * 问题。它封装 Obsidian CLI：reload → 插件实例存在 → 总览命令已注册 → 看板视图
 * 能挂载 → 控制台无错误 → 配置真实数据目录后总览出现真实卡片、详情出现真实
 * 主图（ECharts canvas 或 SVG 兜底）与数据表（M2 退出标准 #1 的真实数据路径）；
 * 再走一遍 M3 交互路径：切图型（表格↔折线）主图随画法变而 tbody 行数不变、切
 * 变换到同比图重画表不动、叠加下拉在无候选时诚实禁用、view_state 全字段
 * setState→getState 往返（M3 退出审计 spec §9 / G7）。overlay 双图渲染真实数据无
 * 候选，由单测覆盖，冒烟不虚构第二序列（D-M3-5/D-M3-6/D-M3-8）。M4 再开发布日历
 * 视图：命令打开→时间线 13 月刻度→状态列表真实指标行→「预计」文案（S5 契约安全版）。
 *
 * 前置条件：Obsidian 已打开本 vault，且 vault 内 `MacroData/processed/` 有 M1 真实
 * 产物（可用 MCD_DATA_DIR / MCD_DETAIL_KEY 覆盖）。若 CLI 不可达，脚本以退出码 2
 * 跳过，并打印手动降级两步（手册：CLI 能力不足处降级为人工）。
 *
 * 用法：node scripts/smoke.mjs [--screenshot]
 *   环境变量 OBSIDIAN_CLI 覆盖 CLI 二进制名（默认 obsidian）。
 *   --screenshot 额外把窗口截图落到 artifacts/smoke.png（尽力而为，不判负）。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = process.env.OBSIDIAN_CLI || 'obsidian';
const PLUGIN_ID = 'mcd';
const COMMAND_ID = `${PLUGIN_ID}:open-overview`;
const VIEW_TYPE = 'mcd-overview-view';
const DETAIL_VIEW_TYPE = 'mcd-detail-view';
// Vault-relative data root the live ETL products live under (loader appends
// processed/). Override for a different vault layout.
const DATA_DIR = process.env.MCD_DATA_DIR || 'MacroData';
// A real indicator key present in the live manifest, used to open the detail.
const DETAIL_KEY = process.env.MCD_DETAIL_KEY || 'retail_sales_total';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WANT_SCREENSHOT = process.argv.includes('--screenshot');

const results = [];
const record = (name, ok, detail = '') => results.push({ name, ok, detail });

/** 调一次 CLI，返回状态与已 trim 的输出；带超时避免卡死。 */
function run(args, timeout = 30000) {
	const r = spawnSync(CLI, args, { encoding: 'utf8', timeout });
	return {
		status: r.status,
		out: (r.stdout || '').trim(),
		err: (r.stderr || '').trim(),
		spawnError: r.error ? r.error.message : null,
	};
}

/** eval 回显形如 `=> <value>`，取出 <value> 的字符串形式。 */
function evalJs(code) {
	const r = run(['eval', `code=${code}`]);
	const m = /^=>\s*([\s\S]*)$/.exec(r.out);
	return { ...r, value: (m ? m[1] : r.out).trim() };
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * Read the real annual point count straight from the vault product, so the
 * annual-grain assertions compare the rendered year rows against the source of
 * truth (数据诚实). Best-effort: returns null when the file is absent/unreadable,
 * and the caller then falls back to the DOM-only structural checks.
 */
function readAnnualCount() {
	try {
		const vaultRoot = path.resolve(REPO_ROOT, '..', '..', '..');
		const file = path.join(
			vaultRoot,
			DATA_DIR,
			'processed',
			`${DETAIL_KEY}_annual.json`,
		);
		if (!existsSync(file)) return null;
		const json = JSON.parse(readFileSync(file, 'utf8'));
		return Array.isArray(json.series) ? json.series.length : null;
	} catch {
		return null;
	}
}

// 0. CLI 可达性（需要 Obsidian 已打开本 vault）
const ping = run(['plugins:enabled']);
if (ping.spawnError || ping.status !== 0) {
	console.error(`[SKIP] 无法调用 Obsidian CLI (${ping.spawnError || `exit ${ping.status}`}).`);
	console.error('请先确认 Obsidian 已打开本 vault；或手动降级两步：');
	console.error(`  1) ${CLI} plugin:reload id=${PLUGIN_ID}`);
	console.error(`  2) ${CLI} dev:errors   # 期望 No errors captured.`);
	process.exit(2);
}
const enabled = ping.out.split(/\r?\n/).map((l) => l.trim());
record('CLI 可达且插件已启用', enabled.includes(PLUGIN_ID), enabled.includes(PLUGIN_ID) ? '' : '未在已启用插件列表中发现 mcd');

// 1. 重载刚构建出的 main.js
const reload = run(['plugin:reload', `id=${PLUGIN_ID}`]);
record('插件重载成功', reload.status === 0 && /reload/i.test(reload.out), reload.out || reload.err);

// 2. 插件实例已加载（onload 未抛错）
const loaded = evalJs(
	`app.plugins.enabledPlugins.has('${PLUGIN_ID}') && app.plugins.plugins['${PLUGIN_ID}']!==undefined`,
);
record('插件实例已加载', loaded.value === 'true', loaded.value || loaded.err);

// 3. 总览命令已注册（稳定 id，AGENTS.md 要求发布后不得改名）
const cmd = evalJs(`app.commands.commands['${COMMAND_ID}']!==undefined`);
record(`命令已注册 (${COMMAND_ID})`, cmd.value === 'true', cmd.value || cmd.err);

// 4. 执行命令，看板视图应挂载出一个 leaf
evalJs(`app.commands.executeCommandById('${COMMAND_ID}')`);
await sleep(700);
const leaf = evalJs(`app.workspace.getLeavesOfType('${VIEW_TYPE}').length`);
record('总览视图可打开并挂载', Number(leaf.value) >= 1, `leaves=${leaf.value}`);

// 5. 加载 + 渲染后控制台无错误
const errs = run(['dev:errors']);
const clean = /no errors/i.test(errs.out);
record('控制台无错误', clean, clean ? '' : errs.out.slice(0, 600));

// ---- 真实数据路径（M2 退出标准 #1：配置 dataDir → 总览真实卡片 → 详情真实序列）----

// 6. 把数据目录指向 vault 内真实 ETL 产物根，重开总览触发真实加载
evalJs(
	`(function(){var p=app.plugins.plugins['${PLUGIN_ID}'];p.settings.dataDir='${DATA_DIR}';p.saveSettings();return p.settings.dataDir;})()`,
);
evalJs(`app.workspace.detachLeavesOfType('${VIEW_TYPE}')`);
evalJs(`app.commands.executeCommandById('${COMMAND_ID}')`);
await sleep(800);

// 6a. 总览渲染出带契约 key 的真实指标卡片（示例卡片没有 data-key）
const realCards = evalJs(
	`(function(){var l=app.workspace.getLeavesOfType('${VIEW_TYPE}')[0];return l?l.view.contentEl.querySelectorAll('.mcd-card[data-key]').length:-1;})()`,
);
record(
	'总览渲染出真实指标卡片',
	Number(realCards.value) >= 1,
	`dataDir=${DATA_DIR} realCards=${realCards.value}`,
);

// 6b. 真实数据下不再展示示例横幅（数据诚实，D-M2-5）
const sampleBanner = evalJs(
	`(function(){var l=app.workspace.getLeavesOfType('${VIEW_TYPE}')[0];return l?(l.view.contentEl.querySelector('.mcd-banner')!==null):true;})()`,
);
record('真实数据下无示例横幅', sampleBanner.value === 'false', `banner=${sampleBanner.value}`);

// 7. 打开一个真实指标的详情页，断言主图与数据表
const opened = evalJs(
	`(function(){var p=app.plugins.plugins['${PLUGIN_ID}'];p.openDetail('${DETAIL_KEY}');return true;})()`,
);
await sleep(800);
record(`详情命令已调用 (${DETAIL_KEY})`, opened.value === 'true', opened.value || opened.err);

const detailLeaf = evalJs(`app.workspace.getLeavesOfType('${DETAIL_VIEW_TYPE}').length`);
record('详情视图可打开并挂载', Number(detailLeaf.value) >= 1, `leaves=${detailLeaf.value}`);

// 主图存在（M3-T3 起）：主图由 tree-shaken ECharts 渲染为 <canvas>；仅当 ECharts
// 不可用/抛错才回退到依赖无关的 SVG 折线。两者其一存在即算主图已画出，
// 不再只认 .mcd-chart__svg（那会漏掉真实的 canvas 路径）。
const hasChart = () => evalJs(
	`(function(){var l=app.workspace.getLeavesOfType('${DETAIL_VIEW_TYPE}')[0];if(!l)return 'no-leaf';var c=l.view.contentEl;return (c.querySelector('.mcd-chart--echarts canvas')!==null)||(c.querySelector('.mcd-chart__svg')!==null);})()`,
);
const bodyRows = () => evalJs(
	`(function(){var l=app.workspace.getLeavesOfType('${DETAIL_VIEW_TYPE}')[0];return l?l.view.contentEl.querySelectorAll('tbody tr').length:-1;})()`,
);
// data-value="table"/"line" 在工具栏中唯一（不像 calendar/yoy 会与模式段重名），
// 故可安全地按值点击图型段。
const pickChart = (v) => evalJs(
	`(function(){var l=app.workspace.getLeavesOfType('${DETAIL_VIEW_TYPE}')[0];if(!l)return 'no-leaf';var b=l.view.contentEl.querySelector('.mcd-segmented__item[data-value="${v}"]');if(!b)return 'no-btn';b.click();return 'clicked';})()`,
);

const chart0 = hasChart();
record('详情页渲染主图（ECharts canvas 或 SVG 兜底）', chart0.value === 'true', chart0.value || chart0.err);

const baseRows = Number(bodyRows().value);
record('详情页渲染数据表', baseRows >= 1, `rows=${baseRows}`);

// 7a. 详情 view_state 存了 key（T3-6：重载 leaf 恢复到同一指标）
const stateKey = evalJs(
	`(function(){var l=app.workspace.getLeavesOfType('${DETAIL_VIEW_TYPE}')[0];return l?JSON.stringify(l.view.getState()||{}):'{}';})()`,
);
record('详情 view_state 存有 key', stateKey.value.includes(DETAIL_KEY), `state=${stateKey.value}`);

// 7b. 切图型不动数据（T3-6 验收 / spec §9-1）：点『表格』主图应隐藏、点『折线』
//     主图应恢复，但 tbody 行数始终不变——图型只改画法，绝不改底层数据。
const toTable = pickChart('table');
await sleep(400);
const tableChart = hasChart();
const tableRows = Number(bodyRows().value);
record('切图型→表格：主图隐藏', tableChart.value === 'false', `pick=${toTable.value} chart=${tableChart.value}`);
record('切图型→表格：数据行数不变', tableRows === baseRows, `rows=${tableRows} base=${baseRows}`);

const toLine = pickChart('line');
await sleep(400);
const lineChart = hasChart();
const lineRows = Number(bodyRows().value);
record('切图型→折线：主图恢复', lineChart.value === 'true', `pick=${toLine.value} chart=${lineChart.value}`);
record('切图型→折线：数据行数不变', lineRows === baseRows, `rows=${lineRows} base=${baseRows}`);

// 7c. 切变换到同比（spec §9-2）：消费 retail_sales_total_yoy sibling，主图按同比
//     重画，但数据表仍是原值序列（表与变换无关），行数不变。
evalJs(
	`(function(){var l=app.workspace.getLeavesOfType('${DETAIL_VIEW_TYPE}')[0];if(!l)return 'no-leaf';var s=l.view.getState();s.transform='yoy';l.view.setState(s,{history:false});return 'ok';})()`,
);
await sleep(500);
const yoyState = evalJs(
	`(function(){var l=app.workspace.getLeavesOfType('${DETAIL_VIEW_TYPE}')[0];return l?l.view.getState().transform:'?';})()`,
);
const yoyChart = hasChart();
const yoyRows = Number(bodyRows().value);
record('切变换→同比：状态生效', yoyState.value === 'yoy', `transform=${yoyState.value}`);
record('切变换→同比：主图重画', yoyChart.value === 'true', `chart=${yoyChart.value}`);
record('切变换→同比：数据行数不变', yoyRows === baseRows, `rows=${yoyRows} base=${baseRows}`);

// 7d. 叠加下拉诚实禁用（spec §9-3/§9-4 + UI-UX §6）：真实 capabilities 中
//     retail_sales_total 的 overlays={} 无候选，叠加下拉应被禁用而非提供空操作。
//     跨 region 双图/单轴叠加渲染需真实候选序列，当前 vault 无此类数据，故由单测
//     覆盖（overlay.spec / chartModel.spec dual / option.spec 双 grid / detail.spec
//     双 pane），冒烟不虚构第二条序列（D-M3-5/D-M3-6）。
const overlayState = evalJs(
	`(function(){var l=app.workspace.getLeavesOfType('${DETAIL_VIEW_TYPE}')[0];if(!l)return 'no-leaf';var s=l.view.contentEl.querySelector('select.mcd-select');return s?String(s.disabled):'no-select';})()`,
);
record('叠加下拉：无候选时诚实禁用', overlayState.value === 'true', `disabled=${overlayState.value}`);

// 7e. view_state 全字段往返（spec §9-7 / G7）：setState 写全 7 字段，getState 原样
//     读回，证明重开的标签页恢复到同一指标、同一分析视角。
const fullState = `{key:'${DETAIL_KEY}',mode:'yoy',chartType:'calendar',transform:'yoy',overlay:null,range:'3y',smoothing:true}`;
evalJs(
	`(function(){var l=app.workspace.getLeavesOfType('${DETAIL_VIEW_TYPE}')[0];if(!l)return 'no-leaf';l.view.setState(${fullState},{history:false});return 'ok';})()`,
);
await sleep(500);
const rtRaw = evalJs(
	`(function(){var l=app.workspace.getLeavesOfType('${DETAIL_VIEW_TYPE}')[0];return l?JSON.stringify(l.view.getState()||{}):'{}';})()`,
);
let rtOk = false;
try {
	const g = JSON.parse(rtRaw.value);
	rtOk =
		g.key === DETAIL_KEY && g.mode === 'yoy' && g.chartType === 'calendar' &&
		g.transform === 'yoy' && g.overlay === null && g.range === '3y' &&
		g.smoothing === true;
} catch {
	rtOk = false;
}
record('view_state 全字段 setState→getState 往返', rtOk, `state=${rtRaw.value}`);

// ---- 年度粒度（CR-2026-10-13：年度趋势只体现年度总额，不再按年迷你折线）----
// 详情粒度段的「年度」切到 manifest 的 `<key>_annual` 兄弟（12 月累计官方年总额）：
// 数据表变为年份行、脚注声明年度总额口径、切回「月度」行数复原（209 不变）。

// 7f-0. 先把详情恢复到干净的月度默认视角（7e 留下了 calendar/yoy/3y/smoothing）。
evalJs(
	`(function(){var l=app.workspace.getLeavesOfType('${DETAIL_VIEW_TYPE}')[0];if(!l)return 'no-leaf';l.view.setState({key:'${DETAIL_KEY}'},{history:false});return 'ok';})()`,
);
await sleep(500);
const monthlyRowsBefore = Number(bodyRows().value);
record(
	'年度段前置：月度详情行数复原',
	monthlyRowsBefore === baseRows,
	`rows=${monthlyRowsBefore} base=${baseRows}`,
);

// 7f-1. 年度兄弟存在 → 粒度段「年度」可点；不存在则本段诚实跳过（不虚构年度序列）。
const annualBtn = evalJs(
	`(function(){var l=app.workspace.getLeavesOfType('${DETAIL_VIEW_TYPE}')[0];if(!l)return 'no-leaf';var b=l.view.contentEl.querySelector('.mcd-segmented__item[data-value="annual"]');return b?String(!b.disabled):'no-btn';})()`,
);
const annualAvailable = annualBtn.value === 'true';
record('粒度段「年度」在有年度兄弟时可用', annualAvailable, `annualBtn=${annualBtn.value}`);

if (annualAvailable) {
	const annualCount = readAnnualCount();

	// 7f-2. 点「年度」：切到年度兄弟序列，grain 状态生效。
	evalJs(
		`(function(){var l=app.workspace.getLeavesOfType('${DETAIL_VIEW_TYPE}')[0];if(!l)return 'no-leaf';var b=l.view.contentEl.querySelector('.mcd-segmented__item[data-value="annual"]');if(!b)return 'no-btn';b.click();return 'clicked';})()`,
	);
	await sleep(600);
	const grainState = evalJs(
		`(function(){var l=app.workspace.getLeavesOfType('${DETAIL_VIEW_TYPE}')[0];return l?l.view.getState().grain:'?';})()`,
	);
	record('切「年度」：grain 状态生效', grainState.value === 'annual', `grain=${grainState.value}`);

	// 7f-3. 主图仍以柱状画出（ECharts canvas 或 SVG 兜底），非空。
	const annualChart = hasChart();
	record(
		'切「年度」：主图渲染（年度柱状）',
		annualChart.value === 'true',
		`chart=${annualChart.value}`,
	);

	// 7f-4. 数据表变为年份行：每行「期」列是 4 位年份（YYYY），而非 YYYY-MM。
	const annualRows = Number(bodyRows().value);
	const yearLabels = evalJs(
		`(function(){var l=app.workspace.getLeavesOfType('${DETAIL_VIEW_TYPE}')[0];if(!l)return '';var tds=l.view.contentEl.querySelectorAll('tbody tr td:first-child');return Array.prototype.map.call(tds,function(t){return t.textContent;}).join(',');})()`,
	);
	const labels = yearLabels.value.split(',').filter(Boolean);
	const allYears = labels.length >= 1 && labels.every((s) => /^\d{4}$/.test(s));
	record(
		'切「年度」：数据表全为年份行（YYYY）',
		allYears,
		`rows=${annualRows} labels=${yearLabels.value.slice(0, 60)}`,
	);
	if (annualCount !== null) {
		record(
			'切「年度」：年份行数 = vault 真实年度点数',
			annualRows === annualCount,
			`rows=${annualRows} expected=${annualCount}`,
		);
	}

	// 7f-5. 脚注声明年度总额（12 月累计）口径，杜绝把年度当作按月迷你折线误读。
	const footnote = evalJs(
		`(function(){var l=app.workspace.getLeavesOfType('${DETAIL_VIEW_TYPE}')[0];if(!l)return '';var p=l.view.contentEl.querySelector('.mcd-main > p.mcd-muted');return p?p.textContent:'';})()`,
	);
	record(
		'切「年度」：脚注含「年度总额」口径',
		footnote.value.includes('年度总额'),
		`footnote=${footnote.value.slice(0, 60)}`,
	);

	// 7f-6. 切回「月度」：数据表恢复月度行数（209 不变），证明粒度切换不损底层数据。
	evalJs(
		`(function(){var l=app.workspace.getLeavesOfType('${DETAIL_VIEW_TYPE}')[0];if(!l)return 'no-leaf';var b=l.view.contentEl.querySelector('.mcd-segmented__item[data-value="monthly"]');if(!b)return 'no-btn';b.click();return 'clicked';})()`,
	);
	await sleep(600);
	const backRows = Number(bodyRows().value);
	record(
		'切回「月度」：数据行数复原',
		backRows === baseRows,
		`rows=${backRows} base=${baseRows}`,
	);
}

// 8. 真实数据渲染后控制台仍无错误
const errs2 = run(['dev:errors']);
const clean2 = /no errors/i.test(errs2.out);
record('真实数据渲染后控制台无错误', clean2, clean2 ? '' : errs2.out.slice(0, 600));

// ---- 发布日历视图（M4-T5 / S5：命令打开 → 时间线 → 状态列表 → 预计文案）----
// dataDir 已在步骤 6 指向 vault 内真实 ETL 产物，故此段走的是真实数据路径。

// R0. 发布日历命令已注册（稳定 id，发布后不得改名）
const RELEASE_COMMAND_ID = `${PLUGIN_ID}:open-release-calendar`;
const RELEASE_VIEW_TYPE = 'mcd-release-view';
const relCmd = evalJs(`app.commands.commands['${RELEASE_COMMAND_ID}']!==undefined`);
record(`发布日历命令已注册 (${RELEASE_COMMAND_ID})`, relCmd.value === 'true', relCmd.value || relCmd.err);

// R1. 执行命令，发布日历视图应挂载出一个 leaf
evalJs(`app.commands.executeCommandById('${RELEASE_COMMAND_ID}')`);
await sleep(700);
const relLeaf = evalJs(`app.workspace.getLeavesOfType('${RELEASE_VIEW_TYPE}').length`);
record('发布日历视图可打开并挂载', Number(relLeaf.value) >= 1, `leaves=${relLeaf.value}`);

// R2. 视图渲染出 .mcd-release（契约可读时的真实日历，而非空态/伪造）
const relRoot = evalJs(
	`(function(){var l=app.workspace.getLeavesOfType('${RELEASE_VIEW_TYPE}')[0];return l?(l.view.contentEl.querySelector('.mcd-release')!==null):false;})()`,
);
record('发布日历渲染出 .mcd-release', relRoot.value === 'true', `present=${relRoot.value}`);

// R3. 时间线刻度数 === 月轴长度（13：anchor 前 11 月 + anchor + 后 1 月）
const relTicks = evalJs(
	`(function(){var l=app.workspace.getLeavesOfType('${RELEASE_VIEW_TYPE}')[0];return l?l.view.contentEl.querySelectorAll('.mcd-release__tick').length:-1;})()`,
);
record('发布日历时间线含 13 个月刻度', Number(relTicks.value) === 13, `ticks=${relTicks.value}`);

// R4. 状态列表行数 === 真实指标数（>=1；与总览真实卡片同源，不虚构行）
const relRows = evalJs(
	`(function(){var l=app.workspace.getLeavesOfType('${RELEASE_VIEW_TYPE}')[0];return l?l.view.contentEl.querySelectorAll('.mcd-release__row').length:-1;})()`,
);
record('发布日历状态列表渲染真实指标行', Number(relRows.value) >= 1, `rows=${relRows.value}`);

// R5. 「预计」文案出现（下次发布为按频率推导值且显式标注，spec §2 数据诚实）
const relNext = evalJs(
	`(function(){var l=app.workspace.getLeavesOfType('${RELEASE_VIEW_TYPE}')[0];return l?l.view.contentEl.textContent.includes('预计'):false;})()`,
);
record('发布日历标注「预计」下次发布', relNext.value === 'true', `has预计=${relNext.value}`);

// R6. 发布日历渲染后控制台仍无错误
const errs3 = run(['dev:errors']);
const clean3 = /no errors/i.test(errs3.out);
record('发布日历渲染后控制台无错误', clean3, clean3 ? '' : errs3.out.slice(0, 600));

// 9. 尽力而为的截图（手册：截图落 artifacts/），失败不判负
if (WANT_SCREENSHOT) {
	const dir = path.join(REPO_ROOT, 'artifacts');
	mkdirSync(dir, { recursive: true });
	const shot = path.join(dir, 'smoke.png');
	const s = run(['dev:screenshot', `path=${shot}`]);
	record('截图落盘 artifacts/smoke.png', s.status === 0, s.status === 0 ? shot : s.err || s.out);
}

let failed = 0;
for (const r of results) {
	if (!r.ok) failed++;
	console.log(`[${r.ok ? 'PASS' : 'FAIL'}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
}
const total = results.length;
console.log(failed === 0 ? `\nSMOKE PASS (${total}/${total})` : `\nSMOKE FAIL (${failed}/${total} failed)`);
process.exit(failed === 0 ? 0 : 1);
