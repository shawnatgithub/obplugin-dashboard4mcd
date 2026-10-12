/**
 * Detail screen composition (S2 / DetailLimited S3).
 *
 * `renderDetail` builds the single-indicator page into a container using the
 * `.mcd-*` classes and the prototype layout (UI-UX §7 Detail): a header (back /
 * title / actions), the meta row (freshness dot + region/frequency/unit chips),
 * the double-timestamp line (§6 数据截至 · 更新于 · 文件名), an optional amber
 * status banner, the injected main chart (`renderChart`), the data table (a
 * missing value is a neutral Badge「缺失」, never 0 — §6), and a source footnote.
 *
 * Pure DOM (no Obsidian), so it is testable under jsdom. The toolbar
 * (`./toolbar`) applies the capabilities graying engine; this composer renders
 * the M2 structure and never throws on a stub panel or a missing series
 * (T6: 置灰零抛错).
 */

import type { ChartModel } from '../analysis/chartModel';
import type { ViewState } from '../analysis/viewState';
import {
	type DetailModel,
	formatValue,
	frequencyLabel,
	regionLabel,
	unitLabel,
} from '../contract/mapper';
import type { SeriesPoint, Unit } from '../contract/types';
import { freshnessDotClass, freshnessLabel } from '../format';
import type { ChartHandle, RenderChartFn } from './chartView';
import { clearEl, el, svgEl } from './dom';
import { buildToolbar } from './toolbar';

export interface DetailHandlers {
	/** Return to the overview dashboard. */
	onBack?: () => void;
	/** Re-read data (the view re-renders). */
	onRefresh?: () => void;
	/** Jump to the plugin settings tab. */
	onOpenSettings?: () => void;
	/** Open the release-calendar / collection-status view. */
	onOpenRelease?: () => void;
}

export interface DetailProps {
	model: DetailModel;
	/** The renderer-agnostic chart the injected `renderChart` draws. */
	chart: ChartModel;
	/** The persisted view state the controlled toolbar reflects (M3-T4). */
	view: ViewState;
	/** Injected chart renderer — ECharts in the app, the SVG fallback in tests. */
	renderChart: RenderChartFn;
	/** Emits a view-state patch from the toolbar; the caller re-renders. */
	onViewStateChange: (patch: Partial<ViewState>) => void;
	/**
	 * True when the manifest carries a `<key>_annual` sibling, enabling the 年度
	 * grain in the toolbar (CR-2026-10-13). Defaults to false.
	 */
	annualAvailable?: boolean;
	handlers?: DetailHandlers;
}

/** Lucide `chevron-left` / `refresh-cw`, copied from the prototype. */
const BACK_ICON_PATH = 'M15 18l-6-6 6-6';
const REFRESH_ICON_PATH = 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7';

function iconButton(
	label: string,
	path: string,
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
	icon.appendChild(svgEl('path', { d: path }));
	btn.appendChild(icon);
	btn.addEventListener('click', onClick);
	return btn;
}

function buildHeader(model: DetailModel, handlers: DetailHandlers): HTMLElement {
	const header = el('header', 'mcd-header');
	header.appendChild(
		iconButton('返回总览', BACK_ICON_PATH, () => handlers.onBack?.()),
	);
	header.appendChild(el('h1', 'mcd-header__title', model.title));
	header.appendChild(el('span', 'mcd-header__crumb', '指标详情'));
	header.appendChild(el('span', 'mcd-header__spacer'));

	const release = el('button', 'mcd-nav', '发布日历');
	release.type = 'button';
	release.setAttribute('aria-label', '发布日历与采集状态');
	release.title = '打开发布日历与采集状态';
	release.addEventListener('click', () => handlers.onOpenRelease?.());
	header.appendChild(release);

	header.appendChild(
		iconButton('刷新', REFRESH_ICON_PATH, () => handlers.onRefresh?.()),
	);
	const settings = el('button', 'mcd-button', '设置');
	settings.type = 'button';
	settings.addEventListener('click', () => handlers.onOpenSettings?.());
	header.appendChild(settings);
	return header;
}

/** Freshness dot + label, then the region / frequency / unit caliber chips. */
function buildMeta(model: DetailModel): HTMLElement {
	const meta = el('div', 'mcd-detail__meta');

	const fresh = el('span', 'mcd-detail__fresh');
	const dot = el('span', freshnessDotClass(model.freshness));
	dot.title = freshnessLabel(model.freshness);
	fresh.appendChild(dot);
	fresh.appendChild(el('span', undefined, freshnessLabel(model.freshness)));
	meta.appendChild(fresh);

	meta.appendChild(el('span', 'mcd-detail__chip', regionLabel(model.region)));
	meta.appendChild(
		el('span', 'mcd-detail__chip', frequencyLabel(model.frequency)),
	);
	const unit = unitLabel(model.unit);
	if (unit) meta.appendChild(el('span', 'mcd-detail__chip', `单位 ${unit}`));

	return meta;
}

/** Page-level double timestamp (§6, non-negotiable): period · update · file. */
function buildStamp(model: DetailModel): HTMLElement {
	const parts = [
		`数据截至 ${model.lastDate ?? '—'}`,
		`更新于 ${model.updatedAt ?? '未知'}`,
	];
	if (model.fileName) parts.push(model.fileName);
	return el('div', 'mcd-detail__stamp mcd-muted mcd-fs-sm', parts.join(' · '));
}

function buildStatusBanner(text: string): HTMLElement {
	const banner = el('div', 'mcd-banner');
	banner.appendChild(el('span', 'mcd-dot'));
	banner.appendChild(el('span', undefined, text));
	return banner;
}

