/**
 * Contract → release-calendar view model (pure, Obsidian-free) — M4-T1 / S5.
 *
 * Turns the frozen `manifest_v1` (+ the per-key `indicator_series_v1` for title
 * and source) into the release-calendar and collection-status model the S5 view
 * renders. This is the seam where the M4 data-honesty boundary is enforced
 * (spec §2, UI-UX §6):
 *
 *   - The manifest supplies freshness, last_date and generated_at. It CANNOT
 *     supply scheduler runtime states (polling / retry n-of-m / alert triggered
 *     / a next-run clock time), so this model never invents them.
 *   - The "next expected" release is DERIVED from the collection frequency and
 *     always labelled 预计 — an estimate, never a scheduling promise, because
 *     the authoritative release day is not published to the vault (spec §10-3).
 *   - A null or unparseable last_date derives to null (shown as —), never a
 *     guessed date; a quarterly marker is anchored to its quarter-end month so
 *     it can sit on the monthly timeline without fabricating a day.
 *
 * Every function is total (no throws): a degraded manifest yields a degraded but
 * well-formed model, so the view can explain itself instead of crashing.
 */

import { freshnessLabel } from '../format';
import type { OverviewStatus, StatusItem } from '../types';
import { STATUS_BADGE, formatTimestamp, summarizeStatus } from './mapper';
import type {
	Frequency,
	IndicatorSeriesV1,
	ManifestIndicator,
	ManifestV1,
	Status,
} from './types';

/** The four freshness states, reused as the calendar's colour/label tone. */
export type ReleaseTone = 'fresh' | 'aging' | 'stale' | 'unknown';

/** One row of the collection-status list (S5, five columns + an action). */
export interface StatusRow {
	key: string;
	/** Series title, falling back to the contract key. */
	metric: string;
	/** `手动` for a manual series, else the declared source, else `本地 ETL`. */
	source: string;
	/** Honest freshness mapping — never extended into a runtime state. */
	tone: ReleaseTone;
	/** `freshnessLabel(tone)`. */
	statusLabel: string;
	/** Manifest last_date, or `—` when undated. */
	lastDate: string;
	/** `预计 <derived>` or `—`; the derived date is an estimate, not a promise. */
	nextExpected: string;
	/** True when the series is past its expected window (freshness=stale). */
	overdue: boolean;
	/** True when the series declares `source === 'manual'`. */
	isManual: boolean;
	/** Manifest lifecycle status (active / planned / paused). */
	lifecycle: Status;
}

/** One indicator's position on the monthly release timeline. */
export interface TimelineMarker {
	key: string;
	name: string;
	/** Month anchor `YYYY-MM` of last_date, or null when it cannot be placed. */
	month: string | null;
	/** Month anchor of the derived next period, or null. */
	nextMonth: string | null;
	tone: ReleaseTone;
}

/** The whole release-calendar view model. */
export interface ReleaseModel {
	/** Timeline "current month" anchor `YYYY-MM`, or `''` when underivable. */
	anchorMonth: string;
	/** Timeline axis: anchor-11 .. anchor .. anchor+1 (13), or [] when unanchored. */
	months: string[];
	markers: TimelineMarker[];
	rows: StatusRow[];
	/** Formatted ETL generation time, or `—` when the manifest omits it. */
	generatedAt: string;
	/** True when the manifest lists no indicators. */
	empty: boolean;
	/** Footer: the 预计 caveat + the runtime-state boundary + the data source. */
	honestyNote: string;
}

/** Footer copy declaring the derivation basis and the honesty boundary. */
export const RELEASE_HONESTY_NOTE =
	'「预计下次」按采集频率从数据截至日估算，为预计值而非调度承诺；权威发布日未发布到本地契约。轮询、重试、告警等调度运行时状态不在契约内，故不显示。数据来源：本地 ETL。';

const MONTH_RE = /^(\d{4})-(\d{2})$/;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const QUARTER_RE = /^(\d{4})-Q([1-4])$/;

/** Zero-pad a number to two digits. */
function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

/** True when `month` is a real calendar month (1-12). */
function validMonth(month: number): boolean {
	return month >= 1 && month <= 12;
}

/**
 * Shift a `YYYY-MM` month anchor by `delta` months (may be negative), crossing
 * year boundaries. Returns `''` when the anchor is not a `YYYY-MM` string.
 */
function shiftMonth(anchor: string, delta: number): string {
	const m = MONTH_RE.exec(anchor);
	if (!m) return '';
	const year = Number(m[1]);
	const month = Number(m[2]);
	if (!validMonth(month)) return '';
	const total = year * 12 + (month - 1) + delta;
	const ny = Math.floor(total / 12);
	const nm = (total % 12) + 1;
	return `${String(ny).padStart(4, '0')}-${pad2(nm)}`;
}

/**
 * Derive the next release period from a last_date and its frequency, keeping the
 * native period format (monthly → `YYYY-MM`, quarterly → `YYYY-Qn`, daily →
 * `YYYY-MM-DD`). Returns null for a null date, a format that does not match the
 * frequency, an out-of-range month/quarter, or a non-existent calendar day —
 * never a guess (spec §2).
 */
