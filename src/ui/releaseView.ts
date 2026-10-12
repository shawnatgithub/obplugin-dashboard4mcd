/**
 * The Release-calendar workspace view (S5, contract-safe) — M4-T3.
 *
 * Thin glue between Obsidian's `ItemView` and the Obsidian-free composer: it
 * loads the frozen data contract through the vault adapter, derives the release
 * model with `toReleaseModel`, and renders it with `renderRelease`. Unlike the
 * overview it has no bundled sample fallback — the calendar can only be honest
 * about real indicators — so a contract that cannot be read falls back to the
 * shared onboarding guide instead of inventing dates (spec §2, UI-UX §6).
 *
 * All mapping and IO live in the pure `contract/` modules, so this file stays
 * lifecycle-only and never throws on a degraded contract.
 */

import { ItemView, Notice } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import { loadContract } from '../contract/loader';
import { toReleaseModel } from '../contract/releaseMapper';
import {
	RELEASE_VIEW_ICON,
	RELEASE_VIEW_TITLE,
	VIEW_TYPE_MCD_RELEASE,
} from '../constants';
import type McdPlugin from '../main';
import { renderOnboarding } from './onboarding';
import { renderRelease } from './release';

export class McdReleaseView extends ItemView {
	private readonly plugin: McdPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: McdPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_MCD_RELEASE;
	}

	getDisplayText(): string {
		return RELEASE_VIEW_TITLE;
	}

	getIcon(): string {
		return RELEASE_VIEW_ICON;
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
	 * A contract that cannot be read shows the shared onboarding guide — never a
	 * blank or fabricated calendar (UI-UX §6 failure-not-silent). There is no
	 * sample fallback here: an invented release date would be a lie about when
	 * real data lands, so the honest states are the guide or the real model.
	 */
	private async refresh(notify: boolean): Promise<void> {
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
						void this.refresh(true);
					},
				},
			});
			if (notify) {
				new Notice('发布日历：尚未接入真实数据');
			}
			return;
		}

		const model = toReleaseModel(result.manifest, result.seriesByKey);
		renderRelease(this.contentEl, {
			model,
			handlers: {
				onBack: () => {
					void this.plugin.activateOverview();
				},
				onRefresh: () => {
					void this.refresh(true);
				},
				onOpenSettings: () => this.plugin.openSettings(),
				onOpenDetail: (key) => {
					void this.plugin.openDetail(key);
				},
			},
		});
		if (notify) {
			new Notice(
				`发布日历：已载入 ${model.rows.length} 项指标（数据来源：本地 ETL）`,
			);
		}
	}
}
