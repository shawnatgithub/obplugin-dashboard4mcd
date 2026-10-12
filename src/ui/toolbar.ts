/**
 * Detail toolbar: the capabilities graying engine (T3-5) made controlled (M3-T4).
 *
 * Renders the 模式 / 图型 / 变换 segments, the 叠加 select, the 范围 segment and
 * the 平滑 toggle for one indicator, reading its capabilities panel so every
 * unsupported option is disabled and carries its `reason_code` copy in `title` +
 * `aria-disabled` (UI-UX §6 失败不静默). A disabled control never throws, is
 * never the active one, and never fires `onChange`.
 *
 * The toolbar is controlled (spec §6, G7): it reflects the persisted `view`
 * (ViewState) and reports every legal interaction through `onChange(patch)`,
 * which the detail view folds back into `view_state` and re-renders. The active
 * option of each capability segment is the persisted value when it is supported,
 * else the first supported one, else none when all are grayed.
 *
 * Pure DOM (no Obsidian), so it is testable under jsdom.
 */

import type { RangeKey } from '../analysis/range';
import type { TransformKey } from '../analysis/transform';
import type { ChartType, ModeKey, ViewState } from '../analysis/viewState';
import { isStub, reasonText } from '../contract/reasonText';
import type {
	FullPanel,
	OverlayEntry,
	Panel,
	ReasonCode,
} from '../contract/types';
import { el } from './dom';

/** A capabilities panel: full, source-unsupported stub, or absent (degraded). */
export type { Panel };

export interface ToolbarProps {
	panel: Panel;
	/** The persisted view state the toolbar reflects (controlled). */
	view: ViewState;
	/** Emits a legal patch when an enabled control is activated. */
	onChange: (patch: Partial<ViewState>) => void;
}

interface Option {
	value: string;
	label: string;
	supported: boolean;
	reason?: ReasonCode;
}

/** Tooltip for a disabled option that carries no reason_code (e.g. no overlay). */
export const UNSUPPORTED_FALLBACK = '暂不可用';

/** The MVP baseline selection (v0.1 §5): calendar + line + level. */
export const DEFAULT_MODE: ModeKey = 'calendar';
export const DEFAULT_CHART = 'line';
export const DEFAULT_TRANSFORM: TransformKey = 'level';

const MODES: { value: ModeKey; label: string }[] = [
	{ value: 'calendar', label: '日历' },
	{ value: 'seasonal_compare', label: '季节对比' },
	{ value: 'yoy', label: '同比' },
];

const TRANSFORMS: { value: TransformKey; label: string }[] = [
	{ value: 'level', label: '原值' },
	{ value: 'yoy', label: '同比' },
	{ value: 'mom', label: '环比' },
];

/** The 范围 segment: a pure view window over the loaded series. */
const RANGES: { value: RangeKey; label: string }[] = [
	{ value: '1y', label: '近1年' },
	{ value: '3y', label: '近3年' },
	{ value: '5y', label: '近5年' },
	{ value: 'all', label: '全部' },
];

/** Display names for the chart types the contract may whitelist. */
const CHART_LABEL: Record<string, string> = {
	line: '折线',
	table: '表格',
	calendar: '日历',
	area: '面积',
	bar: '柱状',
};

function chartLabel(value: string): string {
	return CHART_LABEL[value] ?? value;
}

/**
 * A structural control (范围 / 平滑) is available for any real or absent panel;
 * only a source-unsupported stub grays it, carrying the stub reason so the whole
 * toolbar explains itself consistently in the limited state (S3).
 */
function structuralOption(value: string, label: string, panel: Panel): Option {
	if (panel && isStub(panel)) {
		return { value, label, supported: false, reason: panel.reason_code };
	}
	return { value, label, supported: true };
}

/** Resolve a mode/transform entry against the panel, honoring all three shapes. */
function entryOption(
	panel: Panel,
	value: string,
	label: string,
	entry: ((full: FullPanel) => { supported: boolean; reason_code?: ReasonCode }) | null,
): Option {
	if (!panel) return { value, label, supported: true };
	if (isStub(panel)) {
		return { value, label, supported: false, reason: panel.reason_code };
	}
	const e = entry?.(panel);
	return { value, label, supported: e?.supported ?? true, reason: e?.reason_code };
}

