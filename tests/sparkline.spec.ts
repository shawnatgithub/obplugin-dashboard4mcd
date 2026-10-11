import {
	SPARK_HEIGHT,
	SPARK_POINTS,
	SPARK_WIDTH,
	buildSparkPath,
	shape,
	sparkX,
	sparkY,
} from '../src/sparkline';

describe('sparkline geometry', () => {
	describe('shape(seed)', () => {
		it('returns one point per period', () => {
			expect(shape(1)).toHaveLength(SPARK_POINTS);
		});

		it('is deterministic for the same seed', () => {
			expect(shape(7)).toEqual(shape(7));
		});

		it('differs across seeds', () => {
			expect(shape(1)).not.toEqual(shape(2));
		});

		it('keeps every value inside the [0.08, 0.92] clamp', () => {
			for (const seed of [1, 2, 3, 5, 8, 13, 16]) {
				for (const v of shape(seed)) {
					expect(v).toBeGreaterThanOrEqual(0.08);
					expect(v).toBeLessThanOrEqual(0.92);
				}
			}
		});
	});

	describe('coordinate mapping', () => {
		it('maps the first index to x=0 and the last to x=width', () => {
			expect(sparkX(0)).toBe(0);
			expect(sparkX(SPARK_POINTS - 1)).toBe(SPARK_WIDTH);
		});

		it('maps f=1 to the top padding and f=0 to the bottom', () => {
			expect(sparkY(1)).toBe(3);
			expect(sparkY(0)).toBe(SPARK_HEIGHT - 3);
		});

		it('is monotonic: larger values sit higher (smaller y)', () => {
			expect(sparkY(0.9)).toBeLessThan(sparkY(0.1));
		});
	});

	describe('buildSparkPath(pts, gaps)', () => {
		it('returns an empty string for an empty series', () => {
			expect(buildSparkPath([])).toBe('');
		});

		it('emits a single move then lines when there are no gaps', () => {
			const d = buildSparkPath(shape(1));
			expect(d.startsWith('M')).toBe(true);
			expect(d.match(/M/g)).toHaveLength(1);
			expect(d.match(/L/g)).toHaveLength(SPARK_POINTS - 1);
		});

		it('breaks the pen at each gap so missing periods are not interpolated', () => {
			// gaps at 4 and 16 => three separate strokes (M at 0, 5, 17)
			const d = buildSparkPath(shape(3), [4, 16]);
			expect(d.match(/M/g)).toHaveLength(3);
		});

		it('emits nothing when every period is a gap', () => {
			const all = Array.from({ length: SPARK_POINTS }, (_, i) => i);
			expect(buildSparkPath(shape(1), all)).toBe('');
		});

		it('rounds coordinates to one decimal place', () => {
			const d = buildSparkPath(shape(1));
			// every coordinate token has at most one digit after the dot
			for (const token of d.match(/-?\d+\.\d+/g) ?? []) {
				expect(token).toMatch(/^-?\d+\.\d$/);
			}
		});
	});
});
