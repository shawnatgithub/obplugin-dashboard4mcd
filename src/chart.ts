/**
 * Pure line-chart geometry (T3-4 / D-M2-4).
 *
 * A dependency-free SVG chart for M2: no ECharts bundle (AGENTS.md keep-small),
 * swappable behind `renderLineChart` so M3 can replace the internals with
 * ECharts once the overlay/dual-axis features land (G6 deferred, spec §4).
 *
 * The honesty rules from UI-UX §6 are baked into the geometry: the line breaks
 * at every null (never interpolated across a gap), each gap gets a marker, and
 * the y-scale is derived from the real values only. This module has no DOM or
 * Obsidian dependency, so it is unit-testable in isolation.
 */

import type { SeriesPoint } from './contract/types';

/** SVG viewBox width (viewBox units; the element scales to its container). */
export const CHART_WIDTH = 640;
/** SVG viewBox height before any per-call override. */
export const CHART_HEIGHT = 260;
/** Plot-area padding: left leaves room for y labels, bottom for x labels. */
export const CHART_PAD = { top: 16, right: 18, bottom: 30, left: 48 } as const;

/** A y-axis scale: bounds plus the tick values to draw gridlines at. */
export interface YScale {
	min: number;
	max: number;
	ticks: number[];
}

const EMPTY_SCALE: YScale = { min: 0, max: 1, ticks: [0, 0.5, 1] };

/**
 * Round an axis to "nice" bounds and steps covering `[min, max]` with about
 * `count` intervals. A flat series is padded symmetrically so its line sits
 * mid-plot instead of collapsing onto an edge.
 */
export function niceScale(min: number, max: number, count = 4): YScale {
	if (!Number.isFinite(min) || !Number.isFinite(max)) return EMPTY_SCALE;
	let lo = min;
	let hi = max;
	if (lo === hi) {
		const pad = Math.abs(lo) > 0 ? Math.abs(lo) * 0.5 : 0.5;
		lo -= pad;
		hi += pad;
	}
	const rawStep = (hi - lo) / count;
	const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
	const norm = rawStep / mag;
	const step =
		(norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) *
		mag;
	const niceMin = Math.floor(lo / step) * step;
	const niceMax = Math.ceil(hi / step) * step;
	const ticks: number[] = [];
	for (let v = niceMin; v <= niceMax + step * 1e-9; v += step) {
		ticks.push(Number(v.toFixed(10)));
	}
	return { min: niceMin, max: niceMax, ticks };
}

/** Derive a y-scale from the non-null values of a series. */
export function scaleFromPoints(
	points: readonly SeriesPoint[],
	count = 4,
): YScale {
	const vals = points
		.map((p) => p.value)
		.filter((v): v is number => v !== null);
	if (vals.length === 0) return EMPTY_SCALE;
	return niceScale(Math.min(...vals), Math.max(...vals), count);
}

/** Usable plot width in viewBox units. */
export function plotWidth(): number {
	return CHART_WIDTH - CHART_PAD.left - CHART_PAD.right;
}

/** Usable plot height in viewBox units. */
export function plotHeight(): number {
	return CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom;
}

/** X coordinate for point index `i` of `n`, spanning the plot area. */
export function chartX(i: number, n: number): number {
	const denom = n > 1 ? n - 1 : 1;
	return CHART_PAD.left + (i / denom) * plotWidth();
}

/** Y coordinate for value `v` under `scale`, spanning the plot area. */
export function chartY(v: number, scale: YScale): number {
	const span = scale.max - scale.min || 1;
	const f = (v - scale.min) / span;
	return CHART_PAD.top + (1 - f) * plotHeight();
}

/**
 * SVG path `d` for the series, breaking the pen at every null so a missing
 * period is never interpolated across (UI-UX §6 断线). Coordinates round to one
 * decimal for stable, readable output.
 */
export function buildLinePath(
	points: readonly SeriesPoint[],
	scale: YScale,
): string {
	const n = points.length;
	let d = '';
	let pen = false;
	points.forEach((p, i) => {
		if (p.value === null) {
			pen = false;
			return;
		}
		d += `${pen ? 'L' : 'M'}${chartX(i, n).toFixed(1)},${chartY(
			p.value,
			scale,
		).toFixed(1)}`;
		pen = true;
	});
	return d;
}

/** Indices of null (missing) points — where the chart draws a gap marker. */
export function gapIndices(points: readonly SeriesPoint[]): number[] {
	const out: number[] = [];
	points.forEach((p, i) => {
		if (p.value === null) out.push(i);
	});
	return out;
}

/** Index of the most recent non-null point, or -1 when there is none. */
export function lastNonNullIndex(points: readonly SeriesPoint[]): number {
	for (let i = points.length - 1; i >= 0; i--) {
		const p = points[i];
		if (p && p.value !== null) return i;
	}
	return -1;
}

/** Up to `maxTicks` evenly spaced indices for x-axis date labels. */
export function xTickIndices(n: number, maxTicks = 6): number[] {
	if (n <= 0) return [];
	if (n <= maxTicks) return Array.from({ length: n }, (_, i) => i);
	const step = (n - 1) / (maxTicks - 1);
	return Array.from({ length: maxTicks }, (_, k) => Math.round(k * step));
}

/** Compact y-tick label: integers bare, otherwise one decimal. */
export function formatTick(v: number): string {
	return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
