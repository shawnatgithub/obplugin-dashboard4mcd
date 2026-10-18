import { calendarPoints, overviewChart } from '../src/analysis/overviewRange';
import type { DetailModel } from '../src/contract/mapper';

const points = [
	{ date: '2024-08', value: 1, revision: 0 },
	{ date: '2025-09', value: 2, revision: 0 },
	{ date: '2026-06', value: 3, revision: 0 },
	{ date: '2026-08', value: 4, revision: 0 },
];

it('slices calendar months, inserts missing positions and does not interpolate', () => {
	const sliced = calendarPoints(points, 'monthly', '12');
	expect(sliced).toHaveLength(12);
	expect(sliced[0]?.date).toBe('2025-09');
	expect(sliced.at(-2)).toEqual({ date: '2026-07', value: null, revision: 0 });
	expect(sliced.at(-1)?.value).toBe(4);
	expect(calendarPoints(points, 'monthly', '24')).toHaveLength(24);
	expect(calendarPoints(points, 'monthly', 'all')).toHaveLength(25);
	expect(points).toHaveLength(4);
});

it('preserves quarterly and daily labels instead of inventing monthly values', () => {
	expect(calendarPoints([{ date: '2026-Q1', value: 2, revision: 0 }], 'quarterly', '12')[0]?.date).toBe('2026-Q1');
	expect(calendarPoints([{ date: '2026-08-17', value: 2, revision: 0 }], 'daily', '12')[0]?.date).toBe('2026-08-17');
});

it('uses full range in ECharts after calendar slicing, keeping missing markers', () => {
	const detail: DetailModel = {
		key: 'x', title: 'Metric', unit: 'yoy_pct', region: 'CN', frequency: 'monthly',
		freshness: 'fresh', lastDate: '2026-08', updatedAt: null, fileName: null,
		points, panel: null, statusBanner: null,
	};
	const model = overviewChart(detail, '12');
	expect(model.range).toBe('all');
	expect(model.series[0]?.points).toHaveLength(12);
	expect(model.series[0]?.smooth).toBe(false);
});
