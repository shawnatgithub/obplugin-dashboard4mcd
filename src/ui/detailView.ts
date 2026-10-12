/**
 * The single-indicator Detail workspace view (S2 / DetailLimited S3).
 *
 * Thin glue between Obsidian's `ItemView` and the Obsidian-free composers: it
 * loads the data contract through the vault adapter and renders one of three
 * honest states — the onboarding guide when the contract cannot be read, an
 * empty prompt when the leaf has no indicator key, or the detail page built by
 * `renderDetail`. The full view state (key + mode / chartType / transform /
 * overlay / range / smoothing) is persisted in `view_state` so a restored tab
 * reopens the same indicator the same way (spec §6/§8, G7).
 *
 * The toolbar is controlled: an interaction emits a patch, which is folded into
 * the view state and re-rendered from the cached contract (no extra disk read),
 * disposing the previous ECharts instance first so a re-render never leaks.
 *
 * All mapping and IO live in the pure `contract/` modules, so this file stays
 * lifecycle-only and never throws on a degraded contract.
 */

import { ItemView } from 'obsidian';
import type { ViewStateResult, WorkspaceLeaf } from 'obsidian';
import {
	buildChartModel,
	type ChartSeriesSource,
} from '../analysis/chartModel';
import {
	DEFAULT_VIEW_STATE,
	parseViewState,
	type ViewState,
} from '../analysis/viewState';
import { loadContract, type LoadResult } from '../contract/loader';
import { toDetail } from '../contract/mapper';
import type { IndicatorSeriesV1, ManifestV1 } from '../contract/types';
import {
	DETAIL_VIEW_TITLE,
	VIEW_ICON,
	VIEW_TYPE_MCD_DETAIL,
} from '../constants';
import type McdPlugin from '../main';
import { disposeChart, renderChart, type ChartHandle } from './chart';
import { renderDetail, renderEmptyDetail } from './detail';
import { renderOnboarding } from './onboarding';

/**
 * Project the loaded series into the sources `buildChartModel` may reference
 * (the transform sibling and any overlay target). Points are handed over raw —
 * the model collapses revisions itself — and each unit/title comes from the
 * manifest or the series, never guessed from the key (D5/D10).
 */
function toChartSources(
	seriesByKey: Map<string, IndicatorSeriesV1>,
	manifest: ManifestV1,
): Map<string, ChartSeriesSource> {
	const sources = new Map<string, ChartSeriesSource>();
	for (const [key, s] of seriesByKey) {
		const ind = manifest.indicators.find((i) => i.key === key) ?? null;
		sources.set(key, {
			points: s.series,
			unit: ind?.unit ?? s.unit,
			title: s.title ?? key,
		});
	}
	return sources;
}

export class McdDetailView extends ItemView {
	private readonly plugin: McdPlugin;
	/** The full persisted view state; `key === ''` means no indicator selected. */
	private view: ViewState = { ...DEFAULT_VIEW_STATE, key: '' };
	/** The last loaded contract, cached so a toolbar change need not re-read disk. */
	private contract: LoadResult | null = null;
	/** The live chart's teardown handle, disposed before each re-render/close. */
	private chartHandle: ChartHandle | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: McdPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_MCD_DETAIL;
	}

	getDisplayText(): string {
		return this.view.key ? `指标：${this.view.key}` : DETAIL_VIEW_TITLE;
	}

	getIcon(): string {
		return VIEW_ICON;
	}

	/** Persist the full view state so a restored tab reopens identically (§6/§8). */
	getState(): Record<string, unknown> {
		return { ...this.view };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		// parseViewState is total: a partial (M2 stored only `{key}`) or a
		// hand-edited blob degrades field-by-field to the defaults, never throws.
		this.view = parseViewState(state);
		await this.refresh();
		await super.setState(state, result);
	}

	async onOpen(): Promise<void> {
		await this.refresh();
	}

	async onClose(): Promise<void> {
		this.clearChart();
		this.contentEl.textContent = '';
	}

	/** Navigate to an indicator from the overview (card → detail), resetting the view. */
	setKey(key: string): void {
		this.view = { ...DEFAULT_VIEW_STATE, key };
		void this.refresh();
	}

	/** A toolbar interaction: fold the patch in and re-render from the cache. */
	private readonly onViewChange = (patch: Partial<ViewState>): void => {
		this.view = { ...this.view, ...patch };
		this.render();
	};

	/**
	 * (Re)load the contract, cache it and render. The data dir is vault-relative;
	 * the vault adapter keeps every read inside the vault (AGENTS.md: no access
	 * outside the vault).
	 */
	private async refresh(): Promise<void> {
		this.contract = await loadContract(
			this.app.vault.adapter,
			this.plugin.settings.dataDir,
		);
		this.render();
	}

	/** Render the honest state for the cached contract (idempotent, leak-safe). */
	private render(): void {
		const result = this.contract;
		if (!result) return;
		// Dispose any live chart before the DOM is replaced, so a re-render or a
		// state switch never leaks an ECharts instance.
		this.clearChart();

		if (!result.ok) {
			renderOnboarding(this.contentEl, {
				detail: result.detail,
				handlers: {
					onOpenSettings: () => this.plugin.openSettings(),
					onRefresh: () => {
						void this.refresh();
					},
				},
			});
			return;
		}

		if (!this.view.key) {
			renderEmptyDetail(this.contentEl, {
				onOpenOverview: () => {
					void this.plugin.activateOverview();
				},
			});
			return;
		}

		const series = result.seriesByKey.get(this.view.key) ?? null;
		const detail = toDetail(this.view.key, result.manifest, series, result.caps);
		// Fold the contract series + capabilities + the persisted view state into
		// the renderer-agnostic model, then let the composer draw it with the
		// injected ECharts renderer (which falls back to SVG on any failure).
		const chart = buildChartModel(
			detail,
			this.view,
			toChartSources(result.seriesByKey, result.manifest),
		);
		this.chartHandle = renderDetail(this.contentEl, {
			model: detail,
			chart,
			view: this.view,
			renderChart,
			onViewStateChange: this.onViewChange,
			handlers: {
				onBack: () => {
					void this.plugin.activateOverview();
				},
				onRefresh: () => {
					void this.refresh();
				},
				onOpenSettings: () => this.plugin.openSettings(),
				onOpenRelease: () => {
					void this.plugin.activateRelease();
				},
			},
		});
	}

	/** Dispose the live chart (handle + any instance in the subtree) to avoid leaks. */
	private clearChart(): void {
		this.chartHandle?.dispose();
		this.chartHandle = null;
		disposeChart(this.contentEl);
	}
}
