import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
	collapseRevisions,
	formatTimestamp,
	formatValue,
	frequencyLabel,
	hashSeed,
	regionLabel,
	resolveOverview,
	sparkFromSeries,
	toDetail,
	toOverview,
	unitLabel,
	type OverviewModel,
} from '../../src/contract/mapper';
import {
	parseCapabilities,
	parseManifest,
	parseSeries,
} from '../../src/contract/parse';
import { isStub, reasonText } from '../../src/contract/reasonText';
import type {
	CapabilitiesV1,
	IndicatorSeriesV1,
	ManifestV1,
	SeriesPoint,
} from '../../src/contract/types';
import type { MetricCard } from '../../src/types';

/**
 * Mapper tests (T3-3). Fixtures are the frozen golden samples shared with the
 * ETL repo (`tests/golden/contract/`), sealed by checksums.spec.ts, so every
 * asserted value here is a byte the pipeline actually emits — no invented data.
 */

const GOLDEN = path.resolve(
	__dirname,
	'..',
	'..',
	'tests',
	'golden',
	'contract',
	'processed',
);

function readJson(name: string): unknown {
	return JSON.parse(readFileSync(path.join(GOLDEN, name), 'utf8'));
}

interface Golden {
	manifest: ManifestV1;
	caps: CapabilitiesV1;
	seriesByKey: Map<string, IndicatorSeriesV1>;
}

function loadGolden(): Golden {
	const m = parseManifest(readJson('manifest.json'));
	if (!m.ok) throw new Error('manifest parse failed');
	const c = parseCapabilities(readJson('capabilities.json'));
	if (!c.ok) throw new Error('capabilities parse failed');
	const seriesByKey = new Map<string, IndicatorSeriesV1>();
	for (const ind of m.value.indicators) {
		const r = parseSeries(readJson(ind.file));
		if (!r.ok) throw new Error(`series parse failed: ${ind.file}`);
		seriesByKey.set(ind.key, r.value);
	}
	return { manifest: m.value, caps: c.value, seriesByKey };
}

function cardByKey(model: OverviewModel, key: string): MetricCard | undefined {
	for (const g of model.groups) {
		const hit = g.cards.find((c) => c.key === key);
		if (hit) return hit;
	}
	return undefined;
}

/** Clone the manifest with one indicator's lifecycle status overridden. */
function withStatus(
	manifest: ManifestV1,
	key: string,
	status: 'active' | 'planned' | 'paused',
): ManifestV1 {
	return {
		...manifest,
		indicators: manifest.indicators.map((i) =>
			i.key === key ? { ...i, status } : i,
		),
	};
}

describe('mapper helpers', () => {
	it('formatValue: null 为破折号，速率保留一位，整数级别不带 .0', () => {
		expect(formatValue(null, 'yoy_pct')).toBe('—');
		expect(formatValue(3.8, 'yoy_pct')).toBe('3.8');
		expect(formatValue(-0.7, 'yoy_pct')).toBe('-0.7');
		expect(formatValue(44100, 'level_cny')).toBe('44100');
		expect(formatValue(44100.5, 'level_cny')).toBe('44100.5');
	});

	it('unitLabel / regionLabel 覆盖契约枚举', () => {
		expect(unitLabel('yoy_pct')).toBe('%');
		expect(unitLabel('mom_pct')).toBe('%');
		expect(unitLabel('level_cny')).toBe('亿元');
		expect(unitLabel('index_2020_100')).toBe('');
		expect(unitLabel('unknown')).toBe('');
		expect(regionLabel('CN')).toBe('全国趋势');
		expect(regionLabel('SH')).toBe('地方：上海');
		expect(frequencyLabel('monthly')).toBe('月度');
		expect(frequencyLabel('quarterly')).toBe('季度');
		expect(frequencyLabel('daily')).toBe('日度');
		expect(frequencyLabel('annual')).toBe('年度');
	});

	it('formatTimestamp 保留日期与时分，无时间时仅日期', () => {
		expect(formatTimestamp('2026-10-11T08:00:00+08:00')).toBe('2026-10-11 08:00');
		expect(formatTimestamp('2026-10-11')).toBe('2026-10-11');
	});

	it('hashSeed 确定、非负、按 key 区分', () => {
		expect(hashSeed('abc')).toBe(hashSeed('abc'));
		expect(hashSeed('abc')).toBeGreaterThanOrEqual(0);
		expect(hashSeed('retail_sales_total')).not.toBe(hashSeed('cpi_national_yoy'));
	});

	it('sparkFromSeries 截取最近 24 期并保留 null', () => {
		const pts: SeriesPoint[] = Array.from({ length: 30 }, (_, i) => ({
			date: `d${i}`,
			value: i === 5 ? null : i,
			revision: 1,
		}));
		const spark = sparkFromSeries(pts);
		expect(spark).toHaveLength(24);
		expect(spark[0]).toBe(6); // 30 - 24 = 6, so index 5 (the null) is dropped
		expect(spark[23]).toBe(29);
	});

	it('collapseRevisions 保留每期最新修订，不重复计期', () => {
		const { seriesByKey } = loadGolden();
		const raw = seriesByKey.get('retail_sales_total_yoy')!.series;
		expect(raw).toHaveLength(6); // 2026-08 appears as rev1 + rev2
		const collapsed = collapseRevisions(raw);
		expect(collapsed).toHaveLength(5);
		const aug = collapsed.find((p) => p.date === '2026-08')!;
		expect(aug.value).toBe(4.1);
		expect(aug.revision).toBe(2);
	});
});

