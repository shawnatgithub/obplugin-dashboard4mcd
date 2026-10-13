/**
 * Overview → markdown snapshot (pure, Obsidian-free).
 *
 * Builds an honest, paste-ready markdown block of the currently visible metric
 * cards so the reader can drop the dashboard into a note. It reuses the same
 * presentation strings the cards render (`deltaText`, `freshnessLabel`) so the
 * note never disagrees with the panel, and it carries the data-honesty signals
 * (UI-UX §6): the ETL update time, the active category, and — when the numbers
 * are the bundled fallback — an explicit 示例数据 caveat. Values are copied
 * verbatim from the cards; nothing is interpolated or recomputed here.
 */

import { deltaText, freshnessLabel } from '../format';
import type { MetricCard } from '../types';

export interface SnapshotMeta {
	/** Header line, e.g. `ETL 更新于 2026-10-11 08:00`. */
	updatedAt: string;
	/** The active filter chip label (全部 / 消费 / 价格 / 货币). */
	category: string;
	/** True when the cards are the bundled sample fallback, not real data. */
	isSample: boolean;
}

/** Escape a pipe so a value cannot break the markdown table. */
function cell(text: string): string {
	return text.replace(/\|/g, '\\|');
}

/** One table row per card: 指标 / 数值 / 较上期 / 数据期 / 状态. */
function row(card: MetricCard): string {
	const value = `${card.value}${card.unit ? ' ' + card.unit : ''}`.trim();
	const delta = deltaText(card.delta) ?? '—';
	return `| ${cell(card.name)} | ${cell(value)} | ${cell(delta)} | ${cell(
		card.period,
	)} | ${cell(freshnessLabel(card.fresh))} |`;
}

/**
 * Render the snapshot as markdown. An empty card set yields an honest "no data"
 * note rather than a bare table, so the inserted block always explains itself.
 */
export function snapshotMarkdown(
	cards: readonly MetricCard[],
	meta: SnapshotMeta,
): string {
	const lines: string[] = ['## 宏观数据看板快照', ''];
	lines.push(`> ${meta.updatedAt} · 分类：${meta.category}`);
	if (meta.isSample) {
		lines.push('>');
		lines.push('> ⚠️ 当前为内置示例数据，非真实数据。');
	}
	lines.push('');

	if (cards.length === 0) {
		lines.push('当前分类下暂无指标。');
	} else {
		lines.push('| 指标 | 数值 | 较上期 | 数据期 | 状态 |');
		lines.push('| --- | --- | --- | --- | --- |');
		for (const card of cards) lines.push(row(card));
	}

	lines.push('');
	lines.push('数据来源：本地 ETL JSON。');
	return lines.join('\n');
}
