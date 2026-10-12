/**
 * Overlay eligibility (M3-T1 / spec §4, D-M3-5 / D-M3-6).
 *
 * A faithful consumer of the frozen capabilities matrix — it never re-judges
 * the contract's axis decision. A supported `single`-axis candidate overlays on
 * one axis once the two series share at least `min_overlap_months` of history;
 * an `INCOMPATIBLE_REGION` candidate becomes a split dual-chart (UI-UX §6
 * forbids mixing regions on one axis); any other unsupported reason blocks with
 * its own reason_code so the control can explain itself. Absent capabilities or
 * an unknown target degrade to `none` rather than throwing.
 *
 * Pure (no DOM / Obsidian / ECharts).
 */

import { isStub } from '../contract/reasonText';
import type { Panel, ReasonCode, SeriesPoint } from '../contract/types';

/** What the overlay dropdown's current selection resolves to. */
export type OverlayDecision =
	| { kind: 'none' }
	| { kind: 'single'; targetKey: string; minOverlap: number }
	| { kind: 'dual'; targetKey: string }
	| { kind: 'blocked'; targetKey: string; reason: ReasonCode };

/** Periods with a non-null value in both series (the meaningful overlap). */
function overlapMonths(
	base: readonly SeriesPoint[],
	target: readonly SeriesPoint[] | null,
): number {
	if (!target) return 0;
	const targetDates = new Set(
		target.filter((p) => p.value !== null).map((p) => p.date),
	);
	return base.filter((p) => p.value !== null && targetDates.has(p.date)).length;
}

/**
 * Resolve the overlay selection for one indicator. `targetKey` is the dropdown
 * value (null = 无); `basePoints` / `targetPoints` are the revision-collapsed
 * series used only to measure overlap against `min_overlap_months`.
 */
export function resolveOverlay(
	panel: Panel,
	targetKey: string | null,
	basePoints: readonly SeriesPoint[],
	targetPoints: readonly SeriesPoint[] | null,
): OverlayDecision {
	if (targetKey === null) return { kind: 'none' };
	// No capabilities → nothing is known to be overlayable; degrade, don't guess.
	if (panel === null) return { kind: 'none' };
	if (isStub(panel)) {
		return { kind: 'blocked', targetKey, reason: panel.reason_code };
	}

	const entry = panel.overlays[targetKey];
	if (!entry) return { kind: 'none' };

	if (!entry.supported) {
		const reason = entry.reason_code;
		// A cross-region candidate is not an error to hide — it can be split.
		if (reason === 'INCOMPATIBLE_REGION') return { kind: 'dual', targetKey };
		return { kind: 'blocked', targetKey, reason: reason ?? 'UNIT_MISMATCH' };
	}

	// Supported: honor the contract's axis_mode; a non-single axis cannot share
	// one scale, so it is blocked rather than silently mis-drawn (D-M3-5).
	if (entry.axis_mode !== 'single') {
		return { kind: 'blocked', targetKey, reason: 'UNIT_MISMATCH' };
	}
	const minOverlap = entry.min_overlap_months ?? 0;
	if (overlapMonths(basePoints, targetPoints) < minOverlap) {
		return { kind: 'blocked', targetKey, reason: 'INSUFFICIENT_HISTORY' };
	}
	return { kind: 'single', targetKey, minOverlap };
}
