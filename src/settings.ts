import { App, PluginSettingTab, Setting } from 'obsidian';
import type McdPlugin from './main';

export interface McdSettings {
	/**
	 * Directory the Python ETL pipeline writes processed JSON to. The current
	 * build renders bundled sample data; this is declared now (no guessing,
	 * D10) and consumed once the loader lands.
	 */
	dataDir: string;
}

export const DEFAULT_SETTINGS: McdSettings = {
	dataDir: '',
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
				'Python ETL 输出 JSON 的目录。当前版本展示内置示例数据；接入采集管线后将读取此目录。',
			)
			.addText((text) =>
				text
					.setPlaceholder('例如 D:/Codex/MacroDataETL/processed')
					.setValue(this.plugin.settings.dataDir)
					.onChange(async (value) => {
						this.plugin.settings.dataDir = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
