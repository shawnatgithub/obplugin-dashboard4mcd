import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
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
