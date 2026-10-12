#!/usr/bin/env node
/**
 * L2 冒烟测试 — verification pyramid 的第三层（手册 §4 / 计划 T3-9 / G27）。
 *
 * 为什么存在：L0（lint+build）与 L1（jest）都在 Node/jsdom 里跑，永远不碰真实
 * 的 main.js，也不进 Obsidian 运行时。只有这一层把打包产物真正加载进一个打开的
 * vault，用来抓住加载期崩溃、错误的 import、视图构造函数抛错等单元测试看不见的
 * 问题。它封装 Obsidian CLI：reload → 插件实例存在 → 总览命令已注册 → 看板视图
 * 能挂载 → 控制台无错误。
 *
 * 前置条件：Obsidian 已打开本 vault。若 CLI 不可达，脚本以退出码 2 跳过，并打印
 * 手动降级两步（手册：CLI 能力不足处降级为人工）。
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

// 6. 尽力而为的截图（手册：截图落 artifacts/），失败不判负
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
