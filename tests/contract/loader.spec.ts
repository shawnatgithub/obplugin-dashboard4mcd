import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
	joinPath,
	loadContract,
	type ContractAdapter,
} from '../../src/contract/loader';

/**
 * Loader tests (T3-4). A fake in-memory adapter serves the sealed golden
 * fixtures under the real vault layout (`<dataDir>/processed/<file>`), so the
 * loader is exercised end to end without Obsidian or node fs.
 */

const GOLDEN = path.resolve(
	__dirname,
	'..',
	'..',
	'tests',
	'golden',
	'contract',
	'processed',
);
const DATA_DIR = 'MacroData';
const PREFIX = 'MacroData/processed';

const GOLDEN_NAMES = [
	'manifest.json',
	'capabilities.json',
	'retail_sales_total.json',
	'retail_sales_total_yoy.json',
	'money_supply_m1_yoy.json',
	'cpi_national_yoy.json',
	'disposable_income_yoy.json',
	'retail_sales_sh_yoy.json',
];

function goldenFiles(): Record<string, string> {
	const out: Record<string, string> = {};
	for (const n of GOLDEN_NAMES) {
		out[`${PREFIX}/${n}`] = readFileSync(path.join(GOLDEN, n), 'utf8');
	}
	return out;
}

function fakeAdapter(files: Record<string, string>): ContractAdapter {
	return {
		async exists(p: string): Promise<boolean> {
			return Object.prototype.hasOwnProperty.call(files, p);
		},
		async read(p: string): Promise<string> {
			const c = files[p];
			if (c === undefined) throw new Error(`ENOENT: ${p}`);
			return c;
		},
	};
}

describe('joinPath', () => {
	it('joins vault-relative parts with a forward slash', () => {
		expect(joinPath('MacroData', 'processed', 'manifest.json')).toBe(
			'MacroData/processed/manifest.json',
		);
	});

	it('normalizes redundant and back slashes and drops empties', () => {
		expect(joinPath('MacroData/', '/processed/', 'manifest.json')).toBe(
			'MacroData/processed/manifest.json',
		);
		expect(joinPath('', 'processed', 'x.json')).toBe('processed/x.json');
		expect(joinPath('a\\b', 'c')).toBe('a/b/c');
	});
});

describe('loadContract', () => {
	it('happy path: manifest + all series + capabilities', async () => {
		const res = await loadContract(fakeAdapter(goldenFiles()), DATA_DIR);
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		expect(res.manifest.indicators).toHaveLength(6);
		expect(res.seriesByKey.size).toBe(6);
		expect(res.caps).not.toBeNull();
		expect(res.caps?.schema_version).toBe('capabilities_v1');
	});

	it('accepts a data dir with a trailing slash', async () => {
		const res = await loadContract(fakeAdapter(goldenFiles()), 'MacroData/');
		expect(res.ok).toBe(true);
	});

	it('tolerates missing series files (partial map, manifest intact)', async () => {
		const files = goldenFiles();
		delete files[`${PREFIX}/cpi_national_yoy.json`];
		delete files[`${PREFIX}/retail_sales_sh_yoy.json`];
		const res = await loadContract(fakeAdapter(files), DATA_DIR);
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		expect(res.manifest.indicators).toHaveLength(6);
		expect(res.seriesByKey.size).toBe(4);
		expect(res.seriesByKey.has('cpi_national_yoy')).toBe(false);
	});

	it('degrades to caps=null when the capabilities file is absent', async () => {
		const files = goldenFiles();
		delete files[`${PREFIX}/capabilities.json`];
		const res = await loadContract(fakeAdapter(files), DATA_DIR);
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		expect(res.caps).toBeNull();
		expect(res.seriesByKey.size).toBe(6);
	});

	it('reports no_data_dir for an empty or blank directory setting', async () => {
		for (const dir of ['', '   ']) {
			const res = await loadContract(fakeAdapter(goldenFiles()), dir);
			expect(res.ok).toBe(false);
			if (res.ok) continue;
			expect(res.reason).toBe('no_data_dir');
		}
	});

	it('reports missing_manifest when the processed folder has none', async () => {
		const res = await loadContract(fakeAdapter({}), DATA_DIR);
		expect(res.ok).toBe(false);
		if (res.ok) return;
		expect(res.reason).toBe('missing_manifest');
		expect(res.detail).toContain('MacroData/processed/manifest.json');
	});

	it('reports unknown_schema for a newer manifest contract (G8 degrade)', async () => {
		const files = goldenFiles();
		files[`${PREFIX}/manifest.json`] = JSON.stringify({
			schema_version: 'manifest_v2',
			capabilities_file: 'capabilities.json',
			indicators: [],
		});
		const res = await loadContract(fakeAdapter(files), DATA_DIR);
		expect(res.ok).toBe(false);
		if (res.ok) return;
		expect(res.reason).toBe('unknown_schema');
	});

	it('reports unreadable for malformed manifest JSON', async () => {
		const files = goldenFiles();
		files[`${PREFIX}/manifest.json`] = '{ this is not json';
		const res = await loadContract(fakeAdapter(files), DATA_DIR);
		expect(res.ok).toBe(false);
		if (res.ok) return;
		expect(res.reason).toBe('unreadable');
	});

	it('reports unreadable and surfaces the cause when read throws', async () => {
		const adapter: ContractAdapter = {
			async exists() {
				return true;
			},
			async read() {
				throw new Error('EACCES: permission denied');
			},
		};
		const res = await loadContract(adapter, DATA_DIR);
		expect(res.ok).toBe(false);
		if (res.ok) return;
		expect(res.reason).toBe('unreadable');
		expect(res.detail).toContain('EACCES');
	});
});
