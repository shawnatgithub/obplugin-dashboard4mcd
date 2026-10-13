/**
 * Contract types mirroring the frozen ETL schemas (`schemas/*.schema.json`).
 *
 * The plugin is a read-only consumer of the data contract (dev plan §2.3, G3):
 * these interfaces are a *mirror*, never an authority. If the ETL schema
 * changes, this file is re-synced from it — the plugin does not invent fields.
 * Keeping them Obsidian-free lets `parse`/`mapper`/`reasonText` stay pure and
 * unit-testable against `tests/golden/contract/` fixtures.
 *
 * Field names are intentionally snake_case to match the JSON on disk 1:1, so
 * parsing is a shape guard rather than a rename pass (D8: one source of truth).
 */

/** Geographic scope. CN = national; SH/SC/CD = local (Shanghai/Sichuan/Chengdu). */
export type Region = 'CN' | 'SH' | 'SC' | 'CD';

/** Release cadence of a series. `annual` is the CR-2026-10-13 year-total grain. */
export type Frequency = 'monthly' | 'quarterly' | 'daily' | 'annual';

/** Measurement unit. G18: a base key stores its level; `<key>_yoy` stores a ratio. */
export type Unit = 'yoy_pct' | 'mom_pct' | 'index_2020_100' | 'level_cny' | 'pct' | 'unknown';

/** Lifecycle state. G19: the first frozen batch is all `planned`. */
export type Status = 'active' | 'planned' | 'paused';

/** Freshness four-state (G16). `unknown` = cannot be determined (missing release config / first fetch). */
export type Freshness = 'fresh' | 'aging' | 'stale' | 'unknown';

/**
 * The seven capability reason codes (capabilities_v1 `$defs.reasonCode`).
 * Every disabled mode/transform/overlay carries one; `reasonText` maps it to
 * user-facing copy so a grayed-out control always explains itself (UI-UX §6).
 */
export type ReasonCode =
	| 'INSUFFICIENT_HISTORY'
	| 'MISSING_MONTHS'
	| 'INCOMPATIBLE_FREQUENCY'
	| 'INCOMPATIBLE_REGION'
	| 'UNIT_MISMATCH'
	| 'DERIVED_NOT_FOUND'
	| 'SOURCE_UNSUPPORTED';

/** One indicator entry in the manifest (manifest_v1 `indicators[]`). */
export interface ManifestIndicator {
	key: string;
	file: string;
	schema: string;
	region: Region;
	frequency: Frequency;
	unit: Unit;
	status: Status;
	last_date: string | null;
	freshness: Freshness;
}

/** The processed-output manifest (manifest_v1). */
export interface ManifestV1 {
	schema_version: 'manifest_v1';
	generated_at?: string;
	timezone?: string;
	capabilities_file: string;
	indicators: ManifestIndicator[];
}

/** A single observation. `value` is null for a missing period, never 0 (null_not_zero). */
export interface SeriesPoint {
	date: string;
	value: number | null;
	revision: number;
}

/** A normalized indicator series (indicator_series_v1). */
export interface IndicatorSeriesV1 {
	schema_version: 'indicator_series_v1';
	key: string;
	title?: string;
	region: Region;
	frequency: Frequency;
	date_grain: string;
	unit: Unit;
	null_policy: 'null_not_zero';
	status: Status;
	source?: string;
	generated_at?: string;
	series: SeriesPoint[];
	quality: { last_date: string | null; errors?: string[] };
}

/** A mode/transform entry. When `supported` is false, `reason_code` explains why. */
export interface ModeEntry {
	supported: boolean;
	warnings?: string[];
	reason_code?: ReasonCode;
	/** For a supported yoy/level transform, the sibling key it derives from. */
	source?: string;
}

/** An overlay candidate entry (M3 consumes this; parsed here for completeness). */
export interface OverlayEntry {
	supported: boolean;
	axis_mode?: string;
	min_overlap_months?: number;
	reason_code?: ReasonCode;
}

/** capabilities_v1 panel branch A: a fully described indicator (G15). */
export interface FullPanel {
	modes: { calendar: ModeEntry; seasonal_compare: ModeEntry; yoy: ModeEntry };
	overlays: Record<string, OverlayEntry>;
	chart_types: string[];
	transforms: { level: ModeEntry; yoy: ModeEntry; mom: ModeEntry };
}

/** capabilities_v1 panel branch B: the source itself is unavailable (G15). */
export interface StubPanel {
	source_supported: false;
	reason_code: ReasonCode;
}

/** The per-panel capability matrix (capabilities_v1). */
export interface CapabilitiesV1 {
	schema_version: 'capabilities_v1';
	generated_at?: string;
	panels: Record<string, FullPanel | StubPanel>;
}

/**
 * A capabilities panel for one indicator: a full matrix, a source-unsupported
 * stub, or null when capabilities are absent (degraded). Centralized here so
 * both the UI toolbar and the pure analysis layer share one definition.
 */
export type Panel = FullPanel | StubPanel | null;
