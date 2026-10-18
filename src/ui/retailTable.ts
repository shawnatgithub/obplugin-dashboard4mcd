/** One independently dated retail snapshot; never mix row-specific latest dates. */
import type { RetailLoadResult } from '../contract/loader';
import { formatTimestamp } from '../contract/mapper';
import { RETAIL_ROWS, safeSourceUrl } from '../contract/retail';
import { el } from './dom';

function number(value: number | null | undefined, signed = false): string {
	if (value == null) return '—';
	return `${signed && value > 0 ? '+' : ''}${value.toFixed(1)}`;
}
export function buildRetailTable(result?: RetailLoadResult): HTMLElement {
	const section = el('section', 'mcd-retail');
	section.appendChild(el('h2', 'mcd-section-title', '分业态零售（限额以上）'));
	section.appendChild(el('p', 'mcd-muted mcd-retail__scope', '选定商品类别及餐饮；占比以全国限额以上商品零售与餐饮总额为分母，非所列类别合计。'));
	const product = result?.ok ? result.value : null;
	const period = product ? [...product.periods].sort((a, b) => b.date.localeCompare(a.date))[0] : undefined;
	const status = el('p', 'mcd-retail__status');
	status.textContent = period ? `${period.date} · ${period.source_kind.toUpperCase()} · 金额精度 ${period.amount_precision} 位小数（亿元）`
		: result && !result.ok ? result.detail : '尚无已验证的零售月度数据';
	section.appendChild(status);
	if (period && safeSourceUrl(period.source_url)) {
		const source = el('a', 'mcd-retail__source', '国家统计局 · 数据来源');
		source.href = period.source_url;
		source.target = '_blank';
		source.rel = 'noopener noreferrer';
		section.appendChild(source);
	}
	const wrap = el('div', 'mcd-retail__scroll');
	const table = el('table', 'mcd-retail__table');
	table.setAttribute('aria-label', `分业态零售 ${period?.date ?? '暂无数据'}`);
	const head = el('thead');
	const headings = el('tr');
	for (const name of ['业态', '同比%', '较上月pp', '占比%']) {
		const cell = el('th', undefined, name);
		cell.scope = 'col';
		headings.appendChild(cell);
	}
	head.appendChild(headings);
	const body = el('tbody');
	for (const [id, name] of Object.entries(RETAIL_ROWS)) {
		const row = period?.rows.find((r) => r.id === id);
		const tr = el('tr');
		tr.dataset.row = id;
		tr.appendChild(el('td', undefined, name));
		for (const [field, signed] of [['yoy_pct', false], ['delta_pp', true], ['share_pct', false]] as const) {
			const cell = el('td', 'mcd-tabular', number(row?.[field], signed));
			if (row?.[field] == null) cell.title = row?.reason === 'combined_january_february'
				? '1–2 月合并发布，无单月可比值' : row?.reason ?? (field === 'delta_pp' ? '缺少相邻上月可比值' : '尚未采集或未发布');
			tr.appendChild(cell);
		}
		body.appendChild(tr);
	}
	table.append(head, body); wrap.appendChild(table); section.appendChild(wrap);
	if (product) {
		section.appendChild(el('p', 'mcd-muted mcd-retail__timestamps', `上次成功：${product.last_success_at ? formatTimestamp(product.last_success_at) : '—'} · 最近尝试：${formatTimestamp(product.last_attempt_at)}`));
		if (product.diagnostics.length) section.appendChild(el('p', 'mcd-muted', '采集或质量提示见“数据状态”；保留数据不代表本次采集成功。'));
	}
	return section;
}
