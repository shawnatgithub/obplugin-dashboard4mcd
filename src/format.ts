/**
 * Pure presentation formatting.
 *
 * Every user-facing string derived from data lives here so the wording has a
 * single source of truth (D8) and can be tested without the DOM. Values follow
 * the Overview prototype source (UI-UX §8.2), which also resolves the §9
 * pending decisions (freshness labels, delta unit, page title).
 */

import type { Delta, Fresh, MetricCard } from './types';

/** Freshness tri-state → label (UI-UX §9 #2, resolved to the prototype set). */
export const FRESHNESS_LABEL: Record<Fresh, string> = {
	fresh: '最新',
	aging: '临近截止',
	stale: '已过期',
};

/** Human label for a freshness state. */
export function freshnessLabel(fresh: Fresh): string {
	return FRESHNESS_LABEL[fresh];
}

/** CSS class list for the freshness dot (`styles.css` §6). */
export function freshnessDotClass(fresh: Fresh): string {
	return `mcd-dot is-${fresh}`;
}

/**
 * Period-over-period delta text.
 * `flat` → `→ 持平`; otherwise `↑`/`↓` + magnitude + `pct` (UI-UX §9 #3).
 * Returns null when there is no delta to show.
 */
export function deltaText(delta?: Delta): string | null {
	if (!delta) return null;
	if (delta.dir === 'flat') return '→ 持平';
	const arrow = delta.dir === 'up' ? '↑' : '↓';
	return `${arrow} ${delta.v ?? ''}pct`;
}

/** `含 N 期缺失` when the series has gaps, else null. */
export function gapNote(gaps?: readonly number[]): string | null {
	if (!gaps || gaps.length === 0) return null;
	return `含 ${gaps.length} 期缺失`;
}

/** A card is in the expired state when it carries an `expired` note. */
export function isExpired(card: MetricCard): boolean {
	return Boolean(card.expired);
}

/** Placeholder shown in place of a sparkline when a card is expired. */
export const EXPIRED_SPARK_TEXT = '近 24 期无可用更新';
