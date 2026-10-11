import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 设计令牌一致性检查。
 *
 * 为什么存在：styles.css 的令牌抄自 Figma 原型的 index.css，但表面色必须
 * 改接 Obsidian 主题变量（提示词 §6）。这是两个文件之间唯一的机器可校验关系，
 * 一旦原型新增令牌或插件漏接，视觉就会静默偏离基准，所以放在 L1 门禁里。
 */

const REPO_ROOT = path.resolve(__dirname, '..');
const PROTO_CSS = path.join(
	REPO_ROOT,
	'prototype',
	'mcd-console',
	'src',
	'index.css',
);
const PLUGIN_CSS = path.join(REPO_ROOT, 'styles.css');

/** 原型令牌名 → styles.css 令牌名（插件侧统一加 mcd- 前缀） */
function pluginToken(protoToken: string): string {
	return `--mcd-${protoToken}`;
}

/**
 * 表面色：必须接 Obsidian 变量，不允许硬编码色值。
 * grid/wire 是图表与线框专用色，允许插件自持。
 */
const SURFACE_TOKENS = [
	'bg',
	'card',
	'stroke',
	'text',
	'muted',
	'hover',
	'chrome',
	'pop',
];

/** 强调色与语义色：插件自持，但色值必须与原型一致 */
const SELF_HELD_TOKENS = ['accent', 'amber', 'red', 'stale'];

/** 取出 `[data-theme='<name>'] { ... }` 块内的令牌声明 */
function protoThemeBlock(css: string, theme: 'dark' | 'light'): Record<string, string> {
	const start = css.indexOf(`[data-theme='${theme}']`);
	expect(start).toBeGreaterThanOrEqual(0);
	const body = css.slice(start, css.indexOf('}', start));
	const out: Record<string, string> = {};
	for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
		const name = match[1];
		const value = match[2];
		if (name && value) out[name.replace(/^--/, '')] = value.trim();
	}
	return out;
}

/** 取出 `.mcd-root { ... }` / `.theme-light .mcd-root { ... }` 内的令牌声明 */
function pluginBlock(css: string, selector: string): Record<string, string> {
	const start = css.indexOf(selector);
	expect(start).toBeGreaterThanOrEqual(0);
	const body = css.slice(start, css.indexOf('}', start));
	const out: Record<string, string> = {};
	for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
		const name = match[1];
		const value = match[2];
		if (name && value) out[name] = value.trim();
	}
	return out;
}

describe('design tokens', () => {
	const protoCss = readFileSync(PROTO_CSS, 'utf8');
	const pluginCss = readFileSync(PLUGIN_CSS, 'utf8');
	const protoDark = protoThemeBlock(protoCss, 'dark');
	const protoLight = protoThemeBlock(protoCss, 'light');
	const pluginDark = pluginBlock(pluginCss, '.mcd-root {');
	const pluginLight = pluginBlock(pluginCss, '.theme-light .mcd-root {');

	it.each(Object.keys(protoDark))(
		'styles.css 覆盖原型深色令牌 --%s',
		(protoToken) => {
			expect(pluginDark[pluginToken(protoToken)]).toBeDefined();
		},
	);

	it('深浅两主题的令牌集合一致（原型侧）', () => {
		expect(Object.keys(protoLight).sort()).toEqual(
			Object.keys(protoDark).sort(),
		);
	});

	it.each(SELF_HELD_TOKENS)(
		'深色自持色 --%s 与原型色值一致',
		(protoToken) => {
			expect(pluginDark[pluginToken(protoToken)]).toBe(
				protoDark[protoToken],
			);
		},
	);

	it.each(SELF_HELD_TOKENS)(
		'浅色自持色 --%s 与原型色值一致',
		(protoToken) => {
			expect(pluginLight[pluginToken(protoToken)]).toBe(
				protoLight[protoToken],
			);
		},
	);

	it.each(SURFACE_TOKENS)(
		'表面色 --mcd-%s 走 Obsidian 主题变量，不硬编码',
		(token) => {
			expect(pluginDark[pluginToken(token)]).toMatch(/^var\(--/);
		},
	);

	it('原型未硬编码 Obsidian 已提供的表面色（提醒复核映射）', () => {
		// 原型的深色表面值应与 Obsidian 默认深色接近，差异过大说明映射表需要更新
		expect(protoDark['bg']).toBe('#1e1e1e');
		expect(protoDark['text']).toBe('#dcddde');
	});
});
