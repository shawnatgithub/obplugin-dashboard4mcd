/**
 * Line-chart renderer (raw SVG, dependency-free) — D-M2-4.
 *
 * Draws the detail view's main chart from real series points using the pure
 * geometry in `src/chart.ts`, following the EconomistChart rules (UI-UX §5):
 * horizontal gridlines only, an accent line that breaks at every missing
 * period (never interpolated, §6 断线), a dashed marker per gap, an end-point
 * dot on the latest observation, and a figcaption naming the unit and source.
 *
 * The whole chart sits behind this one function so M3 can swap the internals
 * for ECharts (G6) without touching the detail composer that calls it.
 */

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
	scaleFromPoints,
	xTickIndices,
} from '../chart';
import type { SeriesPoint } from '../contract/types';
import { clearEl, el, svgEl } from './dom';

/** What `renderLineChart` needs: the points plus how to label them. */
export interface ChartSpec {
	points: SeriesPoint[];
	unit: string;
	source?: string;
}

/** Shown in the wireframe fallback when nothing is plottable. */
export const EMPTY_CHART_TEXT = '暂无可用数据点';

function buildCaption(spec: ChartSpec): HTMLElement {
	const parts = [`单位：${spec.unit || '—'}`];
	if (spec.source) parts.push(`来源：${spec.source}`);
	return el('figcaption', 'mcd-chart__caption', parts.join(' · '));
}

/** Wireframe fallback for a series with no plottable value (never zero-fill). */
function buildChartEmpty(): HTMLElement {
	return el('div', 'mcd-wireframe mcd-chart__empty', EMPTY_CHART_TEXT);
}

/**
 * Render (or re-render) a line chart for `spec` into `container`. Total: an
 * empty/all-null series yields the wireframe fallback rather than throwing or
 * drawing a misleading flat zero line (UI-UX §6 数据诚实).
 */
export function renderLineChart(container: HTMLElement, spec: ChartSpec): void {
	clearEl(container);
	container.classList.add('mcd-chart', 'mcd-chart--line');

	const points = spec.points;
	if (lastNonNullIndex(points) < 0) {
		container.appendChild(buildChartEmpty());
		return;
	}

	const n = points.length;
	const scale = scaleFromPoints(points);
	const plotLeft = CHART_PAD.left;
	const plotRight = CHART_WIDTH - CHART_PAD.right;
	const plotTop = CHART_PAD.top;
	const plotBottom = CHART_HEIGHT - CHART_PAD.bottom;

	const svg = svgEl('svg', {
		class: 'mcd-chart__svg',
		viewBox: `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`,
		role: 'img',
		'aria-label': `${n} 期数据折线图`,
	});

	// Horizontal gridlines + y-axis labels (no vertical grid, UI-UX §5).
	for (const tick of scale.ticks) {
		const y = chartY(tick, scale);
		svg.appendChild(
			svgEl('line', {
				class: 'mcd-chart__grid',
				x1: plotLeft,
				x2: plotRight,
				y1: y,
				y2: y,
				stroke: 'var(--mcd-grid)',
				'vector-effect': 'non-scaling-stroke',
			}),
		);
		const label = svgEl('text', {
			class: 'mcd-chart__ylabel',
			x: plotLeft - 6,
			y,
			dy: '0.32em',
			'text-anchor': 'end',
		});
		label.textContent = formatTick(tick);
		svg.appendChild(label);
	}

	// A dashed vertical at every missing period; the line never crosses it.
	for (const gap of gapIndices(points)) {
		const x = chartX(gap, n);
		svg.appendChild(
			svgEl('line', {
				class: 'mcd-chart__gap',
				x1: x,
				x2: x,
				y1: plotTop,
				y2: plotBottom,
				stroke: 'var(--mcd-wire)',
				'stroke-dasharray': '3 3',
				'vector-effect': 'non-scaling-stroke',
			}),
		);
	}

	// The accent series line, pen lifted at each null.
	svg.appendChild(
		svgEl('path', {
			class: 'mcd-chart__line',
			d: buildLinePath(points, scale),
			fill: 'none',
			stroke: 'var(--mcd-accent)',
			'stroke-width': 2.5,
			'stroke-linejoin': 'round',
			'stroke-linecap': 'round',
			'vector-effect': 'non-scaling-stroke',
		}),
	);

	// End-point dot on the most recent observation.
	const li = lastNonNullIndex(points);
	const lastPt = points[li];
	if (lastPt && lastPt.value !== null) {
		svg.appendChild(
			svgEl('circle', {
				class: 'mcd-chart__endpoint',
				cx: chartX(li, n),
				cy: chartY(lastPt.value, scale),
				r: 3,
				fill: 'var(--mcd-accent)',
			}),
		);
	}

	// Sparse x-axis date labels.
	for (const idx of xTickIndices(n)) {
		const pt = points[idx];
		if (!pt) continue;
		const label = svgEl('text', {
			class: 'mcd-chart__xlabel',
			x: chartX(idx, n),
			y: plotBottom + 16,
			'text-anchor': 'middle',
		});
		label.textContent = pt.date;
		svg.appendChild(label);
	}

	container.appendChild(svg);
	container.appendChild(buildCaption(spec));
}
