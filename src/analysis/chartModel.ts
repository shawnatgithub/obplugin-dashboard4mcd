/**
 * The renderer-agnostic chart model (M3-T2 / spec §4).
 *
 * `buildChartModel` folds the frozen contract series, the capability panel and
 * the current ViewState into one honest description of what to draw: which
 * series (primary + optional overlay), how many axes, a single vs a cross-region
 * dual layout, where the spring-festival merges fall, and whether there is
 * anything to plot at all. It performs no rendering and touches no DOM/ECharts,
 * so the ECharts option builder and the SVG fallback consume the same decisions
 * and can never drift apart.
 *
 * Honesty rules enforced here (UI-UX §6): the overlay axis decision is consumed
 * faithfully, never re-judged (D-M3-5) — a `single` overlay shares ONE y-axis
 * even when the two series carry different units; a cross-region overlay becomes
 * a dual layout rather than a single-axis blend (D-M3-6); the spring-festival
 * merge is annotated, never synthesized into a value (D-M3-8); a series with no
 * plottable point is `empty` so the composer shows a wireframe, not a flat zero.
 */

import { collapseRevisions, unitLabel, type DetailModel } from '../contract/mapper';
import { isStub } from '../contract/reasonText';
import type { Panel, SeriesPoint, Unit } from '../contract/types';
import { resolveOverlay } from './overlay';
import type { RangeKey } from './range';
import { isSmoothingOn } from './smoothing';
import { detectSpringFestival, type SpringFestivalSpan } from './springFestival';
import { applyTransform, type TransformKey } from './transform';
import type { ChartType, ViewState } from './viewState';

/** One drawable series plus the metadata its axis, legend and styling need. */
export interface ChartSeries {
	name: string;
	points: SeriesPoint[];
	unit: Unit;
	role: 'primary' | 'overlay';
	smooth: boolean;
}

/** A y-axis: the unit it measures and its human label. */
export interface ChartAxis {
	unit: Unit;
	label: string;
}

/** The full, renderer-agnostic description of one detail chart. */
export interface ChartModel {
	chartType: ChartType;
	/** `dual` = a cross-region split into two independently-scaled charts. */
	layout: 'single' | 'dual';
	series: ChartSeries[];
	/** Single layout shares one axis (D-M3-5); dual carries one per chart. */
	yAxes: ChartAxis[];
	springFestival: SpringFestivalSpan[];
	/** Spring-festival / caliber note for the amber bar, or null when none. */
	annotation: string | null;
	/** The dataZoom window the reader picked (drives the option builder). */
	range: RangeKey;
	/** Present only when the underlying series declares a source. */
	source?: string;
	/** True when the primary series has no plottable value (composer shows a wireframe). */
	empty: boolean;
}

/**
 * A resolved series the model may reference besides the primary — the transform
 * sibling (`<key>_yoy`) or an overlay target. `points` are the raw contract
 * points; `buildChartModel` collapses revisions itself, so the caller only has
 * to hand over what it loaded (never guessing a unit or title, D5/D10).
 */
export interface ChartSeriesSource {
	points: SeriesPoint[];
	unit: Unit;
	title: string;
}

/** The mandatory spring-festival copy (D-M3-8): explain the merge, never fake it. */
const SPRING_FESTIVAL_NOTE = '1–2 月因春节合并口径，2 月不单独发布';

/** The contract's own sibling key for a derived transform, or null when absent. */
function transformSource(panel: Panel, transform: TransformKey): string | null {
	if (transform === 'level') return null;
	if (panel === null || isStub(panel)) return null;
	return panel.transforms[transform].source ?? null;
}

/** The unit of the plotted primary series after the transform. */
function resolveUnit(
	transform: TransformKey,
	baseUnit: Unit,
	sibling: ChartSeriesSource | null,
): Unit {
	if (transform === 'level') return baseUnit;
	if (transform === 'yoy') return sibling?.unit ?? 'yoy_pct';
	return 'mom_pct';
}

/** The legend name of the plotted primary series after the transform. */
function resolveName(
	transform: TransformKey,
	baseTitle: string,
	sibling: ChartSeriesSource | null,
): string {
	if (transform === 'yoy') return sibling ? sibling.title : `${baseTitle}（同比）`;
	if (transform === 'mom') return `${baseTitle}（环比）`;
	return baseTitle;
}

/**
 * Build the chart model for one indicator under `view`. `seriesByKey` supplies
 * any sibling/overlay series the model may need (the primary comes from
 * `detail`); it is consulted by key, so a missing target simply degrades to no
 * overlay rather than throwing.
 */
export function buildChartModel(
	detail: DetailModel,
	view: ViewState,
	seriesByKey: Map<string, ChartSeriesSource>,
): ChartModel {
	const panel: Panel = detail.panel;
	const smooth = isSmoothingOn(view);

	// 1. Primary series: apply the transform, consuming the contract sibling.
	const siblingKey = transformSource(panel, view.transform);
	const siblingSrc = siblingKey ? seriesByKey.get(siblingKey) ?? null : null;
	const siblingPoints = siblingSrc ? collapseRevisions(siblingSrc.points) : null;
	const primaryPoints = applyTransform(detail.points, view.transform, siblingPoints);
	const primaryUnit = resolveUnit(view.transform, detail.unit, siblingSrc);
	const primary: ChartSeries = {
		name: resolveName(view.transform, detail.title, siblingSrc),
		points: primaryPoints,
		unit: primaryUnit,
		role: 'primary',
		smooth,
	};

	// 2. Overlay: faithfully consume the capabilities matrix (D-M3-5/D-M3-6).
	const targetSrc = view.overlay ? seriesByKey.get(view.overlay) ?? null : null;
	const targetPoints = targetSrc ? collapseRevisions(targetSrc.points) : null;
	const decision = resolveOverlay(panel, view.overlay, primaryPoints, targetPoints);

	const series: ChartSeries[] = [primary];
	let layout: 'single' | 'dual' = 'single';
	if (
		targetSrc &&
		targetPoints &&
		(decision.kind === 'single' || decision.kind === 'dual')
	) {
		series.push({
			name: targetSrc.title,
			points: targetPoints.map((p) => ({ ...p })),
			unit: targetSrc.unit,
			role: 'overlay',
			smooth,
		});
		if (decision.kind === 'dual') layout = 'dual';
	}

	// 3. Axes: single shares one axis; dual carries one per chart.
	const yAxes: ChartAxis[] = [
		{ unit: primaryUnit, label: unitLabel(primaryUnit) },
	];
	if (layout === 'dual' && targetSrc) {
		yAxes.push({ unit: targetSrc.unit, label: unitLabel(targetSrc.unit) });
	}

	// 4. Spring-festival annotation (locate the merge, never fabricate a value).
	const spans = detectSpringFestival(primaryPoints);
	const annotation = spans.length > 0 ? SPRING_FESTIVAL_NOTE : null;

	const model: ChartModel = {
		chartType: view.chartType,
		layout,
		series,
		yAxes,
		springFestival: spans,
		annotation,
		range: view.range,
		empty: !primaryPoints.some((p) => p.value !== null),
	};
	if (detail.source) model.source = detail.source;
	return model;
}
