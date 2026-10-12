/**
 * The single-indicator Detail workspace view (S2 / DetailLimited S3).
 *
 * Thin glue between Obsidian's `ItemView` and the Obsidian-free composers: it
 * loads the data contract through the vault adapter and renders one of three
 * honest states — the onboarding guide when the contract cannot be read, an
 * empty prompt when the leaf has no indicator key, or the detail page built by
 * `renderDetail`. The selected key is persisted in `view_state` so a restored
 * tab reopens the same indicator (spec §8 view_state).
 *
 * All mapping and IO live in the pure `contract/` modules, so this file stays
 * lifecycle-only and never throws on a degraded contract.
 */

import { ItemView } from 'obsidian';
import type { ViewStateResult, WorkspaceLeaf } from 'obsidian';
import { loadContract } from '../contract/loader';
import { toDetail } from '../contract/mapper';
import {
	DETAIL_VIEW_TITLE,
	VIEW_ICON,
	VIEW_TYPE_MCD_DETAIL,
} from '../constants';
import type McdPlugin from '../main';
import { renderDetail, renderEmptyDetail } from './detail';
import { renderOnboarding } from './onboarding';

export class McdDetailView extends ItemView {
	private readonly plugin: McdPlugin;
	private key: string | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: McdPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_MCD_DETAIL;
	}

	getDisplayText(): string {
		return this.key ? `指标：${this.key}` : DETAIL_VIEW_TITLE;
	}

	getIcon(): string {
		return VIEW_ICON;
	}

	/** Persist the selected indicator so a restored tab reopens it (§8). */
	getState(): Record<string, unknown> {
		return this.key ? { key: this.key } : {};
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const next = (state ?? {}) as { key?: unknown };
		this.key = typeof next.key === 'string' ? next.key : null;
		await this.refresh();
		await super.setState(state, result);
	}

	async onOpen(): Promise<void> {
		await this.refresh();
	}

	async onClose(): Promise<void> {
		this.contentEl.textContent = '';
	}

	/** Navigate to an indicator from the overview (card → detail). */
	setKey(key: string): void {
		this.key = key;
		void this.refresh();
	}

	/**
	 * (Re)load the contract and render the honest state for it. The data dir is
	 * vault-relative; the vault adapter keeps every read inside the vault
	 * (AGENTS.md: no access outside the vault).
	 */
	private async refresh(): Promise<void> {
		const result = await loadContract(
			this.app.vault.adapter,
			this.plugin.settings.dataDir,
		);

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

		if (!this.key) {
			renderEmptyDetail(this.contentEl, {
				onOpenOverview: () => {
					void this.plugin.activateOverview();
				},
			});
			return;
		}

		const series = result.seriesByKey.get(this.key) ?? null;
		renderDetail(this.contentEl, {
			model: toDetail(this.key, result.manifest, series, result.caps),
			handlers: {
				onBack: () => {
					void this.plugin.activateOverview();
				},
				onRefresh: () => {
					void this.refresh();
				},
				onOpenSettings: () => this.plugin.openSettings(),
			},
		});
	}
}
