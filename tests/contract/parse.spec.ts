import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
	parseCapabilities,
	parseManifest,
	parseSeries,
} from '../../src/contract/parse';
import type { StubPanel } from '../../src/contract/types';

/**
 * Contract-parse tests (T3-2). Fixtures are the frozen golden samples shared
 * with the ETL repo (`tests/golden/contract/`), sealed by checksums.spec.ts —
 * so these assertions run against the same bytes the pipeline emits.
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

function readJson(name: string): unknown {
	return JSON.parse(readFileSync(path.join(GOLDEN, name), 'utf8'));
}

describe('parseManifest', () => {
	it('解析 golden manifest：6 指标 + capabilities 指针', () => {
		const r = parseManifest(readJson('manifest.json'));
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value.schema_version).toBe('manifest_v1');
		expect(r.value.capabilities_file).toBe('capabilities.json');
		expect(r.value.indicators).toHaveLength(6);
	});

	it('保留契约四态 freshness（含 unknown）', () => {
		const r = parseManifest(readJson('manifest.json'));
		if (!r.ok) throw new Error('expected ok');
		const seen = new Set<string>(r.value.indicators.map((i) => i.freshness));
		for (const f of ['fresh', 'aging', 'stale', 'unknown']) {
			expect(seen.has(f)).toBe(true);
		}
	});

	it('未知 schema_version → unknown_schema 降级，不抛错（G8）', () => {
		const r = parseManifest({
			schema_version: 'manifest_v2',
			capabilities_file: 'capabilities.json',
			indicators: [],
		});
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error.kind).toBe('unknown_schema');
		expect(r.error.got).toBe('manifest_v2');
	});

	it('非对象 / 缺 schema_version → malformed', () => {
		expect(parseManifest(null).ok).toBe(false);
		expect(parseManifest('nope').ok).toBe(false);
		const r = parseManifest({ indicators: [] });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.kind).toBe('malformed');
	});

	it('indicators 非数组 / 指标缺 key → malformed', () => {
		expect(
			parseManifest({
				schema_version: 'manifest_v1',
				capabilities_file: 'c',
				indicators: 'nope',
			}).ok,
		).toBe(false);
		expect(
			parseManifest({
				schema_version: 'manifest_v1',
				capabilities_file: 'c',
				indicators: [{ file: 'x' }],
			}).ok,
		).toBe(false);
	});
});

describe('parseSeries', () => {
	it('解析 golden 序列：key/title/series + null 缺月保留', () => {
		const r = parseSeries(readJson('retail_sales_total.json'));
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value.key).toBe('retail_sales_total');
		expect(r.value.title).toBe('全国社会消费品零售总额');
		expect(r.value.series.length).toBeGreaterThan(0);
		// null_not_zero: at least one missing period stays null, never 0.
		expect(r.value.series.some((p) => p.value === null)).toBe(true);
	});

	it('未知 schema_version → unknown_schema', () => {
		const r = parseSeries({ schema_version: 'indicator_series_v9', key: 'k', series: [] });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.kind).toBe('unknown_schema');
	});

	it('缺 key / series 非数组 → malformed', () => {
		expect(parseSeries({ schema_version: 'indicator_series_v1', series: [] }).ok).toBe(false);
		expect(
			parseSeries({ schema_version: 'indicator_series_v1', key: 'k', series: {} }).ok,
		).toBe(false);
	});
});

describe('parseCapabilities', () => {
	it('解析 golden capabilities：7 面板，含一个源不支持 stub', () => {
		const r = parseCapabilities(readJson('capabilities.json'));
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(Object.keys(r.value.panels)).toHaveLength(7);
		const stub = r.value.panels.shanghai_finance_quarterly as StubPanel;
		expect(stub.source_supported).toBe(false);
		expect(stub.reason_code).toBe('SOURCE_UNSUPPORTED');
	});

	it('未知 schema_version → unknown_schema', () => {
		const r = parseCapabilities({ schema_version: 'capabilities_v2', panels: {} });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.kind).toBe('unknown_schema');
	});

	it('panels 非对象 → malformed', () => {
		expect(
			parseCapabilities({ schema_version: 'capabilities_v1', panels: [] }).ok,
		).toBe(false);
	});
});
