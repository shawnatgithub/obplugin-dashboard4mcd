/**
 * View state (M3-T2 / spec §6, D-M3-9).
 *
 * The persisted, renderer-agnostic description of how one indicator's detail
 * chart is being viewed: which comparison mode, chart type, transform, overlay
 * target, time range and smoothing. The detail leaf saves it as `view_state`
 * and restores it on reload (G7).
 *
 * `parseViewState` is total and defensive: every field is validated on read, so
 * a stale or partial blob (M2 only stored `{key}`), a hand-edited value, or an
 * out-of-range enum degrades to that field's default rather than throwing or
 * yielding an invalid chart. Pure (no DOM / Obsidian / ECharts), so it is shared
 * by the controlled toolbar and the detail view and unit-tested in isolation.
 */

import type { RangeKey } from './range';
import type { TransformKey } from './transform';

/** The 模式 segment: which comparison lens the reader picked. */
export type ModeKey = 'calendar' | 'seasonal_compare' | 'yoy';

/** The 图型 segment: which shape renders the series (`table` hides the chart). */
export type ChartType = 'line' | 'area' | 'bar' | 'calendar' | 'table';

/** Everything the detail view persists and the chart model consumes. */
export interface ViewState {
	key: string;
	mode: ModeKey;
	chartType: ChartType;
	transform: TransformKey;
	/** The selected overlay target key, or null when nothing is overlaid. */
	overlay: string | null;
	range: RangeKey;
	smoothing: boolean;
}

/** The default view for a freshly opened indicator (backward-compatible with M2). */
export const DEFAULT_VIEW_STATE: Omit<ViewState, 'key'> = {
	mode: 'calendar',
	chartType: 'line',
	transform: 'level',
	overlay: null,
	range: 'all',
	smoothing: false,
};

const MODES: readonly ModeKey[] = ['calendar', 'seasonal_compare', 'yoy'];
const CHART_TYPES: readonly ChartType[] = ['line', 'area', 'bar', 'calendar', 'table'];
const TRANSFORMS: readonly TransformKey[] = ['level', 'yoy', 'mom'];
const RANGES: readonly RangeKey[] = ['1y', '3y', '5y', 'all'];

/** Return `value` when it is one of `allowed`, otherwise the `fallback`. */
function oneOf<T extends string>(
	value: unknown,
	allowed: readonly T[],
	fallback: T,
): T {
	if (typeof value !== 'string') return fallback;
	return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/**
 * Coerce an unknown persisted blob into a full ViewState. Any missing, wrongly
 * typed, or out-of-range field falls back to its default, so an older or
 * hand-edited `view_state` never throws and never produces an invalid chart.
 */
export function parseViewState(raw: unknown): ViewState {
	const obj = (raw ?? {}) as Record<string, unknown>;
	return {
		key: typeof obj.key === 'string' ? obj.key : '',
		mode: oneOf(obj.mode, MODES, DEFAULT_VIEW_STATE.mode),
		chartType: oneOf(obj.chartType, CHART_TYPES, DEFAULT_VIEW_STATE.chartType),
		transform: oneOf(obj.transform, TRANSFORMS, DEFAULT_VIEW_STATE.transform),
		overlay: typeof obj.overlay === 'string' ? obj.overlay : null,
		range: oneOf(obj.range, RANGES, DEFAULT_VIEW_STATE.range),
		smoothing: obj.smoothing === true,
	};
}