describe('toOverview', () => {
	const { manifest, caps, seriesByKey } = loadGolden();
	const model = toOverview(manifest, seriesByKey, caps);

	it('按 region 分组：全国 5 卡 + 上海 1 卡，全国在前', () => {
		expect(model.groups).toHaveLength(2);
		const cn = model.groups[0]!;
		const sh = model.groups[1]!;
		expect(cn.title).toBe('全国趋势');
		expect(cn.cards).toHaveLength(5);
		expect(sh.title).toBe('地方：上海');
		expect(sh.cards).toHaveLength(1);
		expect(sh.cards[0]!.key).toBe('retail_sales_sh_yoy');
	});

	it('annual 兄弟序列不产生总览卡（CR-2026-10-13）', () => {
		// 冻结清单含 7 个指标，其中 retail_sales_total_annual 为 annual：
		// 卡片仍为 5+1，annual 键不出现在任何分组。
		expect(manifest.indicators).toHaveLength(7);
		expect(manifest.indicators.some((i) => i.frequency === 'annual')).toBe(true);
		expect(cardByKey(model, 'retail_sales_total_annual')).toBeUndefined();
		const total = model.groups.flatMap((g) => g.cards).length;
		expect(total).toBe(6);
	});

	it('真实数据 meta：无示例横幅，更新时间来自 manifest', () => {
		expect(model.meta.sampleNotice).toBe('');
		expect(model.meta.updatedAt).toBe('ETL 更新于 2026-10-11 08:00');
	});

	it('级别卡：主值 + 亿元，无同比 delta，缺口成断点', () => {
		const total = cardByKey(model, 'retail_sales_total')!;
		expect(total.name).toBe('全国社会消费品零售总额');
		expect(total.value).toBe('44100');
		expect(total.unit).toBe('亿元');
		expect(total.period).toBe('2026-09');
		expect(total.fresh).toBe('fresh');
		expect(total.delta).toBeUndefined(); // 级别不显示 pct 变化
		expect(total.spark).toHaveLength(12);
		expect(total.gaps).toEqual([8, 9]); // 2026-06 / 2026-07 nulls
	});

	it('同比卡：修订折叠后 5 期，delta 取最新两期差', () => {
		const yoy = cardByKey(model, 'retail_sales_total_yoy')!;
		expect(yoy.value).toBe('3.8');
		expect(yoy.unit).toBe('%');
		expect(yoy.delta).toEqual({ dir: 'down', v: '0.3' }); // 3.8 - 4.1
		expect(yoy.spark).toHaveLength(5);
		expect(yoy.gaps).toBeUndefined();
	});

	it('四态 freshness 落到卡片，unknown 用序列期号补 period', () => {
		expect(cardByKey(model, 'money_supply_m1_yoy')!.fresh).toBe('aging');
		expect(cardByKey(model, 'cpi_national_yoy')!.fresh).toBe('stale');
		const inc = cardByKey(model, 'disposable_income_yoy')!;
		expect(inc.fresh).toBe('unknown');
		expect(inc.value).toBe('5.2');
		expect(inc.period).toBe('2026-Q2'); // manifest last_date 为 null，回退到序列
		expect(inc.delta).toEqual({ dir: 'up', v: '0.2' });
	});

	it('stale CPI 的负值回升算作上行 1.0pct', () => {
		expect(cardByKey(model, 'cpi_national_yoy')!.delta).toEqual({
			dir: 'up',
			v: '1.0',
		}); // 0.3 - (-0.7)
	});

	it('缺序列的指标降级为过期卡，不显示折线', () => {
		const partial = new Map(seriesByKey);
		partial.delete('cpi_national_yoy');
		const m2 = toOverview(manifest, partial, caps);
		const cpi = cardByKey(m2, 'cpi_national_yoy')!;
		expect(cpi.value).toBe('—');
		expect(cpi.name).toBe('cpi_national_yoy'); // 无 title 回退到 key
		expect(cpi.expired).toBeTruthy();
		expect(cpi.spark).toBeUndefined();
	});
});

