import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseManifest, parseSeries } from '../src/contract/parse';
import {
	deriveNextExpected,
	toOverviewStatus,
	toReleaseModel,
} from '../src/contract/releaseMapper';
import type {
	IndicatorSeriesV1,
	ManifestIndicator,
	ManifestV1,
} from '../src/contract/types';

/**
 * Release-calendar mapper tests (M4-T1, S5 contract-safe).
 *
 * The main path runs on the frozen golden fixtures, so every asserted string is
 * a byte the pipeline emits (never a guess, D5/D10). The synthetic cases reach
 * the branches the golden cannot: a manual source, an empty manifest, an anchor
 * fallback, and a quarterly marker anchored to a month on the monthly timeline.
 * These lock the §2 data-honesty rules: a next date is always labelled 预计, a
 * null last_date is never fabricated into a point, and an unparseable date is
 * never guessed.
 */

const GOLDEN = path.resolve(
	__dirname,
	'..',
	'tests',
	'golden',
	'contract',
	'processed',
);

function readJson(name: string): unknown {
	return JSON.parse(readFileSync(path.join(GOLDEN, name), 'utf8'));
}

function loadGolden(): {
	manifest: ManifestV1;
	seriesByKey: Map<string, IndicatorSeriesV1>;
} {
	const mr = parseManifest(readJson('manifest.json'));
	if (!mr.ok) throw new Error('manifest parse failed');
	const manifest = mr.value;
	const seriesByKey = new Map<string, IndicatorSeriesV1>();
	for (const ind of manifest.indicators) {
		const sr = parseSeries(readJson(ind.file));
		if (sr.ok) seriesByKey.set(ind.key, sr.value);
	}
	return { manifest, seriesByKey };
}

// --- synthetic builders (typed directly; no parse round-trip needed) ---

function ind(
	partial: Partial<ManifestIndicator> & { key: string },
): ManifestIndicator {
	return {
		file: `${partial.key}.json`,
		schema: 'indicator_series_v1',
		region: 'CN',
		frequency: 'monthly',
		unit: 'yoy_pct',
		status: 'active',
		last_date: null,
		freshness: 'unknown',
		...partial,
	};
}

function manifestOf(
	indicators: ManifestIndicator[],
	generatedAt?: string,
): ManifestV1 {
	const m: ManifestV1 = {
		schema_version: 'manifest_v1',
		capabilities_file: 'capabilities.json',
		indicators,
	};
	if (generatedAt !== undefined) m.generated_at = generatedAt;
	return m;
}

function seriesOf(
	key: string,
	source?: string,
	title?: string,
): IndicatorSeriesV1 {
	const s: IndicatorSeriesV1 = {
		schema_version: 'indicator_series_v1',
		key,
		region: 'CN',
		frequency: 'monthly',
		date_grain: 'month',
		unit: 'yoy_pct',
		null_policy: 'null_not_zero',
		status: 'active',
		series: [],
		quality: { last_date: null },
	};
	if (source !== undefined) s.source = source;
	if (title !== undefined) s.title = title;
	return s;
}

describe('deriveNextExpected', () => {
	it('steps a monthly period, crossing the year boundary', () => {
		expect(deriveNextExpected('2026-08', 'monthly')).toBe('2026-09');
		expect(deriveNextExpected('2026-12', 'monthly')).toBe('2027-01');
	});

	it('steps a quarterly period, crossing the year boundary', () => {
		expect(deriveNextExpected('2026-Q2', 'quarterly')).toBe('2026-Q3');
		expect(deriveNextExpected('2026-Q4', 'quarterly')).toBe('2027-Q1');
	});

	it('steps a daily period, crossing month and year', () => {
		expect(deriveNextExpected('2026-08-15', 'daily')).toBe('2026-08-16');
		expect(deriveNextExpected('2026-08-31', 'daily')).toBe('2026-09-01');
		expect(deriveNextExpected('2026-12-31', 'daily')).toBe('2027-01-01');
	});

	it('returns null for a null or unparseable date (never guesses)', () => {
		expect(deriveNextExpected(null, 'monthly')).toBeNull();
		expect(deriveNextExpected('bad', 'monthly')).toBeNull();
		expect(deriveNextExpected('2026-13', 'monthly')).toBeNull();
		expect(deriveNextExpected('2026-Q5', 'quarterly')).toBeNull();
		expect(deriveNextExpected('2026-02-30', 'daily')).toBeNull();
	});

	it('returns null when the date format does not match the frequency', () => {
		expect(deriveNextExpected('2026-08', 'quarterly')).toBeNull();
		expect(deriveNextExpected('2026-Q2', 'monthly')).toBeNull();
	});
});

