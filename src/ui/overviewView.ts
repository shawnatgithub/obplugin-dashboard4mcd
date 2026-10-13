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

import { ItemView, MarkdownView, Notice } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import { loadContract } from '../contract/loader';
import {
	categoryDefs,
	resolveOverview,
	statusFromCards,
} from '../contract/mapper';
import { toOverviewStatus, toReleaseModel } from '../contract/releaseMapper';
import { VIEW_ICON, VIEW_TITLE, VIEW_TYPE_MCD_OVERVIEW } from '../constants';
import type McdPlugin from '../main';
import type { MetricCard, MetricCategory, OverviewStatus } from '../types';
import { renderOnboarding } from './onboarding';
import { renderOverview } from './overview';
import { snapshotMarkdown } from './snapshot';

export class McdOverviewView extends ItemView {
	private readonly plugin: McdPlugin;
	private selected: string | null = null;
	private category: MetricCategory | '全部' = '全部';
	private cards: MetricCard[] = [];
	private status: OverviewStatus | undefined;
	private updatedAt = '';
	private isSample = false;

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
		const cards = model.groups.flatMap((g) => g.cards);
		this.cards = cards;
		this.updatedAt = model.meta.updatedAt;
		this.isSample = !result.ok;
		// Real contract → honest 预计/截至 status from the release mapper; the
		// bundled-sample fallback derives a panel from the cards themselves.
		this.status = result.ok
			? toOverviewStatus(toReleaseModel(result.manifest, result.seriesByKey))
			: statusFromCards(cards);
		renderOverview(this.contentEl, {
			meta: model.meta,
			groups: model.groups,
			categories: categoryDefs(cards),
			status: this.status,
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
				onOpenRelease: () => {
					void this.plugin.activateRelease();
				},
				onCategoryChange: (category) => {
					this.category = category;
				},
				onInsertNote: () => {
					this.insertNote();
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

	/**
	 * Insert an honest markdown snapshot of the currently visible cards into the
	 * active note. Visibility follows the active category chip, so the reader
	 * gets exactly what they see. With no note open there is nowhere to write, so
	 * it explains that instead of failing silently (AGENTS.md: no surprise IO).
	 */
	private insertNote(): void {
		const visible =
			this.category === '全部'
				? this.cards
				: this.cards.filter(
						(card) => (card.category ?? '消费') === this.category,
					);
		const markdown = snapshotMarkdown(visible, {
			updatedAt: this.updatedAt,
			category: this.category,
			isSample: this.isSample,
		});

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			new Notice('宏观数据看板：请先打开一个笔记，再插入快照');
			return;
		}
		view.editor.replaceSelection(`${markdown}\n`);
		new Notice(`宏观数据看板：已插入 ${visible.length} 项指标快照`);
	}
}
