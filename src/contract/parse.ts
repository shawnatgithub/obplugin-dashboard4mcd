/**
 * Defensive contract parsing (T3-2).
 *
 * The ETL already validates every product against its JSON schema on write, so
 * the plugin does not re-run a full schema validator (that would need a heavy
 * dependency — AGENTS.md: keep the plugin small). Its job here is narrower and
 * user-facing:
 *
 *   1. Guard `schema_version` so an unknown/newer contract degrades to a banner
 *      instead of crashing (G8: "不抛错，只禁用或警告").
 *   2. Guard the top-level shape just enough that the mapper can never throw on
 *      a missing array/object.
 *
 * Every function returns a discriminated `ParseResult` and NEVER throws, so a
 * corrupt or partial vault leaves the UI in a recoverable empty/degraded state.
 */

import type { CapabilitiesV1, IndicatorSeriesV1, ManifestV1 } from './types';

/** Successful parse carrying the narrowed, typed value. */
export interface ParseOk<T> {
	ok: true;
	value: T;
}

/**
 * Failed parse. `kind` drives the UI: `unknown_schema` shows the G8 degrade
 * banner (a newer contract than this build understands); `malformed` shows the
 * generic "data unreadable" empty state.
 */
export interface ParseErr {
	ok: false;
	error: { kind: 'unknown_schema' | 'malformed'; got?: string; message: string };
}

export type ParseResult<T> = ParseOk<T> | ParseErr;

/** True for a plain JSON object (not null, not an array). */
function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Shared `schema_version` guard (G8). On success returns the object narrowed to
 * a record so callers can read fields without re-checking the shape.
 */
function checkVersion(
	json: unknown,
	expected: string,
): { ok: true; obj: Record<string, unknown> } | ParseErr {
	if (!isRecord(json)) {
		return {
			ok: false,
			error: { kind: 'malformed', message: `${expected}: 顶层不是 JSON 对象` },
		};
	}
	const got = json.schema_version;
	if (got !== expected) {
		const isString = typeof got === 'string';
		return {
			ok: false,
			error: {
				kind: isString ? 'unknown_schema' : 'malformed',
				got: isString ? got : undefined,
				message: `${expected}: schema_version 实为 ${JSON.stringify(got ?? null)}`,
			},
		};
	}
	return { ok: true, obj: json };
}

/** Parse `manifest.json`. Guards version + `indicators[]` + `capabilities_file`. */
export function parseManifest(json: unknown): ParseResult<ManifestV1> {
	const guard = checkVersion(json, 'manifest_v1');
	if (!guard.ok) return guard;
	const { obj } = guard;
	if (typeof obj.capabilities_file !== 'string') {
		return {
			ok: false,
			error: { kind: 'malformed', message: 'manifest_v1: 缺 capabilities_file' },
		};
	}
	if (!Array.isArray(obj.indicators)) {
		return {
			ok: false,
			error: { kind: 'malformed', message: 'manifest_v1: indicators 不是数组' },
		};
	}
	// Every entry must at least carry a string key, or the mapper could not bind
	// a card to it. Deeper field types are trusted (ETL-validated on write).
	for (const ind of obj.indicators) {
		if (!isRecord(ind) || typeof ind.key !== 'string') {
			return {
				ok: false,
				error: { kind: 'malformed', message: 'manifest_v1: 指标项缺 key' },
			};
		}
	}
	return { ok: true, value: obj as unknown as ManifestV1 };
}

/** Parse an indicator series file. Guards version + `key` + `series[]`. */
export function parseSeries(json: unknown): ParseResult<IndicatorSeriesV1> {
	const guard = checkVersion(json, 'indicator_series_v1');
	if (!guard.ok) return guard;
	const { obj } = guard;
	if (typeof obj.key !== 'string' || obj.key.length === 0) {
		return {
			ok: false,
			error: { kind: 'malformed', message: 'indicator_series_v1: 缺 key' },
		};
	}
	if (!Array.isArray(obj.series)) {
		return {
			ok: false,
			error: { kind: 'malformed', message: 'indicator_series_v1: series 不是数组' },
		};
	}
	return { ok: true, value: obj as unknown as IndicatorSeriesV1 };
}

/** Parse `capabilities.json`. Guards version + `panels` object. */
export function parseCapabilities(json: unknown): ParseResult<CapabilitiesV1> {
	const guard = checkVersion(json, 'capabilities_v1');
	if (!guard.ok) return guard;
	const { obj } = guard;
	if (!isRecord(obj.panels)) {
		return {
			ok: false,
			error: { kind: 'malformed', message: 'capabilities_v1: panels 不是对象' },
		};
	}
	return { ok: true, value: obj as unknown as CapabilitiesV1 };
}
