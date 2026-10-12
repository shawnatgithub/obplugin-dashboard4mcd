import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseCapabilities } from '../../src/contract/parse';
import { isStub, panelReason, reasonText } from '../../src/contract/reasonText';
import type { CapabilitiesV1, ReasonCode } from '../../src/contract/types';

/** reason_code copy + panel-shape helpers (T3-5). */

const ALL_CODES: ReasonCode[] = [
	'INSUFFICIENT_HISTORY',
	'MISSING_MONTHS',
	'INCOMPATIBLE_FREQUENCY',
	'INCOMPATIBLE_REGION',
	'UNIT_MISMATCH',
	'DERIVED_NOT_FOUND',
	'SOURCE_UNSUPPORTED',
];

const GOLDEN = path.resolve(
	__dirname,
	'..',
	'..',
	'tests',
	'golden',
	'contract',
	'processed',
);

function caps(): CapabilitiesV1 {
	const raw = JSON.parse(
		readFileSync(path.join(GOLDEN, 'capabilities.json'), 'utf8'),
	);
	const r = parseCapabilities(raw);
	if (!r.ok) throw new Error('golden capabilities failed to parse');
	return r.value;
}

describe('reasonText', () => {
	it.each(ALL_CODES)('%s 有非空文案', (code) => {
		const t = reasonText(code);
		expect(typeof t).toBe('string');
		expect(t.length).toBeGreaterThan(0);
	});

	it('七条文案互不相同（不会张冠李戴）', () => {
		expect(new Set(ALL_CODES.map(reasonText)).size).toBe(7);
	});
});

describe('isStub / panelReason', () => {
	it('源不支持面板 → stub，panelReason 给出 SOURCE_UNSUPPORTED', () => {
		const panel = caps().panels.shanghai_finance_quarterly;
		expect(panel).toBeDefined();
		if (!panel) return;
		expect(isStub(panel)).toBe(true);
		expect(panelReason(panel)).toBe('SOURCE_UNSUPPORTED');
	});

	it('完整面板 → 非 stub，panelReason 为 null', () => {
		const panel = caps().panels.retail_sales_total;
		expect(panel).toBeDefined();
		if (!panel) return;
		expect(isStub(panel)).toBe(false);
		expect(panelReason(panel)).toBeNull();
	});
});
