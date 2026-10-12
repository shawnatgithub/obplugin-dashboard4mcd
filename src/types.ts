/**
 * Shared domain types for the macro dashboard.
 *
 * These mirror the data contract of the Overview prototype
 * (`prototype/mcd-console/src/screens/Overview.tsx`), which is the visual and
 * data authority for S1 (docs/宏观数据面板_UI-UX设计指导.md §1, §8.2).
 * Keeping them here (Obsidian-free) lets both the pure logic and the DOM
 * renderers depend on a single source of truth.
 */

/**
 * Freshness four-state (mirrors the contract `Freshness`, G16). Labels are
 * resolved in `format.ts` (single source). `unknown` = cannot be determined
 * yet (missing release config / first fetch), shown as a neutral dot.
 */
export type Fresh = 'fresh' | 'aging' | 'stale' | 'unknown';

/** Direction of the period-over-period change. */
export type DeltaDir = 'up' | 'down' | 'flat';

/**
 * Period-over-period change. `v` is the absolute magnitude as a string; the
 * unit for a rate's difference is `pct` (UI-UX §9 待裁决 #3, resolved to pct).
 */
export interface Delta {
	dir: DeltaDir;
	v?: string;
}

/** Card corner badge. `手动` = manually sourced; `NEW` = newly added series. */
export type Badge = 'NEW' | '手动';

/** A single metric card in the overview grid. */
export interface MetricCard {
	name: string;
	/**
	 * Contract key (manifest `indicators[].key`), used to open the detail view
	 * (T7 navigation). Absent on bundled sample cards, which have no key.
	 */
	key?: string;
	/** Current value, already formatted as a string (may be `—` when missing). */
	value: string;
	unit: string;
	delta?: Delta;
	/** Data period label, e.g. `2026-09` or `2026-Q1`. */
	period: string;
	fresh: Fresh;
	badge?: Badge;
	/** When set, the card shows this expired note instead of a sparkline. */
	expired?: string;
	/** Deterministic seed for the placeholder sparkline shape (sample cards). */
	seed: number;
	/**
	 * Real values for the sparkline, most recent last (≤ 24 points, `null` =
	 * a missing period). When present it takes precedence over `seed`, so the
	 * mini chart shows actual data instead of the placeholder shape.
	 */
	spark?: (number | null)[];
	/**
	 * Indices of missing periods within `spark` (or the 24-point placeholder);
	 * the sparkline breaks there and draws a dashed marker.
	 */
	gaps?: number[];
}

/** A titled group of metric cards. */
export interface MetricGroup {
	title: string;
	cards: MetricCard[];
}
