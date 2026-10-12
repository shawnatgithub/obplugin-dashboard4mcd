/**
 * Overview screen composition.
 *
 * `renderOverview` builds the whole S1 dashboard into a container using the
 * `.mcd-*` classes from `styles.css` and the prototype layout (Overview.tsx):
 * a sticky header, an amber sample-data banner (data-honesty, UI-UX §6), the
 * grouped card grid, and a muted footnote. It owns single-card selection so
 * only one card is highlighted at a time.
 *
 * This module touches only the DOM (no Obsidian imports) so it is testable
 * under jsdom.
 */

import type { OverviewMeta } from '../data/overview';
import type { MetricGroup } from '../types';
import { clearEl, el, svgEl } from './dom';
import { buildMetricCard } from './metricCard';

export interface OverviewHandlers {
	/** Re-read data (the view re-renders and confirms the source). */
	onRefresh?: () => void;
	/** Jump to the plugin settings tab. */
	onOpenSettings?: () => void;
	/** Open the release-calendar / collection-status view. */
	onOpenRelease?: () => void;
	/** Selection changed; receives the resolved selection (null = none). */
	onSelect?: (selected: string | null) => void;
	/** A real card was activated; receives its contract key to open detail. */
	onOpen?: (key: string) => void;
}

export interface OverviewProps {
	meta: OverviewMeta;
	groups: MetricGroup[];
	handlers?: OverviewHandlers;
	selected?: string | null;
}

/** Refresh glyph path (Lucide `refresh-cw`), copied from the prototype. */
const REFRESH_ICON_PATH = 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7';

function buildHeader(
	meta: OverviewMeta,
	handlers: OverviewHandlers,
): HTMLElement {
	const header = el('header', 'mcd-header');
	header.appendChild(el('h1', 'mcd-header__title', meta.title));
	header.appendChild(el('span', 'mcd-header__crumb', meta.crumb));
	header.appendChild(el('span', 'mcd-header__meta', meta.updatedAt));

	const release = el('button', 'mcd-nav', '发布日历');
	release.type = 'button';
	release.setAttribute('aria-label', '发布日历与采集状态');
	release.title = '打开发布日历与采集状态';
	release.addEventListener('click', () => handlers.onOpenRelease?.());
	header.appendChild(release);

	const refresh = el('button', 'mcd-icon-button');
	refresh.type = 'button';
	refresh.setAttribute('aria-label', '刷新');
	refresh.title = '重新读取本地 JSON';
	const icon = svgEl('svg', {
		width: 16,
		height: 16,
		viewBox: '0 0 24 24',
		fill: 'none',
		stroke: 'currentColor',
		'stroke-width': 1.8,
		'stroke-linecap': 'round',
	});
	icon.appendChild(svgEl('path', { d: REFRESH_ICON_PATH }));
	refresh.appendChild(icon);
	refresh.addEventListener('click', () => handlers.onRefresh?.());
	header.appendChild(refresh);

	const settings = el('button', 'mcd-button', '设置');
	settings.type = 'button';
	settings.addEventListener('click', () => handlers.onOpenSettings?.());
	header.appendChild(settings);

	return header;
}

function buildSampleBanner(text: string): HTMLElement {
	const banner = el('div', 'mcd-banner');
	banner.appendChild(el('span', 'mcd-dot'));
	banner.appendChild(el('span', undefined, text));
	return banner;
}

function buildGroup(
	group: MetricGroup,
	handlers: OverviewHandlers,
	selected: string | null,
): HTMLElement {
	const section = el('section', 'mcd-group');

	const head = el('div', 'mcd-group__head');
	head.appendChild(el('h2', 'mcd-group__title', group.title));
	head.appendChild(el('span', 'mcd-group__count', `${group.cards.length} 项`));
	head.appendChild(el('span', 'mcd-group__rule'));
	section.appendChild(head);

	const grid = el('div', 'mcd-grid');
	for (const card of group.cards) {
		grid.appendChild(
			buildMetricCard(card, handlers, card.name === selected),
		);
	}
	section.appendChild(grid);

	return section;
}

function buildEmptyState(): HTMLElement {
	const empty = el('div', 'mcd-empty');
	empty.appendChild(el('div', 'mcd-empty__icon'));
	empty.appendChild(el('div', 'mcd-empty__title', '暂无数据'));
	empty.appendChild(
		el(
			'p',
			'mcd-muted',
			'尚未接入 ETL 输出，或数据目录为空。请在 设置 → 宏观数据看板 中配置数据目录后重试。',
		),
	);
	return empty;
}

function applySelection(view: HTMLElement, selected: string | null): void {
	view.querySelectorAll<HTMLElement>('.mcd-card').forEach((card) => {
		card.classList.toggle('is-selected', card.dataset.metric === selected);
	});
}

/** Render (or re-render) the overview dashboard into `root`. */
export function renderOverview(root: HTMLElement, props: OverviewProps): void {
	clearEl(root);
	const external = props.handlers ?? {};
	let selected = props.selected ?? null;

	const view = el('div', 'mcd-root mcd-view');

	const handlers: OverviewHandlers = {
		...external,
		onSelect: (name) => {
			selected = selected === name ? null : name;
			applySelection(view, selected);
			external.onSelect?.(selected);
		},
	};

	view.appendChild(buildHeader(props.meta, handlers));

	const main = el('main', 'mcd-main');
	// Only show the honesty banner when there is something to disclose; real
	// contract data carries an empty notice (spec D-M2-5, T5).
	if (props.meta.sampleNotice) {
		main.appendChild(buildSampleBanner(props.meta.sampleNotice));
	}
	if (props.groups.length === 0) {
		main.appendChild(buildEmptyState());
	} else {
		for (const group of props.groups) {
			main.appendChild(buildGroup(group, handlers, selected));
		}
	}
	main.appendChild(
		el('p', 'mcd-muted mcd-fs-sm', props.meta.footnote),
	);
	view.appendChild(main);

	root.appendChild(view);
	applySelection(view, selected);
}
