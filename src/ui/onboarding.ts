/**
 * Onboarding / first-run empty state (S4b).
 *
 * A shared centered guide shown by both the overview and the detail view when
 * the data contract cannot be read — the data dir is unconfigured or the ETL
 * products are missing (spec §8). It states plainly why real data is absent,
 * lists the three steps to produce it, and offers a primary 打开设置 action plus
 * optional 查看示例数据 (D-M2-5) and 刷新 actions — never a silent blank screen
 * (UI-UX §6 失败不静默).
 *
 * Pure DOM (no Obsidian), so it is testable under jsdom.
 */

import { clearEl, el, svgEl } from './dom';

export interface OnboardingHandlers {
	/** Jump to the plugin settings tab (primary action). */
	onOpenSettings?: () => void;
	/** Show the bundled sample data (secondary fallback); omit to hide it. */
	onShowSample?: () => void;
	/** Retry loading the contract; omit to hide it. */
	onRefresh?: () => void;
}

export interface OnboardingProps {
	title?: string;
	/** Why real data is absent — the loader's detail line. */
	detail?: string;
	handlers?: OnboardingHandlers;
}

/** Default heading for the first-run guide. */
export const ONBOARDING_TITLE = '开始使用宏观数据看板';

const ONBOARDING_INTRO =
	'尚未接入本地 ETL 数据。按以下三步生成并载入真实数据。';

const STEPS: { head: string; body: string }[] = [
	{
		head: '配置数据目录',
		body: '在 设置 → 宏观数据看板 填写 vault 内的数据根目录（例如 MacroData）。',
	},
	{
		head: '运行 ETL',
		body: '在数据产品仓运行 run_etl，把 processed/ 产物写入该目录。',
	},
	{
		head: '刷新看板',
		body: '回到看板点击刷新，即可载入真实指标。',
	},
];

/** Lucide `trending-up`, drawn inside the empty-state icon box. */
const TRENDING_UP_PATHS = ['M22 7l-8.5 8.5-5-5L2 17', 'M16 7h6v6'];

function buildIcon(): HTMLElement {
	const box = el('div', 'mcd-empty__icon');
	const svg = svgEl('svg', {
		width: 24,
		height: 24,
		viewBox: '0 0 24 24',
		fill: 'none',
		stroke: 'currentColor',
		'stroke-width': 1.8,
		'stroke-linecap': 'round',
		'stroke-linejoin': 'round',
	});
	for (const d of TRENDING_UP_PATHS) svg.appendChild(svgEl('path', { d }));
	box.appendChild(svg);
	return box;
}

function buildSteps(): HTMLElement {
	const ol = el('ol', 'mcd-steps');
	STEPS.forEach((step, i) => {
		const li = el('li');
		li.appendChild(el('strong', undefined, `${i + 1} ${step.head}`));
		li.appendChild(
			el('p', 'mcd-muted mcd-onboarding__step-body', step.body),
		);
		ol.appendChild(li);
	});
	return ol;
}

function buildActions(handlers: OnboardingHandlers): HTMLElement {
	const actions = el('div', 'mcd-empty__actions');

	const primary = el('button', 'mcd-button mcd-button--primary', '打开设置');
	primary.type = 'button';
	primary.addEventListener('click', () => handlers.onOpenSettings?.());
	actions.appendChild(primary);

	if (handlers.onShowSample) {
		const sample = el('button', 'mcd-button', '查看示例数据');
		sample.type = 'button';
		sample.addEventListener('click', () => handlers.onShowSample?.());
		actions.appendChild(sample);
	}

	if (handlers.onRefresh) {
		const refresh = el('button', 'mcd-button', '刷新');
		refresh.type = 'button';
		refresh.addEventListener('click', () => handlers.onRefresh?.());
		actions.appendChild(refresh);
	}

	return actions;
}

/** Render (or re-render) the onboarding guide into `root`. */
export function renderOnboarding(
	root: HTMLElement,
	props: OnboardingProps = {},
): void {
	clearEl(root);
	const handlers = props.handlers ?? {};

	const view = el('div', 'mcd-root mcd-view');
	const empty = el('div', 'mcd-empty');
	empty.appendChild(buildIcon());
	empty.appendChild(
		el('div', 'mcd-empty__title', props.title ?? ONBOARDING_TITLE),
	);
	empty.appendChild(el('p', 'mcd-muted', ONBOARDING_INTRO));
	if (props.detail) {
		empty.appendChild(
			el('p', 'mcd-note mcd-onboarding__detail', `当前状态：${props.detail}`),
		);
	}
	empty.appendChild(buildSteps());
	empty.appendChild(buildActions(handlers));

	view.appendChild(empty);
	root.appendChild(view);
}
