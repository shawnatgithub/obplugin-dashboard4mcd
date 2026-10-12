/**
 * Spring-festival merge detection (M3-T1 / spec §4, D-M3-8).
 *
 * The frozen retail series carries a null February every year because the NBS
 * reports January-February as one combined figure for the spring festival. This
 * module only *locates* those spans so the chart can highlight them and the
 * detail page can carry the mandatory amber annotation (UI-UX §6 春节合并). It
 * never synthesizes a merged value — a missing period stays missing
 * (null_not_zero, D5/D10).
 *
 * Pure (no DOM / Obsidian / ECharts).
 */

import type { SeriesPoint } from '../contract/types';

/** A January-February window flagged as a spring-festival merged period. */
export interface SpringFestivalSpan {
	/** Calendar year the merge belongs to (e.g. `2012`). */
	year: string;
	/** Index of January in the series, or of February when January is absent. */
	startIndex: number;
	/** Index of the (null) February point. */
	endIndex: number;
}

/** A February period label `YYYY-02`. */
const FEBRUARY = /^\d{4}-02$/;

/**
 * Find every year whose February is present but null (the merge placeholder).
 * When the matching January is also in the series the span covers both; when
 * January was never released the span is the single February index. Spans come
 * back in series order.
 */
export function detectSpringFestival(
	points: readonly SeriesPoint[],
): SpringFestivalSpan[] {
	const indexByDate = new Map<string, number>();
	points.forEach((p, i) => indexByDate.set(p.date, i));

	const spans: SpringFestivalSpan[] = [];
	points.forEach((p, i) => {
		if (p.value !== null || !FEBRUARY.test(p.date)) return;
		const year = p.date.slice(0, 4);
		const janIndex = indexByDate.get(`${year}-01`);
		spans.push({
			year,
			startIndex: janIndex !== undefined ? janIndex : i,
			endIndex: i,
		});
	});
	return spans;
}
