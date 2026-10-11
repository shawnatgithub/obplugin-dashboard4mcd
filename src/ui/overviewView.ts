/**
 * The Overview workspace view.
 *
 * Thin glue between Obsidian's `ItemView` and the Obsidian-free `renderOverview`
 * composer: it resolves the content element, feeds the bundled sample data, and
 * wires the header actions (refresh / settings) plus selection tracking.
 */

import { ItemView, Notice } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import {
	VIEW_ICON,
	VIEW_TITLE,
	VIEW_TYPE_MCD_OVERVIEW,
} from '../constants';
import { OVERVIEW_GROUPS, OVERVIEW_META } from '../data/overview';
import type McdPlugin from '../main';
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
		this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.textContent = '';
	}

	private render(): void {
		renderOverview(this.contentEl, {
			meta: OVERVIEW_META,
			groups: OVERVIEW_GROUPS,
			selected: this.selected,
			handlers: {
				onSelect: (selected) => {
					this.selected = selected;
				},
				onRefresh: () => {
					this.render();
					new Notice('宏观数据看板：当前展示内置示例数据');
				},
				onOpenSettings: () => {
					this.plugin.openSettings();
				},
			},
		});
	}
}
