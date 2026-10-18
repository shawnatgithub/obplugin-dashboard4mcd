import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { WorkspaceLeaf } from 'obsidian';
import type McdPlugin from '../src/main';
import type { ContractAdapter } from '../src/contract/loader';
import { McdOverviewView } from '../src/ui/overviewView';
import { renderChart } from '../src/ui/chart';

jest.mock('../src/ui/chart', () => ({ renderChart: jest.fn(() => ({ dispose: jest.fn() })) }));
function setup(adapterOverride?: ContractAdapter) {
	const files: Record<string, string> = {};
	for (const name of ['manifest', 'capabilities', 'retail_sales_total', 'retail_sales_total_annual', 'retail_sales_total_yoy', 'money_supply_m1_yoy', 'cpi_national_yoy', 'disposable_income_yoy', 'retail_sales_sh_yoy']) {
		files[`MacroData/processed/${name}.json`] = readFileSync(path.join(__dirname, 'golden/contract/processed', `${name}.json`), 'utf8');
	}
	const adapter: ContractAdapter = adapterOverride ?? { exists: async (p) => p in files, read: async (p) => files[p]! };
	const plugin = { settings: { dataDir: 'MacroData', onboardingSeen: true }, openSettings: jest.fn(), activateRelease: jest.fn(), openDetail: jest.fn() } as unknown as McdPlugin;
	const view = new McdOverviewView(undefined as unknown as WorkspaceLeaf, plugin);
	let themeChanged: (() => void) | undefined;
	Object.assign(view, { app: { vault: { adapter }, workspace: { on: (_event: string, cb: () => void) => { themeChanged = cb; return {}; } } } });
	document.body.appendChild(view.contentEl);
	return { view, theme: () => themeChanged?.(), files };
}
afterEach(() => { document.body.textContent = ''; });

it('loads live charts, keeps filters/range/status/selection through refresh and redraws on theme change', async () => {
	const { view, theme } = setup();
	await view.onOpen();
	const root = view.contentEl;
	root.querySelector<HTMLButtonElement>('[data-cat="价格"]')?.click();
	const range = root.querySelector<HTMLSelectElement>('.mcd-range')!;
	range.value = '24'; range.dispatchEvent(new Event('change'));
	root.querySelector<HTMLButtonElement>('.mcd-status__toggle')?.click();
	const selected = root.querySelector('.mcd-card.is-selected')?.getAttribute('data-key');
	root.querySelector<HTMLButtonElement>('.mcd-icon-button')?.click();
	await new Promise((resolve) => window.setTimeout(resolve, 0));
	expect(root.querySelector('.mcd-chip.is-active')?.getAttribute('data-cat')).toBe('价格');
	expect(root.querySelector<HTMLSelectElement>('.mcd-range')?.value).toBe('24');
	expect(root.querySelector('.mcd-status__toggle')?.getAttribute('aria-expanded')).toBe('true');
	expect(root.querySelector('.mcd-card.is-selected')?.getAttribute('data-key')).toBe(selected);
	expect(root.querySelector('.mcd-retail__status')?.textContent).toContain('retail_breakdown.json');
	const calls = jest.mocked(renderChart).mock.calls.length;
	theme();
	expect(jest.mocked(renderChart).mock.calls.length).toBe(calls + 1);
	const handle = jest.mocked(renderChart).mock.results.at(-1)?.value as { dispose: jest.Mock };
	await view.onClose();
	expect(handle.dispose).toHaveBeenCalledTimes(1);
	expect(root.childElementCount).toBe(0);
});

it('does not resurrect a closed view when an asynchronous load finishes', async () => {
	let release: (present: boolean) => void = () => {};
	const waiting = new Promise<boolean>((resolve) => { release = resolve; });
	const { view } = setup({ exists: () => waiting, read: async () => '{}' });
	const opening = view.onOpen();
	await view.onClose();
	release(false);
	await opening;
	expect(view.contentEl.childElementCount).toBe(0);
});
