/**
 * Contract loader: vault IO → typed view inputs (T3-4).
 *
 * A thin, total IO seam over an injected adapter so it is unit-testable with a
 * fake (no Obsidian, no node fs). It never throws: every failure becomes a
 * `LoadErr` the caller can turn into onboarding copy or a degraded banner
 * (D-M2-2 degrade-not-crash, UI-UX §6 failure-not-silent).
 *
 * Layout is the frozen M1 output contract: the data root holds a `processed/`
 * folder with `manifest.json`; each `indicators[].file` and the manifest's
 * `capabilities_file` are relative to that folder. A missing/unparsable
 * capabilities file degrades to `caps: null` (the overview and detail still
 * render, only the graying reasons are absent); a missing series file is simply
 * absent from the map, which the mapper renders as an expired card.
 */

import { parseRetail, type Diagnostic, type RetailProduct } from './retail';
import {
	parseCapabilities,
	parseManifest,
	parseSeries,
	type ParseResult,
} from './parse';
import type {
	CapabilitiesV1,
	IndicatorSeriesV1,
	ManifestV1,
} from './types';

/** The IO seam. Obsidian's `vault.adapter` satisfies this structurally. */
export interface ContractAdapter {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
}

/** Subfolder of the data root that holds the contract products (M1 layout). */
export const PROCESSED_SUBDIR = 'processed';
/** Manifest filename inside the processed subfolder. */
export const MANIFEST_FILENAME = 'manifest.json';

export type LoadErrReason =
	| 'no_data_dir'
	| 'missing_manifest'
	| 'unreadable'
	| 'unknown_schema';

export interface LoadOk {
	ok: true;
	manifest: ManifestV1;
	seriesByKey: Map<string, IndicatorSeriesV1>;
	/** Null when the capabilities file is absent or unparsable (degraded). */
	caps: CapabilitiesV1 | null;
	diagnostics?: Diagnostic[];
}

export interface LoadErr {
	ok: false;
	reason: LoadErrReason;
	/** Human-readable specifics for a banner / notice (may include a path). */
	detail: string;
}

export type LoadResult = LoadOk | LoadErr;

