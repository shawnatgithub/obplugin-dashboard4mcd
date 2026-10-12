import type { ReleaseModel } from '../src/contract/releaseMapper';
import { renderRelease } from '../src/ui/release';
import type { ReleaseHandlers } from '../src/ui/release';

/**
 * Release-calendar composer DOM tests (M4-T2, S5).
 *
 * `renderRelease` is Obsidian-free, so these run under jsdom and lock the S5
 * structure plus the §2 data-honesty rules: a next date always reads 预计, an
 * overdue (stale) row is flagged but never labelled a runtime failure, a manual
 * series carries the 手动 badge, an undated indicator draws no fabricated
 * marker, and the empty state renders instead of an empty table.
 */

function makeModel(overrides: Partial<ReleaseModel> = {}): ReleaseModel {
	return {
		anchorMonth: '2026-10',
		months: ['2026-09', '2026-10', '2026-11'],
		markers: [
			{
				key: 'a',
				name: '指标A',
				month: '2026-09',
				nextMonth: '2026-10',
				tone: 'fresh',
			},
			{
				key: 'b',
				name: '指标B',
				month: '2026-10',
				nextMonth: '2026-11',
				tone: 'stale',
			},
			// undated: no fabricated point on the timeline
			{ key: 'c', name: '指标C', month: null, nextMonth: null, tone: 'unknown' },
		],
		rows: [
			{
				key: 'a',
				metric: '指标A',
				source: 'akshare_nbs',
				tone: 'fresh',
				statusLabel: '最新',
				lastDate: '2026-09',
				nextExpected: '预计 2026-10',
				overdue: false,
				isManual: false,
				lifecycle: 'active',
			},
			{
				key: 'b',
				metric: '指标B',
				source: 'akshare_nbs',
				tone: 'stale',
				statusLabel: '已过期',
				lastDate: '2026-06',
				nextExpected: '预计 2026-07',
				overdue: true,
				isManual: false,
				lifecycle: 'active',
			},
			{
				key: 'm',
				metric: '手动指标',
				source: '手动',
				tone: 'aging',
				statusLabel: '临近截止',
				lastDate: '2026-08',
				nextExpected: '预计 2026-09',
				overdue: false,
				isManual: true,
				lifecycle: 'planned',
			},
		],
		generatedAt: '2026-10-11 08:00',
		empty: false,
		honestyNote: '「预计下次」按采集频率估算，非调度承诺。',
		...overrides,
	};
}

function render(
	model: ReleaseModel = makeModel(),
	handlers: ReleaseHandlers = {},
): HTMLElement {
	const root = document.createElement('div');
	document.body.appendChild(root);
	renderRelease(root, { model, handlers });
	return root;
}

function rows(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>('.mcd-release__row'));
}

function rowByKey(root: HTMLElement, key: string): HTMLElement {
	const found = rows(root).find((r) => r.dataset.key === key);
	if (!found) throw new Error(`row not found: ${key}`);
	return found;
}

afterEach(() => {
	document.body.textContent = '';
});

describe('renderRelease — structure', () => {
	it('scopes tokens and lays out the release view', () => {
		const root = render();
		expect(root.querySelector('.mcd-root.mcd-view')).not.toBeNull();
		expect(root.querySelector('.mcd-release')).not.toBeNull();
	});

	it('renders the header with the title, back action and month anchor', () => {
		const root = render();
		expect(root.querySelector('.mcd-header__title')?.textContent).toBe(
			'发布日历与采集状态',
		);
		expect(
			root.querySelector('.mcd-icon-button[aria-label="返回总览"]'),
		).not.toBeNull();
		expect(root.querySelector('.mcd-button')?.textContent).toBe('设置');
		expect(root.querySelector('.mcd-header__meta')?.textContent).toContain(
			'2026-10',
		);
	});

	it('renders a four-state legend', () => {
		const root = render();
		const labels = Array.from(
			root.querySelectorAll('.mcd-release__legend-item'),
		).map((n) => n.textContent);
		expect(labels).toEqual(['最新', '临近截止', '已过期', '待采集']);
	});
});

describe('renderRelease — timeline', () => {
	it('renders one tick per month and flags the anchor month', () => {
		const root = render();
		const ticks = root.querySelectorAll('.mcd-release__tick');
		expect(ticks).toHaveLength(3);
		const anchor = root.querySelector('.mcd-release__tick.is-anchor');
		expect(anchor?.querySelector('.mcd-release__label')?.textContent).toBe(
			'2026-10',
		);
	});

	it('places a filled marker per dated indicator and a hollow ring per next month', () => {
		const root = render();
		// a and b are dated; c is undated and draws nothing (no fabricated point)
		expect(
			root.querySelectorAll('.mcd-release__marker:not(.mcd-release__marker--next)'),
		).toHaveLength(2);
		expect(
			root.querySelectorAll('.mcd-release__marker--next'),
		).toHaveLength(2);
	});

	it('tones a filled marker by freshness', () => {
		const root = render();
		expect(root.querySelector('.mcd-release__marker.is-fresh')).not.toBeNull();
		expect(root.querySelector('.mcd-release__marker.is-stale')).not.toBeNull();
	});
});

describe('renderRelease — collection status list', () => {
	it('renders the five-column header and one row per indicator', () => {
		const root = render();
		const heads = Array.from(
			root.querySelectorAll('.mcd-release__list thead th'),
		).map((n) => n.textContent);
		expect(heads.slice(0, 5)).toEqual([
			'指标',
			'来源',
			'状态',
			'数据截至',
			'预计下次',
		]);
		expect(rows(root)).toHaveLength(3);
	});

	it('flags the overdue (stale) row without calling it a runtime failure', () => {
		const root = render();
		const overdue = root.querySelectorAll('.mcd-release__row.is-overdue');
		expect(overdue).toHaveLength(1);
		expect(rowByKey(root, 'b').classList.contains('is-overdue')).toBe(true);
		expect(rowByKey(root, 'b').textContent).toContain('已过期');
	});

	it('badges a manual series in the source column', () => {
		const root = render();
		const manual = rowByKey(root, 'm');
		expect(manual.querySelector('.mcd-badge')?.textContent).toBe('手动');
	});

	it('labels the derived next date with 预计', () => {
		const root = render();
		expect(rowByKey(root, 'a').textContent).toContain('预计 2026-10');
	});

	it('opens the detail view for the row key', () => {
		const onOpenDetail = jest.fn();
		const root = render(makeModel(), { onOpenDetail });
		const btn = rowByKey(root, 'a').querySelector('button');
		expect(btn?.textContent).toContain('查看详情');
		btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(onOpenDetail).toHaveBeenCalledWith('a');
	});
});

describe('renderRelease — states', () => {
	it('renders the empty state and no rows when the manifest is empty', () => {
		const root = render(
			makeModel({ empty: true, rows: [], markers: [], months: [] }),
		);
		expect(root.querySelector('.mcd-release__empty')).not.toBeNull();
		expect(root.querySelector('.mcd-release__empty')?.textContent).toContain(
			'暂无指标',
		);
		expect(rows(root)).toHaveLength(0);
		expect(root.querySelector('.mcd-release__timeline')).toBeNull();
	});

	it('renders the honesty note in the footer', () => {
		const root = render();
		expect(root.querySelector('.mcd-release__note')?.textContent).toContain(
			'非调度承诺',
		);
	});
});
