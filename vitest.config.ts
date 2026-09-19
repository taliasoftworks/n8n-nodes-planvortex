import { defineConfig } from 'vitest/config';

/**
 * The tests never go to the network, so there is no environment to set up and nothing to mock
 * globally: every suite builds the n8n it needs from `test/helpers/context.ts`.
 *
 * The one line that is not obvious is the optimizer. `n8n-workflow` ships source maps whose
 * sources are not in the package, and loading it unbundled makes Vite print a "points to missing
 * source files" warning per module — around forty lines of noise in front of the result, which is
 * how a real warning goes unread. Pre-bundling it with esbuild drops the maps, and it also takes
 * the collection step from about eight seconds to under one.
 */
export default defineConfig({
	test: {
		include: ['test/**/*.test.ts'],
		deps: {
			optimizer: {
				ssr: { enabled: true, include: ['n8n-workflow'] },
			},
		},
	},
});
