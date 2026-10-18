import { OVERVIEW_META } from '../src/data/overview';
import type { DetailModel } from '../src/contract/mapper';
import type { ChartModel } from '../src/analysis/chartModel';
import { renderOverview } from '../src/ui/overview';
import { buildRetailTable } from '../src/ui/retailTable';
import { buildStatusPanel } from '../src/ui/overviewStatus';
import { RETAIL_ROWS, type RetailProduct } from '../src/contract/retail';
import type { MetricGroup } from '../src/types';

const points = [{ date: '2025-01', value: 1, revision: 0 }, { date: '2026-08', value: 2, revision: 0 }];
const groups: MetricGroup[] = [{ title: 'National', cards: [
	{ key: 'a', name: 'Same name', value: '2', unit: '%', period: '2026-08', fresh: 'fresh', seed: 1, category: '消费', points, frequency: 'monthly' },
	{ key: 'b', name: 'Same name', value: '3', unit: '亿元', period: '2026-08', fresh: 'aging', seed: 2, category: '价格', points, frequency: 'monthly' },
] }];
const detail: DetailModel = { key: 'a', title: 'Same name', unit: 'yoy_pct', region: 'CN', frequency: 'monthly', freshness: 'fresh', lastDate: '2026-08', updatedAt: null, fileName: null, points, panel: null, statusBanner: null };
const categories = [{ id: '全部' as const, label: '全部', count: 2 }, { id: '价格' as const, label: '价格', count: 1 }];
afterEach(() => { document.body.textContent = ''; });

it('selects first by key and links chart without opening detail; repeated click stays selected', () => {
	const root = document.body.appendChild(document.createElement('div'));
	const opened = jest.fn();
	const handle = renderOverview(root, { meta: OVERVIEW_META, groups, handlers: { onOpen: opened } });
	const cards = root.querySelectorAll<HTMLButtonElement>('.mcd-card');
	expect(cards[0]?.getAttribute('aria-pressed')).toBe('true');
	cards[1]?.click(); cards[1]?.click();
	expect(cards[1]?.getAttribute('aria-pressed')).toBe('true');
	expect(cards[0]?.getAttribute('aria-pressed')).toBe('false');
	expect(opened).not.toHaveBeenCalled();
	root.querySelector<HTMLButtonElement>('.mcd-overview-detail__open')?.click();
	expect(opened).toHaveBeenCalledWith('b');
	handle.dispose();
});

it('restores category and range; repairs hidden selection and preserves native keyboard activation', () => {
	const root = document.body.appendChild(document.createElement('div'));
	const selected = jest.fn();
	const handle = renderOverview(root, { meta: OVERVIEW_META, groups, categories, category: '价格', range: '24', selected: 'a', handlers: { onSelect: selected } });
	expect(root.querySelector('.mcd-card.is-selected')?.getAttribute('data-key')).toBe('b');
	expect(root.querySelector('.mcd-card.is-selected')?.tagName).toBe('BUTTON');
	expect(selected).toHaveBeenLastCalledWith('b');
	expect(root.querySelector<HTMLSelectElement>('.mcd-range')?.value).toBe('24');
	expect(root.querySelector('.mcd-chip.is-active')?.getAttribute('data-cat')).toBe('价格');
	handle.dispose();
});

it('links calendar ranges to sparklines and chart; draws attached and disposes before replacement', () => {
	const root = document.body.appendChild(document.createElement('div'));
	const disposed: number[] = [];
	const models: ChartModel[] = [];
	const draw = (host: HTMLElement, model: ChartModel) => {
		expect(host.isConnected).toBe(true);
		models.push(model);
		const id = models.length;
		return { dispose: () => { disposed.push(id); } };
	};
	const handle = renderOverview(root, { meta: OVERVIEW_META, groups, categories, details: new Map([['a', detail]]), chartRenderer: draw, handlers: { onInsertNote: () => {} } });
	const range = root.querySelector<HTMLSelectElement>('.mcd-range')!;
	expect(range.nextElementSibling?.classList.contains('mcd-insert')).toBe(true);
	expect(models[0]?.series[0]?.points).toHaveLength(12);
	const before = root.querySelector('.mcd-card .mcd-spark')?.outerHTML;
	range.value = '24'; range.dispatchEvent(new Event('change'));
	expect(models[1]?.series[0]?.points).toHaveLength(20);
	expect(root.querySelector('.mcd-card .mcd-spark')?.outerHTML).not.toBe(before);
	expect(root.querySelector('.mcd-card__value')?.textContent).toBe('2%');
	expect(disposed).toEqual([1]);
	handle.redraw();
	expect(disposed).toEqual([1, 2]);
	handle.dispose();
	expect(disposed).toEqual([1, 2, 3]);
});

