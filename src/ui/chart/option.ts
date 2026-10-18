/**
 * The pure ECharts option builder (M3-T2 / spec §5, D-M3-3).
 *
 * Maps a renderer-agnostic `ChartModel` onto an ECharts option with no side
 * effects: no `echarts.init`, no DOM, no Obsidian. Keeping this pure means the
 * whole visual contract is unit-testable — series types, the null-break honesty
 * rule, the overlay wire styling, the dual-grid split, the spring-festival
 * markArea, the missing-period markLine and the range→dataZoom window — while the
 * thin glue in `echartsView.ts` (M3-T3) only calls `init().setOption(...)`.
 *
 * Data-honesty invariants baked in here (UI-UX §6): `connectNulls:false` on every
 * line so a missing period breaks instead of interpolating; a null value is never
 * coerced to 0; the spring-festival merge is a translucent markArea, never a
 * synthesized point; a `single` overlay shares one axis exactly as the contract
 * decided (D-M3-5), and only INCOMPATIBLE_REGION splits into two grids (D-M3-6).
 */

import type { EChartsOption } from 'echarts';
import type { ChartAxis, ChartModel, ChartSeries } from '../../analysis/chartModel';
import type { RangeKey } from '../../analysis/range';
import type { SeriesPoint } from '../../contract/types';
import type { ChartTokens } from './tokens';

/* ---------- Local option shapes (a readable, type-safe subset of ECharts) ---------- */

interface GridBox {
	left: number;
	right: number;
	top: number | string;
	bottom?: number | string;
	height?: string;
	containLabel: boolean;
}
interface CategoryAxis {
	type: 'category';
	data: string[];
	boundaryGap: boolean;
	gridIndex?: number;
	axisLabel: { formatter: (value: string) => string; color: string; fontSize: number };
	axisLine: { lineStyle: { color: string } };
	axisTick: { length: number };
}
interface ValueAxis {
	type: 'value';
	name: string;
	gridIndex?: number;
	nameGap: number;
	nameTextStyle: { color: string };
	splitLine: { lineStyle: { color: string } };
	axisLabel: { color: string };
}
interface MarkAreaPiece {
	silent: boolean;
	itemStyle: { color: string; opacity: number };
	label: { show: boolean };
	data: Array<[{ xAxis: string }, { xAxis: string }]>;
}
interface MarkLinePiece {
	silent: boolean;
	symbol: string;
	lineStyle: { type: string; color: string };
	label: { formatter: string; color: string; fontSize: number; position: string };
	data: Array<{ xAxis: string }>;
}
interface LineShape {
	type: 'line';
	name: string;
	data: Array<number | null>;
	xAxisIndex: number;
	yAxisIndex: number;
	smooth: boolean;
	connectNulls: false;
	showSymbol: boolean;
	symbol: string;
	symbolSize: number;
	lineStyle: { width: number; color: string; type?: number[] };
	itemStyle: { color: string };
	areaStyle?: { color: string; opacity: number };
	markArea?: MarkAreaPiece;
	markLine?: MarkLinePiece;
}
interface BarShape {
	type: 'bar';
	name: string;
	data: Array<number | null>;
	xAxisIndex: number;
	yAxisIndex: number;
	barMaxWidth: number;
	itemStyle: { color: string };
}
interface HeatmapShape {
	type: 'heatmap';
	coordinateSystem: 'calendar';
	data: Array<[string, number]>;
}
type SeriesShape = LineShape | BarShape | HeatmapShape;
interface DataZoomPiece {
	type: 'inside' | 'slider';
	xAxisIndex?: number[];
	start: number;
	end: number;
	height?: number;
	bottom?: number;
}
interface BuiltOption {
	animation: boolean;
	tooltip: {
		trigger: string;
		backgroundColor: string;
		borderColor: string;
		textStyle: { color: string };
		renderMode: 'richText';
		confine: boolean;
	};
	grid?: GridBox | GridBox[];
	xAxis?: CategoryAxis | CategoryAxis[];
	yAxis?: ValueAxis | ValueAxis[];
	dataZoom?: DataZoomPiece[];
	visualMap?: Record<string, unknown>;
	calendar?: Record<string, unknown>;
	series: SeriesShape[];
}

/* ---------- Pure helpers ---------- */

function tooltip(trigger: string, tokens: ChartTokens): BuiltOption['tooltip'] {
	return { trigger, backgroundColor: tokens.surface, borderColor: tokens.border,
		textStyle: { color: tokens.text }, renderMode: 'richText', confine: true };
}

/** Period count per range; `all` is unbounded (mirrors analysis/range). */
const RANGE_MONTHS: Record<RangeKey, number> = {
	'1y': 12,
	'3y': 36,
	'5y': 60,
	all: Number.POSITIVE_INFINITY,
};

