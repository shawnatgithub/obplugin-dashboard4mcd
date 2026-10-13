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
import type {
	CategoryDef,
	MetricCategory,
	MetricGroup,
	OverviewStatus,
} from '../types';
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
	/** Insert a markdown snapshot of the visible cards into the active note. */
	onInsertNote?: () => void;
	/** The category filter changed; receives the active chip id. */
	onCategoryChange?: (category: MetricCategory | '全部') => void;
}

export interface OverviewProps {
	meta: OverviewMeta;
	groups: MetricGroup[];
	handlers?: OverviewHandlers;
	selected?: string | null;
	/** Filter chips (全部 / 消费 / 价格 / 货币). Omitted → no chip row. */
	categories?: CategoryDef[];
	/** The collapsible 数据状态 panel model. Omitted → no panel. */
	status?: OverviewStatus;
	/** Start with the 数据状态 panel expanded (default collapsed). */
	statusOpen?: boolean;
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
		const cardEl = buildMetricCard(card, handlers, card.name === selected);
		// Tag with its category so the chip filter can show/hide it client-side.
		cardEl.dataset.category = card.category ?? '消费';
		grid.appendChild(cardEl);
	}
	section.appendChild(grid);

	return section;
}

/**
 * The controls row: category filter chips + the insert-to-note action. Chips
 * carry `data-cat`; the active one gets `is-active`. The insert button uses a
 * distinct class so it never collides with the header's `.mcd-button`/`.mcd-nav`.
 */
function buildControls(
	categories: CategoryDef[],
	handlers: OverviewHandlers,
	onFilter: (category: MetricCategory | '全部') => void,
): HTMLElement {
	const controls = el('div', 'mcd-controls');

	const chips = el('div', 'mcd-chips');
	chips.setAttribute('role', 'tablist');
	chips.setAttribute('aria-label', '指标分类筛选');
	categories.forEach((cat, i) => {
		const chip = el('button', 'mcd-chip', `${cat.label} ${cat.count}`);
		chip.type = 'button';
		chip.dataset.cat = cat.id;
		chip.setAttribute('role', 'tab');
		chip.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
		if (i === 0) chip.classList.add('is-active');
		chip.addEventListener('click', () => {
			chips.querySelectorAll<HTMLElement>('.mcd-chip').forEach((c) => {
				const active = c === chip;
				c.classList.toggle('is-active', active);
				c.setAttribute('aria-selected', active ? 'true' : 'false');
			});
			onFilter(cat.id);
			handlers.onCategoryChange?.(cat.id);
		});
		chips.appendChild(chip);
	});
	controls.appendChild(chips);

	if (handlers.onInsertNote) {
		const insert = el('button', 'mcd-insert', '插入到笔记');
		insert.type = 'button';
		insert.title = '将当前可见指标快照插入到当前笔记';
		insert.addEventListener('click', () => handlers.onInsertNote?.());
		controls.appendChild(insert);
	}

	return controls;
}

/**
 * The collapsible 数据状态 panel: a toggle row with the three legend counts, and
 * a body listing one honest row per real series (freshness tone + 预计/截至 detail).
 * No scheduler runtime state is shown — the contract does not carry it.
 */
function buildStatusPanel(status: OverviewStatus, open: boolean): HTMLElement {
	const panel = el('div', 'mcd-status');

	const toggle = el('button', 'mcd-status__toggle');
	toggle.type = 'button';
	toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
	toggle.appendChild(el('span', 'mcd-status__title', '数据状态'));
	const badges = el('span', 'mcd-status__counts');
	const latest = el('span', 'mcd-badge is-fresh', `最新 ${status.latest}`);
	const upcoming = el('span', 'mcd-badge is-aging', `临近更新 ${status.upcoming}`);
	const overdue = el('span', 'mcd-badge is-stale', `已过期 ${status.overdue}`);
	badges.append(latest, upcoming, overdue);
	toggle.appendChild(badges);
	toggle.appendChild(el('span', 'mcd-status__chevron'));
	panel.appendChild(toggle);

	const body = el('div', 'mcd-status__body');
	if (!open) body.hidden = true;
	if (status.items.length === 0) {
		body.appendChild(
			el('p', 'mcd-muted mcd-fs-sm', '尚无已接入的真实序列。'),
		);
	} else {
		const list = el('ul', 'mcd-status__list');
		for (const item of status.items) {
			const row = el('li', 'mcd-status__item');
			row.dataset.tone = item.tone;
			row.appendChild(el('span', `mcd-dot is-${item.tone}`));
			row.appendChild(el('span', 'mcd-status__metric', item.metric));
			row.appendChild(el('span', `mcd-status__badge is-${item.tone}`, item.badge));
			row.appendChild(el('span', 'mcd-status__detail', item.detail));
			list.appendChild(row);
		}
		body.appendChild(list);
	}
	panel.appendChild(body);

	toggle.addEventListener('click', () => {
		const nowOpen = body.hidden;
		body.hidden = !nowOpen;
		toggle.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
	});

	return panel;
}

/** Show only the cards in `active` (全部 shows every card); hide emptied groups. */
function applyCategory(view: HTMLElement, active: MetricCategory | '全部'): void {
	view.querySelectorAll<HTMLElement>('.mcd-group').forEach((section) => {
		let visible = 0;
		section.querySelectorAll<HTMLElement>('.mcd-card').forEach((card) => {
			const show = active === '全部' || card.dataset.category === active;
			card.classList.toggle('is-hidden', !show);
			if (show) visible++;
		});
		section.classList.toggle('is-hidden', visible === 0);
	});
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
	// Category filter chips + insert-to-note (only when the model supplies them).
	if (props.categories && props.categories.length > 0) {
		main.appendChild(
			buildControls(props.categories, handlers, (active) =>
				applyCategory(view, active),
			),
		);
	}
	// Collapsible 数据状态 panel (real freshness + 预计/截至 detail).
	if (props.status) {
		main.appendChild(buildStatusPanel(props.status, props.statusOpen ?? false));
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
