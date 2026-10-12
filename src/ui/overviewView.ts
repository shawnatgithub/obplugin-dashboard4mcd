/**
 * The Overview workspace view.
 *
 * Thin glue between Obsidian's `ItemView` and the Obsidian-free composers: it
 * loads the data contract from the configured vault folder through the vault
 * adapter, resolves it to an overview model (real data, or the bundled sample
 * fallback behind an honest banner), and wires the header actions (refresh /
 * settings) plus single-card selection. All mapping and IO live in the pure
 * `contract/` modules, so this file stays lifecycle-only.
 */

import { ItemView, Notice } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import { loadContract } from '../contract/loader';
import { resolveOverview } from '../contract/mapper';
import { VIEW_ICON, VIEW_TITLE, VIEW_TYPE_MCD_OVERVIEW } from '../constants';
import type McdPlugin from '../main';
import { renderOnboarding } from './onboarding';
import { renderOverview } from './overview';

export class McdOverviewView extends ItemView {
	private readonly plugin: McdPlugin;
	private selected: string | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: McdPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_MCD_OVERVIEW;
	}

	getDisplayText(): string {
		return VIEW_TITLE;
	}

	getIcon(): string {
		return VIEW_ICON;
	}

	async onOpen(): Promise<void> {
		await this.refresh(false);
	}

	async onClose(): Promise<void> {
		this.contentEl.textContent = '';
	}

	/**
	 * (Re)load the contract from the configured data dir and re-render. The data
	 * dir is vault-relative; the vault adapter keeps every read inside the vault
	 * (AGENTS.md: no access outside the vault). `notify` surfaces the source.
	 *
	 * On a genuine first run (no data dir / no manifest, guide not yet seen) the
	 * overview shows the three-step onboarding empty state (spec §8); once the
	 * reader engages it, `onboardingSeen` flips and the sample fallback returns
	 * (D-M2-5). Any other load failure falls straight back to the sample set.
	 */
	private async refresh(notify: boolean): Promise<void> {
		const result = await loadContract(
			this.app.vault.adapter,
			this.plugin.settings.dataDir,
		);

		if (
			!result.ok &&
			(result.reason === 'no_data_dir' ||
				result.reason === 'missing_manifest') &&
			!this.plugin.settings.onboardingSeen
		) {
			renderOnboarding(this.contentEl, {
				detail: result.detail,
				handlers: {
					onOpenSettings: () => {
						void this.plugin.markOnboardingSeen();
						this.plugin.openSettings();
					},
					onShowSample: () => {
						void this.plugin.markOnboardingSeen();
						void this.refresh(false);
					},
					onRefresh: () => {
						void this.refresh(true);
					},
				},
			});
			if (notify) {
				new Notice('宏观数据看板：尚未接入真实数据');
			}
			return;
		}

		const model = resolveOverview(result);
		renderOverview(this.contentEl, {
			meta: model.meta,
			groups: model.groups,
			selected: this.selected,
			handlers: {
				onSelect: (selected) => {
					this.selected = selected;
				},
				onOpen: (key) => {
					void this.plugin.openDetail(key);
				},
				onRefresh: () => {
					void this.refresh(true);
				},
				onOpenSettings: () => {
					this.plugin.openSettings();
				},
			},
		});
		if (notify) {
			new Notice(
				result.ok
					? `宏观数据看板：已载入真实数据（${result.seriesByKey.size} 项序列）`
					: '宏观数据看板：未找到真实数据，当前展示内置示例',
			);
		}
	}
}
