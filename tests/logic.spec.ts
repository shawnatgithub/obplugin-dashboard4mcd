import type { Notice } from 'obsidian';
import {
	RIBBON_NOTICE_MESSAGE,
	mergeSettings,
	showRibbonNotice,
} from '../src/logic';

// These tests exercise the extracted pure logic. Because `src/logic.ts` has no
// runtime dependency on the Obsidian API, they run without touching the
// `__mocks__/obsidian.ts` stub at all.
describe('mcd pure logic', () => {
	it('merges loaded data on top of the default settings', () => {
		const defaults = { mySetting: 'default' };

		expect(mergeSettings(defaults, { mySetting: 'custom' })).toEqual({
			mySetting: 'custom',
		});
	});

	it('falls back to the defaults when there is no saved data', () => {
		const defaults = { mySetting: 'default' };

		expect(mergeSettings(defaults, null)).toEqual(defaults);
		expect(mergeSettings(defaults, undefined)).toEqual(defaults);
	});

	it('shows the ribbon notice through the injected Notice constructor', () => {
		const shown: string[] = [];
		class FakeNotice {
			constructor(message: string) {
				shown.push(message);
			}
		}

		showRibbonNotice(FakeNotice as unknown as new (message: string) => Notice);

		expect(shown).toEqual([RIBBON_NOTICE_MESSAGE]);
	});
});
