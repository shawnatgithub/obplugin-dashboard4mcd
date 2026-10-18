import { parseRetail, RETAIL_ROWS } from '../../src/contract/retail';
import { loadRetail } from '../../src/contract/loader';

const stamp = '2026-09-16T10:00:00+08:00';
function product() {
	return {
		schema_version: 'retail_breakdown_v1', generated_at: stamp,
		last_success_at: stamp, last_attempt_at: stamp,
		scope: 'national_above_designated_size_current_month_nominal',
		share_basis: 'national_above_designated_size_goods_plus_catering',
		periods: [{ date: '2026-08', denominator_amount: 14891,
			source_kind: 'api', source_url: 'https://data.stats.gov.cn/',
			retrieved_at: stamp, amount_precision: 1,
			rows: Object.entries(RETAIL_ROWS).map(([id, name]) => ({
				id, name, amount: 368.4, yoy_pct: 4.9, delta_pp: null,
				share_pct: 2.473977570344503, reason: null,
			})),
		}], diagnostics: [],
	};
}

it('preserves published rates, precision, scope and provenance', () => {
	const res = parseRetail(product());
	expect(res.ok).toBe(true);
	if (!res.ok) throw new Error(res.error.message);
	expect(res.value.periods[0]?.rows[2]?.amount).toBe(368.4);
	expect(res.value.periods[0]?.rows[2]?.yoy_pct).toBe(4.9);
	expect(res.value.periods[0]?.source_kind).toBe('api');
});

it.each(['partial', 'duplicates', 'scope', 'negative', 'infinite', 'share', 'date', 'url'])('rejects invalid retail %s', (kind) => {
	const doc = product();
	const period = doc.periods[0]!;
	if (kind === 'partial') period.rows.pop();
	if (kind === 'duplicates') period.rows[1] = period.rows[0]!;
	if (kind === 'scope') doc.scope = 'national_all_catering';
	if (kind === 'negative') period.rows[0]!.amount = -1;
	if (kind === 'infinite') period.rows[0]!.yoy_pct = Infinity;
	if (kind === 'share') period.rows[0]!.share_pct = 101;
	if (kind === 'date') period.date = '2026-13';
	if (kind === 'url') period.source_url = 'javascript:alert(1)';
	expect(parseRetail(doc).ok).toBe(false);
});

it('accepts explicit empty diagnostic products without a last success', () => {
	const doc = { ...product(), periods: [], last_success_at: null };
	expect(parseRetail(doc).ok).toBe(true);
});

it('rejects unknown schema distinctly', () => {
	const res = parseRetail({ ...product(), schema_version: 'retail_breakdown_v2' });
	expect(res.ok).toBe(false);
	if (!res.ok) expect(res.error.kind).toBe('unknown_schema');
});

it('loads the optional product only from configured processed folder', async () => {
	const read = jest.fn(async () => JSON.stringify(product()));
	const res = await loadRetail({ exists: async () => true, read }, 'MacroData');
	expect(res.ok).toBe(true);
	expect(read).toHaveBeenCalledWith('MacroData/processed/retail_breakdown.json');
});

it.each(['missing', 'invalid', 'denied'])('returns an explicit %s sidecar result without throwing', async (kind) => {
	const res = await loadRetail({
		exists: async () => { if (kind === 'denied') throw new Error('EACCES'); return kind !== 'missing'; },
		read: async () => '{bad json',
	}, 'MacroData');
	expect(res.ok).toBe(false);
	if (!res.ok) expect(res.detail.length).toBeGreaterThan(0);
});
