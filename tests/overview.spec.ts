import { OVERVIEW_GROUPS, OVERVIEW_META } from '../src/data/overview';
import type { MetricGroup } from '../src/types';
import { renderOverview } from '../src/ui/overview';
import type { OverviewProps } from '../src/ui/overview';

/**
 * DOM-level tests for the Overview screen. `renderOverview` is Obsidian-free,
 * so these run under jsdom (the project-wide Jest environment) and assert the
 * real structure, the data-honesty signals (UI-UX §6), and the interactions.
 */

function render(props: Partial<OverviewProps> = {}): HTMLElement {
	const root = document.createElement('div');
	document.body.appendChild(root);
	renderOverview(root, {
		meta: OVERVIEW_META,
		groups: OVERVIEW_GROUPS,
		...props,
	});
	return root;
}

function cards(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>('.mcd-card'));
}

function cardByName(root: HTMLElement, name: string): HTMLElement {
	const found = cards(root).find((c) => c.dataset.metric === name);
	if (!found) throw new Error(`card not found: ${name}`);
	return found;
}

const TOTAL_CARDS = OVERVIEW_GROUPS.reduce((n, g) => n + g.cards.length, 0);

afterEach(() => {
	document.body.textContent = '';
});

describe('renderOverview — structure', () => {
	it('scopes tokens with .mcd-root and lays out .mcd-view', () => {
		const root = render();
		expect(root.querySelector('.mcd-root.mcd-view')).not.toBeNull();
	});

	it('renders the header with title, crumb, meta and both actions', () => {
		const root = render();
		expect(root.querySelector('.mcd-header__title')?.textContent).toBe(
			'宏观数据看板',
		);
		expect(root.querySelector('.mcd-header__crumb')?.textContent).toBe('总览');
		expect(root.querySelector('.mcd-header__meta')?.textContent).toBe(
			OVERVIEW_META.updatedAt,
		);
		expect(root.querySelector('.mcd-icon-button')).not.toBeNull();
		expect(root.querySelector('.mcd-button')?.textContent).toBe('设置');
	});

	it('renders one group per section with a count, and every card', () => {
		const root = render();
		expect(root.querySelectorAll('.mcd-group')).toHaveLength(
			OVERVIEW_GROUPS.length,
		);
		expect(root.querySelector('.mcd-group__count')?.textContent).toBe('8 项');
		expect(cards(root)).toHaveLength(TOTAL_CARDS);
	});

	it('shows the sample-data banner and the footnote (data honesty)', () => {
		const root = render();
		expect(root.querySelector('.mcd-banner')?.textContent).toContain(
			'示例数据',
		);
		expect(root.querySelector('.mcd-main > p.mcd-muted')?.textContent).toBe(
			OVERVIEW_META.footnote,
		);
	});

	it('omits the banner when the notice is empty (real contract data)', () => {
		const root = render({ meta: { ...OVERVIEW_META, sampleNotice: '' } });
		expect(root.querySelector('.mcd-banner')).toBeNull();
	});
});

describe('renderOverview — metric card', () => {
	it('renders name, value, unit and delta', () => {
		const root = render();
		const card = cardByName(root, '社会消费品零售总额（同比）');
		expect(card.querySelector('.mcd-card__name')?.textContent).toBe(
			'社会消费品零售总额（同比）',
		);
		expect(card.querySelector('.mcd-card__value')?.textContent).toContain('3.8');
		expect(card.querySelector('.mcd-card__unit')?.textContent).toBe('%');
		expect(card.querySelector('.mcd-delta')?.textContent).toBe('↓ 0.3pct');
	});

	it('draws a sparkline with a baseline, one marker per gap, path and end dot', () => {
		const root = render();
		const svg = cardByName(root, '社会消费品零售总额（同比）').querySelector(
			'.mcd-spark',
		);
		expect(svg).not.toBeNull();
		// 1 baseline + 1 gap marker (this card has gaps:[4])
		expect(svg?.querySelectorAll('line')).toHaveLength(2);
		expect(svg?.querySelector('path')).not.toBeNull();
		expect(svg?.querySelector('circle')).not.toBeNull();
	});

	it('renders a NEW badge (not a gap note) when the card is badged NEW', () => {
		const root = render();
		const card = cardByName(root, '网上零售额（同比）');
		expect(card.querySelector('.mcd-badge.is-new')?.textContent).toBe('NEW');
	});

	it('renders a gap note when there are gaps and no badge', () => {
		const root = render();
		const card = cardByName(root, '服务零售额（同比）');
		expect(card.querySelector('.mcd-card__foot')?.textContent).toContain(
			'含 2 期缺失',
		);
	});

	it('renders the 手动 badge with a red dot', () => {
		const root = render();
		const card = cardByName(root, '住户存款增速');
		expect(card.querySelector('.mcd-badge.is-red')?.textContent).toContain(
			'手动',
		);
		expect(card.querySelector('.mcd-dot.is-red')).not.toBeNull();
	});

	it('omits the end dot for a stale (muted) series', () => {
		const root = render();
		const svg = cardByName(root, '住户存款增速').querySelector('.mcd-spark');
		expect(svg?.querySelector('circle')).toBeNull();
	});
});

