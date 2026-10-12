import {
	CHART_HEIGHT,
	CHART_PAD,
	CHART_WIDTH,
	buildLinePath,
	chartX,
	chartY,
	formatTick,
	gapIndices,
	lastNonNullIndex,
	niceScale,
	plotHeight,
	plotWidth,
	scaleFromPoints,
	xTickIndices,
} from '../src/chart';
import type { SeriesPoint } from '../src/contract/types';
import { EMPTY_CHART_TEXT, renderLineChart } from '../src/ui/chartView';

/**
 * Chart geometry is pure (no DOM/Obsidian), so it is unit-tested directly;
 * `renderLineChart` is a DOM composer and is asserted under jsdom. Together
 * they lock the honesty rules: the line breaks at every null, gaps get markers,
 * the y-scale comes from real values only, and an empty series never draws a
 * misleading flat zero line.
 */

function pt(date: string, value: number | null, revision = 0): SeriesPoint {
	return { date, value, revision };
}

/** 4 periods with one interior gap; non-null values 10 / 20 / 30. */
const SERIES: SeriesPoint[] = [
	pt('2026-01', 10),
	pt('2026-02', null),
	pt('2026-03', 20),
	pt('2026-04', 30),
];

describe('chart geometry — niceScale', () => {
	it('returns the empty scale for a non-finite bound', () => {
		expect(niceScale(Number.NaN, 10)).toEqual({
			min: 0,
			max: 1,
			ticks: [0, 0.5, 1],
		});
	});

	it('pads a flat range symmetrically so the line sits mid-plot', () => {
		const scale = niceScale(5, 5);
		expect(scale.min).toBeLessThan(5);
		expect(scale.max).toBeGreaterThan(5);
		expect(scale.ticks).toEqual([2, 4, 6, 8]);
	});

	it('covers the range with ascending nice ticks', () => {
		const scale = niceScale(10, 30, 4);
		expect(scale.min).toBe(10);
		expect(scale.max).toBe(30);
		expect(scale.ticks).toEqual([10, 15, 20, 25, 30]);
	});
});

describe('chart geometry — scaleFromPoints', () => {
	it('derives the scale from non-null values only', () => {
		expect(scaleFromPoints(SERIES)).toEqual(niceScale(10, 30, 4));
	});

	it('returns the empty scale when every value is null', () => {
		expect(scaleFromPoints([pt('a', null), pt('b', null)])).toEqual({
			min: 0,
			max: 1,
			ticks: [0, 0.5, 1],
		});
	});
});

describe('chart geometry — coordinates', () => {
	it('spans the plot width across indices', () => {
		expect(plotWidth()).toBe(CHART_WIDTH - CHART_PAD.left - CHART_PAD.right);
		expect(chartX(0, 4)).toBe(CHART_PAD.left);
		expect(chartX(3, 4)).toBe(CHART_WIDTH - CHART_PAD.right);
	});

	it('keeps a single point at the left edge (no divide-by-zero)', () => {
		expect(chartX(0, 1)).toBe(CHART_PAD.left);
	});

	it('maps max to the top and min to the bottom of the plot', () => {
		const scale = { min: 10, max: 30, ticks: [10, 20, 30] };
		expect(plotHeight()).toBe(
			CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom,
		);
		expect(chartY(30, scale)).toBe(CHART_PAD.top);
		expect(chartY(10, scale)).toBe(CHART_HEIGHT - CHART_PAD.bottom);
	});
});

describe('chart geometry — path & gaps', () => {
	it('breaks the pen at a null (two M commands, one per contiguous run)', () => {
		const d = buildLinePath(SERIES, niceScale(10, 30, 4));
		expect((d.match(/M/g) ?? [])).toHaveLength(2);
		expect((d.match(/L/g) ?? [])).toHaveLength(1);
	});

	it('returns an empty path when nothing is plottable', () => {
		expect(buildLinePath([pt('a', null)], niceScale(0, 1))).toBe('');
	});

	it('lists the null indices as gaps', () => {
		expect(gapIndices(SERIES)).toEqual([1]);
	});

	it('finds the last non-null index, or -1 when there is none', () => {
		expect(lastNonNullIndex(SERIES)).toBe(3);
		expect(lastNonNullIndex([pt('a', null)])).toBe(-1);
		expect(lastNonNullIndex([])).toBe(-1);
	});
});

describe('chart geometry — x ticks & labels', () => {
	it('returns nothing for an empty axis', () => {
		expect(xTickIndices(0)).toEqual([]);
	});

	it('returns every index when they already fit', () => {
		expect(xTickIndices(3, 6)).toEqual([0, 1, 2]);
	});

	it('thins to maxTicks, always including the first and last', () => {
		const ticks = xTickIndices(12, 6);
		expect(ticks).toHaveLength(6);
		expect(ticks[0]).toBe(0);
		expect(ticks[ticks.length - 1]).toBe(11);
	});

	it('formats integers bare and fractions with one decimal', () => {
		expect(formatTick(10)).toBe('10');
		expect(formatTick(2.5)).toBe('2.5');
	});
});

describe('renderLineChart — DOM', () => {
	let host: HTMLElement;

	beforeEach(() => {
		host = document.createElement('div');
		document.body.appendChild(host);
	});

	afterEach(() => {
		document.body.textContent = '';
	});

	it('draws gridlines, labels, one gap marker, the line, endpoint and caption', () => {
		renderLineChart(host, {
			points: SERIES,
			unit: '%',
			source: 'akshare_eastmoney',
		});
		expect(host.classList.contains('mcd-chart--line')).toBe(true);
		const svg = host.querySelector('.mcd-chart__svg');
		expect(svg).not.toBeNull();
		// 5 ticks for [10..30] step 5 → 5 gridlines + 5 y labels
		expect(svg?.querySelectorAll('.mcd-chart__grid')).toHaveLength(5);
		expect(svg?.querySelectorAll('.mcd-chart__ylabel')).toHaveLength(5);
		expect(svg?.querySelectorAll('.mcd-chart__gap')).toHaveLength(1);
		expect(svg?.querySelectorAll('.mcd-chart__line')).toHaveLength(1);
		expect(svg?.querySelector('.mcd-chart__endpoint')).not.toBeNull();
		// n=4 ≤ 6 → every index labelled
		expect(svg?.querySelectorAll('.mcd-chart__xlabel')).toHaveLength(4);
		const caption = host.querySelector('.mcd-chart__caption');
		expect(caption?.textContent).toContain('单位：%');
		expect(caption?.textContent).toContain('来源：akshare_eastmoney');
	});

	it('omits the source clause when the series declares none', () => {
		renderLineChart(host, { points: SERIES, unit: '亿元' });
		expect(host.querySelector('.mcd-chart__caption')?.textContent).toBe(
			'单位：亿元',
		);
	});

	it('falls back to the wireframe (no SVG) when nothing is plottable', () => {
		renderLineChart(host, { points: [pt('a', null)], unit: '%' });
		expect(host.querySelector('.mcd-chart__svg')).toBeNull();
		expect(host.querySelector('.mcd-chart__empty')?.textContent).toBe(
			EMPTY_CHART_TEXT,
		);
	});

	it('re-render clears the previous chart', () => {
		renderLineChart(host, { points: SERIES, unit: '%' });
		renderLineChart(host, { points: [pt('a', null)], unit: '%' });
		expect(host.querySelectorAll('.mcd-chart__svg')).toHaveLength(0);
		expect(host.querySelectorAll('.mcd-chart__empty')).toHaveLength(1);
	});
});
