/**
 * Pure, Obsidian-free logic shared by the plugin.
 *
 * Anything that needs the Obsidian API is injected by the caller (see
 * `main.ts`) instead of being imported as a runtime value, which keeps this
 * module unit-testable without the Obsidian runtime.
 */

/**
 * Merge data loaded from disk on top of the default settings so that any
 * setting introduced in a newer version still falls back to a sane value.
 * Used by `McdPlugin.loadSettings()`.
 */
export function mergeSettings<T extends object>(
	defaults: T,
	loaded: Partial<T> | null | undefined,
): T {
	return Object.assign({}, defaults, loaded ?? {});
}
