import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ViewStateResult, WorkspaceLeaf } from 'obsidian';
import type { ContractAdapter } from '../src/contract/loader';
import type McdPlugin from '../src/main';
import { McdDetailView } from '../src/ui/detailView';

/**
 * Detail view state tests (M3-T4 / spec §6, G7). The view injects the concrete
 * ECharts renderer through `./chart`; the tests stub that seam so no ESM-only
 * echarts subpath is loaded and no canvas is needed — what is under test is the
 * view_state round-trip and the controlled re-render, not the drawing.
 *
 * A fake in-memory adapter serves the sealed golden fixtures under the real
 * vault layout, so `setState → refresh → render` runs end to end without
 * Obsidian or node fs (the same pattern as the loader tests).
 */

jest.mock('../src/ui/chart', () => ({
	renderChart: jest.fn(() => ({ dispose: jest.fn() })),
	disposeChart: jest.fn(),
}));

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

function makeView(): McdDetailView {
	const plugin = {
		settings: { dataDir: DATA_DIR },
		openSettings: jest.fn(),
		activateOverview: jest.fn(),
	} as unknown as McdPlugin;
	const leaf = undefined as unknown as WorkspaceLeaf;
	const view = new McdDetailView(leaf, plugin);
	// Obsidian sets `app`; the manual mock leaves it undefined, so inject the
	// vault adapter the refresh path reads.
	Object.assign(view, { app: { vault: { adapter: goldenAdapter() } } });
	return view;
}

const NO_RESULT = { history: false } as ViewStateResult;

afterEach(() => {
	document.body.textContent = '';
});

describe('McdDetailView — view_state round-trip (G7)', () => {
	it('getState returns every ViewState field after setState', async () => {
		const view = makeView();
		await view.setState(
			{
				key: 'retail_sales_total',
				mode: 'yoy',
				chartType: 'table',
				transform: 'yoy',
				overlay: null,
				range: '1y',
				smoothing: true,
			},
			NO_RESULT,
		);
		expect(view.getState()).toEqual({
			key: 'retail_sales_total',
			mode: 'yoy',
			chartType: 'table',
			transform: 'yoy',
			overlay: null,
			range: '1y',
			smoothing: true,
		});
		await view.onClose();
	});

	it('fills defaults for a partial (M2-style) state and renders the page', async () => {
		const view = makeView();
		await view.setState({ key: 'retail_sales_total' }, NO_RESULT);
		expect(view.getState()).toEqual({
			key: 'retail_sales_total',
			mode: 'calendar',
			chartType: 'line',
			transform: 'level',
			overlay: null,
			range: 'all',
			smoothing: false,
		});
		const content = view.contentEl;
		expect(
			content.querySelector('.mcd-header__title')?.textContent?.length,
		).toBeGreaterThan(0);
		expect(content.querySelector('.mcd-toolbar')).not.toBeNull();
		await view.onClose();
	});

	it('renders the empty prompt when no key is set', async () => {
		const view = makeView();
		await view.setState({}, NO_RESULT);
		expect(view.contentEl.querySelector('.mcd-empty')).not.toBeNull();
		await view.onClose();
	});
});

describe('McdDetailView — controlled toolbar re-render', () => {
	it('folds a toolbar patch into the persisted view and re-renders', async () => {
		const view = makeView();
		await view.setState({ key: 'retail_sales_total' }, NO_RESULT);
		const tableBtn = Array.from(
			view.contentEl.querySelectorAll<HTMLButtonElement>(
				'.mcd-segmented__item',
			),
		).find((b) => b.dataset.value === 'table');
		expect(tableBtn).toBeDefined();
		tableBtn?.click();
		expect(view.getState()).toMatchObject({
			key: 'retail_sales_total',
			chartType: 'table',
		});
		await view.onClose();
	});
});
