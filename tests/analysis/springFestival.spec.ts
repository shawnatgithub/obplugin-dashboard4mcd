/**
 * Spring-festival merge detection (M3-T1 / spec §4, D-M3-8). The frozen retail
 * series carries a null February every year (NBS reports Jan-Feb combined for
 * the spring festival). Detection only *locates* those spans so the chart can
 * annotate them; it never fabricates a merged value (null_not_zero, D5/D10).
 */

import { detectSpringFestival } from '../../src/analysis/springFestival';
import type { SeriesPoint } from '../../src/contract/types';

function pt(date: string, value: number | null): SeriesPoint {
	return { date, value, revision: 1 };
}

describe('detectSpringFestival', () => {
	it('flags a null February whose January is absent (single-index span)', () => {
		const points = [pt('2011-12', 1), pt('2012-02', null), pt('2012-03', 2)];
		expect(detectSpringFestival(points)).toEqual([
			{ year: '2012', startIndex: 1, endIndex: 1 },
		]);
	});

	it('spans January through February when January is present', () => {
		const points = [pt('2012-01', 5), pt('2012-02', null), pt('2012-03', 2)];
		expect(detectSpringFestival(points)).toEqual([
			{ year: '2012', startIndex: 0, endIndex: 1 },
		]);
	});

	it('returns nothing when no February is missing', () => {
		const points = [pt('2012-01', 5), pt('2012-02', 6), pt('2012-03', 2)];
		expect(detectSpringFestival(points)).toEqual([]);
	});

	it('detects every merged year, in series order', () => {
		const points = [
			pt('2012-02', null),
			pt('2012-03', 2),
			pt('2013-02', null),
			pt('2013-03', 3),
		];
		expect(detectSpringFestival(points)).toEqual([
			{ year: '2012', startIndex: 0, endIndex: 0 },
			{ year: '2013', startIndex: 2, endIndex: 2 },
		]);
	});

	it('ignores a February that simply has a value', () => {
		const points = [pt('2012-02', 4), pt('2012-03', 2)];
		expect(detectSpringFestival(points)).toEqual([]);
	});
});
