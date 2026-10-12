import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * 契约冻结校验（T1-4 / G3 / 退出标准 #7）。
 *
 * 为什么存在：tests/golden/ 是 ETL 与插件两仓共享的冻结数据契约样本，
 * CHECKSUMS.sha256 是它的封印。插件在这里用 node:crypto 重新计算每个文件的
 * sha256 并与封印逐行比对：任何 fixture 被改动、丢失或多出而未重生成 manifest，
 * 都会失败，从而保证两仓不会静默分叉（D8）。它与 ETL 的 tests/test_checksums.py
 * 等价，是 L3 双仓一致性的插件侧门禁，可用 `npm test -- -t checksums` 单独选中。
 *
 * 第二个 describe 另外校验样本结构，确保冻结契约的形状与插件后续（M1+）要
 * 消费的字段一致：capabilities 覆盖全部 reason_code、manifest 覆盖全部
 * freshness、signal_state 覆盖全部状态、每个序列样本含 date/value/revision。
 */

const REPO_ROOT = path.resolve(__dirname, '..');
const GOLDEN = path.join(REPO_ROOT, 'tests', 'golden');
const MANIFEST = path.join(GOLDEN, 'CHECKSUMS.sha256');
const PROCESSED = 'contract/processed';

/** 冻结 schema 定义的 reason_code / freshness / signal status 全集 */
const REASON_CODES = [
	'INSUFFICIENT_HISTORY',
	'MISSING_MONTHS',
	'INCOMPATIBLE_FREQUENCY',
	'INCOMPATIBLE_REGION',
	'UNIT_MISMATCH',
	'DERIVED_NOT_FOUND',
	'SOURCE_UNSUPPORTED',
];
const FRESHNESS_VALUES = ['fresh', 'aging', 'stale', 'unknown'];
const SIGNAL_STATUSES = ['support', 'conflict', 'insufficient'];

interface SeriesPoint {
	date: string;
	value: number | null;
	revision: number;
}
interface SeriesFixture {
	schema_version: string;
	key: string;
	series: SeriesPoint[];
}
interface ManifestIndicator {
	key: string;
	file: string;
	schema: string;
	region: string;
	frequency: string;
	unit: string;
	status: string;
	last_date: string | null;
	freshness: string;
}
interface ManifestFixture {
	schema_version: string;
	indicators: ManifestIndicator[];
}
interface SignalEntry {
	key: string;
	status: string;
	values: Record<string, number | string | null>;
}
interface SignalFixture {
	schema_version: string;
	signals: SignalEntry[];
}
interface CapabilitiesFixture {
	schema_version: string;
	panels: Record<string, unknown>;
}

/** 递归列出 golden 树下所有普通文件的 posix 相对路径（排除 manifest 自身） */
function goldenFiles(): string[] {
	const walk = (dir: string): string[] => {
		const out: string[] = [];
		for (const entry of readdirSync(dir)) {
			const full = path.join(dir, entry);
			if (statSync(full).isDirectory()) {
				out.push(...walk(full));
			} else {
				out.push(path.relative(GOLDEN, full).split(path.sep).join('/'));
			}
		}
		return out;
	};
	return walk(GOLDEN)
		.filter((rel) => rel !== 'CHECKSUMS.sha256')
		.sort();
}

/** 对样本原始字节求 sha256（与 ETL 的 hashlib.sha256(read_bytes()) 一致） */
function sha256(rel: string): string {
	return createHash('sha256')
		.update(readFileSync(path.join(GOLDEN, rel)))
		.digest('hex');
}

/** 解析 manifest：每行 `<64hex>  <posix-rel>`，两个空格分隔 */
function parseManifest(text: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const raw of text.split('\n')) {
		const line = raw.replace(/\r$/, '');
		if (!line.trim()) continue;
		const sep = line.indexOf('  ');
		out.set(line.slice(sep + 2), line.slice(0, sep));
	}
	return out;
}

function readJson<T>(rel: string): T {
	return JSON.parse(readFileSync(path.join(GOLDEN, rel), 'utf8')) as T;
}

const sealed = parseManifest(readFileSync(MANIFEST, 'utf8'));
const onDisk = goldenFiles();
const seriesFiles = onDisk.filter(
	(rel) =>
		rel.startsWith(`${PROCESSED}/`) &&
		rel !== `${PROCESSED}/capabilities.json` &&
		rel !== `${PROCESSED}/manifest.json`,
);

describe('contract checksums (T1-4 / G3)', () => {
	it('封印存在且覆盖全部契约样本', () => {
		expect(sealed.size).toBeGreaterThanOrEqual(11);
	});

	it.each([...sealed.keys()])('样本 %s 的 sha256 与封印一致', (rel) => {
		expect(sha256(rel)).toBe(sealed.get(rel));
	});

	it('没有游离于封印之外的多余样本', () => {
		expect(onDisk).toEqual([...sealed.keys()].sort());
	});

	it('manifest 每行格式合法（64 位小写十六进制 + posix 相对路径）', () => {
		for (const [rel, digest] of sealed) {
			expect(digest).toMatch(/^[0-9a-f]{64}$/);
			expect(rel).not.toContain('\\');
			expect(rel.startsWith('/')).toBe(false);
		}
	});
});

describe('contract fixture structure', () => {
	it('capabilities 覆盖全部 7 个 reason_code 与 7 个面板', () => {
		const caps = readJson<CapabilitiesFixture>(
			`${PROCESSED}/capabilities.json`,
		);
		expect(caps.schema_version).toBe('capabilities_v1');
		expect(Object.keys(caps.panels)).toHaveLength(7);
		const blob = JSON.stringify(caps);
		for (const code of REASON_CODES) expect(blob).toContain(code);
	});

	it('manifest 覆盖全部 4 种 freshness 且指标字段完整', () => {
		const manifest = readJson<ManifestFixture>(`${PROCESSED}/manifest.json`);
		expect(manifest.schema_version).toBe('manifest_v1');
		const seen = new Set(manifest.indicators.map((i) => i.freshness));
		for (const f of FRESHNESS_VALUES) expect(seen.has(f)).toBe(true);
		for (const ind of manifest.indicators) {
			for (const k of [
				'key',
				'file',
				'schema',
				'region',
				'frequency',
				'unit',
				'status',
				'freshness',
			] as const) {
				expect(ind[k]).toBeDefined();
			}
		}
	});

	it('signal_state 状态合法且覆盖 3 种语义', () => {
		const sig = readJson<SignalFixture>('contract/signals/signal_state.json');
		expect(sig.schema_version).toBe('signal_state_v1');
		const seen = new Set(sig.signals.map((s) => s.status));
		for (const st of SIGNAL_STATUSES) expect(seen.has(st)).toBe(true);
		for (const s of sig.signals) {
			expect(SIGNAL_STATUSES).toContain(s.status);
			expect(s.key.length).toBeGreaterThan(0);
			expect(typeof s.values).toBe('object');
		}
	});

	it.each(seriesFiles)('序列样本 %s 结构合法', (rel) => {
		const fx = readJson<SeriesFixture>(rel);
		expect(fx.schema_version).toBe('indicator_series_v1');
		expect(typeof fx.key).toBe('string');
		expect(Array.isArray(fx.series)).toBe(true);
		for (const p of fx.series) {
			expect(typeof p.date).toBe('string');
			expect(p.value === null || typeof p.value === 'number').toBe(true);
			expect(typeof p.revision).toBe('number');
		}
	});
});
