import { Notice, Plugin } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import {
	COMMAND_OPEN_OVERVIEW,
	PLUGIN_ID,
	RIBBON_TOOLTIP,
	VIEW_ICON,
	VIEW_TYPE_MCD_OVERVIEW,
} from './constants';
import { mergeSettings } from './logic';
import { DEFAULT_SETTINGS, McdSettings, McdSettingTab } from './settings';
import { McdOverviewView } from './ui/overviewView';

/** Minimal shape of Obsidian's settings API used to jump straight to our tab. */
interface AppSettingsApi {
	openTabById(id: string): void;
}

export default class McdPlugin extends Plugin {
	settings!: McdSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_MCD_OVERVIEW,
			(leaf: WorkspaceLeaf) => new McdOverviewView(leaf, this),
		);

		this.addRibbonIcon(VIEW_ICON, RIBBON_TOOLTIP, () => {
			void this.activateOverview();
		});

		this.addCommand({
			id: COMMAND_OPEN_OVERVIEW,
			name: RIBBON_TOOLTIP,
			callback: () => {
				void this.activateOverview();
			},
		});

		this.addSettingTab(new McdSettingTab(this.app, this));
	}

	onunload(): void {}

	/** Reveal the overview dashboard, opening a new tab only if none exists. */
	async activateOverview(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_MCD_OVERVIEW)[0];
		const leaf = existing ?? workspace.getLeaf(true);
		if (!existing) {
			await leaf.setViewState({
				type: VIEW_TYPE_MCD_OVERVIEW,
				active: true,
			});
		}
		await workspace.revealLeaf(leaf);
	}

	/** Open Obsidian settings directly to this plugin's tab. */
	openSettings(): void {
		const setting = (
			this.app as unknown as { setting?: AppSettingsApi }
		).setting;
		if (setting) {
			setting.openTabById(PLUGIN_ID);
		} else {
			new Notice('请在 设置 → 第三方插件 中打开「宏观数据看板」');
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = mergeSettings(
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<McdSettings>,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