export function deriveNextExpected(
	lastDate: string | null,
	frequency: Frequency,
): string | null {
	if (!lastDate) return null;

	if (frequency === 'monthly') {
		const m = MONTH_RE.exec(lastDate);
		if (!m || !validMonth(Number(m[2]))) return null;
		return shiftMonth(lastDate, 1);
	}

	if (frequency === 'quarterly') {
		const q = QUARTER_RE.exec(lastDate);
		if (!q) return null;
		const year = Number(q[1]);
		const quarter = Number(q[2]);
		return quarter === 4 ? `${year + 1}-Q1` : `${year}-Q${quarter + 1}`;
	}

	if (frequency === 'daily') {
		if (!DAY_RE.test(lastDate)) return null;
		const date = new Date(`${lastDate}T00:00:00Z`);
		if (Number.isNaN(date.getTime())) return null;
		// Reject a non-existent day (e.g. 2026-02-30) that Date would roll over.
		if (date.toISOString().slice(0, 10) !== lastDate) return null;
		date.setUTCDate(date.getUTCDate() + 1);
		return date.toISOString().slice(0, 10);
	}

	return null;
}

/**
 * Map any supported date string to its `YYYY-MM` month anchor for the monthly
 * timeline: a monthly/daily date keeps its month; a quarterly `YYYY-Qn` maps to
 * the quarter's end month (Q1→03 … Q4→12). Returns null when it cannot be
 * placed, so an undated indicator draws no fabricated point.
 */
function monthAnchor(date: string | null): string | null {
	if (!date) return null;
	const md = MONTH_RE.exec(date) ?? DAY_RE.exec(date);
	if (md) {
		const month = Number(md[2]);
		return validMonth(month) ? `${md[1]}-${pad2(month)}` : null;
	}
	const q = QUARTER_RE.exec(date);
	if (q) return `${q[1]}-${pad2(Number(q[2]) * 3)}`;
	return null;
}

/**
 * The timeline's current-month anchor: the manifest's generated_at month when
 * present, else the latest last_date month across indicators, else `''`
 * (unanchored — the list still renders, the timeline does not).
 */
function deriveAnchor(manifest: ManifestV1): string {
	if (manifest.generated_at) {
		const anchored = monthAnchor(manifest.generated_at.slice(0, 10));
		if (anchored) return anchored;
	}
	let max = '';
	for (const ind of manifest.indicators) {
		const anchored = monthAnchor(ind.last_date);
		if (anchored && anchored > max) max = anchored;
	}
	return max;
}

/** Build one collection-status row from a manifest entry plus its series. */
function toStatusRow(
	ind: ManifestIndicator,
	series: IndicatorSeriesV1 | null,
): StatusRow {
	const isManual = series?.source === 'manual';
	const next = deriveNextExpected(ind.last_date, ind.frequency);
	return {
		key: ind.key,
		metric: series?.title ?? ind.key,
		source: isManual ? '手动' : (series?.source ?? '本地 ETL'),
		tone: ind.freshness,
		statusLabel: freshnessLabel(ind.freshness),
		lastDate: ind.last_date ?? '—',
		nextExpected: next ? `预计 ${next}` : '—',
		overdue: ind.freshness === 'stale',
		isManual,
		lifecycle: ind.status,
	};
}

/** Build one timeline marker from a manifest entry plus its series. */
function toMarker(
	ind: ManifestIndicator,
	series: IndicatorSeriesV1 | null,
): TimelineMarker {
	const next = deriveNextExpected(ind.last_date, ind.frequency);
	return {
		key: ind.key,
		name: series?.title ?? ind.key,
		month: monthAnchor(ind.last_date),
		nextMonth: monthAnchor(next),
		tone: ind.freshness,
	};
}

/**
 * Fold the release model's rows into the overview's collapsible 数据状态 panel.
 * A row that is overdue or approaching its next release shows the honest
 * `预计 <period>` estimate; a fresh row shows its data-as-of date instead. No
 * runtime scheduling state is invented (spec §2 boundary), and the legend
 * counts come from the same freshness tones the calendar uses.
 */
export function toOverviewStatus(model: ReleaseModel): OverviewStatus {
	const items: StatusItem[] = model.rows.map((row) => ({
		key: row.key,
		metric: row.metric,
		tone: row.tone,
		badge: STATUS_BADGE[row.tone],
		detail:
			row.tone === 'stale' || row.tone === 'aging'
				? row.nextExpected
				: row.lastDate,
	}));
	return summarizeStatus(items);
}

/**
 * Map the whole contract to the release-calendar model. Deterministic: the
 * timeline expands from the anchor month (never the wall clock), so tests are
 * stable. Total: a missing series, an empty manifest, or an underivable anchor
 * all yield a well-formed model rather than a throw.
 *
 * An `annual` sibling (CR-2026-10-13) is excluded from rows and markers: it has
 * no monthly collection schedule to track, and a `YYYY` last_date carries no
 * month anchor for the monthly timeline. Its freshness lives on its monthly
 * parent's row, so dropping it here loses nothing and fabricates no day.
 */
export function toReleaseModel(
	manifest: ManifestV1,
	seriesByKey: Map<string, IndicatorSeriesV1>,
): ReleaseModel {
	const indicators = manifest.indicators.filter(
		(ind) => ind.frequency !== 'annual',
	);
	const anchorMonth = deriveAnchor(manifest);
	const months = anchorMonth
		? Array.from({ length: 13 }, (_, i) => shiftMonth(anchorMonth, i - 11))
		: [];
	return {
		anchorMonth,
		months,
		markers: indicators.map((ind) =>
			toMarker(ind, seriesByKey.get(ind.key) ?? null),
		),
		rows: indicators.map((ind) =>
			toStatusRow(ind, seriesByKey.get(ind.key) ?? null),
		),
		generatedAt: manifest.generated_at
			? formatTimestamp(manifest.generated_at)
			: '—',
		empty: indicators.length === 0,
		honestyNote: RELEASE_HONESTY_NOTE,
	};
}
