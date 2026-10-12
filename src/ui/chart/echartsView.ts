/**
 * The ECharts renderer glue (M3-T3 / spec §3 D-M3-1, D-M3-3, D-M3-4; closes G6).
 *
 * This is the only module that touches ECharts. It registers exactly the charts,
 * components and renderer the pure option builder emits — so esbuild tree-shakes
 * the rest and `main.js` stays small (U4) — then resolves the live theme tokens,
 * builds the option with `buildChartOption` and hands it to
 * `echarts.init().setOption()`.
 *
 * Every failure mode degrades to the dependency-free SVG renderer instead of
 * throwing or leaving a blank host (D-M3-4 失败不静默): an empty model or the
 * `table` type never initializes ECharts, and any init/setOption error falls back
 * to SVG. `disposeChart` is the leak guard the detail view calls before a
 * re-render and on close — ECharts tags its host with `_echarts_instance_`, so we
 * can find and dispose any instance bound to the subtree.
 */

import { BarChart, HeatmapChart, LineChart } from 'echarts/charts';
import {
	CalendarComponent,
	DataZoomComponent,
	GridComponent,
	LegendComponent,
	MarkAreaComponent,
	MarkLineComponent,
	TooltipComponent,
	VisualMapComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import type { ChartModel } from '../../analysis/chartModel';
import { renderChartSvg, type ChartHandle } from '../chartView';
import { buildChartOption } from './option';
import { resolveChartTokens } from './tokens';

// Register only what the option builder emits; everything else is tree-shaken (U4).
echarts.use([
	LineChart,
	BarChart,
	HeatmapChart,
	GridComponent,
	TooltipComponent,
	LegendComponent,
	DataZoomComponent,
	MarkLineComponent,
	MarkAreaComponent,
	VisualMapComponent,
	CalendarComponent,
	CanvasRenderer,
]);

/** Fixed canvas height (matches `.mcd-chart` in styles.css); width fills the host. */
const CHART_HEIGHT = 320;

/** A dual layout stacks two grids, so it needs a taller canvas to stay readable. */
const DUAL_CHART_HEIGHT = 440;

/** ECharts tags its host element with this attribute (its `DOM_ATTRIBUTE_KEY`). */
const INSTANCE_ATTR = '_echarts_instance_';

/**
 * Render `model` into `container` with ECharts, degrading to the SVG fallback for
 * the empty / `table` cases and on any error (D-M3-4). Returns a handle whose
 * `dispose` tears the instance down, so a re-render or a closed leaf never leaks.
 */
export function renderChart(
	container: HTMLElement,
	model: ChartModel,
): ChartHandle {
	if (model.empty || model.chartType === 'table') {
		return renderChartSvg(container, model);
	}
	try {
		// The composer attaches the tree before calling this, so the host sits
		// under `.mcd-root` and getComputedStyle resolves the inherited --mcd-*
		// tokens; any unset variable falls back to the literal palette.
		const tokens = resolveChartTokens((name) =>
			getComputedStyle(container).getPropertyValue(name),
		);
		const option = buildChartOption(model, tokens);
		container.classList.add('mcd-chart', 'mcd-chart--echarts');
		const chart = echarts.init(container, undefined, {
			renderer: 'canvas',
			width: 'auto',
			height: model.layout === 'dual' ? DUAL_CHART_HEIGHT : CHART_HEIGHT,
		});
		chart.setOption(option);
		// The leaf is often not laid out yet when the composer draws (clientWidth
		// 0), and ECharts then bakes its 100px default width — a chart squashed
		// into a vertical sliver with no readable x-axis. Observe the host so the
		// canvas re-measures as soon as it gets a real width, and again on every
		// later relayout (split resize, sidebar toggle). The observer is torn down
		// with the chart so a re-render never leaks one.
		let observer: ResizeObserver | null = null;
		if (typeof ResizeObserver !== 'undefined') {
			observer = new ResizeObserver(() => chart.resize());
			observer.observe(container);
		}
		return {
			dispose: () => {
				observer?.disconnect();
				chart.dispose();
			},
		};
	} catch {
		return renderChartSvg(container, model);
	}
}

/**
 * Dispose any ECharts instance bound to `root` or a descendant. A safe no-op when
 * nothing is bound; complements the handle's `dispose` as a subtree-wide guard.
 */
export function disposeChart(root: HTMLElement): void {
	const self = echarts.getInstanceByDom(root);
	if (self) {
		self.dispose();
		return;
	}
	const bound = root.querySelectorAll<HTMLElement>(`[${INSTANCE_ATTR}]`);
	bound.forEach((node) => echarts.getInstanceByDom(node)?.dispose());
}