function modeOptions(panel: Panel): Option[] {
	return MODES.map((m) =>
		entryOption(panel, m.value, m.label, (full) => full.modes[m.value]),
	);
}

function transformOptions(panel: Panel): Option[] {
	return TRANSFORMS.map((t) =>
		entryOption(panel, t.value, t.label, (full) => full.transforms[t.value]),
	);
}

function rangeOptions(panel: Panel): Option[] {
	return RANGES.map((r) => structuralOption(r.value, r.label, panel));
}

/**
 * Chart types are a whitelist (plain strings, no per-item reason), so only the
 * supported ones are offered; a stub grays the default, an absent panel offers
 * the default enabled (nothing is known to be unsupported).
 */
function chartOptions(panel: Panel): Option[] {
	if (!panel) return [{ value: DEFAULT_CHART, label: chartLabel(DEFAULT_CHART), supported: true }];
	if (isStub(panel)) {
		return [
			{
				value: DEFAULT_CHART,
				label: chartLabel(DEFAULT_CHART),
				supported: false,
				reason: panel.reason_code,
			},
		];
	}
	return panel.chart_types.map((t) => ({
		value: t,
		label: chartLabel(t),
		supported: true,
	}));
}

/** The preferred value when supported, else the first supported, else null. */
function resolveActive(options: Option[], preferred: string): string | null {
	const pref = options.find((o) => o.value === preferred);
	if (pref?.supported) return preferred;
	return options.find((o) => o.supported)?.value ?? null;
}

/**
 * An overlay candidate is actionable when the contract supports a single-axis
 * overlay, or when it is cross-region (INCOMPATIBLE_REGION) — the latter is not
 * a block but a split into two charts, so it stays selectable and is labelled
 * 「（拆分双图）」 (spec §6, §9 item 4). Any other reason grays the option.
 */
function overlaySelectable(entry: OverlayEntry): boolean {
	return entry.supported || entry.reason_code === 'INCOMPATIBLE_REGION';
}

interface OverlayOption {
	value: string;
	label: string;
	selectable: boolean;
	reason?: ReasonCode;
}

/** 无 (always selectable) plus the contract's overlay candidates for the panel. */
function overlayOptions(panel: Panel): OverlayOption[] {
	const none: OverlayOption = { value: 'none', label: '无', selectable: true };
	if (!panel || isStub(panel)) return [none];
	return [
		none,
		...Object.entries(panel.overlays).map(([key, entry]) => ({
			value: key,
			label:
				entry.reason_code === 'INCOMPATIBLE_REGION'
					? `${key}（拆分双图）`
					: key,
			selectable: overlaySelectable(entry),
			reason: entry.reason_code,
		})),
	];
}

/**
 * A labelled segmented control. Enabled items fire `onPick(value)`; disabled
 * items carry their reason copy and get no listener, so they never emit a patch
 * and never throw (§6 置灰零抛错).
 */
function buildSegment(
	label: string,
	options: Option[],
	activeValue: string | null,
	onPick: (value: string) => void,
): HTMLElement {
	const group = el('div', 'mcd-toolbar__group');
	group.appendChild(el('span', 'mcd-toolbar__label', label));

	const seg = el('div', 'mcd-segmented');
	for (const opt of options) {
		const btn = el('button', 'mcd-segmented__item', opt.label);
		btn.type = 'button';
		btn.dataset.value = opt.value;
		const active = opt.value === activeValue;
		btn.classList.toggle('is-selected', active);
		btn.setAttribute('aria-pressed', active ? 'true' : 'false');
		if (!opt.supported) {
			btn.disabled = true;
			btn.classList.add('is-disabled');
			btn.setAttribute('aria-disabled', 'true');
			btn.title = opt.reason ? reasonText(opt.reason) : UNSUPPORTED_FALLBACK;
		} else {
			btn.addEventListener('click', () => onPick(opt.value));
		}
		seg.appendChild(btn);
	}
	group.appendChild(seg);
	return group;
}

