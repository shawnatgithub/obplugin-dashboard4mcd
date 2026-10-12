import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseCapabilities } from '../src/contract/parse';
import { reasonText } from '../src/contract/reasonText';
import type { CapabilitiesV1, FullPanel, StubPanel } from '../src/contract/types';
import { UNSUPPORTED_FALLBACK, buildToolbar } from '../src/ui/toolbar';

/**
 * Capabilities graying engine tests (T3-5). The toolbar is built from the real
 * golden panels, so every asserted tooltip is the exact reason_code copy the
 * contract implies. These lock the §7 rules: an unsupported option is disabled
 * and explains itself (title + aria-disabled), a disabled option is never the
 * active one, the MVP default (calendar/line/level) falls back to the first
 * supported option, a stub grays everything, and an absent panel degrades to
 * all-enabled without throwing.
 */

const GOLDEN = path.resolve(
	__dirname,
	'..',
	'tests',
	'golden',
	'contract',
	'processed',
);

function loadCaps(): CapabilitiesV1 {
	const json: unknown = JSON.parse(
		readFileSync(path.join(GOLDEN, 'capabilities.json'), 'utf8'),
	);
	const r = parseCapabilities(json);
	if (!r.ok) throw new Error('capabilities parse failed');
	return r.value;
}

const caps = loadCaps();

function panelFor(key: string): FullPanel | StubPanel {
	const p = caps.panels[key];
	if (!p) throw new Error(`panel not found: ${key}`);
	return p;
}

function toolbarFor(key: string | null): HTMLElement {
	const panel = key === null ? null : panelFor(key);
	const root = document.createElement('div');
	document.body.appendChild(root);
	root.appendChild(buildToolbar({ panel }));
	return root.querySelector<HTMLElement>('.mcd-toolbar')!;
}

function segment(toolbar: HTMLElement, label: string): HTMLElement {
	const groups = Array.from(
		toolbar.querySelectorAll<HTMLElement>('.mcd-toolbar__group'),
	);
	const found = groups.find(
		(g) => g.querySelector('.mcd-toolbar__label')?.textContent === label,
	);
	if (!found) throw new Error(`segment not found: ${label}`);
	return found;
}

function items(seg: HTMLElement): HTMLButtonElement[] {
	return Array.from(seg.querySelectorAll<HTMLButtonElement>('.mcd-segmented__item'));
}

function item(seg: HTMLElement, value: string): HTMLButtonElement {
	const found = items(seg).find((i) => i.dataset.value === value);
	if (!found) throw new Error(`option not found: ${value}`);
	return found;
}

function selectedValues(seg: HTMLElement): string[] {
	return items(seg)
		.filter((i) => i.classList.contains('is-selected'))
		.map((i) => i.dataset.value!);
}

afterEach(() => {
	document.body.textContent = '';
});

describe('buildToolbar — layout', () => {
	it('renders the four labelled segments in order', () => {
		const toolbar = toolbarFor('retail_sales_total');
		expect(toolbar.getAttribute('role')).toBe('toolbar');
		const labels = Array.from(
			toolbar.querySelectorAll('.mcd-toolbar__label'),
		).map((l) => l.textContent);
		expect(labels).toEqual(['模式', '图型', '变换', '叠加']);
	});
});

describe('buildToolbar — full panel (retail_sales_total)', () => {
	const toolbar = toolbarFor('retail_sales_total');

	it('selects the MVP default mode and enables all three modes', () => {
		const seg = segment(toolbar, '模式');
		expect(selectedValues(seg)).toEqual(['calendar']);
		expect(items(seg).every((i) => !i.disabled)).toBe(true);
	});

	it('selects line and offers the whitelisted chart types', () => {
		const seg = segment(toolbar, '图型');
		expect(selectedValues(seg)).toEqual(['line']);
		expect(items(seg).map((i) => i.dataset.value)).toEqual([
			'line',
			'table',
			'calendar',
		]);
	});

	it('grays the mom transform with its reason_code copy', () => {
		const seg = segment(toolbar, '变换');
		expect(selectedValues(seg)).toEqual(['level']);
		const mom = item(seg, 'mom');
		expect(mom.disabled).toBe(true);
		expect(mom.classList.contains('is-disabled')).toBe(true);
		expect(mom.getAttribute('aria-disabled')).toBe('true');
		expect(mom.title).toBe(reasonText('DERIVED_NOT_FOUND'));
	});

	it('lists a supported overlay candidate, enabled and not active', () => {
		const seg = segment(toolbar, '叠加');
		const overlay = item(seg, 'cpi_national_yoy');
		expect(overlay.disabled).toBe(false);
		expect(selectedValues(seg)).toEqual([]);
	});
});

