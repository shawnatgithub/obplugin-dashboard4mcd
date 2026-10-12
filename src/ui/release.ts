/**
 * Release-calendar screen composition (S5, contract-safe) — M4-T2.
 *
 * `renderRelease` builds the release-calendar and collection-status view into a
 * container using the `.mcd-*` classes from `styles.css`. It renders ONLY what
 * the frozen contract can honestly supply (spec §2, UI-UX §6): a monthly
 * timeline of freshness-toned markers, a five-column status list whose "next"
 * date is always labelled 预计, an overdue (stale) row flagged for attention
 * without pretending to be a runtime failure, and a manual series badged 手动.
 * The scheduler runtime states the contract cannot supply (polling / retry /
 * alert / next-run clock time) are never drawn.
 *
 * Pure DOM (no Obsidian), so it is testable under jsdom and never throws on an
 * undated indicator or an empty manifest.
 */

import type {
	ReleaseModel,
	StatusRow,
	TimelineMarker,
} from '../contract/releaseMapper';
import { FRESHNESS_LABEL, freshnessDotClass, freshnessLabel } from '../format';
import type { Fresh } from '../types';
import { clearEl, el, svgEl } from './dom';

export interface ReleaseHandlers {
	/** Return to the overview dashboard. */
	onBack?: () => void;
	/** Re-read data (the view re-renders). */
	onRefresh?: () => void;
	/** Jump to the plugin settings tab. */
	onOpenSettings?: () => void;
	/** Open one indicator's detail view; receives its contract key. */
	onOpenDetail?: (key: string) => void;
}

export interface ReleaseProps {
	model: ReleaseModel;
	handlers?: ReleaseHandlers;
}

/** Lucide `chevron-left` / `refresh-cw`, copied from the prototype. */
const BACK_ICON_PATH = 'M15 18l-6-6 6-6';
const REFRESH_ICON_PATH = 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7';

/** Fixed legend order so the four states always read consistently. */
const LEGEND_ORDER: Fresh[] = ['fresh', 'aging', 'stale', 'unknown'];

function iconButton(
	label: string,
	pathD: string,
	onClick: () => void,
): HTMLElement {
	const btn = el('button', 'mcd-icon-button');
	btn.type = 'button';
	btn.setAttribute('aria-label', label);
	btn.title = label;
	const icon = svgEl('svg', {
		width: 16,
		height: 16,
		viewBox: '0 0 24 24',
		fill: 'none',
		stroke: 'currentColor',
		'stroke-width': 1.8,
		'stroke-linecap': 'round',
		'stroke-linejoin': 'round',
	});
	icon.appendChild(svgEl('path', { d: pathD }));
	btn.appendChild(icon);
	btn.addEventListener('click', onClick);
	return btn;
}

function buildHeader(model: ReleaseModel, handlers: ReleaseHandlers): HTMLElement {
	const header = el('header', 'mcd-header');
	header.appendChild(
		iconButton('返回总览', BACK_ICON_PATH, () => handlers.onBack?.()),
	);
	header.appendChild(el('h1', 'mcd-header__title', '发布日历与采集状态'));
	header.appendChild(el('span', 'mcd-header__crumb', '发布日历'));
	// The month anchor plus the ETL generation time (double timestamp, §6): an
	// unanchored model omits the month rather than inventing one.
	const meta = model.anchorMonth
		? `当前月 ${model.anchorMonth} · ETL 更新于 ${model.generatedAt}`
		: `ETL 更新于 ${model.generatedAt}`;
	header.appendChild(el('span', 'mcd-header__meta', meta));
	header.appendChild(
		iconButton('刷新', REFRESH_ICON_PATH, () => handlers.onRefresh?.()),
	);
	const settings = el('button', 'mcd-button', '设置');
	settings.type = 'button';
	settings.addEventListener('click', () => handlers.onOpenSettings?.());
	header.appendChild(settings);
	return header;
}

/** The four freshness states, reusing the shared dot classes and labels. */
function buildLegend(): HTMLElement {
	const legend = el('div', 'mcd-release__legend');
	for (const fresh of LEGEND_ORDER) {
		const item = el('span', 'mcd-release__legend-item');
		item.appendChild(el('span', freshnessDotClass(fresh)));
		item.appendChild(el('span', undefined, FRESHNESS_LABEL[fresh]));
		legend.appendChild(item);
	}
	return legend;
}

