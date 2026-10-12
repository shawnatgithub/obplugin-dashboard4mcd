/**
 * Range slicing (M3-T1 / spec §4, UI-UX §7 工具栏「范围」).
 *
 * The pure equivalent of the ECharts dataZoom window: the toolbar's 范围 segment
 * (近1年 / 近3年 / 近5年 / 全部) narrows what the reader sees without touching
 * the underlying data. Calibrated for monthly series (12 / 36 / 60 periods);
 * a series shorter than the window is returned whole, and `all` keeps history.
 *
 * Pure (no DOM / Obsidian / ECharts).
 */

import type { SeriesPoint } from '../contract/types';

/** Which time window the toolbar's 范围 segment selects. */
export type RangeKey = '1y' | '3y' | '5y' | 'all';

/** Period count per range; `all` is unbounded. */
const WINDOW: Record<RangeKey, number> = {
	'1y': 12,
	'3y': 36,
	'5y': 60,
	all: Number.POSITIVE_INFINITY,
};

/** The last N periods for `range` (copies, so the source is never mutated). */
export function sliceByRange(
	points: readonly SeriesPoint[],
	range: RangeKey,
): SeriesPoint[] {
	const n = WINDOW[range];
	if (points.length <= n) return points.map((p) => ({ ...p }));
	return points.slice(points.length - n).map((p) => ({ ...p }));
}
