/**
 * Pure transform layer (M3-T1 / spec §4): level passes through, yoy consumes
 * the sibling `_yoy` series when present and otherwise derives it by matching
 * the same month one year back, mom derives the previous-month ratio. Missing
 * periods stay null (never interpolated, null_not_zero).
 */

import { applyTransform } from '../../src/analysis/transform';
import type { SeriesPoint } from '../../src/contract/types';

function pt(date: string, value: number | null, revision = 1): SeriesPoint {
	return { date, value, revision };
}

/** A contiguous 13-month series so yoy (year-1) and mom (prev month) resolve. */
const BASE: SeriesPoint[] = [
	pt('2020-01', 100),
	pt('2020-02', 110),
	pt('2020-03', 120),
	pt('2020-04', 130),
	pt('2020-05', 140),
	pt('2020-06', 150),
	pt('2020-07', 160),
	pt('2020-08', 170),
	pt('2020-09', 180),
	pt('2020-10', 190),
	pt('2020-11', 200),
	pt('2020-12', 210),
	pt('2021-01', 120),
];

describe('applyTransform level', () => {
	it('returns the base series unchanged', () => {
		const out = applyTransform(BASE, 'level', null);
		expect(out.map((p) => p.value)).toEqual(BASE.map((p) => p.value));
		expect(out.map((p) => p.date)).toEqual(BASE.map((p) => p.date));
	});
});

describe('applyTransform yoy', () => {
	it('consumes the sibling series when one is supplied', () => {
		const sibling = [pt('2021-01', 20), pt('2021-02', 21)];
		const out = applyTransform(BASE, 'yoy', sibling);
		expect(out).toEqual(sibling);
	});

	it('derives yoy by matching the same month one year back when no sibling', () => {
		const out = applyTransform(BASE, 'yoy', null);
		const byDate = new Map(out.map((p) => [p.date, p.value]));
		// 2021-01 = (120 / 100 - 1) * 100 = 20
		expect(byDate.get('2021-01')).toBeCloseTo(20, 5);
		// 2020-* has no year-ago counterpart → null (never fabricated)
		expect(byDate.get('2020-01')).toBeNull();
		expect(byDate.get('2020-12')).toBeNull();
	});

	it('keeps the source revision and date on derived points', () => {
		const out = applyTransform(BASE, 'yoy', null);
		const last = out[out.length - 1];
		expect(last?.date).toBe('2021-01');
		expect(last?.revision).toBe(1);
	});

	it('yields null when the year-ago value is zero (no divide-by-zero)', () => {
		const base = [pt('2020-01', 0), pt('2021-01', 50)];
		const out = applyTransform(base, 'yoy', null);
		expect(out[1]?.value).toBeNull();
	});
});

describe('applyTransform mom', () => {
	it('derives the previous-month ratio', () => {
		const out = applyTransform(BASE, 'mom', null);
		const byDate = new Map(out.map((p) => [p.date, p.value]));
		// 2020-02 = (110 / 100 - 1) * 100 = 10
		expect(byDate.get('2020-02')).toBeCloseTo(10, 5);
		// 2021-01 = (120 / 210 - 1) * 100
		expect(byDate.get('2021-01')).toBeCloseTo((120 / 210 - 1) * 100, 5);
	});

	it('leaves the first period null (no previous month)', () => {
		const out = applyTransform(BASE, 'mom', null);
		expect(out[0]?.value).toBeNull();
	});

	it('does not interpolate across a missing period', () => {
		const base = [pt('2020-01', 100), pt('2020-02', null), pt('2020-03', 120)];
		const out = applyTransform(base, 'mom', null);
		// 2020-02 is null → its mom is null; 2020-03 references a null prev → null
		expect(out[1]?.value).toBeNull();
		expect(out[2]?.value).toBeNull();
	});
});
