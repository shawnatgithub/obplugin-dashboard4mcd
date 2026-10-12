/**
 * Detail toolbar with the capabilities graying engine (T3-5, UI-UX §7 S2).
 *
 * Renders the 模式 / 图型 / 变换 segments plus the 叠加 control for one
 * indicator, reading its capabilities panel so every unsupported option is
 * disabled and carries its `reason_code` copy in `title` + `aria-disabled`
 * (UI-UX §6 失败不静默). A disabled control never throws and is never the
 * active one; when a default (calendar/line/level) is unsupported the active
 * option falls back to the first supported one, or to none when all are grayed.
 *
 * Pure DOM (no Obsidian), so it is testable under jsdom. M2 renders the MVP
 * baseline and grays the rest; actually switching modes / chart types /
 * transforms and applying overlays lands in M3 (spec §1 non-goals), so the
 * enabled non-default options are inert here — the toolbar's M2 job is to show
 * what is available and explain what is not.
 */

import { isStub, reasonText } from '../contract/reasonText';
import type { FullPanel, Panel, ReasonCode } from '../contract/types';
import { el } from './dom';

/** A capabilities panel: full, source-unsupported stub, or absent (degraded). */
export type { Panel };

export interface ToolbarProps {
	panel: Panel;
}

type ModeKey = keyof FullPanel['modes'];
type TransformKey = keyof FullPanel['transforms'];

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

/**
 * Overlay candidates (M3 applies them). Unsupported candidates are grayed with
 * their reason; an empty/absent set renders a single disabled 无 option so the
 * control is present but honestly empty.
 */
function overlayOptions(panel: Panel): Option[] {
	if (!panel) return [{ value: 'none', label: '无', supported: false }];
	if (isStub(panel)) {
		return [{ value: 'none', label: '无', supported: false, reason: panel.reason_code }];
	}
	const entries = Object.entries(panel.overlays);
	if (entries.length === 0) {
		return [{ value: 'none', label: '无', supported: false }];
	}
	return entries.map(([key, entry]) => ({
		value: key,
		label: key,
		supported: entry.supported,
		reason: entry.reason_code,
	}));
}

/** The preferred value when supported, else the first supported, else null. */
function resolveActive(options: Option[], preferred: string): string | null {
	const pref = options.find((o) => o.value === preferred);
	if (pref?.supported) return preferred;
	return options.find((o) => o.supported)?.value ?? null;
}

function buildSegment(
	label: string,
	options: Option[],
	activeValue: string | null,
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
		}
		seg.appendChild(btn);
	}
	group.appendChild(seg);
	return group;
}

/**
 * Build the detail toolbar for one indicator's capabilities panel. Always
 * returns a well-formed toolbar (never throws), degrading to all-enabled when
 * capabilities are absent.
 */
export function buildToolbar(props: ToolbarProps): HTMLElement {
	const panel = props.panel;
	const toolbar = el('div', 'mcd-toolbar');
	toolbar.setAttribute('role', 'toolbar');

	const modes = modeOptions(panel);
	toolbar.appendChild(buildSegment('模式', modes, resolveActive(modes, DEFAULT_MODE)));

	const charts = chartOptions(panel);
	toolbar.appendChild(buildSegment('图型', charts, resolveActive(charts, DEFAULT_CHART)));

	const transforms = transformOptions(panel);
	toolbar.appendChild(
		buildSegment('变换', transforms, resolveActive(transforms, DEFAULT_TRANSFORM)),
	);

	// Overlays have no M2 default (applying them is M3), so nothing is active.
	toolbar.appendChild(buildSegment('叠加', overlayOptions(panel), null));

	return toolbar;
}
