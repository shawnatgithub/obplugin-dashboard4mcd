/** Linked chart and retail snapshot. The owner calls update only after attachment. */
import { overviewChart, type OverviewRange } from '../analysis/overviewRange';
import type { ChartModel } from '../analysis/chartModel';
import type { DetailModel } from '../contract/mapper';
import type { RetailLoadResult } from '../contract/loader';
import type { MetricCard } from '../types';
import { renderChartSvg, type ChartHandle } from './chartView';
import { el } from './dom';
import { buildRetailTable } from './retailTable';

export type ChartRenderer = (host: HTMLElement, model: ChartModel) => ChartHandle;
export function buildOverviewDetail(retail?: RetailLoadResult, renderer: ChartRenderer = renderChartSvg, onOpen?: (key: string) => void) {
	const root = el('div', 'mcd-overview-detail');
	const trend = el('section', 'mcd-overview-detail__trend');
	root.append(trend, buildRetailTable(retail));
	let chart: ChartHandle | null = null;
	const dispose = () => { chart?.dispose(); chart = null; };
	return {
		root, dispose,
		update(card: MetricCard | undefined, detail: DetailModel | undefined, range: OverviewRange): void {
			dispose(); trend.textContent = '';
			const header = el('div', 'mcd-overview-detail__header');
			header.appendChild(el('h2', 'mcd-section-title', card?.name ?? '暂无可选指标'));
			if (card?.key && onOpen) {
				const key = card.key;
				const button = el('button', 'mcd-overview-detail__open', '打开详情');
				button.type = 'button'; button.addEventListener('click', () => onOpen(key));
				header.appendChild(button);
			}
			trend.appendChild(header);
			if (!detail) {
				trend.appendChild(el('p', 'mcd-muted mcd-overview-detail__empty', card?.key ? '未找到该指标的序列数据' : card ? '示例卡片无真实历史序列；请接入 ETL 数据。' : '当前筛选下没有指标。'));
				return;
			}
			if (detail.statusBanner) trend.appendChild(el('p', 'mcd-muted', detail.statusBanner));
			const model = overviewChart(detail, range);
			if (model.annotation) trend.appendChild(el('p', 'mcd-chart__annotation', model.annotation));
			const host = el('div', 'mcd-overview-detail__chart');
			host.setAttribute('aria-label', `${detail.title} 趋势图`);
			trend.appendChild(host);
			trend.appendChild(el('p', 'mcd-muted mcd-chart__source', `来源：${detail.source ?? '本地 ETL'} · 数据截至 ${detail.lastDate ?? '—'} · ETL 更新 ${detail.updatedAt ?? '—'} · 虚线表示缺失期`));
			chart = renderer(host, model);
		},
	};
}
