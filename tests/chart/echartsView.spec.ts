/**
 * The ECharts glue (M3-T3 / spec §3 D-M3-3, D-M3-4). `renderChart` is the thin
 * side-effecting seam: it resolves the live theme tokens, builds the option with
 * the pure builder and hands it to `echarts.init().setOption()`. jsdom has no
 * canvas, so `echarts/core` is mocked here — these tests assert the glue's
 * *contract*: it initializes with exactly the built option, returns a disposable
 * handle, and degrades to the dependency-free SVG renderer on any failure or for
 * the empty / table cases (never throwing, never leaving a blank host). The real
 * canvas render is verified by the L2 smoke test in Obsidian (M3-T6).
 */

import * as echartsCore from 'echarts/core';
import type {
	ChartAxis,
	ChartModel,
	ChartSeries,
} from '../../src/analysis/chartModel';
import type { SeriesPoint } from '../../src/contract/types';
import { disposeChart, renderChart } from '../../src/ui/chart/echartsView';
import { buildChartOption } from '../../src/ui/chart/option';
import { DEFAULT_CHART_TOKENS } from '../../src/ui/chart/tokens';

// Mock only the side-effecting core; the pure builder/tokens and the SVG
// fallback stay real so the assertions exercise the actual glue wiring.
jest.mock('echarts/core', () => ({
	use: jest.fn(),
	init: jest.fn(),
	getInstanceByDom: jest.fn(),
}));

// The registration tokens are ESM-only files jest cannot require as CommonJS,
// and the glue only feeds them to the mocked `use()`, so a Proxy that answers any
// named import with a dummy is enough (keeps the tree-shake imports intact).
jest.mock('echarts/charts', () => new Proxy({}, { get: () => ({}) }));
jest.mock('echarts/components', () => new Proxy({}, { get: () => ({}) }));
jest.mock('echarts/renderers', () => new Proxy({}, { get: () => ({}) }));

const initMock = jest.mocked(echartsCore.init);
const getInstanceMock = jest.mocked(echartsCore.getInstanceByDom);
type InitReturn = ReturnType<typeof echartsCore.init>;

interface FakeChart {
	setOption: jest.Mock;
	dispose: jest.Mock;
	resize: jest.Mock;
}

function makeFakeChart(): FakeChart {
	return { setOption: jest.fn(), dispose: jest.fn(), resize: jest.fn() };
}

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

let container: HTMLElement;

beforeEach(() => {
	// clearMocks only clears calls; reset removes the per-test implementations.
	initMock.mockReset();
	getInstanceMock.mockReset();
	container = document.createElement('div');
	document.body.appendChild(container);
});

afterEach(() => {
	document.body.textContent = '';
});

describe('renderChart — ECharts path', () => {
	it('initializes with the built option and returns a disposable handle', () => {
		const chart = makeFakeChart();
		initMock.mockReturnValue(chart as unknown as InitReturn);
		const m = model();

		const handle = renderChart(container, m);

		expect(initMock).toHaveBeenCalledTimes(1);
		expect(initMock).toHaveBeenCalledWith(container, undefined, {
			renderer: 'canvas',
			width: 'auto',
			height: 320,
		});
		expect(chart.setOption).toHaveBeenCalledTimes(1);
		// jsdom resolves no --mcd-* custom property, so the glue falls back to
		// DEFAULT_CHART_TOKENS and the option must equal the pure builder's.
		expect(chart.setOption).toHaveBeenCalledWith(
			buildChartOption(m, DEFAULT_CHART_TOKENS),
		);

		handle.dispose();
		expect(chart.dispose).toHaveBeenCalledTimes(1);
	});
});

describe('renderChart — SVG fallback (D-M3-4)', () => {
	it('draws the SVG chart and never throws when init fails', () => {
		initMock.mockImplementation(() => {
			throw new Error('canvas unavailable');
		});
		expect(() => renderChart(container, model())).not.toThrow();
		expect(container.querySelector('.mcd-chart__svg')).not.toBeNull();
	});

	it('uses the wireframe for an empty model without touching ECharts', () => {
		renderChart(
			container,
			model({ empty: true, series: [series({ points: [pt('2026-01', null)] })] }),
		);
		expect(initMock).not.toHaveBeenCalled();
		expect(container.querySelector('.mcd-chart__empty')).not.toBeNull();
	});

	it('clears the host for the table chart type without touching ECharts', () => {
		renderChart(container, model({ chartType: 'table' }));
		expect(initMock).not.toHaveBeenCalled();
		expect(container.querySelector('.mcd-chart__svg')).toBeNull();
		expect(container.childElementCount).toBe(0);
	});
});

describe('disposeChart', () => {
	it('disposes an instance bound to the host', () => {
		const chart = makeFakeChart();
		getInstanceMock.mockReturnValue(chart as unknown as InitReturn);
		disposeChart(container);
		expect(chart.dispose).toHaveBeenCalledTimes(1);
	});

	it('is a safe no-op when nothing is bound', () => {
		getInstanceMock.mockReturnValue(undefined);
		expect(() => disposeChart(container)).not.toThrow();
	});
});