/**
 * The category-axis label. An annual point carries a bare `YYYY` date and is
 * shown verbatim (CR-2026-10-13); a monthly `YYYY-MM` shows the full stamp in
 * January and just `MM` otherwise (UI-UX §5).
 */
function xLabel(date: string): string {
	if (!/^\d{4}-\d{2}$/.test(date)) return date;
	return date.endsWith('-01') ? date : date.slice(5);
}

/** Sorted union of every series' dates (lexicographic = chronological for `YYYY-MM`). */
function unionDates(list: readonly ChartSeries[]): string[] {
	const set = new Set<string>();
	for (const s of list) for (const p of s.points) set.add(p.date);
	return [...set].sort();
}

/** Align a series' values to the shared categories; a date it lacks is null (a gap). */
function alignData(
	points: readonly SeriesPoint[],
	categories: readonly string[],
): Array<number | null> {
	const byDate = new Map<string, number | null>();
	for (const p of points) byDate.set(p.date, p.value);
	return categories.map((d) => byDate.get(d) ?? null);
}

/** The dataZoom start/end (percent) that shows the last `range` window of `total`. */
function zoomWindow(range: RangeKey, total: number): { start: number; end: number } {
	const win = RANGE_MONTHS[range];
	if (total <= win) return { start: 0, end: 100 };
	return { start: ((total - win) / total) * 100, end: 100 };
}

/** A translucent amber band over each spring-festival merge (annotation, not a value). */
function springFestivalArea(
	model: ChartModel,
	primary: ChartSeries,
	tokens: ChartTokens,
): MarkAreaPiece | null {
	const data: Array<[{ xAxis: string }, { xAxis: string }]> = [];
	for (const span of model.springFestival) {
		const a = primary.points[span.startIndex]?.date;
		const b = primary.points[span.endIndex]?.date;
		if (a !== undefined && b !== undefined) data.push([{ xAxis: a }, { xAxis: b }]);
	}
	if (data.length === 0) return null;
	return {
		silent: true,
		itemStyle: { color: tokens.amber, opacity: 0.12 },
		label: { show: false },
		data,
	};
}

/** A dashed vertical line + 缺失 label at every explicitly missing period. */
function missingLine(primary: ChartSeries, tokens: ChartTokens): MarkLinePiece | null {
	const data = primary.points
		.filter((p) => p.value === null)
		.map((p) => ({ xAxis: p.date }));
	if (data.length === 0) return null;
	return {
		silent: true,
		symbol: 'none',
		lineStyle: { type: 'dashed', color: tokens.wire },
		label: { formatter: '缺失', color: tokens.muted, fontSize: 10, position: 'insideEndTop' },
		data,
	};
}

function categoryAxis(
	cats: readonly string[],
	tokens: ChartTokens,
	boundaryGap: boolean,
	gridIndex: number | undefined,
): CategoryAxis {
	const ax: CategoryAxis = {
		type: 'category',
		data: [...cats],
		boundaryGap,
		axisLabel: { formatter: xLabel, color: tokens.muted, fontSize: 11 },
		axisLine: { lineStyle: { color: tokens.text } },
		axisTick: { length: 4 },
	};
	if (gridIndex !== undefined) ax.gridIndex = gridIndex;
	return ax;
}

function valueAxis(
	a: ChartAxis,
	tokens: ChartTokens,
	gridIndex: number | undefined,
): ValueAxis {
	const ax: ValueAxis = {
		type: 'value',
		name: a.label,
		nameGap: 8,
		nameTextStyle: { color: tokens.muted },
		splitLine: { lineStyle: { color: tokens.grid } },
		axisLabel: { color: tokens.muted },
	};
	if (gridIndex !== undefined) ax.gridIndex = gridIndex;
	return ax;
}

/** One line/area/bar series; the primary carries the markArea/markLine honesty cues. */
function buildSeries(
	s: ChartSeries,
	model: ChartModel,
	categories: readonly string[],
	tokens: ChartTokens,
	index: number,
	primary: ChartSeries | null,
): LineShape | BarShape {
	const data = alignData(s.points, categories);
	const isPrimary = s.role === 'primary';
	const color = isPrimary ? tokens.accent : tokens.wire;

	if (model.chartType === 'bar') {
		return {
			type: 'bar',
			name: s.name,
			data,
			xAxisIndex: index,
			yAxisIndex: index,
			barMaxWidth: 24,
			itemStyle: { color },
		};
	}

	const line: LineShape = {
		type: 'line',
		name: s.name,
		data,
		xAxisIndex: index,
		yAxisIndex: index,
		smooth: s.smooth,
		connectNulls: false,
		showSymbol: false,
		symbol: 'circle',
		symbolSize: 4,
		lineStyle: { width: isPrimary ? 2.5 : 1.5, color },
		itemStyle: { color },
	};
	if (!isPrimary) line.lineStyle.type = [4, 3];
	if (model.chartType === 'area' && isPrimary) {
		line.areaStyle = { color, opacity: 0.12 };
	}
	if (isPrimary && primary) {
		const area = springFestivalArea(model, primary, tokens);
		if (area) line.markArea = area;
		const missing = missingLine(primary, tokens);
		if (missing) line.markLine = missing;
	}
	return line;
}

