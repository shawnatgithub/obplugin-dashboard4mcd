/**
 * The chart renderer barrel (M3-T3). One import point for the detail view: the
 * ECharts glue (`renderChart` + `disposeChart`) and the pure SVG fallback plus the
 * shared handle types. `detail.ts` depends only on the `RenderChartFn` /
 * `ChartHandle` types, so it stays ECharts-free; `detailView.ts` injects the
 * concrete `renderChart` here. Swapping the renderer never touches the composer
 * (D-M2-4).
 */

export { disposeChart, renderChart } from './echartsView';
export { NOOP_CHART_HANDLE, renderChartSvg } from '../chartView';
export type { ChartHandle, RenderChartFn } from '../chartView';
