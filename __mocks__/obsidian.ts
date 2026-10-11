/**
 * Manual Jest mock for the `obsidian` module.
 *
 * The `obsidian` npm package ships only TypeScript types, so every *value*
 * imported from it (the `Plugin`, `Notice`, `Setting`, ... classes) is
 * undefined when the code runs under Jest. This stub provides empty
 * implementations so plugin code that imports from `obsidian` can at least be
 * loaded in a test environment. Add methods here as your tests start to
 * exercise more of the Obsidian API.
 *
 * Placed in a root-level `__mocks__` folder, Jest applies it automatically to
 * the `obsidian` node module without any `jest.mock()` call.
 */

export class Plugin {
	app: unknown;
	manifest: unknown;

	constructor(app?: unknown, manifest?: unknown) {
		this.app = app;
		this.manifest = manifest;
	}

	addCommand(): void {}
	addRibbonIcon(): { addClass: () => void; onClick: () => void } {
		return { addClass: () => {}, onClick: () => {} };
	}
	addStatusBarItem(): {
		setText: (text: string) => void;
		addClass: (cls: string) => void;
	} {
		return { setText: () => {}, addClass: () => {} };
	}
	addSettingTab(): void {}
	registerView(): void {}
	registerDomEvent(): void {}
	registerEvent(): void {}
	registerInterval(): void {}
	async loadData(): Promise<unknown> {
		return null;
	}
	async saveData(_data?: unknown): Promise<void> {}
}

export class Notice {
	constructor(_message?: string) {}
}

export class Setting {
	constructor(_containerEl?: unknown) {}
	setName(_name: string): this {
		return this;
	}
	setHeading(): this {
		return this;
	}
	setDesc(_desc: string): this {
		return this;
	}
	addText(_cb: (text: unknown) => void): this {
		return this;
	}
}

// Extra stubs so main.ts / settings.ts remain loadable under Jest.
export class Modal {
	app: unknown;
	containerEl = {
		empty: () => {},
		setText: (_text: string) => {},
		createEl: (..._args: unknown[]) => {},
	};

	constructor(app?: unknown) {
		this.app = app;
	}
	open(): void {}
	close(): void {}
	onOpen(): void {}
	onClose(): void {}
}

export class PluginSettingTab {
	app: unknown;
	containerEl = { empty: () => {} };

	constructor(app?: unknown, _plugin?: unknown) {
		this.app = app;
	}
	display(): void {}
}

export class MarkdownView {}

export class WorkspaceLeaf {}

/** Minimal ItemView stub: a container with a header (0) and content (1). */
export class ItemView {
	app: unknown;
	leaf: unknown;
	containerEl: HTMLElement;
	contentEl: HTMLElement;

	constructor(leaf?: unknown) {
		this.leaf = leaf;
		this.containerEl = document.createElement('div');
		this.contentEl = document.createElement('div');
		this.containerEl.appendChild(document.createElement('div'));
		this.containerEl.appendChild(this.contentEl);
	}

	getViewType(): string {
		return '';
	}
	getDisplayText(): string {
		return '';
	}
	getIcon(): string {
		return '';
	}
	async onOpen(): Promise<void> {}
	async onClose(): Promise<void> {}
}
