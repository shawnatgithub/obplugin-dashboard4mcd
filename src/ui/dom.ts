/**
 * Tiny DOM helpers.
 *
 * The renderers build the dashboard with standard DOM APIs (not Obsidian's
 * `createEl`/`createDiv` augmentations) so they stay Obsidian-free and can be
 * exercised under jsdom without the runtime — the same philosophy as
 * `src/logic.ts`.
 */

const SVG_NS = 'http://www.w3.org/2000/svg' as const;

/** Remove every child of `node` (dependency-free equivalent of `.empty()`). */
export function clearEl(node: HTMLElement): void {
	while (node.firstChild) node.removeChild(node.firstChild);
}

/** Create an HTML element with an optional class list and text content. */
export function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className?: string,
	text?: string,
): HTMLElementTagNameMap[K] {
	const node: HTMLElement = document.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node as HTMLElementTagNameMap[K];
}

/** Create an SVG element with attributes (values are stringified). */
export function svgEl<K extends keyof SVGElementTagNameMap>(
	tag: K,
	attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
	const node = document.createElementNS(SVG_NS, tag);
	if (attrs) {
		for (const [key, value] of Object.entries(attrs)) {
			node.setAttribute(key, String(value));
		}
	}
	return node;
}
