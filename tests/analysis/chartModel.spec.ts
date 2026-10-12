/**
 * The renderer-agnostic chart model (M3-T2 / spec §4). `buildChartModel` folds
 * the contract series + capabilities + ViewState into one honest description of
 * what to draw — which series (primary + optional overlay), how many axes, a
 * single vs cross-region dual layout, the spring-festival spans to annotate and
 * whether there is anything to plot. It renders nothing, so the ECharts option
 * builder and the SVG fallback share the exact same decisions.
 *
 * The overlay axis decision is consumed faithfully, never re-judged (D-M3-5): a
 * `single` overlay keeps ONE shared y-axis even when the two series carry
 * different units (retail 亿元 over cpi %). INCOMPATIBLE_REGION becomes a dual
 * layout (D-M3-6). The spring-festival merge is annotated, never synthesized
 * into a value (D-M3-8, null_not_zero).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
	buildChartModel,
	type ChartSeriesSource,
} from '../../src/analysis/chartModel';
import { DEFAULT_VIEW_STATE, type ViewState } from '../../src/analysis/viewState';
import { collapseRevisions, type DetailModel } from '../../src/contract/mapper';
import { parseCapabilities, parseSeries } from '../../src/contract/parse';
import type {
	CapabilitiesV1,
	IndicatorSeriesV1,
	SeriesPoint,
} from '../../src/contract/types';

const GOLDEN = path.resolve(__dirname, '..', 'golden', 'contract', 'processed');

function readJson(name: string): unknown {
	return JSON.parse(readFileSync(path.join(GOLDEN, name), 'utf8')) as unknown;
}

const CAPS: CapabilitiesV1 = (() => {
	const r = parseCapabilities(readJson('capabilities.json'));
	if (!r.ok) throw new Error('golden capabilities failed to parse');
	return r.value;
})();

function seriesOf(key: string): IndicatorSeriesV1 {
	const r = parseSeries(readJson(`${key}.json`));
	if (!r.ok) throw new Error(`golden ${key} failed to parse`);
	return r.value;
}

function sourceOf(key: string): ChartSeriesSource {
	const s = seriesOf(key);
	return { points: s.series, unit: s.unit, title: s.title ?? key };
}

function pt(date: string, value: number | null): SeriesPoint {
	return { date, value, revision: 1 };
}

/** `count` monthly points from `startYear`-01, all non-null and distinct. */
function monthly(startYear: number, count: number): SeriesPoint[] {
	const out: SeriesPoint[] = [];
	for (let i = 0; i < count; i++) {
		const y = startYear + Math.floor(i / 12);
		const m = (i % 12) + 1;
		out.push(pt(`${y}-${String(m).padStart(2, '0')}`, 100 + i));
	}
	return out;
}

function makeDetail(overrides: Partial<DetailModel> = {}): DetailModel {
	const retail = seriesOf('retail_sales_total');
	return {
		key: 'retail_sales_total',
		title: retail.title ?? 'retail_sales_total',
		unit: retail.unit,
		region: retail.region,
		frequency: retail.frequency,
		freshness: 'fresh',
		lastDate: retail.quality.last_date,
		updatedAt: '2026-10-11 08:00',
		fileName: 'retail_sales_total.json',
		source: retail.source,
		points: collapseRevisions(retail.series),
		panel: CAPS.panels['retail_sales_total'] ?? null,
		statusBanner: null,
		...overrides,
	};
}

function view(overrides: Partial<ViewState> = {}): ViewState {
	return { key: 'retail_sales_total', ...DEFAULT_VIEW_STATE, ...overrides };
}

const NO_EXTRA = new Map<string, ChartSeriesSource>();

