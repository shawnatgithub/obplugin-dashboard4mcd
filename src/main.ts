import { Notice, Plugin } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import {
	COMMAND_OPEN_OVERVIEW,
	COMMAND_OPEN_RELEASE,
	PLUGIN_ID,
	RELEASE_VIEW_TITLE,
	RIBBON_TOOLTIP,
	VIEW_ICON,
	VIEW_TYPE_MCD_DETAIL,
	VIEW_TYPE_MCD_OVERVIEW,
	VIEW_TYPE_MCD_RELEASE,
} from './constants';
import { mergeSettings } from './logic';
import { DEFAULT_SETTINGS, McdSettings, McdSettingTab } from './settings';
import { McdDetailView } from './ui/detailView';
import { McdOverviewView } from './ui/overviewView';
import { McdReleaseView } from './ui/releaseView';

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

		this.registerView(
			VIEW_TYPE_MCD_DETAIL,
			(leaf: WorkspaceLeaf) => new McdDetailView(leaf, this),
		);

		this.registerView(
			VIEW_TYPE_MCD_RELEASE,
			(leaf: WorkspaceLeaf) => new McdReleaseView(leaf, this),
		);

		this.addRibbonIcon(VIEW_ICON, RIBBON_TOOLTIP, () => {
			void this.activateDefaultView();
		});

		this.addCommand({
			id: COMMAND_OPEN_OVERVIEW,
			name: RIBBON_TOOLTIP,
			callback: () => {
				void this.activateDefaultView();
			},
		});

		this.addCommand({
			id: COMMAND_OPEN_RELEASE,
			name: RELEASE_VIEW_TITLE,
			callback: () => {
				void this.activateRelease();
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

	/** Reveal the release calendar, opening a new tab only if none exists. */
	async activateRelease(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_MCD_RELEASE)[0];
		const leaf = existing ?? workspace.getLeaf(true);
		if (!existing) {
			await leaf.setViewState({
				type: VIEW_TYPE_MCD_RELEASE,
				active: true,
			});
		}
		await workspace.revealLeaf(leaf);
	}

	/**
	 * Reveal the detail page for `key`, reusing an open detail leaf so card
	 * navigation does not pile up tabs. The key travels through `view_state`, so
	 * the view's `setState` picks it up and re-renders (spec §8).
	 */
	async openDetail(key: string): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_MCD_DETAIL)[0];
		const leaf = existing ?? workspace.getLeaf(true);
		await leaf.setViewState({
			type: VIEW_TYPE_MCD_DETAIL,
			active: true,
			state: { key },
		});
		await workspace.revealLeaf(leaf);
	}

	/** Activate whichever view the reader chose as their default (T3-1). */
	async activateDefaultView(): Promise<void> {
		if (this.settings.defaultView !== 'detail') {
			await this.activateOverview();
			return;
		}
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_MCD_DETAIL)[0];
		const leaf = existing ?? workspace.getLeaf(true);
		if (!existing) {
			await leaf.setViewState({ type: VIEW_TYPE_MCD_DETAIL, active: true });
		}
		await workspace.revealLeaf(leaf);
	}

	/** Record that the first-run guide has been engaged (gates onboarding). */
	async markOnboardingSeen(): Promise<void> {
		if (this.settings.onboardingSeen) return;
		this.settings.onboardingSeen = true;
		await this.saveSettings();
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
