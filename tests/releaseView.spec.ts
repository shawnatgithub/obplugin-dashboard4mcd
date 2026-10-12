import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { WorkspaceLeaf } from 'obsidian';
import type { ContractAdapter } from '../src/contract/loader';
import {
	RELEASE_VIEW_ICON,
	RELEASE_VIEW_TITLE,
	VIEW_TYPE_MCD_RELEASE,
} from '../src/constants';
import type McdPlugin from '../src/main';
import { McdReleaseView } from '../src/ui/releaseView';

/**
 * Release-calendar view tests (M4-T3). The view is thin glue: it loads the
 * frozen contract through a fake in-memory adapter (the same seam as the loader
 * and detail-view tests), maps it with `toReleaseModel`, and renders it with
 * `renderRelease`. These lock the identity (view type / title / icon), the happy
 * path (the S5 view mounts with one row per indicator), the degraded path (no
 * manifest falls back to the onboarding guide, never a blank or fabricated
 * calendar), and the navigation wiring (row → detail, back → overview).
 */

const GOLDEN = path.resolve(
	__dirname,
	'..',
	'tests',
	'golden',
	'contract',
	'processed',
);
const DATA_DIR = 'MacroData';
const PREFIX = 'MacroData/processed';
const GOLDEN_NAMES = [
	'manifest.json',
	'capabilities.json',
	'retail_sales_total.json',
	'retail_sales_total_yoy.json',
	'money_supply_m1_yoy.json',
	'cpi_national_yoy.json',
	'disposable_income_yoy.json',
	'retail_sales_sh_yoy.json',
];

function goldenAdapter(): ContractAdapter {
	const files: Record<string, string> = {};
	for (const n of GOLDEN_NAMES) {
		files[`${PREFIX}/${n}`] = readFileSync(path.join(GOLDEN, n), 'utf8');
	}
	return {
		async exists(p: string): Promise<boolean> {
			return Object.prototype.hasOwnProperty.call(files, p);
		},
		async read(p: string): Promise<string> {
			const c = files[p];
			if (c === undefined) throw new Error(`ENOENT: ${p}`);
			return c;
		},
	};
}

/** An adapter with nothing in it, so the manifest is missing (degraded path). */
function emptyAdapter(): ContractAdapter {
	return {
		async exists(): Promise<boolean> {
			return false;
		},
		async read(p: string): Promise<string> {
			throw new Error(`ENOENT: ${p}`);
		},
	};
}

interface FakePlugin {
	openSettings: jest.Mock;
	activateOverview: jest.Mock;
	openDetail: jest.Mock;
	activateRelease: jest.Mock;
}

function makeView(adapter: ContractAdapter): {
	view: McdReleaseView;
	plugin: FakePlugin;
} {
	const plugin = {
		settings: { dataDir: DATA_DIR, onboardingSeen: true },
		openSettings: jest.fn(),
		activateOverview: jest.fn(),
		openDetail: jest.fn(),
		activateRelease: jest.fn(),
	} as unknown as McdPlugin & FakePlugin;
	const leaf = undefined as unknown as WorkspaceLeaf;
	const view = new McdReleaseView(leaf, plugin);
	// Obsidian sets `app`; the manual mock leaves it undefined, so inject the
	// vault adapter the refresh path reads.
	Object.assign(view, { app: { vault: { adapter } } });
	return { view, plugin };
}

afterEach(() => {
	document.body.textContent = '';
});

describe('McdReleaseView — identity', () => {
	it('reports a stable view type, title and icon', () => {
		const { view } = makeView(goldenAdapter());
		expect(view.getViewType()).toBe(VIEW_TYPE_MCD_RELEASE);
		expect(view.getDisplayText()).toBe(RELEASE_VIEW_TITLE);
		expect(view.getIcon()).toBe(RELEASE_VIEW_ICON);
	});
});

describe('McdReleaseView — happy path', () => {
	it('mounts the release view with one row per golden indicator', async () => {
		const { view } = makeView(goldenAdapter());
		await view.onOpen();
		const content = view.contentEl;
		expect(content.querySelector('.mcd-release')).not.toBeNull();
		expect(content.querySelector('.mcd-header__title')?.textContent).toBe(
			RELEASE_VIEW_TITLE,
		);
		// The frozen golden manifest lists six indicators.
		expect(content.querySelectorAll('.mcd-release__row')).toHaveLength(6);
		expect(content.querySelectorAll('.mcd-release__tick')).toHaveLength(13);
		await view.onClose();
	});

	it('opens the detail view for a row and returns to the overview', async () => {
		const { view, plugin } = makeView(goldenAdapter());
		await view.onOpen();
		const content = view.contentEl;

		const firstOpen = content.querySelector<HTMLButtonElement>(
			'.mcd-release__open',
		);
		firstOpen?.click();
		expect(plugin.openDetail).toHaveBeenCalledWith('retail_sales_total');

		const back = content.querySelector<HTMLElement>(
			'.mcd-icon-button[aria-label="返回总览"]',
		);
		back?.click();
		expect(plugin.activateOverview).toHaveBeenCalledTimes(1);
		await view.onClose();
	});
});

describe('McdReleaseView — degraded path', () => {
	it('falls back to the onboarding guide when the manifest is missing', async () => {
		const { view } = makeView(emptyAdapter());
		await view.onOpen();
		const content = view.contentEl;
		// Never a blank or fabricated calendar: the shared empty guide explains
		// why real data is absent (UI-UX §6 failure-not-silent).
		expect(content.querySelector('.mcd-release')).toBeNull();
		expect(content.querySelector('.mcd-empty')).not.toBeNull();
		await view.onClose();
	});
});
