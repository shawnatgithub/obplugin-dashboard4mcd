/**
 * The pure ECharts option builder (M3-T2 / spec §5, D-M3-3). These tests assert
 * the *structure* of the emitted option — series types, the null-break honesty
 * rule (`connectNulls:false`), the overlay wire styling, the dual-grid split, the
 * spring-festival markArea, the missing-period markLine and the range→dataZoom
 * window — without initializing ECharts (jsdom has no canvas). The real render
 * is verified by the L2 smoke test in Obsidian (M3-T6).
 */

import type {
	ChartAxis,
	ChartModel,
	ChartSeries,
} from '../../src/analysis/chartModel';
import type { SeriesPoint } from '../../src/contract/types';
import { buildChartOption } from '../../src/ui/chart/option';
import { DEFAULT_CHART_TOKENS } from '../../src/ui/chart/tokens';

const TOKENS = DEFAULT_CHART_TOKENS;

function pt(date: string, value: number | null): SeriesPoint {
	return { date, value, revision: 1 };
}

function series(overrides: Partial<ChartSeries> = {}): ChartSeries {
	return {
		name: '主序列',
		points: [pt('2026-01', 1), pt('2026-02', 2), pt('2026-03', 3)],
		unit: 'level_cny',
		role: 'primary',
		smooth: false,
		...overrides,
	};
}

function axis(overrides: Partial<ChartAxis> = {}): ChartAxis {
	return { unit: 'level_cny', label: '亿元', ...overrides };
}

function model(overrides: Partial<ChartModel> = {}): ChartModel {
	return {
		chartType: 'line',
		layout: 'single',
		series: [series()],
		yAxes: [axis()],
		springFestival: [],
		annotation: null,
		range: 'all',
		empty: false,
		...overrides,
	};
}

/** A loose view of the emitted option, for structural assertions only. */
interface LooseSeries {
	type?: unknown;
	smooth?: unknown;
	connectNulls?: unknown;
	areaStyle?: unknown;
	lineStyle?: { width?: unknown; color?: unknown; type?: unknown };
	xAxisIndex?: unknown;
	markArea?: { data?: unknown[] };
	markLine?: { data?: unknown[] };
}
interface LooseOption {
	grid?: unknown;
	xAxis?: unknown;
	yAxis?: unknown;
	series?: LooseSeries[];
	dataZoom?: Array<{ start?: unknown; end?: unknown }>;
	visualMap?: unknown;
	calendar?: unknown;
}

function build(m: ChartModel): LooseOption {
	return buildChartOption(m, TOKENS) as unknown as LooseOption;
}