function buildRow(point: SeriesPoint, unit: Unit): HTMLElement {
	const tr = el('tr');
	tr.appendChild(el('td', 'mcd-mono', point.date));

	const value = el('td', 'mcd-num');
	if (point.value === null) {
		// A missing period is labelled, never zero-filled or left blank (§6).
		value.appendChild(el('span', 'mcd-badge', '缺失'));
	} else {
		value.appendChild(el('span', 'mcd-mono', formatValue(point.value, unit)));
	}
	tr.appendChild(value);

	tr.appendChild(el('td', 'mcd-num mcd-mono', String(point.revision)));
	return tr;
}

/** The data table (latest period first), or null when there are no points. */
function buildTable(model: DetailModel): HTMLElement | null {
	if (model.points.length === 0) return null;
	const unit = unitLabel(model.unit);

	const table = el('table', 'mcd-table');
	const headRow = el('tr');
	for (const label of ['期', unit ? `值（${unit}）` : '值', '修订']) {
		headRow.appendChild(el('th', undefined, label));
	}
	const thead = el('thead');
	thead.appendChild(headRow);
	table.appendChild(thead);

	const tbody = el('tbody');
	for (const point of [...model.points].reverse()) {
		tbody.appendChild(buildRow(point, model.unit));
	}
	table.appendChild(tbody);
	return table;
}

function sourceFootnote(model: DetailModel): string {
	const src = model.source ? `来源：${model.source}` : '来源：本地 ETL JSON';
	if (model.frequency === 'annual') {
		// The annual grain shows a published year total, not a monthly derivation
		// (CR-2026-10-13): state the 12 月累计 caliber and that unfinished years
		// are excluded, so the reader never mistakes it for a summed mini-series.
		return `年度总额 = 当年 1—12 月累计（12 月累计口径），${src} 经本地 ETL；未完结年份不纳入。缺失期以 null 保留，不插值、不填 0。`;
	}
	return `${src} · 缺失期以 null 保留，不插值、不填 0。`;
}

/**
 * Render (or re-render) the detail page for `model` into `root` and return the
 * chart handle (the caller disposes it before the next render / on close).
 */
export function renderDetail(
	root: HTMLElement,
	props: DetailProps,
): ChartHandle {
	clearEl(root);
	const model = props.model;
	const handlers = props.handlers ?? {};

	const view = el('div', 'mcd-root mcd-view');
	view.appendChild(buildHeader(model, handlers));

	const main = el('main', 'mcd-main mcd-main--narrow');
	main.appendChild(buildMeta(model));
	main.appendChild(buildStamp(model));
	if (model.statusBanner) {
		main.appendChild(buildStatusBanner(model.statusBanner));
	}

	// The toolbar reads the capabilities panel and grays every unsupported
	// option with its reason_code copy (T3-5); it never throws on a stub or an
	// absent panel, so S3 needs no branch here.
	main.appendChild(
		buildToolbar({
			panel: model.panel,
			view: props.view,
			onChange: props.onViewStateChange,
			annualAvailable: props.annualAvailable ?? false,
		}),
	);

	// The spring-festival / caliber annotation is a mandatory amber note bar
	// (spec §5/§7, D-M3-8): the chart's markArea highlights the merge and this
	// states the caliber in words. It explains a merge; it never fabricates one.
	if (props.chart.annotation) {
		main.appendChild(
			el('div', 'mcd-note mcd-note--amber', props.chart.annotation),
		);
	}

	// The chart host is a bare figure; the injected renderer owns its classes and
	// its empty/fallback states, so S3 (limited) needs no branch here either. A
	// cross-region dual layout is marked so the renderer (and CSS) split it into
	// two independently-scaled charts instead of blending them on one axis.
	const chartHost = el('figure');
	if (props.chart.layout === 'dual') chartHost.classList.add('mcd-chart--dual');
	main.appendChild(chartHost);

	const table = buildTable(model);
	if (table) main.appendChild(table);

	main.appendChild(el('p', 'mcd-muted mcd-fs-sm', sourceFootnote(model)));

	view.appendChild(main);
	// Attach the tree first so the renderer can resolve the inherited --mcd-*
	// tokens via getComputedStyle (they cascade down from .mcd-root only once the
	// host is in the document), then draw the chart and hand back its handle.
	root.appendChild(view);
	return props.renderChart(chartHost, props.chart);
}

export interface EmptyDetailHandlers {
	/** Reveal the overview so the reader can pick an indicator. */
	onOpenOverview?: () => void;
}

/**
 * Rendered when a detail leaf exists but no indicator key is known (e.g. it was
 * restored without view_state). Points back to the overview instead of showing
 * a blank page.
 */
export function renderEmptyDetail(
	root: HTMLElement,
	handlers: EmptyDetailHandlers = {},
): void {
	clearEl(root);
	const view = el('div', 'mcd-root mcd-view');
	const empty = el('div', 'mcd-empty');
	empty.appendChild(el('div', 'mcd-empty__icon'));
	empty.appendChild(el('div', 'mcd-empty__title', '未选择指标'));
	empty.appendChild(
		el('p', 'mcd-muted', '请从总览仪表盘选择一个指标卡片以查看详情。'),
	);
	const open = el('button', 'mcd-button mcd-button--primary', '打开总览');
	open.type = 'button';
	open.addEventListener('click', () => handlers.onOpenOverview?.());
	empty.appendChild(open);
	view.appendChild(empty);
	root.appendChild(view);
}
