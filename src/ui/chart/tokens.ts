/**
 * Chart color tokens (M3-T2 / spec §5, UI-UX §8.5).
 *
 * ECharts paints onto a canvas, which cannot resolve a CSS `var()`, so the chart
 * needs concrete color strings. These tokens are the single source of truth for
 * the chart palette and mirror the `--mcd-*` custom properties in `styles.css`
 * §1. At runtime the glue reads the live values through `resolveChartTokens` so
 * the chart follows the Obsidian theme (light/dark) instead of hardcoding a
 * color; the defaults below are the safety net for an unset variable and the
 * literal palette the pure option-builder tests assert against.
 */

/** A concrete chart palette (resolved colors, never CSS variables). */
export interface ChartTokens {
	accent: string;
	wire: string;
	amber: string;
	grid: string;
	text: string;
	muted: string;
	surface: string;
	border: string;
}

/** The `--mcd-*` custom-property name behind each `ChartTokens` field. */
export const CHART_TOKEN_VARS: Record<keyof ChartTokens, string> = {
	accent: '--mcd-accent',
	wire: '--mcd-wire',
	amber: '--mcd-amber',
	grid: '--mcd-grid',
	text: '--mcd-text',
	muted: '--mcd-muted',
	surface: '--mcd-pop',
	border: '--mcd-stroke',
};

/**
 * Defaults mirroring `styles.css` §1. The plugin-owned colors are literal; the
 * theme-bound ones (grid/text/muted) use neutral values that read on both themes
 * and are always overridden at runtime by `resolveChartTokens`.
 */
export const DEFAULT_CHART_TOKENS: ChartTokens = {
	accent: 'Highlight',
	wire: 'GrayText',
	amber: 'GrayText',
	grid: 'GrayText',
	text: 'CanvasText',
	muted: 'GrayText',
	surface: 'Canvas',
	border: 'GrayText',
};

/**
 * Read the live `--mcd-*` values through `getVar` (the glue passes a
 * `getComputedStyle(root).getPropertyValue` closure) and fall back to `fallback`
 * for any variable that resolves to an empty string, so a detached or unthemed
 * container still yields a usable palette.
 */
export function resolveChartTokens(
	getVar: (name: string) => string,
	fallback: ChartTokens = DEFAULT_CHART_TOKENS,
): ChartTokens {
	const read = (key: keyof ChartTokens): string => {
		const value = getVar(CHART_TOKEN_VARS[key]).trim();
		return value === '' ? fallback[key] : value;
	};
	return {
		accent: read('accent'),
		wire: read('wire'),
		amber: read('amber'),
		grid: read('grid'),
		text: read('text'),
		muted: read('muted'),
		surface: read('surface'),
		border: read('border'),
	};
}
