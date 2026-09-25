/**
 * Runs n8n's official community-package static analysis against this working copy, the way the
 * published scanner runs it against a release: over two sets of files, and both must pass.
 *
 * 1. **The source** — `package.json` plus `nodes/` and `credentials/`, with the scanner's own
 *    `SOURCE_FILE_PATTERNS`. On a real release it downloads these from GitHub, at the commit the
 *    provenance attestation names.
 * 2. **What npm ships** — the compiled `.js` and the `package.json`. Provenance pins the source
 *    commit, not the build output, so the scanner lints the tarball as well. The list comes from
 *    `npm pack --dry-run`, which makes it the tarball's list rather than a guess at it, and
 *    `npm run scan` builds first: linting a stale `dist/` is a verdict on code that is not the
 *    code going out.
 *
 * The published CLI (`npx @n8n/scan-community-package n8n-nodes-planvortex`) also verifies the
 * provenance, so it needs a release to download: that is `npm run scan:published`.
 *
 * Every file count is printed, and zero files is a failure: `analyzePackage` answers
 * `passed: true` when its glob matches nothing, which is the one way this check can go green
 * while testing nothing at all.
 */
import {
	analyzePackage,
	SOURCE_FILE_PATTERNS,
} from '@n8n/scan-community-package/scanner/scanner.mjs';
import { globSync } from 'glob';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message, details) {
	console.error(`FAILED: ${message}`);
	if (details) console.error(details);
	process.exit(1);
}

// 1. The source.
const sourceFiles = globSync(SOURCE_FILE_PATTERNS, {
	cwd: packageDir,
	ignore: ['node_modules/**', '**/package-lock.json'],
});

if (sourceFiles.length === 0) {
	fail(`the scanner matched no source files in ${packageDir}`);
}

// 2. What `npm publish` would upload. The scanner lints `**/*.js` and `package.json` of the
// extracted tarball; these are the same files, linted where they sit.
// One string through the shell, not a command plus arguments: `npm` is `npm.cmd` on Windows and
// needs the shell there, and Node warns when arguments are concatenated into one.
const pack = spawnSync('npm pack --dry-run --json', {
	cwd: packageDir,
	encoding: 'utf8',
	shell: true,
});

if (pack.status !== 0) {
	fail('`npm pack --dry-run` did not run', pack.stderr);
}

// The shape of that JSON changed with npm: 11 answers an array of packed packages, 12 an object
// keyed by package name. CI installs `npm@latest`, so both are live at once — and destructuring
// the wrong one dies with "object is not iterable", which reads like a broken scan and is a
// version difference. Take whichever carries a `files` array.
const packReport = JSON.parse(pack.stdout);
const packed = (Array.isArray(packReport) ? packReport : Object.values(packReport)).find(
	(entry) => Array.isArray(entry?.files),
)?.files;

if (!packed) {
	fail('`npm pack --dry-run --json` answered a shape with no file list', pack.stdout.slice(0, 500));
}

const shippedFiles = packed
	.map((file) => file.path)
	.filter((path) => path.endsWith('.js') || path === 'package.json');

if (!shippedFiles.some((path) => path.endsWith('.js'))) {
	fail('the tarball would contain no compiled JavaScript — run `npm run build` first');
}

const results = [
	['source', sourceFiles.length, await analyzePackage(packageDir, SOURCE_FILE_PATTERNS)],
	['shipped', shippedFiles.length, await analyzePackage(packageDir, shippedFiles)],
];

for (const [label, count, result] of results) {
	if (!result.passed) fail(`${label} files: ${result.message}`, result.details);
	console.log(`OK: ${count} ${label} files passed the n8n community-package scan`);
}
