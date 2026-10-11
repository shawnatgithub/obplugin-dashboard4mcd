import {
	EXPIRED_SPARK_TEXT,
	deltaText,
	freshnessDotClass,
	freshnessLabel,
	gapNote,
	isExpired,
} from '../src/format';
import type { MetricCard } from '../src/types';

describe('freshness formatting', () => {
	it('labels the tri-state with the prototype wording', () => {
		expect(freshnessLabel('fresh')).toBe('最新');
		expect(freshnessLabel('aging')).toBe('临近截止');
		expect(freshnessLabel('stale')).toBe('已过期');
	});

	it('maps each state to its dot modifier class', () => {
		expect(freshnessDotClass('fresh')).toBe('mcd-dot is-fresh');
		expect(freshnessDotClass('aging')).toBe('mcd-dot is-aging');
		expect(freshnessDotClass('stale')).toBe('mcd-dot is-stale');
	});
});

describe('deltaText', () => {
	it('returns null when there is no delta', () => {
		expect(deltaText(undefined)).toBeNull();
	});

	it('renders a flat change as a held line', () => {
		expect(deltaText({ dir: 'flat' })).toBe('→ 持平');
	});

	it('renders up/down with an arrow and pct unit', () => {
		expect(deltaText({ dir: 'up', v: '0.2' })).toBe('↑ 0.2pct');
		expect(deltaText({ dir: 'down', v: '0.3' })).toBe('↓ 0.3pct');
	});
});

describe('gapNote', () => {
	it('returns null when there are no gaps', () => {
		expect(gapNote(undefined)).toBeNull();
		expect(gapNote([])).toBeNull();
	});

	it('counts the missing periods', () => {
		expect(gapNote([4])).toBe('含 1 期缺失');
		expect(gapNote([4, 16])).toBe('含 2 期缺失');
	});
});

describe('isExpired', () => {
	const base: MetricCard = {
		name: 'x',
		value: '1.0',
		unit: '%',
		period: '2026-09',
		fresh: 'fresh',
		seed: 1,
	};

	it('is true only when an expired note is present', () => {
		expect(isExpired(base)).toBe(false);
		expect(isExpired({ ...base, expired: '数据已过期' })).toBe(true);
	});

	it('exposes the expired sparkline placeholder text', () => {
		expect(EXPIRED_SPARK_TEXT).toBe('近 24 期无可用更新');
	});
});
