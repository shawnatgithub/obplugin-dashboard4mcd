/**
 * Pure overlay eligibility (M3-T1 / spec §4, D-M3-5/D-M3-6): faithfully consume
 * the frozen capabilities matrix. A supported single-axis candidate with enough
 * overlap overlays on one axis; INCOMPATIBLE_REGION becomes a split dual-chart;
 * any other unsupported reason blocks with its reason_code. Never re-judge the
 * contract's axis decision.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveOverlay } from '../../src/analysis/overlay';
import { parseCapabilities } from '../../src/contract/parse';
import type { CapabilitiesV1, Panel, SeriesPoint } from '../../src/contract/types';

const capsPath = path.resolve(
	__dirname,
	'..',
	'golden',
	'contract',
	'processed',
	'capabilities.json',
);
const parsed = parseCapabilities(
	JSON.parse(readFileSync(capsPath, 'utf8')) as unknown,
);
if (!parsed.ok) throw new Error('golden capabilities failed to parse');
const CAPS: CapabilitiesV1 = parsed.value;

function panelOf(key: string): Panel {
	return CAPS.panels[key] ?? null;
}

function pt(date: string, value: number | null = 1): SeriesPoint {
	return { date, value, revision: 1 };
}

/** `count` monthly points starting at `year`-01, all non-null. */
function monthlySeries(startYear: number, count: number): SeriesPoint[] {
	const out: SeriesPoint[] = [];
	for (let i = 0; i < count; i++) {
		const y = startYear + Math.floor(i / 12);
		const m = (i % 12) + 1;
		out.push(pt(`${y}-${String(m).padStart(2, '0')}`));
	}
	return out;
}

/** Dates with a non-null value in both series (the meaningful overlap). */
function overlap(a: SeriesPoint[], b: SeriesPoint[]): number {
	const setB = new Set(b.filter((p) => p.value !== null).map((p) => p.date));
	return a.filter((p) => p.value !== null && setB.has(p.date)).length;
}

describe('resolveOverlay', () => {
	it('returns none when no target is selected', () => {
		expect(
			resolveOverlay(panelOf('retail_sales_total'), null, monthlySeries(2010, 60), null),
		).toEqual({ kind: 'none' });
	});

	it('overlays a supported single-axis candidate with enough overlap', () => {
		const base = monthlySeries(2010, 120);
		const target = monthlySeries(2010, 120);
		expect(overlap(base, target)).toBeGreaterThanOrEqual(36);
		expect(
			resolveOverlay(panelOf('retail_sales_total'), 'cpi_national_yoy', base, target),
		).toEqual({ kind: 'single', targetKey: 'cpi_national_yoy', minOverlap: 36 });
	});

	it('blocks a single-axis candidate whose overlap is below min_overlap_months', () => {
		const base = monthlySeries(2010, 120);
		const target = monthlySeries(2010, 12); // only 12 shared months
		const decision = resolveOverlay(
			panelOf('retail_sales_total'),
			'cpi_national_yoy',
			base,
			target,
		);
		expect(decision).toEqual({
			kind: 'blocked',
			targetKey: 'cpi_national_yoy',
			reason: 'INSUFFICIENT_HISTORY',
		});
	});

	it('splits a cross-region candidate into a dual-chart', () => {
		const decision = resolveOverlay(
			panelOf('retail_sales_sh_yoy'),
			'retail_sales_total',
			monthlySeries(2010, 60),
			monthlySeries(2010, 60),
		);
		expect(decision).toEqual({ kind: 'dual', targetKey: 'retail_sales_total' });
	});

	it('blocks a unit-mismatch candidate with its reason_code', () => {
		const decision = resolveOverlay(
			panelOf('cpi_national_yoy'),
			'retail_sales_total',
			monthlySeries(2010, 60),
			monthlySeries(2010, 60),
		);
		expect(decision).toEqual({
			kind: 'blocked',
			targetKey: 'retail_sales_total',
			reason: 'UNIT_MISMATCH',
		});
	});

	it('blocks every candidate on a source-unsupported stub panel', () => {
		const decision = resolveOverlay(
			panelOf('shanghai_finance_quarterly'),
			'retail_sales_total',
			monthlySeries(2010, 60),
			monthlySeries(2010, 60),
		);
		expect(decision).toEqual({
			kind: 'blocked',
			targetKey: 'retail_sales_total',
			reason: 'SOURCE_UNSUPPORTED',
		});
	});

	it('degrades to none when capabilities are absent', () => {
		expect(
			resolveOverlay(null, 'cpi_national_yoy', monthlySeries(2010, 60), monthlySeries(2010, 60)),
		).toEqual({ kind: 'none' });
	});

	it('treats a target that is not an overlay candidate as none', () => {
		expect(
			resolveOverlay(
				panelOf('retail_sales_total'),
				'not_a_candidate',
				monthlySeries(2010, 60),
				monthlySeries(2010, 60),
			),
		).toEqual({ kind: 'none' });
	});
});
