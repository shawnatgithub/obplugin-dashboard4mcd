import { App, PluginSettingTab, Setting } from 'obsidian';
import type McdPlugin from './main';

/** Which workspace view the ribbon icon / open command activates. */
export type DefaultView = 'overview' | 'detail';

export interface McdSettings {
	/**
	 * Vault-relative root the Python ETL pipeline writes its `processed/`
	 * products under (e.g. `MacroData`). The loader appends `processed/` and
	 * reads `manifest.json` from there. Empty → the bundled sample fallback.
	 */
	dataDir: string;
	/** View opened by the ribbon icon / command palette. */
	defaultView: DefaultView;
	/**
	 * True once the reader has engaged the first-run guide (opened settings or
	 * chose to view sample data). Gates the overview onboarding empty state so
	 * it guides once, then falls back to the sample dashboard (D-M2-5).
	 */
	onboardingSeen: boolean;
}

export const DEFAULT_SETTINGS: McdSettings = {
	dataDir: '',
	defaultView: 'overview',
	onboardingSeen: false,
};

export class McdSettingTab extends PluginSettingTab {
	plugin: McdPlugin;

	constructor(app: App, plugin: McdPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName('数据').setHeading();

		new Setting(containerEl)
			.setName('ETL 数据目录')
			.setDesc(
				'vault 内的数据根目录（相对路径）。插件在其下的 processed/ 中读取 manifest.json 等 ETL 产物；留空则展示内置示例数据。',
			)
			.addText((text) =>
				text
					.setPlaceholder('例如 MacroData')
					.setValue(this.plugin.settings.dataDir)
					.onChange(async (value) => {
						this.plugin.settings.dataDir = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName('视图').setHeading();

		new Setting(containerEl)
			.setName('默认视图')
			.setDesc('点击功能区图标或命令时打开的视图。')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('overview', '总览仪表盘')
					.addOption('detail', '指标详情')
					.setValue(this.plugin.settings.defaultView)
					.onChange(async (value) => {
						this.plugin.settings.defaultView = value as DefaultView;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('重置首次运行引导')
			.setDesc('未配置数据目录时，总览会再次展示三步引导空态。')
			.addButton((button) =>
				button.setButtonText('重置').onClick(async () => {
					this.plugin.settings.onboardingSeen = false;
					await this.plugin.saveSettings();
				}),
			);
	}
}