/** A filled (actual) or hollow dashed (预计) marker for one indicator. */
function buildMarker(mk: TimelineMarker, next: boolean): HTMLElement {
	const dot = next
		? el('span', 'mcd-release__marker mcd-release__marker--next')
		: el('span', `mcd-release__marker is-${mk.tone}`);
	const label = next
		? `${mk.name} · 预计下次`
		: `${mk.name}（${freshnessLabel(mk.tone)}）`;
	dot.title = label;
	dot.setAttribute('aria-label', label);
	return dot;
}

/**
 * The monthly release timeline: one tick per month, markers dropped into the
 * tick they land on. An undated indicator (month=null) places nothing, so the
 * timeline stays honest about sparse data instead of decorating it.
 */
function buildTimeline(model: ReleaseModel): HTMLElement {
	const timeline = el('div', 'mcd-release__timeline');
	for (const month of model.months) {
		const tick = el('div', 'mcd-release__tick');
		if (month === model.anchorMonth) tick.classList.add('is-anchor');
		const dots = el('div', 'mcd-release__dots');
		for (const mk of model.markers) {
			if (mk.month === month) dots.appendChild(buildMarker(mk, false));
			if (mk.nextMonth === month) dots.appendChild(buildMarker(mk, true));
		}
		tick.appendChild(dots);
		tick.appendChild(el('span', 'mcd-release__label mcd-mono', month));
		timeline.appendChild(tick);
	}
	return timeline;
}

function buildRow(row: StatusRow, handlers: ReleaseHandlers): HTMLElement {
	const tr = el('tr', 'mcd-release__row');
	tr.dataset.key = row.key;
	if (row.overdue) tr.classList.add('is-overdue');

	tr.appendChild(el('td', 'mcd-release__metric', row.metric));

	const source = el('td');
	// A manual series is badged; any other source is shown verbatim (§6).
	source.appendChild(
		row.isManual
			? el('span', 'mcd-badge', '手动')
			: el('span', undefined, row.source),
	);
	tr.appendChild(source);

	const status = el('td');
	const statusInner = el('span', 'mcd-release__status');
	statusInner.appendChild(el('span', freshnessDotClass(row.tone)));
	statusInner.appendChild(el('span', undefined, row.statusLabel));
	status.appendChild(statusInner);
	tr.appendChild(status);

	tr.appendChild(el('td', 'mcd-mono', row.lastDate));
	tr.appendChild(el('td', 'mcd-mono', row.nextExpected));

	const action = el('td');
	const open = el('button', 'mcd-button mcd-release__open', '查看详情 →');
	open.type = 'button';
	open.addEventListener('click', () => handlers.onOpenDetail?.(row.key));
	action.appendChild(open);
	tr.appendChild(action);

	return tr;
}

/** The five-column collection-status list (plus a trailing action column). */
function buildList(model: ReleaseModel, handlers: ReleaseHandlers): HTMLElement {
	const table = el('table', 'mcd-table mcd-release__list');
	const headRow = el('tr');
	for (const label of ['指标', '来源', '状态', '数据截至', '预计下次', '']) {
		headRow.appendChild(el('th', undefined, label));
	}
	const thead = el('thead');
	thead.appendChild(headRow);
	table.appendChild(thead);

	const tbody = el('tbody');
	for (const row of model.rows) tbody.appendChild(buildRow(row, handlers));
	table.appendChild(tbody);
	return table;
}

function buildEmpty(): HTMLElement {
	const empty = el('div', 'mcd-empty mcd-release__empty');
	empty.appendChild(el('div', 'mcd-empty__icon'));
	empty.appendChild(el('div', 'mcd-empty__title', '暂无指标'));
	empty.appendChild(
		el(
			'p',
			'mcd-muted',
			'清单中没有指标。请先运行本地 ETL，或在 设置 → 宏观数据看板 中检查数据目录。',
		),
	);
	return empty;
}

/** Render (or re-render) the release calendar for `model` into `root`. */
export function renderRelease(root: HTMLElement, props: ReleaseProps): void {
	clearEl(root);
	const model = props.model;
	const handlers = props.handlers ?? {};

	const view = el('div', 'mcd-root mcd-view');
	view.appendChild(buildHeader(model, handlers));

	const main = el('main', 'mcd-main mcd-release');
	if (model.empty) {
		main.appendChild(buildEmpty());
	} else {
		main.appendChild(buildLegend());
		main.appendChild(buildTimeline(model));
		main.appendChild(buildList(model, handlers));
		// Footer states the derivation basis and the runtime-state boundary (§2).
		main.appendChild(
			el('p', 'mcd-release__note mcd-muted mcd-fs-sm', model.honestyNote),
		);
	}

	view.appendChild(main);
	root.appendChild(view);
}
