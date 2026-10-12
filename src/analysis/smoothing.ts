/**
 * Smoothing switch (M3-T1 / spec §4, D-M3-7).
 *
 * The curve itself is ECharts `smooth`; this pure helper only normalizes the
 * view flag so the chart model never guesses. Smoothing is a visual aid between
 * adjacent *observed* points — it never reconnects across a missing period
 * (`connectNulls` stays false in the option builder, UI-UX §6 断线).
 */

/** True when the reader has turned smoothing on. */
export function isSmoothingOn(view: { smoothing: boolean }): boolean {
	return view.smoothing === true;
}