describe('toReleaseModel on the frozen golden manifest', () => {
	const { manifest: gm, seriesByKey } = loadGolden();
	const model = toReleaseModel(gm, seriesByKey);

	it('anchors the timeline to the generated_at month and spans 13 months', () => {
		expect(model.anchorMonth).toBe('2026-10');
		expect(model.months).toHaveLength(13);
		expect(model.months[0]).toBe('2025-11');
		expect(model.months[11]).toBe('2026-10');
		expect(model.months[12]).toBe('2026-11');
	});

	it('formats generatedAt from the manifest timestamp and is not empty', () => {
		expect(model.generatedAt).toBe('2026-10-11 08:00');
		expect(model.empty).toBe(false);
	});

	it('builds one row per indicator with honest freshness-derived fields', () => {
		// The golden manifest carries 7 indicators, one of which is the annual
		// sibling (CR-2026-10-13): annual never produces a calendar row.
		expect(gm.indicators).toHaveLength(7);
		expect(model.rows).toHaveLength(6);
		expect(model.rows.some((r) => r.key === 'retail_sales_total_annual')).toBe(
			false,
		);
		const byKey = new Map(model.rows.map((r) => [r.key, r]));

		const retail = byKey.get('retail_sales_total')!;
		expect(retail.metric).toBe('全国社会消费品零售总额');
		expect(retail.source).toBe('akshare_eastmoney');
		expect(retail.tone).toBe('fresh');
		expect(retail.statusLabel).toBe('最新');
		expect(retail.lastDate).toBe('2026-09');
		expect(retail.nextExpected).toBe('预计 2026-10');
		expect(retail.overdue).toBe(false);
		expect(retail.isManual).toBe(false);
		expect(retail.lifecycle).toBe('active');

		const cpi = byKey.get('cpi_national_yoy')!;
		expect(cpi.tone).toBe('stale');
		expect(cpi.statusLabel).toBe('已过期');
		expect(cpi.lastDate).toBe('2026-03');
		expect(cpi.nextExpected).toBe('预计 2026-04');
		expect(cpi.overdue).toBe(true);

		const m1 = byKey.get('money_supply_m1_yoy')!;
		expect(m1.tone).toBe('aging');
		expect(m1.statusLabel).toBe('临近截止');
		expect(m1.lastDate).toBe('2026-08');
		expect(m1.nextExpected).toBe('预计 2026-09');
		expect(m1.overdue).toBe(false);

		const income = byKey.get('disposable_income_yoy')!;
		expect(income.tone).toBe('unknown');
		expect(income.statusLabel).toBe('待采集');
		expect(income.lastDate).toBe('—');
		expect(income.nextExpected).toBe('—');
		expect(income.overdue).toBe(false);
	});

	it('builds one timeline marker per indicator, null-anchored when undated', () => {
		// Annual is filtered out with the rows: a `YYYY` last_date has no month
		// anchor, and an annual series has no monthly collection schedule.
		expect(model.markers).toHaveLength(6);
		expect(
			model.markers.some((mk) => mk.key === 'retail_sales_total_annual'),
		).toBe(false);
		const byKey = new Map(model.markers.map((mk) => [mk.key, mk]));

		const retail = byKey.get('retail_sales_total')!;
		expect(retail.name).toBe('全国社会消费品零售总额');
		expect(retail.month).toBe('2026-09');
		expect(retail.nextMonth).toBe('2026-10');
		expect(retail.tone).toBe('fresh');

		const income = byKey.get('disposable_income_yoy')!;
		expect(income.month).toBeNull();
		expect(income.nextMonth).toBeNull();
		expect(income.tone).toBe('unknown');
	});

	it('carries an honesty note that labels the next date as an estimate', () => {
		expect(model.honestyNote).toContain('预计');
	});
});

