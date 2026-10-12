/**
 * Contract → view-model mapping (pure, Obsidian-free).
 *
 * Turns the frozen ETL products (manifest_v1 + indicator_series_v1 +
 * capabilities_v1) into the shapes the DOM renderers already consume
 * (`MetricGroup[]` for S1, `DetailModel` for S2). This is the seam where the
 * data-honesty rules are enforced: a card shows its own value/unit (D-M2-7),
 * a missing period stays a gap (never interpolated, null_not_zero), a series
 * with no usable value is marked expired rather than drawn as zero, and the
 * sample fixture is only ever a fallback (D-M2-5), never mixed in here.
 *
 * Every function is total (no throws): degraded input yields a degraded but
 * well-formed view model, so the UI can explain itself instead of crashing.
 */

import { OVERVIEW_META, type OverviewMeta } from '../data/overview';
import { SPARK_POINTS, sparkGaps } from '../sparkline';
import type { Delta, MetricCard, MetricGroup } from '../types';
import { isStub, reasonText } from './reasonText';
import type {
	CapabilitiesV1,
	Frequency,
	FullPanel,
	Freshness,
	IndicatorSeriesV1,
	ManifestIndicator,
	ManifestV1,
	Region,
	SeriesPoint,
	StubPanel,
	Unit,
} from './types';

/** Stable group order: national first, then the local scopes. */
export const REGION_ORDER: Region[] = ['CN', 'SH', 'SC', 'CD'];

const REGION_LABEL: Record<Region, string> = {
	CN: '全国趋势',
	SH: '地方：上海',
	SC: '地方：四川',
	CD: '地方：成都',
};

const UNIT_LABEL: Record<Unit, string> = {
	yoy_pct: '%',
	mom_pct: '%',
	level_cny: '亿元',
	index_2020_100: '',
	unknown: '',
};

/** Group heading for a region (`Record` so a new region fails compilation). */
export function regionLabel(region: Region): string {
	return REGION_LABEL[region];
}

/** Display unit suffix for a value of the given unit. */
export function unitLabel(unit: Unit): string {
	return UNIT_LABEL[unit];
}

/**
 * Format a value for a card/detail heading. `null` → `—` (never `0`). Rates
 * keep one decimal; a whole level is shown without a trailing `.0`.
 */