describe('buildToolbar — fallback active (cpi_national_yoy)', () => {
	const toolbar = toolbarFor('cpi_national_yoy');

	it('grays calendar and moves the active mode to the first supported', () => {
		const seg = segment(toolbar, '模式');
		const calendar = item(seg, 'calendar');
		expect(calendar.disabled).toBe(true);
		expect(calendar.title).toBe(reasonText('MISSING_MONTHS'));
		expect(selectedValues(seg)).toEqual(['seasonal_compare']);
	});

	it('grays the level transform and activates yoy instead', () => {
		const seg = segment(toolbar, '变换');
		expect(item(seg, 'level').title).toBe(reasonText('DERIVED_NOT_FOUND'));
		expect(selectedValues(seg)).toEqual(['yoy']);
	});

	it('grays an incompatible overlay with its reason', () => {
		const seg = segment(toolbar, '叠加');
		const overlay = item(seg, 'retail_sales_total');
		expect(overlay.disabled).toBe(true);
		expect(overlay.title).toBe(reasonText('UNIT_MISMATCH'));
	});
});

describe('buildToolbar — all modes grayed (disposable_income_yoy)', () => {
	const toolbar = toolbarFor('disposable_income_yoy');

	it('leaves no active mode when every mode is unsupported', () => {
		const seg = segment(toolbar, '模式');
		expect(items(seg).every((i) => i.disabled)).toBe(true);
		expect(items(seg).every((i) => i.title === reasonText('INCOMPATIBLE_FREQUENCY'))).toBe(
			true,
		);
		expect(selectedValues(seg)).toEqual([]);
	});

	it('offers only the whitelisted table chart type, active', () => {
		const seg = segment(toolbar, '图型');
		expect(items(seg).map((i) => i.dataset.value)).toEqual(['table']);
		expect(selectedValues(seg)).toEqual(['table']);
	});
});

describe('buildToolbar — stub panel (shanghai_finance_quarterly)', () => {
	const toolbar = toolbarFor('shanghai_finance_quarterly');

	it('grays every option across all segments with the stub reason', () => {
		const all = items(segment(toolbar, '模式'))
			.concat(items(segment(toolbar, '图型')))
			.concat(items(segment(toolbar, '变换')))
			.concat(items(segment(toolbar, '叠加')));
		expect(all.length).toBeGreaterThan(0);
		expect(all.every((i) => i.disabled)).toBe(true);
		expect(
			all.every((i) => i.title === reasonText('SOURCE_UNSUPPORTED')),
		).toBe(true);
	});

	it('selects nothing when no option is available', () => {
		expect(selectedValues(segment(toolbar, '模式'))).toEqual([]);
		expect(selectedValues(segment(toolbar, '图型'))).toEqual([]);
		expect(selectedValues(segment(toolbar, '变换'))).toEqual([]);
	});
});

describe('buildToolbar — empty overlays (retail_sales_total_yoy)', () => {
	it('renders a single disabled 无 option with the generic tooltip', () => {
		const seg = segment(toolbarFor('retail_sales_total_yoy'), '叠加');
		const none = items(seg);
		expect(none).toHaveLength(1);
		expect(none[0]!.dataset.value).toBe('none');
		expect(none[0]!.disabled).toBe(true);
		expect(none[0]!.title).toBe(UNSUPPORTED_FALLBACK);
	});
});

describe('buildToolbar — absent capabilities', () => {
	it('degrades to all-enabled defaults without graying anything', () => {
		const toolbar = toolbarFor(null);
		expect(selectedValues(segment(toolbar, '模式'))).toEqual(['calendar']);
		expect(selectedValues(segment(toolbar, '图型'))).toEqual(['line']);
		expect(selectedValues(segment(toolbar, '变换'))).toEqual(['level']);
		// The three capability segments are fully enabled; only the structural
		// 叠加 placeholder (no candidates) stays disabled.
		const capabilityItems = items(segment(toolbar, '模式'))
			.concat(items(segment(toolbar, '图型')))
			.concat(items(segment(toolbar, '变换')));
		expect(capabilityItems.some((i) => i.disabled)).toBe(false);
	});
});
