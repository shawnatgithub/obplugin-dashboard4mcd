/**
 * Transform layer (M3-T1 / spec §4, D-M3-1 yoy consumption).
 *
 * Turns the displayed series into the one the reader asked for: `level` shows
 * the raw contract values, `yoy` consumes the sibling `_yoy` series when the
 * contract provides one and otherwise derives the same-month-one-year-back
 * ratio, `mom` derives the previous-month ratio. Every rule is total and honest:
 * a missing input period yields a null result (never interpolated, never 0), and
 * a divide-by-zero or an absent counterpart is null rather than Infinity.
 *
 * Pure (no DOM / Obsidian / ECharts), so it is unit-testable in isolation. The
 * derivation assumes a monthly `YYYY-MM` date grain; any other grain without a
 * sibling yields nulls rather than a guessed ratio (D5/D10: never fabricate).
 */

import type { SeriesPoint } from '../contract/types';

/** Which derived series the toolbar's 变换 segment asks for. */
export type TransformKey = 'level' | 'yoy' | 'mom';

/** A monthly period label `YYYY-MM` (the only grain we derive ratios for). */
const MONTHLY = /^\d{4}-\d{2}$/;

/** `YYYY-MM` shifted by whole years (used for the yoy counterpart). */
function shiftYears(date: string, years: number): string {
	const y = Number(date.slice(0, 4));
	return `${y + years}-${date.slice(5)}`;
}

/** The calendar month before `YYYY-MM`, crossing the year boundary. */
function previousMonth(date: string): string {
	const y = Number(date.slice(0, 4));
	const m = Number(date.slice(5, 7));
	return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** `(cur/prev - 1) * 100`, or null when either side is missing or zero. */
function ratio(cur: number | null, prev: number | null | undefined): number | null {
	if (cur === null || prev === null || prev === undefined || prev === 0) return null;
	return (cur / prev - 1) * 100;
}

/**
 * Produce the series to plot for `transform`. `sibling` is the contract's own
 * `_yoy` series (from `panel.transforms.yoy.source`); when present it is the
 * authority for yoy and is returned as-is. Otherwise yoy/mom are derived from
 * `base` by calendar-month matching, so gaps never shift the comparison.
 */
export function applyTransform(
	base: readonly SeriesPoint[],
	transform: TransformKey,
	sibling: readonly SeriesPoint[] | null,
): SeriesPoint[] {
	if (transform === 'level') return base.map((p) => ({ ...p }));
	if (transform === 'yoy' && sibling) return sibling.map((p) => ({ ...p }));

	const byDate = new Map<string, number | null>();
	for (const p of base) byDate.set(p.date, p.value);

	return base.map((p) => {
		if (!MONTHLY.test(p.date)) return { ...p, value: null };
		const prevDate =
			transform === 'yoy' ? shiftYears(p.date, -1) : previousMonth(p.date);
		return { ...p, value: ratio(p.value, byDate.get(prevDate)) };
	});
}