describe('buildChartModel', () => {
	it('builds a single primary line model from the golden retail series', () => {
		const m = buildChartModel(makeDetail(), view(), NO_EXTRA);
		expect(m.chartType).toBe('line');
		expect(m.layout).toBe('single');
		expect(m.series).toHaveLength(1);
		expect(m.series[0]?.role).toBe('primary');
		expect(m.series[0]?.unit).toBe('level_cny');
		expect(m.series[0]?.points).toHaveLength(12);
		expect(m.yAxes).toEqual([{ unit: 'level_cny', label: '亿元' }]);
		expect(m.empty).toBe(false);
		expect(m.range).toBe('all');
		expect(m.springFestival).toEqual([]);
		expect(m.annotation).toBeNull();
		expect(m.source).toBe('akshare_eastmoney');
	});

	it('consumes the contract _yoy sibling, collapsing its revisions', () => {
		const extra = new Map<string, ChartSeriesSource>([
			['retail_sales_total_yoy', sourceOf('retail_sales_total_yoy')],
		]);
		const m = buildChartModel(makeDetail(), view({ transform: 'yoy' }), extra);
		const s0 = m.series[0];
		expect(s0?.unit).toBe('yoy_pct');
		expect(s0?.name).toBe('全国社会消费品零售总额当月同比');
		// 6 raw points with a duplicate 2026-08 collapse to 5; revision 2 (4.1) wins.
		expect(s0?.points).toHaveLength(5);
		expect(s0?.points.find((p) => p.date === '2026-08')?.value).toBe(4.1);
	});

	it('derives mom without a sibling and labels the unit', () => {
		const m = buildChartModel(makeDetail(), view({ transform: 'mom' }), NO_EXTRA);
		expect(m.series[0]?.unit).toBe('mom_pct');
		expect(m.series[0]?.name).toContain('环比');
	});

	it('adds a single-axis overlay series when the contract supports it', () => {
		const detail = makeDetail({ points: monthly(2010, 120) });
		const extra = new Map<string, ChartSeriesSource>([
			[
				'cpi_national_yoy',
				{
					points: monthly(2010, 120),
					unit: 'yoy_pct',
					title: '全国 CPI 当月同比',
				},
			],
		]);
		const m = buildChartModel(
			detail,
			view({ overlay: 'cpi_national_yoy' }),
			extra,
		);
		expect(m.layout).toBe('single');
		expect(m.series).toHaveLength(2);
		expect(m.series[1]?.role).toBe('overlay');
		expect(m.series[1]?.unit).toBe('yoy_pct');
		// D-M3-5: a single-axis overlay keeps ONE shared y-axis even across units.
		expect(m.yAxes).toHaveLength(1);
	});

	it('splits a cross-region overlay into a dual layout with two axes', () => {
		const sh = seriesOf('retail_sales_sh_yoy');
		const detail = makeDetail({
			key: 'retail_sales_sh_yoy',
			title: sh.title ?? 'retail_sales_sh_yoy',
			unit: sh.unit,
			region: sh.region,
			points: collapseRevisions(sh.series),
			panel: CAPS.panels['retail_sales_sh_yoy'] ?? null,
		});
		const extra = new Map<string, ChartSeriesSource>([
			['retail_sales_total', sourceOf('retail_sales_total')],
		]);
		const m = buildChartModel(
			detail,
			view({ key: 'retail_sales_sh_yoy', overlay: 'retail_sales_total' }),
			extra,
		);
		expect(m.layout).toBe('dual');
		expect(m.series).toHaveLength(2);
		expect(m.series[1]?.role).toBe('overlay');
		expect(m.yAxes).toHaveLength(2);
		expect(m.yAxes[1]?.label).toBe('亿元');
	});

	it('adds no overlay series when the contract blocks it (unit mismatch)', () => {
		const cpi = seriesOf('cpi_national_yoy');
		const detail = makeDetail({
			key: 'cpi_national_yoy',
			title: cpi.title ?? 'cpi_national_yoy',
			unit: cpi.unit,
			points: collapseRevisions(cpi.series),
			panel: CAPS.panels['cpi_national_yoy'] ?? null,
		});
		const extra = new Map<string, ChartSeriesSource>([
			['retail_sales_total', sourceOf('retail_sales_total')],
		]);
		const m = buildChartModel(
			detail,
			view({ key: 'cpi_national_yoy', overlay: 'retail_sales_total' }),
			extra,
		);
		expect(m.layout).toBe('single');
		expect(m.series).toHaveLength(1);
	});

	it('honors the requested chart type and range', () => {
		const m = buildChartModel(
			makeDetail(),
			view({ chartType: 'calendar', range: '1y' }),
			NO_EXTRA,
		);
		expect(m.chartType).toBe('calendar');
		expect(m.range).toBe('1y');
	});

	it('marks a series with no plottable value as empty', () => {
		const m = buildChartModel(
			makeDetail({ points: [pt('2026-01', null), pt('2026-02', null)] }),
			view(),
			NO_EXTRA,
		);
		expect(m.empty).toBe(true);
	});

	it('annotates a spring-festival merge without fabricating a value', () => {
		const m = buildChartModel(
			makeDetail({
				points: [pt('2012-01', 5), pt('2012-02', null), pt('2012-03', 2)],
			}),
			view(),
			NO_EXTRA,
		);
		expect(m.springFestival).toEqual([
			{ year: '2012', startIndex: 0, endIndex: 1 },
		]);
		expect(m.annotation).toContain('春节');
		// The merged February stays null — never synthesized.
		expect(m.series[0]?.points[1]?.value).toBeNull();
	});
});
