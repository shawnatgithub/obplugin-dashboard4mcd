/** Calendar windows local to the overview; full-detail range semantics stay intact. */
import { collapseRevisions, type DetailModel } from '../contract/mapper';
import type { Frequency, SeriesPoint } from '../contract/types';
import { buildChartModel, type ChartModel } from './chartModel';
import { DEFAULT_VIEW_STATE } from './viewState';

export type OverviewRange = '12' | '24' | '36' | 'all';
export const OVERVIEW_RANGES: Record<OverviewRange, string> = {
	'12': '近 12 个月', '24': '近 24 个月', '36': '近 36 个月', all: '全部历史',
};
function monthIndex(date: string): number {
	const quarter = /^\d{4}-Q([1-4])$/.exec(date);
	const month = quarter ? Number(quarter[1]) * 3 : Number(date.slice(5, 7) || 12);
	return Number(date.slice(0, 4)) * 12 + month - 1;
}
function monthLabel(index: number): string {
	return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`;
}
export function calendarPoints(points: readonly SeriesPoint[], frequency: Frequency, range: OverviewRange): SeriesPoint[] {
	const sorted = collapseRevisions(points).sort((a, b) => a.date.localeCompare(b.date));
	const first = sorted[0];
	const last = sorted[sorted.length - 1];
	if (!first || !last) return [];
	const end = monthIndex(last.date);
	const start = range === 'all' ? monthIndex(first.date) : Math.max(monthIndex(first.date), end - Number(range) + 1);
	if (frequency !== 'monthly') return sorted.filter((p) => monthIndex(p.date) >= start);
	const byDate = new Map(sorted.map((p) => [p.date, p]));
	const result: SeriesPoint[] = [];
	for (let index = start; index <= end; index++) {
		const date = monthLabel(index);
		result.push(byDate.get(date) ?? { date, value: null, revision: 0 });
	}
	return result;
}
export function overviewChart(detail: DetailModel, range: OverviewRange): ChartModel {
	return buildChartModel(
		{ ...detail, points: calendarPoints(detail.points, detail.frequency, range) },
		{ ...DEFAULT_VIEW_STATE, key: detail.key, range: 'all' },
		new Map(),
	);
}
