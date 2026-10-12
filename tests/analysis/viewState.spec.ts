/**
 * ViewState parsing (M3-T2 / spec §6, D-M3-9). The detail leaf persists its
 * `view_state` and restores it on reload (G7); an older or partial blob (e.g.
 * M2's `{key}`) or a hand-edited value must degrade field-by-field to a default
 * rather than throw or yield an invalid chart. Pure, so it is unit-tested here.
 */

import {
	DEFAULT_VIEW_STATE,
	parseViewState,
} from '../../src/analysis/viewState';

describe('parseViewState', () => {
	it('fills every default for an empty object', () => {
		expect(parseViewState({})).toEqual({ key: '', ...DEFAULT_VIEW_STATE });
	});

	it('fills every default for null and undefined', () => {
		expect(parseViewState(null)).toEqual({ key: '', ...DEFAULT_VIEW_STATE });
		expect(parseViewState(undefined)).toEqual({ key: '', ...DEFAULT_VIEW_STATE });
	});

	it('keeps every valid field', () => {
		expect(
			parseViewState({
				key: 'retail_sales_total',
				mode: 'yoy',
				chartType: 'bar',
				transform: 'mom',
				overlay: 'cpi_national_yoy',
				range: '3y',
				smoothing: true,
			}),
		).toEqual({
			key: 'retail_sales_total',
			mode: 'yoy',
			chartType: 'bar',
			transform: 'mom',
			overlay: 'cpi_national_yoy',
			range: '3y',
			smoothing: true,
		});
	});

	it('falls back per field on invalid enum values', () => {
		expect(
			parseViewState({
				key: 'x',
				mode: 'nope',
				chartType: 'pie',
				transform: 'zzz',
				range: '10y',
			}),
		).toEqual({
			key: 'x',
			mode: 'calendar',
			chartType: 'line',
			transform: 'level',
			overlay: null,
			range: 'all',
			smoothing: false,
		});
	});

	it('treats a non-string overlay and a non-true smoothing as off', () => {
		const parsed = parseViewState({ key: 'x', overlay: 42, smoothing: 'yes' });
		expect(parsed.overlay).toBeNull();
		expect(parsed.smoothing).toBe(false);
	});

	it('restores an M2-era {key} state with defaults', () => {
		expect(parseViewState({ key: 'retail_sales_total' })).toEqual({
			key: 'retail_sales_total',
			...DEFAULT_VIEW_STATE,
		});
	});
});
