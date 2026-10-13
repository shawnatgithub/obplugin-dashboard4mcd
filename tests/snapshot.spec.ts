import type { MetricCard } from '../src/types';
import { snapshotMarkdown } from '../src/ui/snapshot';

/**
 * Snapshot tests: the markdown the overview inserts into a note must be honest
 * (UI-UX §6) — it carries the ETL update time, the active category, a sample
 * caveat when the numbers are the fallback, and the exact card values with no
 * interpolation. Pure string builder, so these assert the text directly.
 */

function card(over: Partial<MetricCard> = {}): MetricCard {
	return {
		name: '社会消费品零售总额（同比）',
		key: 'retail_sales_total_yoy',
		value: '3.8',
		unit: '%',
		period: '2026-09',
		fresh: 'fresh',
		seed: 1,
		delta: { dir: 'down', v: '0.3' },
		...over,
	};
}

describe('snapshotMarkdown', () => {
	it('renders a heading, the meta line, a table row and the source footer', () => {
		const md = snapshotMarkdown([card()], {
			updatedAt: 'ETL 更新于 2026-10-11 08:00',
			category: '全部',
			isSample: false,
		});
		expect(md).toContain('## 宏观数据看板快照');
		expect(md).toContain('> ETL 更新于 2026-10-11 08:00 · 分类：全部');
		expect(md).toContain('| 指标 | 数值 | 较上期 | 数据期 | 状态 |');
		expect(md).toContain('| 社会消费品零售总额（同比） | 3.8 % | ↓ 0.3pct | 2026-09 | 最新 |');
		expect(md).toContain('数据来源：本地 ETL JSON。');
	});

	it('adds the sample-data caveat only when the numbers are the fallback', () => {
		const sample = snapshotMarkdown([card()], {
			updatedAt: 'x',
			category: '全部',
			isSample: true,
		});
		expect(sample).toContain('当前为内置示例数据，非真实数据');

		const real = snapshotMarkdown([card()], {
			updatedAt: 'x',
			category: '全部',
			isSample: false,
		});
		expect(real).not.toContain('示例数据');
	});

	it('renders an honest empty note when no cards are visible', () => {
		const md = snapshotMarkdown([], {
			updatedAt: 'x',
			category: '货币',
			isSample: false,
		});
		expect(md).toContain('当前分类下暂无指标。');
		expect(md).not.toContain('| 指标 |');
	});

	it('shows an em dash for a card with no delta, and escapes pipes', () => {
		const md = snapshotMarkdown(
			[card({ name: 'A|B', delta: undefined })],
			{ updatedAt: 'x', category: '全部', isSample: false },
		);
		expect(md).toContain('| A\\|B | 3.8 % | — | 2026-09 | 最新 |');
	});
});
