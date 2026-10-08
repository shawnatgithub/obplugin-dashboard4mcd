/**
 * Jest configuration for the mcd plugin.
 *
 * The package is ESM (`"type": "module"`), so the config uses the `.cjs`
 * extension to be read as CommonJS. ts-jest compiles the TypeScript tests and
 * sources down to CommonJS so Jest can run them in a Node/jsdom environment
 * without the experimental ESM loader.
 *
 * @type {import('jest').Config}
 */
module.exports = {
	// jsdom emulates the browser/electron APIs (`document`, `window`) that
	// plugin code touches, matching the article's recommendation.
	testEnvironment: 'jsdom',
	roots: ['<rootDir>/src', '<rootDir>/tests'],
	testMatch: ['**/*.spec.ts'],
	transform: {
		'^.+\\.ts$': [
			'ts-jest',
			{
				tsconfig: {
					// Override the module target for the test runtime only.
					module: 'CommonJS',
					moduleResolution: 'node',
					esModuleInterop: true,
				},
			},
		],
	},
	clearMocks: true,
	collectCoverageFrom: ['src/**/*.ts'],
};