/** line / area / bar / table: a category grid, one axis (single) or two (dual). */
function cartesianOption(model: ChartModel, tokens: ChartTokens): BuiltOption {
	const dual = model.layout === 'dual';
	const primary = model.series[0] ?? null;

	// Dual gives each chart its own categories; single shares the union.
	const catsPerAxis: string[][] = dual
		? model.series.map((s) => s.points.map((p) => p.date))
		: [unionDates(model.series)];

	const series: SeriesShape[] = model.series.map((s, i) =>
		buildSeries(
			s,
			model,
			dual ? catsPerAxis[i] ?? [] : catsPerAxis[0] ?? [],
			tokens,
			dual ? i : 0,
			primary,
		),
	);

	const xAxis = catsPerAxis.map((cats, i) =>
		categoryAxis(cats, tokens, model.chartType === 'bar', dual ? i : undefined),
	);
	const yAxis = model.yAxes.map((a, i) => valueAxis(a, tokens, dual ? i : undefined));

	const grid: GridBox | GridBox[] = dual
		? [
				{ left: 56, right: 20, top: 28, height: '32%', containLabel: true },
				{ left: 56, right: 20, top: '56%', height: '32%', containLabel: true },
			]
		: { left: 56, right: 20, top: 28, bottom: 64, containLabel: true };

	const zoom = zoomWindow(model.range, catsPerAxis[0]?.length ?? 0);
	const zoomAxis = dual ? [0, 1] : undefined;
	const dataZoom: DataZoomPiece[] = [
		{ type: 'inside', ...(zoomAxis ? { xAxisIndex: zoomAxis } : {}), start: zoom.start, end: zoom.end },
		{
			type: 'slider',
			...(zoomAxis ? { xAxisIndex: zoomAxis } : {}),
			start: zoom.start,
			end: zoom.end,
			height: 16,
			bottom: 8,
		},
	];

	return {
		animation: false,
		tooltip: tooltip('axis', tokens),
		grid,
		xAxis: dual ? xAxis : xAxis[0],
		yAxis: dual ? yAxis : yAxis[0],
		dataZoom,
		series,
	};
}

/**
 * calendar: a monthly series mapped onto a heatmap over a calendar coordinate.
 * Each `YYYY-MM` is placed on the first day of its month — an approximation, since
 * the contract grain is monthly while a calendar cell is daily (Agent-Limitation).
 * Missing months are simply absent (left blank), never drawn as zero.
 */
function calendarOption(model: ChartModel, tokens: ChartTokens): BuiltOption {
	const points = model.series[0]?.points ?? [];
	const years = [...new Set(points.map((p) => p.date.slice(0, 4)))].sort();
	const values: number[] = [];
	const data: Array<[string, number]> = [];
	for (const p of points) {
		if (p.value === null) continue;
		values.push(p.value);
		data.push([`${p.date}-01`, p.value]);
	}
	const first = years[0] ?? '';
	const last = years[years.length - 1] ?? first;
	const range: string | string[] = years.length <= 1 ? first : [first, last];

	return {
		animation: false,
		tooltip: tooltip('item', tokens),
		visualMap: {
			min: values.length > 0 ? Math.min(...values) : 0,
			max: values.length > 0 ? Math.max(...values) : 1,
			calculable: true,
			orient: 'horizontal',
			left: 'center',
			bottom: 0,
			inRange: { color: [tokens.grid, tokens.accent] },
			textStyle: { color: tokens.muted },
		},
		calendar: {
			range,
			cellSize: ['auto', 14],
			top: 28,
			left: 44,
			right: 16,
			itemStyle: { color: 'transparent', borderColor: tokens.grid },
			splitLine: { show: true, lineStyle: { color: tokens.grid } },
			dayLabel: { show: false },
			monthLabel: { color: tokens.muted },
			yearLabel: { show: false },
		},
		series: [{ type: 'heatmap', coordinateSystem: 'calendar', data }],
	};
}

/**
 * Build the ECharts option for `model` using the concrete `tokens` palette. The
 * object is assembled from the local shapes above (validated structurally by the
 * option tests and rendered by the L2 smoke test); the single cast isolates
 * ECharts' deep composed option types — which reject a dynamically-built object —
 * from the pure logic here.
 */
export function buildChartOption(model: ChartModel, tokens: ChartTokens): EChartsOption {
	const built =
		model.chartType === 'calendar'
			? calendarOption(model, tokens)
			: cartesianOption(model, tokens);
	return built as unknown as EChartsOption;
}
