import type { Notice } from 'obsidian';

/**
 * Pure, Obsidian-free logic extracted from the plugin so it can be unit tested
 * without the Obsidian runtime.
 *
 * Anything that needs the Obsidian API is injected by the caller (see
 * `main.ts`) instead of being imported as a runtime value. `Notice` above is a
 * type-only import, so it is erased at build time and leaves this module with
 * no runtime dependency on `obsidian`.
 */

/** Message shown when the user clicks the ribbon icon. */
export const RIBBON_NOTICE_MESSAGE = 'This is a notice!';

/**
 * Merge data loaded from disk on top of the default settings so that any
 * setting introduced in a newer version still falls back to a sane value.
 * Extracted from `McdPlugin.loadSettings()`.
 */
export function mergeSettings<T extends object>(
	defaults: T,
	loaded: Partial<T> | null | undefined,
): T {
	return Object.assign({}, defaults, loaded ?? {});
}

/**
 * Show the ribbon notice. The Obsidian `Notice` constructor is passed in by the
 * caller, which keeps this module free of a runtime dependency on the Obsidian
 * API and lets tests inject a lightweight stub instead.
 */
export function showRibbonNotice(
	NoticeCtor: new (message: string) => Notice,
): void {
	new NoticeCtor(RIBBON_NOTICE_MESSAGE);
}
