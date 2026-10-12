import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		// 开发期工具脚本（如 L2 冒烟 scripts/smoke.mjs）自由使用 Node API，
		// 不进插件产物，不该用 Obsidian 插件规则校验。
		'scripts/**',
		'jest.config.cjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
		// Figma 原型是视觉基准资产（React + Tailwind 独立工具链），不进插件构建链，
		// 也不该用 Obsidian 插件规则校验。见 prototype/README.md。
		'prototype/**',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.jest,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// 本插件 UI 文案为中文，英文 sentence-case 规则不适用（会误报并输出乱码）。
		rules: {
			'obsidianmd/ui/sentence-case': 'off',
		},
	},
	{
		// 纯渲染层刻意使用标准 DOM（而非 Obsidian 的 createEl 运行时增强），
		// 以便在 jsdom 下脱离 Obsidian 运行时做单元测试。见 src/ui/dom.ts。
		files: ['src/ui/**/*.ts', 'tests/**/*.ts', '__mocks__/**/*.ts'],
		rules: {
			'obsidianmd/prefer-create-el': 'off',
		},
	},
	{
		// 测试只在 Node 下运行，不进插件产物，可自由使用 Node API
		files: ['tests/**/*.ts'],
		languageOptions: {
			globals: { ...globals.node },
		},
		rules: {
			'obsidianmd/no-nodejs-modules': 'off',
		},
	},
);
