/**
 * Range slicing (M3-T1 / spec §4). The pure equivalent of the ECharts dataZoom
 * window, calibrated for monthly series (12/36/60 periods). Used for the table
 * window and to seed the chart's initial zoom; 'all' keeps the full history.
 */

import { sliceByRange } from '../../src/analysis/range';
import type { SeriesPoint } from '../../src/contract/types';

function pt(date: string, value: number | null = 1): SeriesPoint {
	return { date, value, revision: 1 };
}

/** `count` monthly points starting at `startYear`-01. */
function monthly(startYear: number, count: number): SeriesPoint[] {
	const out: SeriesPoint[] = [];
	for (let i = 0; i < count; i++) {
		const y = startYear + Math.floor(i / 12);
		const m = (i % 12) + 1;
		out.push(pt(`${y}-${String(m).padStart(2, '0')}`));
	}
	return out;
}

describe('sliceByRange', () => {
	const series = monthly(2010, 60); // 5 years of monthly points

	it('keeps the last 12 periods for 1y', () => {
		const out = sliceByRange(series, '1y');
		expect(out).toHaveLength(12);
		expect(out[0]?.date).toBe('2014-01');
		expect(out[out.length - 1]?.date).toBe('2014-12');
	});

	it('keeps the last 36 periods for 3y', () => {
		expect(sliceByRange(series, '3y')).toHaveLength(36);
	});

	it('keeps the last 60 periods for 5y', () => {
		expect(sliceByRange(series, '5y')).toHaveLength(60);
	});

	it('keeps everything for all', () => {
		expect(sliceByRange(series, 'all')).toHaveLength(60);
	});

	it('returns the whole series when it is shorter than the window', () => {
		expect(sliceByRange(monthly(2010, 6), '3y')).toHaveLength(6);
	});

	it('returns an empty array for an empty series', () => {
		expect(sliceByRange([], '1y')).toEqual([]);
	});
});