it('shows a clear empty chart after filtering every card', () => {
	const root = document.body.appendChild(document.createElement('div'));
	const handle = renderOverview(root, { meta: OVERVIEW_META, groups: [], categories });
	expect(root.querySelector('.mcd-overview-detail')?.textContent).toContain('暂无可选指标');
	handle.dispose();
});

it('shows seven honest empty retail rows and four columns without prototype values', () => {
	const table = buildRetailTable({ ok: false, reason: 'missing', detail: 'Not collected' });
	expect(table.querySelectorAll('th')).toHaveLength(4);
	expect(table.querySelectorAll('tbody tr')).toHaveLength(7);
	expect(table.textContent).toContain('Not collected');
	expect(table.querySelectorAll('tbody td')[1]?.textContent).toBe('—');
});

it('uses one latest retail snapshot including its nulls and independent provenance', () => {
	const stamp = '2026-09-16T10:00:00+08:00';
	const rows = Object.entries(RETAIL_ROWS).map(([id, name]) => ({ id, name, amount: null, yoy_pct: null, delta_pp: null, share_pct: null, reason: 'Not published' }));
	const product = { schema_version: 'retail_breakdown_v1', generated_at: stamp, last_success_at: stamp, last_attempt_at: stamp, scope: 'national_above_designated_size_current_month_nominal', share_basis: 'national_above_designated_size_goods_plus_catering', diagnostics: [], periods: [
		{ date: '2026-08', denominator_amount: 14891, source_kind: 'html', source_url: 'https://www.stats.gov.cn/', retrieved_at: stamp, amount_precision: 0, rows },
		{ date: '2026-07', denominator_amount: 14308, source_kind: 'api', source_url: 'https://data.stats.gov.cn/', retrieved_at: stamp, amount_precision: 1, rows: rows.map((r) => ({ ...r, yoy_pct: 6.8 })) },
	] } as RetailProduct;
	const table = buildRetailTable({ ok: true, value: product });
	expect(table.textContent).toContain('2026-08');
	expect(table.textContent).toContain('HTML');
	expect(table.textContent).not.toContain('6.8');
	expect(table.querySelector('a')?.getAttribute('href')).toBe('https://www.stats.gov.cn/');
});

it('counts unique displayed diagnostics and safely fences hostile context', () => {
	const diagnostic = { code: 'failed', severity: 'error' as const, message: '<img onerror=alert(1)>', row: 'a', context: { raw: '```\n<script>alert(1)</script>' } };
	let markdown = '';
	const panel = buildStatusPanel({ items: [], latest: 0, upcoming: 1, overdue: 0 }, false, [diagnostic, diagnostic], {
		renderMarkdown: (text, host) => { markdown = text; host.textContent = text; },
	});
	expect(panel.querySelector('.mcd-status__errors')?.textContent).toBe('1');
	expect(panel.querySelector('.mcd-status__warnings')?.textContent).toBe('0');
	panel.querySelector<HTMLButtonElement>('.mcd-status__toggle')?.click();
	expect(panel.querySelectorAll('.mcd-diagnostic')).toHaveLength(1);
	expect(panel.querySelector('img,script')).toBeNull();
	expect(markdown.startsWith('````json\n')).toBe(true);
	expect(markdown.endsWith('\n````')).toBe(true);
});
