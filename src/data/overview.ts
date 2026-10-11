/**
 * Bundled Overview (S1) sample data.
 *
 * Copied verbatim from the visual/data authority
 * `prototype/mcd-console/src/screens/Overview.tsx` (UI-UX §8.2: values follow
 * prototype *source*, not screenshots). This is intentionally placeholder data
 * so the dashboard is formed, usable and testable before the Python ETL repo
 * starts emitting real JSON; the view labels it as sample data (UI-UX §6).
 *
 * When ETL output lands, a loader will produce `MetricGroup[]` with this exact
 * shape and this fixture becomes the fallback/demo dataset.
 */

import type { MetricGroup } from '../types';

/** Header + footnote + honesty strings for the overview screen. */
export interface OverviewMeta {
	title: string;
	crumb: string;
	/** Right-aligned header meta line (data currency). */
	updatedAt: string;
	/** Amber banner clarifying the data provenance (UI-UX §6). */
	sampleNotice: string;
	/** Muted footnote under the grid. */
	footnote: string;
}

export const OVERVIEW_META: OverviewMeta = {
	title: '宏观数据看板',
	crumb: '总览',
	updatedAt: 'ETL 更新于 2026-10-11 08:00',
	sampleNotice:
		'当前展示内置示例数据，尚未接入 ETL 输出；数值与折线均为占位，非真实数据。',
	footnote:
		'迷你折线为 24 期线框占位，虚竖线 = 缺失期（不插值）。数据来源：本地 ETL JSON。',
};

export const OVERVIEW_GROUPS: MetricGroup[] = [
	{
		title: '全国趋势',
		cards: [
			{
				name: '社会消费品零售总额（同比）',
				value: '3.8',
				unit: '%',
				delta: { dir: 'down', v: '0.3' },
				period: '2026-09',
				fresh: 'fresh',
				badge: 'NEW',
				seed: 1,
				gaps: [4],
			},
			{
				name: '网上零售额（同比）',
				value: '7.4',
				unit: '%',
				delta: { dir: 'up', v: '0.2' },
				period: '2026-09',
				fresh: 'fresh',
				badge: 'NEW',
				seed: 2,
				gaps: [4],
			},
			{
				name: '服务零售额（同比）',
				value: '6.2',
				unit: '%',
				period: '2026-09',
				fresh: 'fresh',
				seed: 3,
				gaps: [4, 16],
			},
			{
				name: '餐饮收入（同比）',
				value: '3.1',
				unit: '%',
				delta: { dir: 'down', v: '0.4' },
				period: '2026-09',
				fresh: 'fresh',
				seed: 4,
				gaps: [4],
			},
			{
				name: 'CPI（同比）',
				value: '0.6',
				unit: '%',
				period: '2026-09',
				fresh: 'fresh',
				seed: 5,
			},
			{
				name: '核心 CPI（同比）',
				value: '0.8',
				unit: '%',
				period: '2026-09',
				fresh: 'fresh',
				seed: 6,
			},
			{
				name: 'M1（同比）',
				value: '3.2',
				unit: '%',
				delta: { dir: 'up', v: '0.5' },
				period: '2026-09',
				fresh: 'fresh',
				seed: 7,
			},
			{
				name: 'M2（同比）',
				value: '7.1',
				unit: '%',
				delta: { dir: 'flat' },
				period: '2026-09',
				fresh: 'fresh',
				seed: 8,
			},
		],
	},
	{
		title: '地方：上海',
		cards: [
			{
				name: '上海社会消费品零售总额（同比）',
				value: '2.3',
				unit: '%',
				period: '2026-08',
				fresh: 'aging',
				seed: 9,
				gaps: [3],
			},
			{
				name: '上海餐饮收入（同比）',
				value: '1.9',
				unit: '%',
				period: '2026-08',
				fresh: 'aging',
				seed: 10,
				gaps: [3],
			},
			{
				name: '上海金融数据（季度）',
				value: '—',
				unit: '',
				period: '2026-Q1',
				fresh: 'stale',
				expired: '数据已过期 · 请检查采集',
				seed: 11,
			},
		],
	},
	{
		title: '地方：四川 / 成都',
		cards: [
			{
				name: '四川社会消费品零售总额（同比）',
				value: '4.1',
				unit: '%',
				period: '2026-08',
				fresh: 'aging',
				seed: 12,
				gaps: [3],
			},
			{
				name: '成都社会消费品零售总额（同比）',
				value: '4.5',
				unit: '%',
				period: '2026-08',
				fresh: 'aging',
				badge: 'NEW',
				seed: 13,
				gaps: [3, 15],
			},
		],
	},
	{
		title: '补充指标',
		cards: [
			{
				name: 'M1-M2 剪刀差',
				value: '-3.9',
				unit: 'pct',
				period: '2026-09',
				fresh: 'fresh',
				seed: 14,
			},
			{
				name: '城市轨道交通客运量（上海）',
				value: '+5.2',
				unit: '% 环比',
				period: '2026-09',
				fresh: 'fresh',
				seed: 15,
			},
			{
				name: '住户存款增速',
				value: '12.4',
				unit: '%',
				period: '2026-09',
				fresh: 'stale',
				badge: '手动',
				seed: 16,
			},
		],
	},
];
