/** Optional retail sidecar. No network access or synthesized observations. */
import type { ParseResult } from './parse';

export const RETAIL_ROWS = {
	catering: '餐饮收入',
	apparel: '服装、鞋帽、针纺织品类',
	cosmetics: '化妆品类',
	jewelry: '金银珠宝类',
	sports: '体育、娱乐用品类',
	communications: '通讯器材类',
	appliances: '家用电器和音像器材类',
} as const;
export type RetailRowId = keyof typeof RETAIL_ROWS;

export interface Diagnostic {
	code: string;
	severity: 'warning' | 'error';
	message: string;
	row?: string;
	period?: string;
	source_url?: string;
	context?: Record<string, unknown>;
}
export interface RetailRow {
	id: RetailRowId;
	name: string;
	amount: number | null;
	yoy_pct: number | null;
	delta_pp: number | null;
	share_pct: number | null;
	reason: string | null;
}
export interface RetailPeriod {
	date: string;
	denominator_amount: number | null;
	source_kind: 'api' | 'html';
	source_url: string;
	retrieved_at: string;
	amount_precision: number;
	rows: RetailRow[];
}
export interface RetailProduct {
	schema_version: 'retail_breakdown_v1';
	generated_at: string;
	last_success_at: string | null;
	last_attempt_at: string;
	scope: 'national_above_designated_size_current_month_nominal';
	share_basis: 'national_above_designated_size_goods_plus_catering';
	periods: RetailPeriod[];
	diagnostics: Diagnostic[];
}

function record(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function numeric(v: unknown): v is number | null {
	return v === null || (typeof v === 'number' && Number.isFinite(v));
}
function nonnegative(v: unknown): boolean {
	return numeric(v) && (v === null || v >= 0);
}
function stamp(v: unknown): boolean {
	return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
}
export function safeSourceUrl(v: unknown): v is string {
	if (typeof v !== 'string') return false;
	try {
		const url = new URL(v);
		return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
	} catch { return false; }
}
function validRow(v: unknown): v is RetailRow {
	if (!record(v) || typeof v.id !== 'string' || !Object.prototype.hasOwnProperty.call(RETAIL_ROWS, v.id)) return false;
	return v.name === RETAIL_ROWS[v.id as RetailRowId] && nonnegative(v.amount)
		&& numeric(v.yoy_pct) && numeric(v.delta_pp) && nonnegative(v.share_pct)
		&& (v.share_pct === null || (typeof v.share_pct === 'number' && v.share_pct <= 100))
		&& (v.reason === null || typeof v.reason === 'string');
}
function validPeriod(v: unknown): v is RetailPeriod {
	if (!record(v) || typeof v.date !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v.date)) return false;
	if (!nonnegative(v.denominator_amount) || !safeSourceUrl(v.source_url) || !stamp(v.retrieved_at)) return false;
	if (v.source_kind !== 'api' && v.source_kind !== 'html') return false;
	if (typeof v.amount_precision !== 'number' || !Number.isInteger(v.amount_precision) || v.amount_precision < 0 || v.amount_precision > 6) return false;
	if (!Array.isArray(v.rows) || v.rows.length !== 7 || !v.rows.every(validRow)) return false;
	if (new Set(v.rows.map((r) => r.id)).size !== 7) return false;
	const denominator = v.denominator_amount as number | null;
	return v.rows.every((r) => {
		if (r.share_pct === null) return true;
		return denominator !== null && denominator > 0 && r.amount !== null
			&& Math.abs(r.share_pct - r.amount / denominator * 100) < 0.000001;
	});
}
function validDiagnostic(v: unknown): v is Diagnostic {
	return record(v) && typeof v.code === 'string' && v.code.length > 0
		&& (v.severity === 'warning' || v.severity === 'error') && typeof v.message === 'string'
		&& (v.row === undefined || typeof v.row === 'string')
		&& (v.period === undefined || typeof v.period === 'string')
		&& (v.source_url === undefined || safeSourceUrl(v.source_url))
		&& (v.context === undefined || record(v.context));
}

export function parseRetail(json: unknown): ParseResult<RetailProduct> {
	const fail = (message: string): ParseResult<RetailProduct> => ({
		ok: false, error: { kind: 'malformed', message: `retail_breakdown_v1: ${message}` },
	});
	if (!record(json)) return fail('Expected an object');
	if (json.schema_version !== 'retail_breakdown_v1') {
		return { ok: false, error: { kind: typeof json.schema_version === 'string' ? 'unknown_schema' : 'malformed', message: 'Unsupported retail schema' } };
	}
	if (json.scope !== 'national_above_designated_size_current_month_nominal'
		|| json.share_basis !== 'national_above_designated_size_goods_plus_catering') return fail('Invalid statistical scope or share denominator');
	if (!stamp(json.generated_at) || !stamp(json.last_attempt_at)
		|| !(json.last_success_at === null || stamp(json.last_success_at))) return fail('Invalid timestamps');
	if (!Array.isArray(json.periods) || !json.periods.every(validPeriod)) return fail('Invalid monthly snapshot, rows, or provenance');
	if (new Set(json.periods.map((p) => p.date)).size !== json.periods.length) return fail('Duplicate reporting months');
	if (json.periods.length > 0 && json.last_success_at === null) return fail('History requires a last-success timestamp');
	if (!Array.isArray(json.diagnostics) || !json.diagnostics.every(validDiagnostic)) return fail('Invalid diagnostics');
	return { ok: true, value: json as unknown as RetailProduct };
}
