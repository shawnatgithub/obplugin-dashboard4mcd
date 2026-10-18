/** Freshness is a legend, not a collection failure. Diagnostics are counted once. */
import { safeSourceUrl, type Diagnostic } from '../contract/retail';
import type { OverviewStatus } from '../types';
import { el } from './dom';

export interface StatusOptions {
	onToggle?: (open: boolean) => void;
	renderMarkdown?: (markdown: string, host: HTMLElement) => void;
}
export function uniqueDiagnostics(items: readonly Diagnostic[]): Diagnostic[] {
	const seen = new Set<string>();
	return items.filter((d) => {
		const key = JSON.stringify([d.code, d.severity, d.row, d.period, d.source_url, d.message]);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
export function fencedContext(context: Record<string, unknown>): string {
	const json = JSON.stringify(context, null, 2);
	const longest = Math.max(2, ...(json.match(/`+/g) ?? []).map((s) => s.length));
	const fence = '`'.repeat(longest + 1);
	return `${fence}json\n${json}\n${fence}`;
}
export function buildStatusPanel(status: OverviewStatus, open: boolean, diagnostics: Diagnostic[] = [], options: StatusOptions = {}): HTMLElement {
	const unique = uniqueDiagnostics(diagnostics);
	const panel = el('div', 'mcd-status');
	const toggle = el('button', 'mcd-status__toggle');
	toggle.type = 'button';
	toggle.setAttribute('aria-expanded', String(open));
	toggle.appendChild(el('span', 'mcd-status__title', '数据状态'));
	for (const [severity, cls, label] of [['warning', 'warnings', '警告'], ['error', 'errors', '错误']] as const) {
		const count = unique.filter((d) => d.severity === severity).length;
		const capsule = el('span', `mcd-status__${cls} mcd-exception-count`, String(count));
		capsule.setAttribute('aria-label', `${label} ${count}`);
		capsule.title = `${label} ${count}`;
		toggle.appendChild(capsule);
	}
	const legends = el('span', 'mcd-status__counts');
	const unknown = status.items.filter((i) => i.tone === 'unknown').length;
	for (const [tone, label, count] of [
		['fresh', '最新', status.items.filter((i) => i.tone === 'fresh').length],
		['aging', '临近更新', status.upcoming], ['stale', '已过期', status.overdue],
		...(unknown ? [['unknown', '待采集', unknown]] : []),
	] as const) {
		const legend = el('span', `mcd-legend is-${tone}`);
		legend.append(el('span', `mcd-dot is-${tone}`), document.createTextNode(`${label} ${count}`));
		legends.appendChild(legend);
	}
	toggle.append(legends, el('span', 'mcd-status__chevron'));
	const body = el('div', 'mcd-status__body');
	body.hidden = !open;
	let rendered = false;
	const renderBody = () => {
		if (rendered) return;
		rendered = true;
		for (const diagnostic of unique) {
			const item = el('article', `mcd-diagnostic is-${diagnostic.severity}`);
			item.appendChild(el('strong', undefined, [diagnostic.row, diagnostic.period, diagnostic.code].filter(Boolean).join(' · ')));
			item.appendChild(el('p', undefined, diagnostic.message));
			if (safeSourceUrl(diagnostic.source_url)) {
				const source = el('a', undefined, diagnostic.source_url);
				source.href = diagnostic.source_url; source.target = '_blank'; source.rel = 'noopener noreferrer';
				item.appendChild(source);
			}
			if (diagnostic.context) {
				const code = el('div', 'mcd-diagnostic__code');
				item.appendChild(code);
				if (options.renderMarkdown) options.renderMarkdown(fencedContext(diagnostic.context), code);
				else {
					const pre = el('pre');
					pre.appendChild(el('code', 'language-json', JSON.stringify(diagnostic.context, null, 2)));
					code.appendChild(pre);
				}
			}
			body.appendChild(item);
		}
		if (status.items.length === 0) body.appendChild(el('p', 'mcd-muted mcd-fs-sm', '尚无已接入的真实序列。'));
		const list = el('ul', 'mcd-status__list');
		for (const item of status.items) {
			const row = el('li', 'mcd-status__item'); row.dataset.tone = item.tone;
			row.append(el('span', `mcd-dot is-${item.tone}`), el('span', 'mcd-status__metric', item.metric),
				el('span', `mcd-status__badge is-${item.tone}`, item.badge), el('span', 'mcd-status__detail', item.detail));
			list.appendChild(row);
		}
		body.appendChild(list);
	};
	panel.append(toggle, body);
	if (open) renderBody();
	toggle.addEventListener('click', () => {
		body.hidden = !body.hidden;
		toggle.setAttribute('aria-expanded', String(!body.hidden));
		if (!body.hidden) renderBody();
		options.onToggle?.(!body.hidden);
	});
	return panel;
}
