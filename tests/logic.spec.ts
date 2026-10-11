import { mergeSettings } from '../src/logic';

// These tests exercise the extracted pure logic. Because `src/logic.ts` has no
// runtime dependency on the Obsidian API, they run without touching the
// `__mocks__/obsidian.ts` stub at all.
describe('mcd pure logic', () => {
	it('merges loaded data on top of the default settings', () => {
		const defaults = { dataDir: '' };

		expect(mergeSettings(defaults, { dataDir: 'D:/etl/processed' })).toEqual({
			dataDir: 'D:/etl/processed',
		});
	});

	it('falls back to the defaults when there is no saved data', () => {
		const defaults = { dataDir: '' };

		expect(mergeSettings(defaults, null)).toEqual(defaults);
		expect(mergeSettings(defaults, undefined)).toEqual(defaults);
	});

	it('does not mutate the defaults object', () => {
		const defaults = { dataDir: '' };

		mergeSettings(defaults, { dataDir: 'x' });

		expect(defaults).toEqual({ dataDir: '' });
	});
});
