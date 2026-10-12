/**
 * Smoothing switch semantics (M3-T1 / spec §4, D-M3-7). The actual curve is
 * ECharts `smooth`; this pure helper only normalizes the view flag so the chart
 * model never has to guess. Smoothing never reconnects a missing period.
 */

import { isSmoothingOn } from '../../src/analysis/smoothing';

describe('isSmoothingOn', () => {
	it('is true when the view enables smoothing', () => {
		expect(isSmoothingOn({ smoothing: true })).toBe(true);
	});

	it('is false when the view disables smoothing', () => {
		expect(isSmoothingOn({ smoothing: false })).toBe(false);
	});
});