/** The 平滑 toggle: a single aria-pressed switch (spec §6). */
function buildSmoothing(
	panel: Panel,
	view: ViewState,
	onChange: ToolbarProps['onChange'],
): HTMLElement {
	const group = el('div', 'mcd-toolbar__group');
	group.appendChild(el('span', 'mcd-toolbar__label', '平滑'));

	const opt = structuralOption('smoothing', '开启', panel);
	const seg = el('div', 'mcd-segmented');
	const btn = el('button', 'mcd-segmented__item', opt.label);
	btn.type = 'button';
	btn.dataset.value = opt.value;
	const on = opt.supported && view.smoothing;
	btn.classList.toggle('is-selected', on);
	btn.setAttribute('aria-pressed', on ? 'true' : 'false');
	if (!opt.supported) {
		btn.disabled = true;
		btn.classList.add('is-disabled');
		btn.setAttribute('aria-disabled', 'true');
		btn.title = opt.reason ? reasonText(opt.reason) : UNSUPPORTED_FALLBACK;
	} else {
		btn.addEventListener('click', () => onChange({ smoothing: !view.smoothing }));
	}
	seg.appendChild(btn);
	group.appendChild(seg);
	return group;
}

/**
 * The 叠加 control is a select (UI-UX §7 叠加下拉): 无 plus the contract's
 * overlay candidates. The whole control is disabled when there is no selectable
 * candidate to switch to, so it honestly reads as unavailable instead of
 * offering a no-op; a cross-region candidate is offered as 拆分双图.
 */
function buildOverlay(
	panel: Panel,
	view: ViewState,
	onChange: ToolbarProps['onChange'],
): HTMLElement {
	const group = el('div', 'mcd-toolbar__group');
	group.appendChild(el('span', 'mcd-toolbar__label', '叠加'));

	const options = overlayOptions(panel);
	const select = el('select', 'mcd-select');
	const selectable = new Set(
		options.filter((o) => o.selectable).map((o) => o.value),
	);
	for (const o of options) {
		const opt = el('option', undefined, o.label);
		opt.value = o.value;
		if (!o.selectable) {
			opt.disabled = true;
			opt.title = o.reason ? reasonText(o.reason) : UNSUPPORTED_FALLBACK;
		}
		select.appendChild(opt);
	}
	select.value =
		view.overlay !== null && selectable.has(view.overlay) ? view.overlay : 'none';

	if (options.some((o) => o.value !== 'none' && o.selectable)) {
		select.addEventListener('change', () => {
			onChange({ overlay: select.value === 'none' ? null : select.value });
		});
	} else {
		select.disabled = true;
		select.title =
			panel && isStub(panel)
				? reasonText(panel.reason_code)
				: UNSUPPORTED_FALLBACK;
	}

	group.appendChild(select);
	return group;
}

/**
 * Build the controlled detail toolbar for one indicator's capabilities panel.
 * Always returns a well-formed toolbar (never throws), degrading to all-enabled
 * when capabilities are absent and to all-grayed when the source is a stub.
 */
export function buildToolbar(props: ToolbarProps): HTMLElement {
	const { panel, view, onChange } = props;
	const toolbar = el('div', 'mcd-toolbar');
	toolbar.setAttribute('role', 'toolbar');

	const modes = modeOptions(panel);
	toolbar.appendChild(
		buildSegment('模式', modes, resolveActive(modes, view.mode), (v) =>
			onChange({ mode: v as ModeKey }),
		),
	);

	const charts = chartOptions(panel);
	toolbar.appendChild(
		buildSegment('图型', charts, resolveActive(charts, view.chartType), (v) =>
			onChange({ chartType: v as ChartType }),
		),
	);

	const transforms = transformOptions(panel);
	toolbar.appendChild(
		buildSegment(
			'变换',
			transforms,
			resolveActive(transforms, view.transform),
			(v) => onChange({ transform: v as TransformKey }),
		),
	);

	toolbar.appendChild(buildOverlay(panel, view, onChange));

	const ranges = rangeOptions(panel);
	toolbar.appendChild(
		buildSegment('范围', ranges, resolveActive(ranges, view.range), (v) =>
			onChange({ range: v as RangeKey }),
		),
	);

	toolbar.appendChild(buildSmoothing(panel, view, onChange));

	return toolbar;
}
