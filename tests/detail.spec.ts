import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
	buildChartModel,
	type ChartSeriesSource,
} from '../src/analysis/chartModel';
import { parseViewState, type ViewState } from '../src/analysis/viewState';
import { formatValue, toDetail } from '../src/contract/mapper';
import {
	parseCapabilities,
	parseManifest,
	parseSeries,
} from '../src/contract/parse';
import { reasonText } from '../src/contract/reasonText';
import type {
	CapabilitiesV1,
	IndicatorSeriesV1,
	ManifestV1,
} from '../src/contract/types';
import { EMPTY_CHART_TEXT, renderChartSvg } from '../src/ui/chartView';
import { renderDetail } from '../src/ui/detail';
import type { DetailHandlers } from '../src/ui/detail';

/**
 * Detail-page DOM tests (T3-4). The model is built from the frozen golden
 * fixtures via the real mapper, so every asserted string is a byte the pipeline
 * emits. These lock the S2 structure, the §6 honesty rules (double timestamp,
 * a missing cell is a「缺失」Badge and never 0), and the S3 limited state
 * (banner + wireframe, no throw).
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
	caps: CapabilitiesV1;
	seriesByKey: Map<string, IndicatorSeriesV1>;
} {
	const m = parseOrFail(readJson('manifest.json'));
	const c = parseCaps(readJson('capabilities.json'));
	const seriesByKey = new Map<string, IndicatorSeriesV1>();
	for (const ind of m.indicators) {
		seriesByKey.set(ind.key, parseSeriesOrFail(readJson(ind.file)));
	}
	return { manifest: m, caps: c, seriesByKey };
}

// Small wrappers so the golden loader stays readable (parse* are total).
function parseOrFail(json: unknown): ManifestV1 {
	const r = parseManifest(json);
	if (!r.ok) throw new Error('manifest parse failed');
	return r.value;
}
function parseCaps(json: unknown): CapabilitiesV1 {
	const r = parseCapabilities(json);
	if (!r.ok) throw new Error('capabilities parse failed');
	return r.value;
}
function parseSeriesOrFail(json: unknown): IndicatorSeriesV1 {
	const r = parseSeries(json);
	if (!r.ok) throw new Error('series parse failed');
	return r.value;
}

const { manifest, caps, seriesByKey } = loadGolden();

function render(
	key: string,
	series: IndicatorSeriesV1 | null,
	handlers: DetailHandlers = {},
): HTMLElement {
	const model = toDetail(key, manifest, series, caps);
	// The composer now takes a pre-built ChartModel, the view state the toolbar
	// reflects, and an injected renderer. The tests drive it with the pure SVG
	// fallback (no ECharts) and the default view state, so every asserted string
	// stays a real contract byte.
	const view = parseViewState({ key });
	const chart = buildChartModel(
		model,
		view,
		new Map<string, ChartSeriesSource>(),
	);
	const root = document.createElement('div');
	document.body.appendChild(root);
	renderDetail(root, {
		model,
		chart,
		view,
		onViewStateChange: () => {},
		renderChart: renderChartSvg,
		handlers,
	});
	return root;
}

afterEach(() => {
	document.body.textContent = '';
});

describe('renderDetail — structure', () => {
	const root = render(
		'retail_sales_total_yoy',
		seriesByKey.get('retail_sales_total_yoy')!,
	);

	it('lays out the scoped root, header and narrow main', () => {
		expect(root.querySelector('.mcd-root.mcd-view')).not.toBeNull();
		expect(root.querySelector('.mcd-main--narrow')).not.toBeNull();
	});

	it('renders the header with back, title, crumb and both actions', () => {
		expect(root.querySelector('.mcd-header__title')?.textContent).toBe(
			'全国社会消费品零售总额当月同比',
		);
		expect(root.querySelector('.mcd-header__crumb')?.textContent).toBe(
			'指标详情',
		);
		expect(root.querySelectorAll('.mcd-icon-button')).toHaveLength(2);
		expect(root.querySelector('.mcd-button')?.textContent).toBe('设置');
	});

	it('renders the freshness dot plus region/frequency/unit chips', () => {
		const meta = root.querySelector('.mcd-detail__meta');
		expect(meta?.querySelector('.mcd-dot.is-fresh')).not.toBeNull();
		expect(meta?.querySelector('.mcd-detail__fresh')?.textContent).toBe('最新');
		const chips = Array.from(
			meta?.querySelectorAll('.mcd-detail__chip') ?? [],
		).map((c) => c.textContent);
		expect(chips).toEqual(['全国趋势', '月度', '单位 %']);
	});

	it('shows the double timestamp: period · update · file (§6)', () => {
		const stamp = root.querySelector('.mcd-detail__stamp')?.textContent ?? '';
		expect(stamp).toContain('数据截至 2026-09');
		expect(stamp).toContain('更新于 2026-10-11 08:00');
		expect(stamp).toContain('retail_sales_total_yoy.json');
	});

	it('draws the main chart and a source footnote', () => {
		expect(root.querySelector('.mcd-chart__svg')).not.toBeNull();
		expect(root.querySelector('.mcd-main > p.mcd-muted')?.textContent).toContain(
			'来源：akshare_eastmoney',
		);
	});

	it('renders the capabilities toolbar above the chart', () => {
		const toolbar = root.querySelector('.mcd-toolbar');
		expect(toolbar).not.toBeNull();
		expect(
			Array.from(toolbar?.querySelectorAll('.mcd-toolbar__label') ?? []).map(
				(l) => l.textContent,
			),
		).toEqual(['粒度', '模式', '图型', '变换', '叠加', '范围', '平滑']);
	});
});

describe('renderDetail — header actions', () => {
	it('fires onBack, onRefresh and onOpenSettings', () => {
		const onBack = jest.fn();
		const onRefresh = jest.fn();
		const onOpenSettings = jest.fn();
		const root = render(
			'retail_sales_total_yoy',
			seriesByKey.get('retail_sales_total_yoy')!,
			{ onBack, onRefresh, onOpenSettings },
		);
		const icons = root.querySelectorAll<HTMLElement>('.mcd-icon-button');
		icons[0]?.click();
		icons[1]?.click();
		root.querySelector<HTMLElement>('.mcd-button')?.click();
		expect(onBack).toHaveBeenCalledTimes(1);
		expect(onRefresh).toHaveBeenCalledTimes(1);
		expect(onOpenSettings).toHaveBeenCalledTimes(1);
	});

	it('fires onOpenRelease from the header nav entry', () => {
		const onOpenRelease = jest.fn();
		const root = render(
			'retail_sales_total_yoy',
			seriesByKey.get('retail_sales_total_yoy')!,
			{ onOpenRelease },
		);
		const nav = root.querySelector<HTMLElement>('.mcd-nav');
		expect(nav?.textContent).toBe('发布日历');
		nav?.click();
		expect(onOpenRelease).toHaveBeenCalledTimes(1);
	});
});

describe('renderDetail — data table honesty', () => {
	const key = 'retail_sales_total';
	const model = toDetail(key, manifest, seriesByKey.get(key)!, caps);
	const root = render(key, seriesByKey.get(key)!);
	const rows = Array.from(root.querySelectorAll('tbody tr'));
	const latestFirst = [...model.points].reverse();

	it('labels the value column with its unit', () => {
		const heads = Array.from(root.querySelectorAll('thead th')).map(
			(t) => t.textContent,
		);
		expect(heads).toEqual(['期', '值（亿元）', '修订']);
	});

	it('lists every period, latest first, matching the model', () => {
		expect(rows).toHaveLength(model.points.length);
		rows.forEach((tr, i) => {
			const tds = tr.querySelectorAll('td');
			const point = latestFirst[i]!;
			expect(tds[0]?.textContent).toBe(point.date);
			expect(tds[2]?.textContent).toBe(String(point.revision));
		});
	});

	it('renders a 缺失 Badge for a null and never a zero', () => {
		let missing = 0;
		rows.forEach((tr, i) => {
			const point = latestFirst[i]!;
			const valueCell = tr.querySelectorAll('td')[1]!;
			if (point.value === null) {
				missing += 1;
				expect(valueCell.querySelector('.mcd-badge')?.textContent).toBe(
					'缺失',
				);
				expect(valueCell.textContent).not.toContain('0');
			} else {
				expect(valueCell.textContent).toBe(
					formatValue(point.value, model.unit),
				);
			}
		});
		expect(missing).toBe(2); // 2026-06 and 2026-07
	});

	it('shows the latest level as an integer without a trailing .0', () => {
		expect(rows[0]?.querySelectorAll('td')[1]?.textContent).toBe('44100');
	});
});

describe('renderDetail — limited state (S3)', () => {
	it('missing series: banner + wireframe chart, no table, no throw', () => {
		const root = render('retail_sales_total', null);
		expect(root.querySelector('.mcd-banner')?.textContent).toContain(
			'未找到该指标的序列数据',
		);
		expect(root.querySelector('.mcd-chart__svg')).toBeNull();
		expect(root.querySelector('.mcd-chart__empty')?.textContent).toBe(
			EMPTY_CHART_TEXT,
		);
		expect(root.querySelector('tbody')).toBeNull();
	});

	it('stub source: the banner carries the reason_code copy', () => {
		const stub: IndicatorSeriesV1 = {
			schema_version: 'indicator_series_v1',
			key: 'shanghai_finance_quarterly',
			region: 'SH',
			frequency: 'quarterly',
			date_grain: 'quarter',
			unit: 'yoy_pct',
			null_policy: 'null_not_zero',
			status: 'active',
			series: [{ date: '2026-Q2', value: 1.0, revision: 1 }],
			quality: { last_date: '2026-Q2' },
		};
		const root = render('shanghai_finance_quarterly', stub);
		expect(root.querySelector('.mcd-banner')?.textContent).toContain(
			reasonText('SOURCE_UNSUPPORTED'),
		);
		// S3 grays the whole toolbar with the stub reason and never throws.
		const options = Array.from(
			root.querySelectorAll<HTMLButtonElement>('.mcd-segmented__item'),
		);
		expect(options.length).toBeGreaterThan(0);
		expect(options.every((o) => o.disabled)).toBe(true);
		expect(
			options.every((o) => o.title === reasonText('SOURCE_UNSUPPORTED')),
		).toBe(true);
	});

	it('reflects the freshness state on the dot (stale / unknown)', () => {
		const stale = render('cpi_national_yoy', seriesByKey.get('cpi_national_yoy')!);
		expect(
			stale.querySelector('.mcd-detail__fresh .mcd-dot.is-stale'),
		).not.toBeNull();
		const unknown = render(
			'disposable_income_yoy',
			seriesByKey.get('disposable_income_yoy')!,
		);
		expect(
			unknown.querySelector('.mcd-detail__fresh .mcd-dot.is-unknown'),
		).not.toBeNull();
	});
});

describe('renderDetail — annual grain footnote (CR-2026-10-13)', () => {
	it('states the year-total caliber for an annual series', () => {
		const root = render(
			'retail_sales_total_annual',
			seriesByKey.get('retail_sales_total_annual')!,
		);
		const footnote =
			root.querySelector('.mcd-main > p.mcd-muted')?.textContent ?? '';
		expect(footnote).toContain('年度总额');
		expect(footnote).toContain('12 月累计');
		expect(footnote).toContain('未完结年份不纳入');
	});

	it('lists the year labels verbatim in the annual table', () => {
		const root = render(
			'retail_sales_total_annual',
			seriesByKey.get('retail_sales_total_annual')!,
		);
		const firstDate = root.querySelector('tbody tr td')?.textContent;
		// The golden annual excerpt ends at 2025; the table is latest-first.
		expect(firstDate).toBe('2025');
	});
});

describe('renderDetail — controlled toolbar (M3-T4)', () => {
	it('reflects the view state and forwards toolbar changes', () => {
		const key = 'retail_sales_total';
		const model = toDetail(key, manifest, seriesByKey.get(key)!, caps);
		const view: ViewState = { ...parseViewState({ key }), range: '1y' };
		const chart = buildChartModel(
			model,
			view,
			new Map<string, ChartSeriesSource>(),
		);
		const onViewStateChange = jest.fn();
		const root = document.createElement('div');
		document.body.appendChild(root);
		renderDetail(root, {
			model,
			chart,
			view,
			onViewStateChange,
			renderChart: renderChartSvg,
		});
		const groups = Array.from(
			root.querySelectorAll<HTMLElement>('.mcd-toolbar__group'),
		);
		const range = groups.find(
			(g) => g.querySelector('.mcd-toolbar__label')?.textContent === '范围',
		);
		expect(
			range?.querySelector('.mcd-segmented__item.is-selected')?.getAttribute(
				'data-value',
			),
		).toBe('1y');
		const table = Array.from(
			root.querySelectorAll<HTMLButtonElement>('.mcd-segmented__item'),
		).find((b) => b.dataset.value === 'table');
		table?.click();
		expect(onViewStateChange).toHaveBeenCalledWith({ chartType: 'table' });
	});
});

describe('renderDetail — analysis overlays (M3-T5)', () => {
	it('renders the mandatory amber caliber note for a spring-festival merge', () => {
		// A Jan-present / Feb-null series triggers detectSpringFestival, so
		// buildChartModel emits the mandatory annotation (D-M3-8) and the composer
		// shows it as the amber note bar above the chart. The merged February stays
		// a break in the line and a 缺失 Badge in the table — never a synthesized
		// value (UI-UX §6, null_not_zero).
		const sf: IndicatorSeriesV1 = {
			schema_version: 'indicator_series_v1',
			key: 'retail_sales_total',
			region: 'CN',
			frequency: 'monthly',
			date_grain: 'month',
			unit: 'level_cny',
			null_policy: 'null_not_zero',
			status: 'active',
			series: [
				{ date: '2012-01', value: 5, revision: 1 },
				{ date: '2012-02', value: null, revision: 1 },
				{ date: '2012-03', value: 2, revision: 1 },
			],
			quality: { last_date: '2012-03' },
		};
		const root = render('retail_sales_total', sf);
		const note = root.querySelector('.mcd-note--amber');
		expect(note).not.toBeNull();
		expect(note?.textContent).toContain('春节');
		expect(root.querySelector('.mcd-chart__svg')).not.toBeNull();
	});

	it('omits the note when the model carries no annotation', () => {
		// The golden retail series has both January and February, so no
		// spring-festival span is detected and no note bar is rendered.
		const root = render(
			'retail_sales_total',
			seriesByKey.get('retail_sales_total')!,
		);
		expect(root.querySelector('.mcd-note--amber')).toBeNull();
	});

	it('splits a cross-region overlay into two stacked charts (dual, D-M3-6)', () => {
		const sh = seriesByKey.get('retail_sales_sh_yoy')!;
		const total = seriesByKey.get('retail_sales_total')!;
		const model = toDetail('retail_sales_sh_yoy', manifest, sh, caps);
		const view = parseViewState({
			key: 'retail_sales_sh_yoy',
			overlay: 'retail_sales_total',
		});
		const sources = new Map<string, ChartSeriesSource>([
			[
				'retail_sales_total',
				{
					points: total.series,
					unit: total.unit,
					title: total.title ?? 'retail_sales_total',
				},
			],
		]);
		const chart = buildChartModel(model, view, sources);
		// Precondition: the frozen contract flags this overlay INCOMPATIBLE_REGION,
		// which the model turns into a dual layout (never a single-axis blend).
		expect(chart.layout).toBe('dual');

		const root = document.createElement('div');
		document.body.appendChild(root);
		renderDetail(root, {
			model,
			chart,
			view,
			onViewStateChange: () => {},
			renderChart: renderChartSvg,
		});
		// The dependency-free fallback must still draw BOTH regions as two
		// independent charts — never blend them on one axis, never silently drop
		// one (UI-UX §6 失败不静默).
		expect(root.querySelector('.mcd-chart--dual')).not.toBeNull();
		expect(root.querySelectorAll('.mcd-chart__pane')).toHaveLength(2);
		expect(root.querySelectorAll('.mcd-chart__svg')).toHaveLength(2);
	});
});
