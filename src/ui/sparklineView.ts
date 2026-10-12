/**
 * Mini sparkline renderer (raw SVG, no chart dependency).
 *
 * Mirrors the prototype `Sparkline` (Overview.tsx): a baseline grid line, a
 * dashed vertical marker at every missing period, the accent (or muted wire for
 * stale series) broken path, and an end-point dot for live series. Gaps are
 * never interpolated across (UI-UX §6 断线).
 */

import {
	SPARK_HEIGHT,
	SPARK_WIDTH,
	buildSparkPath,
	normalizeSpark,
	shape,
	sparkX,
	sparkY,
} from '../sparkline';
import type { MetricCard } from '../types';
import { svgEl } from './dom';

export function buildSparkline(card: MetricCard): SVGSVGElement {
	const muted = card.fresh === 'stale';
	// Real values win over the deterministic placeholder shape (spec D-M2-5).
	const pts = card.spark ? normalizeSpark(card.spark) : shape(card.seed);
	const n = pts.length;
	const gaps = card.gaps ?? [];

	const svg = svgEl('svg', {
		class: 'mcd-spark',
		viewBox: `0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`,
		preserveAspectRatio: 'none',
	});

	svg.appendChild(
		svgEl('line', {
			x1: 0,
			x2: SPARK_WIDTH,
			y1: SPARK_HEIGHT - 0.5,
			y2: SPARK_HEIGHT - 0.5,
			stroke: 'var(--mcd-grid)',
			'vector-effect': 'non-scaling-stroke',
		}),
	);

	for (const gap of gaps) {
		const gx = sparkX(gap, n);
		svg.appendChild(
			svgEl('line', {
				x1: gx,
				x2: gx,
				y1: 2,
				y2: SPARK_HEIGHT,
				stroke: 'var(--mcd-wire)',
				'stroke-dasharray': '2 2',
				'vector-effect': 'non-scaling-stroke',
			}),
		);
	}

	const pathAttrs: Record<string, string | number> = {
		d: buildSparkPath(pts, gaps),
		fill: 'none',
		stroke: muted ? 'var(--mcd-wire)' : 'var(--mcd-accent)',
		'stroke-width': 1.5,
		'vector-effect': 'non-scaling-stroke',
		'stroke-linejoin': 'round',
	};
	if (muted) pathAttrs['stroke-dasharray'] = '3 3';
	svg.appendChild(svgEl('path', pathAttrs));

	const last = pts[n - 1];
	if (!muted && last !== undefined && !gaps.includes(n - 1)) {
		svg.appendChild(
			svgEl('circle', {
				cx: SPARK_WIDTH,
				cy: sparkY(last),
				r: 2.5,
				fill: 'var(--mcd-accent)',
			}),
		);
	}

	return svg;
}