export function formatValue(value: number | null, unit: Unit): string {
	if (value === null) return '—';
	if (unit === 'yoy_pct' || unit === 'mom_pct') return value.toFixed(1);
	return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** `2026-10-11T08:00:00+08:00` → `2026-10-11 08:00` (date-only if no time). */
export function formatTimestamp(iso: string): string {
	const date = iso.slice(0, 10);
	const time = iso.slice(11, 16);
	return time ? `${date} ${time}` : date;
}

/** Deterministic non-negative seed from a key (placeholder-shape fallback). */
export function hashSeed(key: string): number {
	let h = 0;
	for (let i = 0; i < key.length; i++) {
		h = (h * 31 + key.charCodeAt(i)) % 100003;
	}
	return h;
}

/**
 * Collapse multiple revisions of the same date to the latest revision,
 * preserving first-seen chronological order. The contract may carry an
 * original and a revised observation for one period (G18); the current truth
 * is the highest revision, and a chart must not double-count the period.
 */
export function collapseRevisions(series: readonly SeriesPoint[]): SeriesPoint[] {
	const byDate = new Map<string, SeriesPoint>();
	for (const p of series) {
		const prev = byDate.get(p.date);
		if (prev === undefined || p.revision >= prev.revision) byDate.set(p.date, p);
	}
	return [...byDate.values()];
}

/** The most recent `SPARK_POINTS` values (most recent last), for a mini chart. */
export function sparkFromSeries(points: readonly SeriesPoint[]): (number | null)[] {
	const values = points.map((p) => p.value);
	return values.slice(Math.max(0, values.length - SPARK_POINTS));
}

/** Last point with a non-null value, or null when the series has none. */
function lastNonNull(points: readonly SeriesPoint[]): SeriesPoint | null {
	for (let i = points.length - 1; i >= 0; i--) {
		const p = points[i];
		if (p && p.value !== null) return p;
	}
	return null;
}

/**
 * Period-over-period delta, but only for a rate unit: the difference between
 * two ratios is a percentage-point move the UI renders as `↑/↓ …pct`. For a
 * level or index the raw difference is not a percentage, so no delta is shown
 * (avoids a misleading `↑900pct` on a 亿元 series).
 */
function deltaFor(points: readonly SeriesPoint[], unit: Unit): Delta | undefined {
	if (unit !== 'yoy_pct' && unit !== 'mom_pct') return undefined;
	const nn = points.filter((p) => p.value !== null);
	if (nn.length < 2) return undefined;
	const prev = nn[nn.length - 2];
	const last = nn[nn.length - 1];
	if (!prev || !last || prev.value === null || last.value === null) return undefined;
	const dv = last.value - prev.value;
	if (dv === 0) return { dir: 'flat' };
	return { dir: dv > 0 ? 'up' : 'down', v: Math.abs(dv).toFixed(1) };
}

/** The overview view model: header meta plus region-grouped cards. */
export interface OverviewModel {
	meta: OverviewMeta;
	groups: MetricGroup[];
}

/** The single-indicator detail view model (S2). */
export interface DetailModel {
	key: string;
	title: string;
	unit: Unit;
	region: Region;
	frequency: Frequency;
	freshness: Freshness;
	lastDate: string | null;
	/** Present only when the series declares a source. */
	source?: string;
	/** Revision-collapsed points, one per period, for the table/chart. */
	points: SeriesPoint[];
	/** Capability panel for this key, or null when capabilities are absent. */
	panel: FullPanel | StubPanel | null;
	/** Amber status line explaining a limitation, or null when unrestricted. */
	statusBanner: string | null;
}

/**
 * Build one overview card from a manifest row plus its (optional) series.
 * The manifest is the index authority for unit/freshness; the series supplies
 * the title, values and source. No series or no usable value → expired card.
 */
export function toCard(
	ind: ManifestIndicator,
	series: IndicatorSeriesV1 | null,
	caps: CapabilitiesV1 | null,
): MetricCard {
	const panel = caps?.panels[ind.key] ?? null;
	const points = series ? collapseRevisions(series.series) : [];
	const last = lastNonNull(points);

	const card: MetricCard = {
		key: ind.key,
		name: series?.title ?? ind.key,
		value: formatValue(last?.value ?? null, ind.unit),
		unit: unitLabel(ind.unit),
		period: last?.date ?? ind.last_date ?? '—',
		fresh: ind.freshness,
		seed: hashSeed(ind.key),
	};

	if (last) {
		const delta = deltaFor(points, ind.unit);
		if (delta) card.delta = delta;
		if (series?.source === 'manual') card.badge = '手动';
		const spark = sparkFromSeries(points);
		card.spark = spark;
		const gaps = sparkGaps(spark);
		if (gaps.length > 0) card.gaps = gaps;
	} else {
		card.expired =
			panel && isStub(panel) ? reasonText(panel.reason_code) : '无可用数据';
	}
	return card;
}

function overviewMeta(manifest: ManifestV1): OverviewMeta {
	return {
		title: OVERVIEW_META.title,
		crumb: OVERVIEW_META.crumb,
		updatedAt: manifest.generated_at
			? `ETL 更新于 ${formatTimestamp(manifest.generated_at)}`
			: 'ETL 更新时间未知',
		// Real data → no sample banner; T5 skips the banner when this is empty.
		sampleNotice: '',
		footnote:
			'迷你折线为最近 24 期真实值，虚竖线 = 缺失期（不插值）。数据来源：本地 ETL JSON。',
	};
}

/**
 * Map the whole contract to the overview. Cards bind 1:1 to manifest keys and
 * are grouped by region in `REGION_ORDER` (D-M2-1: the frozen manifest has no
 * layer field, so region is the honest grouping). `caps` only enriches the
 * expired reason for a stub-source indicator; it never fabricates a card.
 */
export function toOverview(
	manifest: ManifestV1,
	seriesByKey: Map<string, IndicatorSeriesV1>,
	caps: CapabilitiesV1 | null,
): OverviewModel {
	const byRegion = new Map<Region, ManifestIndicator[]>();
	for (const ind of manifest.indicators) {
		const arr = byRegion.get(ind.region);
		if (arr) arr.push(ind);
		else byRegion.set(ind.region, [ind]);
	}
	const groups: MetricGroup[] = [];
	for (const region of REGION_ORDER) {
		const inds = byRegion.get(region);
		if (!inds || inds.length === 0) continue;
		groups.push({
			title: regionLabel(region),
			cards: inds.map((ind) =>
				toCard(ind, seriesByKey.get(ind.key) ?? null, caps),
			),
		});
	}
	return { meta: overviewMeta(manifest), groups };
}

/**
 * Map one indicator to the detail view model. Tolerates a missing series or
 * missing capabilities (degraded `statusBanner`, empty `points`) so the page
 * can always render and explain its own state.
 */
export function toDetail(
	key: string,
	manifest: ManifestV1,
	series: IndicatorSeriesV1 | null,
	caps: CapabilitiesV1 | null,
): DetailModel {
	const ind = manifest.indicators.find((i) => i.key === key) ?? null;
	const panel = caps?.panels[key] ?? null;
	const points = series ? collapseRevisions(series.series) : [];

	let statusBanner: string | null = null;
	if (!series) statusBanner = '未找到该指标的序列数据（文件缺失或尚未生成）';
	else if (panel && isStub(panel)) statusBanner = reasonText(panel.reason_code);
	else if (ind && ind.status === 'planned') statusBanner = '计划中：尚未接入采集';
	else if (ind && ind.status === 'paused') statusBanner = '已暂停采集';

	const model: DetailModel = {
		key,
		title: series?.title ?? ind?.key ?? key,
		unit: ind?.unit ?? series?.unit ?? 'unknown',
		region: ind?.region ?? series?.region ?? 'CN',
		frequency: ind?.frequency ?? series?.frequency ?? 'monthly',
		freshness: ind?.freshness ?? 'unknown',
		lastDate: ind?.last_date ?? series?.quality.last_date ?? null,
		points,
		panel,
		statusBanner,
	};
	if (series?.source) model.source = series.source;
	return model;
}
