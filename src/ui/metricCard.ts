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
	EXPIRED_SPARK_TEXT,
	deltaText,
	freshnessDotClass,
	freshnessLabel,
	gapNote,
	isExpired,
} from '../format';
import type { MetricCard } from '../types';
import { el } from './dom';
import { buildSparkline } from './sparklineView';

export interface MetricCardHandlers {
	/** Called with the card name when the card is activated. */
	onSelect?: (name: string) => void;
}

export function buildMetricCard(
	card: MetricCard,
	handlers: MetricCardHandlers = {},
	selected = false,
): HTMLElement {
	const expired = isExpired(card);

	const root = el('button', 'mcd-card');
	root.type = 'button';
	root.dataset.metric = card.name;
	root.setAttribute(
		'aria-label',
		`${card.name} ${card.value}${card.unit ? ' ' + card.unit : ''}`.trim(),
	);
	if (selected) root.classList.add('is-selected');
	if (expired) root.classList.add('is-disabled');

	// Row 1 — name (+ 手动 badge on the right)
	const nameRow = el('div', 'mcd-card__row');
	nameRow.appendChild(el('span', 'mcd-card__name', card.name));
	if (card.badge === '手动') {
		const badge = el('span', 'mcd-badge is-red');
		badge.appendChild(el('span', 'mcd-dot is-red'));
		badge.appendChild(document.createTextNode('手动'));
		nameRow.appendChild(badge);
	}
	root.appendChild(nameRow);

	// Row 2 — value + unit + delta
	const valueRow = el('div', 'mcd-card__value');
	valueRow.appendChild(el('span', undefined, card.value));
	if (card.unit) {
		valueRow.appendChild(el('span', 'mcd-card__unit', card.unit));
	}
	const delta = deltaText(card.delta);
	if (delta) {
		valueRow.appendChild(el('span', 'mcd-delta', delta));
	}
	root.appendChild(valueRow);

	// Row 3 — sparkline, or the expired placeholder
	if (expired) {
		root.appendChild(el('div', 'mcd-card__expired', EXPIRED_SPARK_TEXT));
	} else {
		root.appendChild(buildSparkline(card));
	}

	// Row 4 — foot
	const foot = el('div', 'mcd-card__foot');
	const footLeft = el('span', 'mcd-card__foot-left');
	footLeft.appendChild(el('span', 'mcd-mono', card.period));
	const dot = el('span', freshnessDotClass(card.fresh));
	dot.title = freshnessLabel(card.fresh);
	footLeft.appendChild(dot);
	if (expired) {
		footLeft.appendChild(
			el('span', 'mcd-card__foot-expired', card.expired ?? ''),
		);
	} else {
		footLeft.appendChild(el('span', undefined, freshnessLabel(card.fresh)));
	}
	foot.appendChild(footLeft);

	if (card.badge === 'NEW') {
		foot.appendChild(el('span', 'mcd-badge is-new', 'NEW'));
	} else if (!card.badge) {
		const note = gapNote(card.gaps);
		if (note) foot.appendChild(el('span', undefined, note));
	}
	root.appendChild(foot);

	root.addEventListener('click', () => handlers.onSelect?.(card.name));

	return root;
}