describe('buildChartOption', () => {
	it('emits a line series that never connects across nulls', () => {
		const s0 = build(model()).series?.[0];
		expect(s0?.type).toBe('line');
		expect(s0?.connectNulls).toBe(false);
		expect(s0?.smooth).toBe(false);
		expect(s0?.lineStyle?.color).toBe(TOKENS.accent);
		expect(s0?.lineStyle?.width).toBe(2.5);
	});

	it('follows the model smoothing flag while still breaking at nulls', () => {
		const s0 = build(model({ series: [series({ smooth: true })] })).series?.[0];
		expect(s0?.smooth).toBe(true);
		expect(s0?.connectNulls).toBe(false);
	});

	it('adds an area style for the area chart type', () => {
		const s0 = build(model({ chartType: 'area' })).series?.[0];
		expect(s0?.type).toBe('line');
		expect(s0?.areaStyle).toBeDefined();
	});

	it('emits a bar series for the bar chart type', () => {
		expect(build(model({ chartType: 'bar' })).series?.[0]?.type).toBe('bar');
	});

	it('emits a calendar heatmap with a visual map', () => {
		const opt = build(model({ chartType: 'calendar' }));
		expect(opt.series?.[0]?.type).toBe('heatmap');
		expect(opt.calendar).toBeDefined();
		expect(opt.visualMap).toBeDefined();
	});

	it('styles an overlay series as a dashed wire line', () => {
		const opt = build(
			model({
				series: [series(), series({ name: '叠加', role: 'overlay', unit: 'yoy_pct' })],
			}),
		);
		const s1 = opt.series?.[1];
		expect(s1?.lineStyle?.color).toBe(TOKENS.wire);
		expect(s1?.lineStyle?.width).toBe(1.5);
		expect(s1?.lineStyle?.type).toEqual([4, 3]);
	});

	it('splits a dual layout into two grids, axes and indexed series', () => {
		const opt = build(
			model({
				layout: 'dual',
				series: [series(), series({ name: '对比', role: 'overlay' })],
				yAxes: [axis(), axis({ label: '亿元' })],
			}),
		);
		expect(Array.isArray(opt.grid)).toBe(true);
		expect((opt.grid as unknown[]).length).toBe(2);
		expect(Array.isArray(opt.xAxis)).toBe(true);
		expect((opt.xAxis as unknown[]).length).toBe(2);
		expect(Array.isArray(opt.yAxis)).toBe(true);
		expect((opt.yAxis as unknown[]).length).toBe(2);
		expect(opt.series?.[0]?.xAxisIndex).toBe(0);
		expect(opt.series?.[1]?.xAxisIndex).toBe(1);
	});

	it('highlights each spring-festival span with a markArea', () => {
		const opt = build(
			model({
				series: [
					series({ points: [pt('2012-01', 5), pt('2012-02', null), pt('2012-03', 2)] }),
				],
				springFestival: [{ year: '2012', startIndex: 0, endIndex: 1 }],
				annotation: '1–2 月因春节合并口径，2 月不单独发布',
			}),
		);
		const area = opt.series?.[0]?.markArea;
		expect(area?.data).toHaveLength(1);
		expect(area?.data?.[0]).toEqual([{ xAxis: '2012-01' }, { xAxis: '2012-02' }]);
	});

	it('marks every missing period on the primary series', () => {
		const opt = build(
			model({
				series: [
					series({ points: [pt('2026-01', 1), pt('2026-02', null), pt('2026-03', 3)] }),
				],
			}),
		);
		expect(opt.series?.[0]?.markLine?.data).toEqual([{ xAxis: '2026-02' }]);
	});

	it('narrows the dataZoom window for a bounded range', () => {
		const many = Array.from({ length: 60 }, (_, i) =>
			pt(`${2020 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, i),
		);
		const all = build(model({ range: 'all', series: [series({ points: many })] }));
		expect(all.dataZoom?.[0]?.start).toBe(0);
		expect(all.dataZoom?.[0]?.end).toBe(100);

		const oneY = build(model({ range: '1y', series: [series({ points: many })] }));
		expect(oneY.dataZoom?.[0]?.start as number).toBeGreaterThan(0);
		expect(oneY.dataZoom?.[0]?.end).toBe(100);
	});
});

describe('buildChartOption — annual grain (CR-2026-10-13)', () => {
	function annualSeries(points: SeriesPoint[]): ChartSeries {
		return {
			name: '年度总额',
			points,
			unit: 'level_cny',
			role: 'primary',
			smooth: false,
		};
	}
	const years = [pt('2021', 440823.2), pt('2022', 439732.5), pt('2023', 471495.2)];

	interface LooseAxis {
		data: string[];
		axisLabel: { formatter: (value: string) => string };
	}

	it('renders year categories verbatim on the axis and defaults to bars', () => {
		const opt = build(model({ chartType: 'bar', series: [annualSeries(years)] }));
		const ax = opt.xAxis as LooseAxis;
		// The categories are the bare `YYYY` dates and the axis label shows each
		// year verbatim (never `slice(5)` → empty, which is the monthly rule).
		expect(ax.data).toEqual(['2021', '2022', '2023']);
		expect(ax.axisLabel.formatter('2021')).toBe('2021');
		expect(opt.series?.[0]?.type).toBe('bar');
	});

	it('keeps a missing year as a null bar, never a zero', () => {
		const opt = build(
			model({
				chartType: 'bar',
				series: [annualSeries([pt('2021', 1), pt('2022', null)])],
			}),
		);
		const data = (opt.series?.[0] as unknown as { data: Array<number | null> }).data;
		expect(data).toEqual([1, null]);
	});

	it('marks a missing year with the 缺失 line in the annual line variant', () => {
		const opt = build(
			model({
				chartType: 'line',
				series: [annualSeries([pt('2021', 1), pt('2022', null)])],
			}),
		);
		expect(opt.series?.[0]?.markLine?.data).toEqual([{ xAxis: '2022' }]);
	});

	it('leaves the monthly axis labels unchanged', () => {
		const opt = build(model());
		const ax = opt.xAxis as LooseAxis;
		expect(ax.axisLabel.formatter('2026-01')).toBe('2026-01');
		expect(ax.axisLabel.formatter('2026-02')).toBe('02');
	});
});
