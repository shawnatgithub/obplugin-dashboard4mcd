/**
 * Metric card renderer (Overview grid cell).
 *
 * Layout follows the prototype `MetricCard` (Overview.tsx) and the component
 * spec (UI-UX §5): name row (+ 手动 badge), value row (value/unit/delta),
 * sparkline or expired placeholder, and a foot row (period + freshness dot +
 * label, then a NEW badge or a gap note). Selection is owned by the parent so
 * only one card is selected at a time; this component just reports clicks.
 */

import {
	freshnessDotClass,
	freshnessLabel,
	gapNote,
	isExpired,
} from '../format';
import { calendarPoints, type OverviewRange } from '../analysis/overviewRange';
import { sparkGaps } from '../sparkline';
import type { MetricCard } from '../types';
import { el } from './dom';
import { buildSparkline } from './sparklineView';

export interface MetricCardHandlers {
	/** Called with the card name when the card is activated. */
	onSelect?: (name: string) => void;
	/** Called with the contract key to open the detail view (real cards only). */
	onOpen?: (key: string) => void;
}

export function cardIdentity(card: MetricCard): string {
	return card.key ?? `sample:${card.seed}:${card.name}`;
}

function comparison(card: MetricCard): string {
	if (!card.delta) return '—';
	const unit = ['%', 'pct', 'pp'].includes(card.unit) ? 'pp' : card.unit;
	const magnitude = card.delta.dir === 'flat' ? 0 : Number(card.delta.v);
	if (!Number.isFinite(magnitude)) return '—';
	return `${card.delta.dir === 'down' ? '−' : '+'}${magnitude.toFixed(1)}${unit ? ` ${unit}` : ''}`;
}

export function updateCardSpark(root: HTMLElement, card: MetricCard, range: OverviewRange): void {
	const host = root.querySelector<HTMLElement>('.mcd-card__spark');
	if (!host) return;
	host.textContent = '';
	if (isExpired(card)) {
		host.appendChild(el('div', 'mcd-card__expired', '暂无可用数据'));
		return;
	}
	const points = card.points ? calendarPoints(card.points, card.frequency ?? 'monthly', range) : null;
	const spark = points?.map((p) => p.value);
	const display = spark ? { ...card, spark, gaps: sparkGaps(spark) } : card;
	host.appendChild(buildSparkline(display));
	host.title = gapNote(display.gaps) ?? '所选时间范围';
}

export function buildMetricCard(
	card: MetricCard,
	handlers: MetricCardHandlers = {},
	selected = false,
	range: OverviewRange = '12',
): HTMLElement {
	const expired = isExpired(card);

	const root = el('button', 'mcd-card');
	root.type = 'button';
	root.dataset.metric = card.name;
	root.dataset.id = cardIdentity(card);
	root.setAttribute('aria-pressed', String(selected));
	root.title = [card.name, freshnessLabel(card.fresh), card.badge, card.expired, gapNote(card.gaps)].filter(Boolean).join(' · ');
	if (card.key) root.dataset.key = card.key;
	root.setAttribute(
		'aria-label',
		`${card.name} ${card.value}${card.unit ? ' ' + card.unit : ''}`.trim(),
	);
	if (selected) root.classList.add('is-selected');
	if (expired) root.classList.add('is-disabled');

	// Row 1 — name (+ 手动 badge on the right)
	const nameRow = el('div', 'mcd-card__row');
	nameRow.appendChild(el('span', 'mcd-card__name', card.name));
	const stamp = el('span', 'mcd-card__stamp');
	const dot = el('span', freshnessDotClass(card.fresh));
	dot.title = freshnessLabel(card.fresh);
	stamp.append(dot, el('span', 'mcd-mono', card.period || '—'));
	nameRow.appendChild(stamp);
	root.appendChild(nameRow);

	// Row 2 — value + unit + delta
	const valueRow = el('div', 'mcd-card__value');
	valueRow.appendChild(el('span', undefined, card.value));
	if (card.unit) {
		valueRow.appendChild(el('span', 'mcd-card__unit', card.unit));
	}
	root.appendChild(valueRow);

	const bottom = el('div', 'mcd-card__bottom');
	const delta = el('div', 'mcd-card__comparison');
	delta.append(el('span', 'mcd-muted', '较上期'), el('span', 'mcd-delta', comparison(card)));
	bottom.append(delta, el('div', 'mcd-card__spark'));
	root.appendChild(bottom);
	updateCardSpark(root, card, range);

	root.addEventListener('click', () => {
		handlers.onSelect?.(cardIdentity(card));
	});

	return root;
}