/** Normalize a path part to Obsidian's vault-relative posix form. */
function norm(part: string): string {
	return part.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

/** Join vault-relative path parts with `/`, dropping empty segments. */
export function joinPath(...parts: string[]): string {
	return parts
		.map(norm)
		.filter((p) => p.length > 0)
		.join('/');
}

function messageOf(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

function err(reason: LoadErrReason, detail: string): LoadErr {
	return { ok: false, reason, detail };
}

/** JSON.parse guarded into the parse-result shape (malformed → unreadable). */
function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
	try {
		return { ok: true, value: JSON.parse(text) as unknown };
	} catch {
		return { ok: false };
	}
}

/** Read + JSON-parse + contract-parse one file, mapping failures to a reason. */
async function readContract<P>(
	adapter: ContractAdapter,
	path: string,
	parse: (json: unknown) => ParseResult<P>,
): Promise<
	{ ok: true; value: P } | { ok: false; reason: LoadErrReason; detail: string }
> {
	let text: string;
	try {
		text = await adapter.read(path);
	} catch (e) {
		return { ok: false, reason: 'unreadable', detail: `${path}: ${messageOf(e)}` };
	}
	const json = parseJson(text);
	if (!json.ok) {
		return { ok: false, reason: 'unreadable', detail: `${path}: 不是合法的 JSON` };
	}
	const parsed = parse(json.value);
	if (!parsed.ok) {
		const reason: LoadErrReason =
			parsed.error.kind === 'unknown_schema' ? 'unknown_schema' : 'unreadable';
		return { ok: false, reason, detail: `${path}: ${parsed.error.message}` };
	}
	return { ok: true, value: parsed.value };
}

/**
 * Load the whole contract from `<dataDir>/processed/`. Resolves to `LoadOk`
 * when at least the manifest is present and valid; otherwise a `LoadErr`.
 */
export async function loadContract(
	adapter: ContractAdapter,
	dataDir: string,
): Promise<LoadResult> {
	const base = norm(dataDir);
	if (!base) return err('no_data_dir', '尚未配置数据目录');

	const manifestPath = joinPath(base, PROCESSED_SUBDIR, MANIFEST_FILENAME);
	try {
		if (!(await adapter.exists(manifestPath))) {
			return err('missing_manifest', `未找到清单文件：${manifestPath}`);
		}
	} catch (e) { return err('unreadable', `${manifestPath}: ${messageOf(e)}`); }

	const manifestRes = await readContract(adapter, manifestPath, parseManifest);
	if (!manifestRes.ok) return err(manifestRes.reason, manifestRes.detail);
	const manifest = manifestRes.value;

	// Capabilities are optional: degrade to null rather than fail the load.
	let caps: CapabilitiesV1 | null = null;
	const diagnostics: Diagnostic[] = [];
	const capsPath = joinPath(base, PROCESSED_SUBDIR, manifest.capabilities_file);
	try {
		if (await adapter.exists(capsPath)) {
			const capsRes = await readContract(adapter, capsPath, parseCapabilities);
			if (capsRes.ok) caps = capsRes.value;
			else diagnostics.push({ code: 'capabilities_unreadable', severity: 'warning', message: capsRes.detail });
		} else diagnostics.push({ code: 'capabilities_missing', severity: 'warning', message: `未找到能力文件：${capsPath}` });
	} catch (e) { diagnostics.push({ code: 'capabilities_unreadable', severity: 'warning', message: `${capsPath}: ${messageOf(e)}` }); }

	// Series are best-effort: a missing/bad file just leaves the key absent,
	// which the mapper renders as an expired card (never a fabricated zero).
	const seriesByKey = new Map<string, IndicatorSeriesV1>();
	for (const ind of manifest.indicators) {
		const seriesPath = joinPath(base, PROCESSED_SUBDIR, ind.file);
		try {
			if (!(await adapter.exists(seriesPath))) {
				diagnostics.push({ code: 'series_missing', severity: 'error', row: ind.key, message: `未找到序列：${seriesPath}` });
				continue;
			}
			const seriesRes = await readContract(adapter, seriesPath, parseSeries);
			if (seriesRes.ok) {
				seriesByKey.set(ind.key, seriesRes.value);
				for (const message of seriesRes.value.quality.errors ?? []) {
					diagnostics.push({ code: 'source_quality', severity: 'warning', row: ind.key, period: ind.last_date ?? undefined, message });
				}
			} else diagnostics.push({ code: 'series_unreadable', severity: 'error', row: ind.key, message: seriesRes.detail });
		} catch (e) { diagnostics.push({ code: 'series_unreadable', severity: 'error', row: ind.key, message: `${seriesPath}: ${messageOf(e)}` }); }
	}

	return { ok: true, manifest, seriesByKey, caps, diagnostics };
}

export type RetailLoadResult = { ok: true; value: RetailProduct }
	| { ok: false; reason: 'missing' | 'unreadable' | 'unknown_schema'; detail: string };

/** Independent of the manifest: a missing sidecar never replaces real cards. */
export async function loadRetail(adapter: ContractAdapter, dataDir: string): Promise<RetailLoadResult> {
	const path = joinPath(dataDir, PROCESSED_SUBDIR, 'retail_breakdown.json');
	try {
		if (!dataDir.trim() || !(await adapter.exists(path))) {
			return { ok: false, reason: 'missing', detail: `尚未接入分业态零售数据：${path}` };
		}
		const res = await readContract(adapter, path, parseRetail);
		if (res.ok) return res;
		return { ok: false, reason: res.reason === 'unknown_schema' ? 'unknown_schema' : 'unreadable', detail: res.detail };
	} catch (e) { return { ok: false, reason: 'unreadable', detail: `${path}: ${messageOf(e)}` }; }
}
