import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_VIEW_STATE, type ViewState } from '../src/analysis/viewState';
import { parseCapabilities } from '../src/contract/parse';
import { reasonText } from '../src/contract/reasonText';
import type { CapabilitiesV1, FullPanel, StubPanel } from '../src/contract/types';
import { buildToolbar } from '../src/ui/toolbar';

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

function toolbarFor(
	key: string | null,
	view?: ViewState,
	onChange: (patch: Partial<ViewState>) => void = () => {},
): HTMLElement {
	const panel = key === null ? null : panelFor(key);
	const root = document.createElement('div');
	document.body.appendChild(root);
	root.appendChild(
		buildToolbar({
			panel,
			view: view ?? { ...DEFAULT_VIEW_STATE, key: key ?? '' },
			onChange,
		}),
	);
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

function overlaySelect(toolbar: HTMLElement): HTMLSelectElement {
	const sel = segment(toolbar, '叠加').querySelector<HTMLSelectElement>(
		'select.mcd-select',
	);
	if (!sel) throw new Error('overlay select not found');
	return sel;
}

function overlayOption(sel: HTMLSelectElement, value: string): HTMLOptionElement {
	const found = Array.from(sel.options).find((o) => o.value === value);
	if (!found) throw new Error(`overlay option not found: ${value}`);
	return found;
}

function optionValues(sel: HTMLSelectElement): string[] {
	return Array.from(sel.options).map((o) => o.value);
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
		expect(labels).toEqual(['模式', '图型', '变换', '叠加', '范围', '平滑']);
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

	it('offers 无 plus a supported overlay candidate, enabled and unselected', () => {
		const sel = overlaySelect(toolbar);
		expect(optionValues(sel)).toEqual(['none', 'cpi_national_yoy']);
		expect(overlayOption(sel, 'cpi_national_yoy').disabled).toBe(false);
		expect(sel.disabled).toBe(false);
		expect(sel.value).toBe('none');
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

	it('grays a unit-mismatched overlay option with its reason', () => {
		const sel = overlaySelect(toolbar);
		const overlay = overlayOption(sel, 'retail_sales_total');
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
		// The overlay control is a <select> now, so the grayed buttons live in
		// the mode / chart / transform / range / smoothing segments.
		const all = items(segment(toolbar, '模式'))
			.concat(items(segment(toolbar, '图型')))
			.concat(items(segment(toolbar, '变换')))
			.concat(items(segment(toolbar, '范围')))
			.concat(items(segment(toolbar, '平滑')));
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
	it('renders a single 无 option and disables the control with no candidates', () => {
		const sel = overlaySelect(toolbarFor('retail_sales_total_yoy'));
		expect(optionValues(sel)).toEqual(['none']);
		expect(sel.disabled).toBe(true);
	});
});

describe('buildToolbar — absent capabilities', () => {
	it('degrades to all-enabled defaults without graying anything', () => {
		const toolbar = toolbarFor(null);
		expect(selectedValues(segment(toolbar, '模式'))).toEqual(['calendar']);
		expect(selectedValues(segment(toolbar, '图型'))).toEqual(['line']);
		expect(selectedValues(segment(toolbar, '变换'))).toEqual(['level']);
		// The three capability segments are fully enabled; the overlay select
		// offers only 无 (no candidates) and is disabled as honestly empty.
		const capabilityItems = items(segment(toolbar, '模式'))
			.concat(items(segment(toolbar, '图型')))
			.concat(items(segment(toolbar, '变换')));
		expect(capabilityItems.some((i) => i.disabled)).toBe(false);
		expect(optionValues(overlaySelect(toolbar))).toEqual(['none']);
	});
});

describe('buildToolbar — controlled interaction (M3-T4)', () => {
	it('emits a chartType patch when an enabled chart button is clicked', () => {
		const onChange = jest.fn();
		const toolbar = toolbarFor('retail_sales_total', undefined, onChange);
		item(segment(toolbar, '图型'), 'table').click();
		expect(onChange).toHaveBeenCalledWith({ chartType: 'table' });
	});

	it('emits mode / transform / range patches from their segments', () => {
		const onChange = jest.fn();
		const toolbar = toolbarFor('retail_sales_total', undefined, onChange);
		item(segment(toolbar, '模式'), 'yoy').click();
		item(segment(toolbar, '变换'), 'yoy').click();
		item(segment(toolbar, '范围'), '1y').click();
		expect(onChange).toHaveBeenNthCalledWith(1, { mode: 'yoy' });
		expect(onChange).toHaveBeenNthCalledWith(2, { transform: 'yoy' });
		expect(onChange).toHaveBeenNthCalledWith(3, { range: '1y' });
	});

	it('never fires onChange for a disabled control and never throws', () => {
		const onChange = jest.fn();
		const toolbar = toolbarFor('retail_sales_total', undefined, onChange);
		const mom = item(segment(toolbar, '变换'), 'mom');
		expect(mom.disabled).toBe(true);
		expect(() => mom.click()).not.toThrow();
		expect(onChange).not.toHaveBeenCalled();
	});

	it('renders the four range options with the persisted one selected', () => {
		const toolbar = toolbarFor('retail_sales_total', {
			...DEFAULT_VIEW_STATE,
			key: 'retail_sales_total',
			range: '3y',
		});
		const seg = segment(toolbar, '范围');
		expect(items(seg).map((i) => i.dataset.value)).toEqual([
			'1y',
			'3y',
			'5y',
			'all',
		]);
		expect(selectedValues(seg)).toEqual(['3y']);
	});

	it('reflects smoothing in aria-pressed and toggles it off via onChange', () => {
		const onChange = jest.fn();
		const toolbar = toolbarFor(
			'retail_sales_total',
			{ ...DEFAULT_VIEW_STATE, key: 'retail_sales_total', smoothing: true },
			onChange,
		);
		const toggle = item(segment(toolbar, '平滑'), 'smoothing');
		expect(toggle.getAttribute('aria-pressed')).toBe('true');
		expect(toggle.classList.contains('is-selected')).toBe(true);
		toggle.click();
		expect(onChange).toHaveBeenCalledWith({ smoothing: false });
	});

	it('shows smoothing off by default and turns it on', () => {
		const onChange = jest.fn();
		const toolbar = toolbarFor('retail_sales_total', undefined, onChange);
		const toggle = item(segment(toolbar, '平滑'), 'smoothing');
		expect(toggle.getAttribute('aria-pressed')).toBe('false');
		toggle.click();
		expect(onChange).toHaveBeenCalledWith({ smoothing: true });
	});
});

describe('buildToolbar — overlay select (M3-T4)', () => {
	it('labels an INCOMPATIBLE_REGION candidate 拆分双图 and keeps it selectable', () => {
		const sel = overlaySelect(toolbarFor('retail_sales_sh_yoy'));
		const opt = overlayOption(sel, 'retail_sales_total');
		expect(opt.disabled).toBe(false);
		expect(opt.textContent).toContain('拆分双图');
	});

	it('emits an overlay patch on change and null for 无', () => {
		const onChange = jest.fn();
		const sel = overlaySelect(
			toolbarFor('retail_sales_total', undefined, onChange),
		);
		sel.value = 'cpi_national_yoy';
		sel.dispatchEvent(new Event('change'));
		expect(onChange).toHaveBeenCalledWith({ overlay: 'cpi_national_yoy' });
		sel.value = 'none';
		sel.dispatchEvent(new Event('change'));
		expect(onChange).toHaveBeenCalledWith({ overlay: null });
	});

	it('reflects the persisted overlay as the selected value', () => {
		const sel = overlaySelect(
			toolbarFor('retail_sales_total', {
				...DEFAULT_VIEW_STATE,
				key: 'retail_sales_total',
				overlay: 'cpi_national_yoy',
			}),
		);
		expect(sel.value).toBe('cpi_national_yoy');
	});
});
