/**
 * Pure sparkline geometry.
 *
 * Ported verbatim from the Overview prototype's `shape()` / `Sparkline`
 * (`prototype/mcd-console/src/screens/Overview.tsx`). The 24-point shape is a
 * deterministic pseudo-random *placeholder*, not real data — the footnote and
 * banner in the view say so explicitly (data-honesty rules, UI-UX §6).
 *
 * This module has no DOM or Obsidian dependency so it can be unit tested.
 */

/** Number of periods drawn in a mini sparkline. */
export const SPARK_POINTS = 24;
/** SVG viewBox width. */
export const SPARK_WIDTH = 300;
/** SVG viewBox height. */
export const SPARK_HEIGHT = 40;
/** Vertical padding so the line never touches the top/bottom edges. */
const SPARK_PAD_Y = 3;

/**
 * Deterministic 24-point placeholder shape in the range [0.08, 0.92].
 * Same seed always yields the same series (stable across renders).
 */
export function shape(seed: number): number[] {
	let s = seed * 9301 + 49297;
	let v = 0.5;
	const out: number[] = [];
	for (let i = 0; i < SPARK_POINTS; i++) {
		s = (s * 9301 + 49297) % 233280;
		v = Math.min(0.92, Math.max(0.08, v + (s / 233280 - 0.5) * 0.28));
		out.push(v);
	}
	return out;
}

/** X coordinate (viewBox units) for period index `i` out of `n` points. */
export function sparkX(i: number, n: number = SPARK_POINTS): number {
	const denom = n > 1 ? n - 1 : 1;
	return (i / denom) * SPARK_WIDTH;
}

/** Y coordinate (viewBox units) for normalized value `f` in [0, 1]. */
export function sparkY(f: number): number {
	return SPARK_PAD_Y + (1 - f) * (SPARK_HEIGHT - SPARK_PAD_Y * 2);
}

/**
 * Build the SVG path `d` for a series, breaking the pen at every missing
 * period so gaps are never interpolated across (UI-UX §6 断线).
 *
 * The x-scale adapts to `pts.length`, so a real series shorter than 24 points
 * still spans the full width; a 24-point input is unchanged. Coordinates are
 * rounded to one decimal, matching the prototype output.
 */
export function buildSparkPath(
	pts: readonly number[],
	gaps: readonly number[] = [],
): string {
	const gapSet = new Set(gaps);
	const n = pts.length;
	let d = '';
	let pen = false;
	pts.forEach((f, i) => {
		if (gapSet.has(i)) {
			pen = false;
			return;
		}
		d += `${pen ? 'L' : 'M'}${sparkX(i, n).toFixed(1)},${sparkY(f).toFixed(1)}`;
		pen = true;
	});
	return d;
}

/**
 * Normalize real values into the [0.08, 0.92] drawing band so a live series
 * uses the same vertical range as the placeholder `shape()`. Min/max are taken
 * over the non-null values; a `null` (missing period) maps to a mid
 * placeholder that `buildSparkPath` skips via the gap set. A flat series (or
 * one with no values) collapses to the band midpoint. One entry per input.
 */
export function normalizeSpark(values: readonly (number | null)[]): number[] {
	const nums = values.filter((v): v is number => v !== null);
	const lo = 0.08;
	const hi = 0.92;
	if (nums.length === 0) return values.map(() => (lo + hi) / 2);
	const min = Math.min(...nums);
	const max = Math.max(...nums);
	const span = max - min;
	return values.map((v) => {
		if (v === null) return (lo + hi) / 2;
		if (span === 0) return (lo + hi) / 2;
		return lo + ((v - min) / span) * (hi - lo);
	});
}

/** Indices of `null` (missing) entries — where the sparkline breaks and marks. */
export function sparkGaps(values: readonly (number | null)[]): number[] {
	const out: number[] = [];
	values.forEach((v, i) => {
		if (v === null) out.push(i);
	});
	return out;
}