describe('toDetail', () => {
	const { manifest, caps, seriesByKey } = loadGolden();

	it('映射同比指标的头信息、来源与折叠后的点', () => {
		const d = toDetail(
			'retail_sales_total_yoy',
			manifest,
			seriesByKey.get('retail_sales_total_yoy')!,
			caps,
		);
		expect(d.title).toBe('全国社会消费品零售总额当月同比');
		expect(d.unit).toBe('yoy_pct');
		expect(d.region).toBe('CN');
		expect(d.frequency).toBe('monthly');
		expect(d.freshness).toBe('fresh');
		expect(d.lastDate).toBe('2026-09');
		expect(d.source).toBe('akshare_eastmoney');
		expect(d.updatedAt).toBe('2026-10-11 08:00');
		expect(d.fileName).toBe('retail_sales_total_yoy.json');
		expect(d.points).toHaveLength(5);
		expect(d.statusBanner).toBeNull();
		expect(d.panel && isStub(d.panel)).toBe(false);
	});

	it('季度指标：unknown 新鲜度，panel 因频率禁用日历/表格-only', () => {
		const d = toDetail(
			'disposable_income_yoy',
			manifest,
			seriesByKey.get('disposable_income_yoy')!,
			caps,
		);
		expect(d.freshness).toBe('unknown');
		expect(d.lastDate).toBe('2026-Q2');
		expect(d.points).toHaveLength(4);
		expect(d.statusBanner).toBeNull();
		if (d.panel && !isStub(d.panel)) {
			expect(d.panel.modes.calendar.supported).toBe(false);
			expect(d.panel.modes.calendar.reason_code).toBe('INCOMPATIBLE_FREQUENCY');
			expect(d.panel.chart_types).toEqual(['table']);
		} else {
			throw new Error('expected a full panel');
		}
	});

	it('缺序列时给出未找到横幅、空点集，标题回退到 key', () => {
		const d = toDetail('retail_sales_total', manifest, null, caps);
		expect(d.points).toHaveLength(0);
		expect(d.title).toBe('retail_sales_total');
		// No series: the update time falls back to the manifest, the file name
		// still comes from the manifest row (§6 双时间戳 stays honest).
		expect(d.updatedAt).toBe('2026-10-11 08:00');
		expect(d.fileName).toBe('retail_sales_total.json');
		expect(d.statusBanner).toBe('未找到该指标的序列数据（文件缺失或尚未生成）');
	});

	it('stub 数据源：横幅采用其 reason_code 文案', () => {
		const stubSeries: IndicatorSeriesV1 = {
			schema_version: 'indicator_series_v1',
			key: 'shanghai_finance_quarterly',
			region: 'SH',
			frequency: 'quarterly',
			date_grain: 'quarter',
			unit: 'yoy_pct',
			null_policy: 'null_not_zero',
			status: 'active',
			series: [{ date: '2026-Q2', value: 1.0, revision: 1 }],
			quality: { last_date: '2026-Q2' },
		};
		const d = toDetail('shanghai_finance_quarterly', manifest, stubSeries, caps);
		expect(d.panel && isStub(d.panel)).toBe(true);
		expect(d.statusBanner).toBe(reasonText('SOURCE_UNSUPPORTED'));
	});

	it('planned 但已有序列时不告警（首批冻结即 planned，G19）', () => {
		const planned = withStatus(manifest, 'retail_sales_total', 'planned');
		const d = toDetail(
			'retail_sales_total',
			planned,
			seriesByKey.get('retail_sales_total')!,
			caps,
		);
		expect(d.statusBanner).toBeNull();
		expect(d.points.length).toBeGreaterThan(0);
	});

	it('paused 状态在有序列时仍给出暂停采集横幅', () => {
		const paused = withStatus(manifest, 'retail_sales_total', 'paused');
		const d = toDetail(
			'retail_sales_total',
			paused,
			seriesByKey.get('retail_sales_total')!,
			caps,
		);
		expect(d.statusBanner).toBe('已暂停采集');
	});
});

describe('resolveOverview', () => {
	it('LoadOk → 真实模型，无示例横幅', () => {
		const { manifest, caps, seriesByKey } = loadGolden();
		const model = resolveOverview({ ok: true, manifest, seriesByKey, caps });
		expect(model.meta.sampleNotice).toBe('');
		expect(model.groups).toHaveLength(2);
	});

	it('LoadErr → 回退内置示例，横幅携带失败原因', () => {
		const model = resolveOverview({
			ok: false,
			reason: 'missing_manifest',
			detail: '未找到清单文件：MacroData/processed/manifest.json',
		});
		expect(model.meta.sampleNotice).toContain('未找到清单文件');
		expect(model.meta.sampleNotice).toContain('示例数据');
		expect(model.groups.length).toBeGreaterThan(0);
	});
});