describe('renderOverview — expired card', () => {
	it('disables the card, shows the placeholder instead of a sparkline', () => {
		const root = render();
		const card = cardByName(root, '上海金融数据（季度）');
		expect(card.classList.contains('is-disabled')).toBe(true);
		expect(card.querySelector('.mcd-card__expired')?.textContent).toBe(
			'近 24 期无可用更新',
		);
		expect(card.querySelector('.mcd-spark')).toBeNull();
	});

	it('surfaces the expired reason in the foot', () => {
		const root = render();
		const card = cardByName(root, '上海金融数据（季度）');
		expect(card.querySelector('.mcd-card__foot-expired')?.textContent).toBe(
			'数据已过期 · 请检查采集',
		);
	});
});

describe('renderOverview — selection', () => {
	it('selects on click, deselects on second click (single selection)', () => {
		const root = render();
		const a = cardByName(root, 'CPI（同比）');
		const b = cardByName(root, '核心 CPI（同比）');

		a.click();
		expect(a.classList.contains('is-selected')).toBe(true);

		b.click();
		expect(a.classList.contains('is-selected')).toBe(false);
		expect(b.classList.contains('is-selected')).toBe(true);

		b.click();
		expect(b.classList.contains('is-selected')).toBe(false);
	});

	it('reports the resolved selection to onSelect', () => {
		const onSelect = jest.fn();
		const root = render({ handlers: { onSelect } });
		const a = cardByName(root, 'CPI（同比）');

		a.click();
		expect(onSelect).toHaveBeenLastCalledWith('CPI（同比）');

		a.click();
		expect(onSelect).toHaveBeenLastCalledWith(null);
	});

	it('honours an initial selection', () => {
		const root = render({ selected: 'M1（同比）' });
		expect(
			cardByName(root, 'M1（同比）').classList.contains('is-selected'),
		).toBe(true);
	});
});

describe('renderOverview — header actions', () => {
	it('fires onRefresh and onOpenSettings', () => {
		const onRefresh = jest.fn();
		const onOpenSettings = jest.fn();
		const root = render({ handlers: { onRefresh, onOpenSettings } });

		root.querySelector<HTMLElement>('.mcd-icon-button')?.click();
		expect(onRefresh).toHaveBeenCalledTimes(1);

		root.querySelector<HTMLElement>('.mcd-button')?.click();
		expect(onOpenSettings).toHaveBeenCalledTimes(1);
	});

	it('fires onOpenRelease from the header nav entry', () => {
		const onOpenRelease = jest.fn();
		const root = render({ handlers: { onOpenRelease } });
		const nav = root.querySelector<HTMLElement>('.mcd-nav');
		expect(nav?.textContent).toBe('发布日历');
		nav?.click();
		expect(onOpenRelease).toHaveBeenCalledTimes(1);
	});
});

describe('renderOverview — empty state', () => {
	it('shows the empty state and no cards when there are no groups', () => {
		const root = render({ groups: [] });
		expect(root.querySelector('.mcd-empty')).not.toBeNull();
		expect(root.querySelector('.mcd-empty__title')?.textContent).toBe(
			'暂无数据',
		);
		expect(cards(root)).toHaveLength(0);
	});
});

describe('renderOverview — card → detail navigation', () => {
	const keyed: MetricGroup[] = [
		{
			title: '全国趋势',
			cards: [
				{
					name: '社会消费品零售总额',
					key: 'retail_sales_total',
					value: '44100',
					unit: '亿元',
					period: '2026-09',
					fresh: 'fresh',
					seed: 1,
				},
			],
		},
	];

	it('exposes the contract key on the card element', () => {
		const root = render({ groups: keyed });
		expect(cards(root)[0]?.dataset.key).toBe('retail_sales_total');
	});

	it('fires onOpen with the key for a keyed card', () => {
		const onOpen = jest.fn();
		const root = render({ groups: keyed, handlers: { onOpen } });
		cards(root)[0]?.click();
		expect(onOpen).toHaveBeenCalledWith('retail_sales_total');
	});

	it('does not fire onOpen for a keyless sample card', () => {
		const onOpen = jest.fn();
		const root = render({ handlers: { onOpen } });
		cardByName(root, 'CPI（同比）').click();
		expect(onOpen).not.toHaveBeenCalled();
	});
});
