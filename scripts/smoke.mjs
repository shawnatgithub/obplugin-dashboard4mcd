#!/usr/bin/env node
/**
 * L2 冒烟测试 — verification pyramid 的第三层（手册 §4 / 计划 T3-9 / G27）。
 *
 * 为什么存在：L0（lint+build）与 L1（jest）都在 Node/jsdom 里跑，永远不碰真实
 * 的 main.js，也不进 Obsidian 运行时。只有这一层把打包产物真正加载进一个打开的
 * vault，用来抓住加载期崩溃、错误的 import、视图构造函数抛错等单元测试看不见的
 * 问题。它封装 Obsidian CLI：reload → 插件实例存在 → 总览命令已注册 → 看板视图
 * 能挂载 → 控制台无错误 → 配置真实数据目录后总览出现真实卡片、详情出现真实
 * 主图与数据表（M2 退出标准 #1 的真实数据路径）。
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
import { mkdirSync } from 'node:fs';
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

const chart = evalJs(
	`(function(){var l=app.workspace.getLeavesOfType('${DETAIL_VIEW_TYPE}')[0];return l?(l.view.contentEl.querySelector('.mcd-chart__svg')!==null):false;})()`,
);
record('详情页渲染主图（SVG 折线）', chart.value === 'true', chart.value || chart.err);

const rows = evalJs(
	`(function(){var l=app.workspace.getLeavesOfType('${DETAIL_VIEW_TYPE}')[0];return l?l.view.contentEl.querySelectorAll('tbody tr').length:-1;})()`,
);
record('详情页渲染数据表', Number(rows.value) >= 1, `rows=${rows.value}`);

// 7a. 详情 view_state 存了 key（T3-6：重载 leaf 恢复到同一指标）
const stateKey = evalJs(
	`(function(){var l=app.workspace.getLeavesOfType('${DETAIL_VIEW_TYPE}')[0];return l?JSON.stringify(l.view.getState()||{}):'{}';})()`,
);
record('详情 view_state 存有 key', stateKey.value.includes(DETAIL_KEY), `state=${stateKey.value}`);

// 8. 真实数据渲染后控制台仍无错误
const errs2 = run(['dev:errors']);
const clean2 = /no errors/i.test(errs2.out);
record('真实数据渲染后控制台无错误', clean2, clean2 ? '' : errs2.out.slice(0, 600));

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