describe('toReleaseModel synthetic branches', () => {
	it('excludes an annual indicator from rows and markers entirely', () => {
		const m = manifestOf(
			[
				ind({ key: 'base', last_date: '2026-08', freshness: 'fresh' }),
				ind({
					key: 'base_annual',
					frequency: 'annual',
					last_date: '2025',
					freshness: 'fresh',
				}),
			],
			'2026-10-11T08:00:00+08:00',
		);
		const model = toReleaseModel(m, new Map());
		expect(model.rows.map((r) => r.key)).toEqual(['base']);
		expect(model.markers.map((mk) => mk.key)).toEqual(['base']);
	});

	it('marks a manual-source series with the 手动 badge and source', () => {
		const m = manifestOf(
			[ind({ key: 'manual_thing', last_date: '2026-07', freshness: 'aging' })],
			'2026-10-11T08:00:00+08:00',
		);
		const sb = new Map([
			['manual_thing', seriesOf('manual_thing', 'manual', '手动录入指标')],
		]);
		const model = toReleaseModel(m, sb);
		const row = model.rows[0]!;
		expect(row.isManual).toBe(true);
		expect(row.source).toBe('手动');
		expect(row.metric).toBe('手动录入指标');
	});

	it('falls back to 本地 ETL when a series carries no source', () => {
		const m = manifestOf(
			[ind({ key: 'src_less', last_date: '2026-07', freshness: 'fresh' })],
			'2026-10-11T08:00:00+08:00',
		);
		const model = toReleaseModel(m, new Map());
		expect(model.rows[0]!.source).toBe('本地 ETL');
	});

	it('reports empty when the manifest has no indicators', () => {
		const model = toReleaseModel(
			manifestOf([], '2026-10-11T08:00:00+08:00'),
			new Map(),
		);
		expect(model.empty).toBe(true);
		expect(model.rows).toEqual([]);
		expect(model.markers).toEqual([]);
		expect(model.months).toHaveLength(13);
	});

	it('falls back to the max last_date month when generated_at is absent', () => {
		const m = manifestOf([
			ind({ key: 'a', last_date: '2026-05', freshness: 'stale' }),
			ind({ key: 'b', last_date: '2026-08', freshness: 'aging' }),
			ind({ key: 'c', last_date: null, freshness: 'unknown' }),
		]);
		const model = toReleaseModel(m, new Map());
		expect(model.anchorMonth).toBe('2026-08');
		expect(model.months).toHaveLength(13);
		expect(model.months[11]).toBe('2026-08');
	});

	it('yields an unanchored timeline when no generated_at and no last_date exist', () => {
		const m = manifestOf([ind({ key: 'a', last_date: null })]);
		const model = toReleaseModel(m, new Map());
		expect(model.anchorMonth).toBe('');
		expect(model.months).toEqual([]);
		expect(model.empty).toBe(false);
		expect(model.rows).toHaveLength(1);
		expect(model.rows[0]!.lastDate).toBe('—');
		expect(model.rows[0]!.nextExpected).toBe('—');
	});

	it('anchors a quarterly marker to the quarter-end month on the monthly axis', () => {
		const m = manifestOf(
			[
				ind({
					key: 'q',
					frequency: 'quarterly',
					last_date: '2026-Q2',
					freshness: 'fresh',
				}),
			],
			'2026-10-11T08:00:00+08:00',
		);
		const model = toReleaseModel(m, new Map());
		const marker = model.markers[0]!;
		expect(marker.month).toBe('2026-06');
		expect(marker.nextMonth).toBe('2026-09');
		expect(model.rows[0]!.nextExpected).toBe('预计 2026-Q3');
	});
});

describe('toOverviewStatus', () => {
	it('folds rows into the panel: fresh shows 截至, aging/stale show 预计', () => {
		const m = manifestOf(
			[
				ind({ key: 'fresh_one', last_date: '2026-09', freshness: 'fresh' }),
				ind({ key: 'aging_one', last_date: '2026-08', freshness: 'aging' }),
				ind({ key: 'stale_one', last_date: '2026-01', freshness: 'stale' }),
			],
			'2026-10-11T08:00:00+08:00',
		);
		const status = toOverviewStatus(toReleaseModel(m, new Map()));
		expect(status.latest).toBe(1);
		expect(status.upcoming).toBe(1);
		expect(status.overdue).toBe(1);

		const byKey = new Map(status.items.map((i) => [i.key, i]));
		expect(byKey.get('fresh_one')?.detail).toBe('2026-09');
		expect(byKey.get('fresh_one')?.badge).toBe('最新');
		expect(byKey.get('aging_one')?.detail).toBe('预计 2026-09');
		expect(byKey.get('aging_one')?.badge).toBe('临近更新');
		expect(byKey.get('stale_one')?.detail).toBe('预计 2026-02');
		expect(byKey.get('stale_one')?.badge).toBe('已过期');
	});

	it('yields an empty panel for an empty manifest', () => {
		const status = toOverviewStatus(toReleaseModel(manifestOf([]), new Map()));
		expect(status.items).toHaveLength(0);
		expect(status.latest).toBe(0);
		expect(status.upcoming).toBe(0);
		expect(status.overdue).toBe(0);
	});
});
