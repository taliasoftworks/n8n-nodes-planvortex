/**
 * Refreshes `errors/planvortex-errors.json` from upstream. Run by a person, never by CI.
 *
 *   npm run errors:sync
 *
 * WHY THERE IS A SNAPSHOT AT ALL. This package may not depend on `planvortex` — n8n's
 * verification requires zero runtime dependencies — so the numbered error catalogue has to exist
 * here as well. Duplicating it is exactly what the other repos forbid ("the error map is
 * generated from ONE shared table, never retyped per language"), and with reason: the catalogue
 * groups by RANGE, and a range is not a diagnosis. The MCP server shipped four translation bugs
 * of that family, three of them the same mistake.
 *
 * So it is neither retyped nor imported: it is READ from the two places that already own it,
 * written to a JSON file that is committed, and turned into TypeScript by
 * `scripts/generate-errors.mjs`. Two steps rather than one because CI clones only this
 * repository: without the committed snapshot the build could not run at all, and the check that
 * watches for drift would be watching nothing.
 *
 * The two upstreams, and why each is the one that owns its half:
 *
 * - **The codes** live in `PlanVortexServer/src/util/ErrorHandler.ts`, which is where a code is
 *   born. Nothing publishes them, so the server repository has to be checked out next to this
 *   one. `PLANVORTEX_ERROR_CATALOGUE` overrides the path.
 * - **The ranges** live in the OpenAPI document PlanVortexHome publishes, in the description of
 *   `Error.code` — the same sentence the Node and Python libraries take their families from.
 *   `PLANVORTEX_OPENAPI` overrides it, with a path or a URL; the published copy at
 *   https://planvortex.com/openapi.json works with no repositories checked out.
 *
 * Nothing here runs at build time and nothing here ships: this file is a dev dependency of the
 * repository, not of the package.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'errors', 'planvortex-errors.json');

/** The repositories sit side by side, as they do for the Node library's OpenAPI sync. */
const DEFAULT_CATALOGUE = path.resolve(ROOT, '../../PlanVortexServer/src/util/ErrorHandler.ts');
const DEFAULT_OPENAPI = path.resolve(ROOT, '../../PlanVortexHome/public/openapi.json');
const PUBLISHED_OPENAPI = 'https://planvortex.com/openapi.json';

function isRemote(source) {
	return /^https?:\/\//i.test(source);
}

async function readSource(source) {
	if (isRemote(source)) {
		const response = await fetch(source);
		if (!response.ok) {
			throw new Error(`${source} answered ${response.status} ${response.statusText}`);
		}
		return await response.text();
	}
	if (!fs.existsSync(source)) {
		throw new Error(`${source} does not exist`);
	}
	return fs.readFileSync(source, 'utf8');
}

/**
 * Every code the server can answer with, read off its declarations.
 *
 * Two things this has to get right, and both are already in the file:
 *
 * - **A commented-out declaration is a RETIRED code**, not a code. 924 (the monthly publication
 *   quota) and 1401 went that way when publications became unlimited, and 1103 is declared twice
 *   with the second one commented out — so a parser that ignores the comment marker reports a
 *   duplicate and resurrects three codes that no longer exist.
 * - **A message can be built rather than written**: twenty-odd of them concatenate a number out
 *   of `CONSTANT` (`"...max allowed " + CONSTANT.SOCIAL_LIMITS...`). The literal head is what is
 *   kept, flagged `dynamic`, because the runtime message always arrives in the response body —
 *   what the snapshot is for is knowing which codes exist and what language they speak.
 */
function parseCatalogue(source) {
	const declaration =
		/static readonly ERROR_CODE_(\d+)\s*=\s*new CustomError\(\s*(\d+)\s*,\s*([\s\S]*?)\);[ \t]*$/gm;

	const codes = new Map();
	let match;

	while ((match = declaration.exec(source)) !== null) {
		const lineStart = source.lastIndexOf('\n', match.index) + 1;
		const indent = source.slice(lineStart, match.index);
		// Commented out, or quoted inside a JSDoc block: neither is a live code.
		if (indent.includes('//') || indent.trimStart().startsWith('*')) continue;

		const [, name, code, expression] = match;
		if (name !== code) {
			throw new Error(
				`ERROR_CODE_${name} declares code ${code}: the catalogue disagrees with itself`,
			);
		}
		if (codes.has(Number(code))) {
			throw new Error(`Code ${code} is declared twice and both are live`);
		}

		const head = expression.match(/^"((?:[^"\\]|\\.)*)"/);
		if (head === null) {
			throw new Error(
				`Code ${code} does not start with a string literal: ${expression.slice(0, 60)}`,
			);
		}
		const dynamic = expression.trim() !== `"${head[1]}"`;

		codes.set(Number(code), {
			code: Number(code),
			message: JSON.parse(`"${head[1]}"`),
			...(dynamic ? { dynamic: true } : {}),
		});
	}

	if (codes.size === 0) throw new Error('No error codes found: the catalogue changed shape');
	return [...codes.values()].sort((a, b) => a.code - b.code);
}

/**
 * The codes answered with HTTP 429 instead of the 400 everything else uses.
 *
 * They are the only transient failures in the whole catalogue, which is what makes them worth
 * carrying: the advice for every one of their neighbours is "do not retry", and for these four it
 * is the opposite. The server keeps them in one list precisely so they read at a glance.
 */
function parseRateLimited(source) {
	const match = source.match(/RATE_LIMITED_ERROR_CODES\s*:\s*number\[\]\s*=\s*\[([^\]]*)\]/);
	if (match === null)
		throw new Error('RATE_LIMITED_ERROR_CODES not found: the catalogue changed shape');
	const codes = match[1]
		.split(',')
		.map((piece) => Number(piece.trim()))
		.filter((code) => Number.isInteger(code));
	if (codes.length === 0)
		throw new Error('RATE_LIMITED_ERROR_CODES is empty: that cannot be right');
	return codes.sort((a, b) => a - b);
}

/**
 * The ranges, out of the published API documentation.
 *
 * The sentence reads `500-546 auth, tokens and client apps · 601-612 user · ...`, and it is the
 * same one the Node and Python libraries read their families from. The label is kept whole for
 * the generated comments; the family slug is derived from the part before the first comma, so
 * "auth, tokens and client apps" is `auth` and "AI plans" is `ai_plans`.
 */
function parseRanges(openapi) {
	const description = openapi?.components?.schemas?.Error?.properties?.code?.description;
	if (typeof description !== 'string') {
		throw new Error('components.schemas.Error.properties.code.description is missing');
	}

	const ranges = [];
	const range = /(\d+)-(\d+)\s+([^·.]+)/g;
	let match;

	while ((match = range.exec(description)) !== null) {
		const label = match[3].trim();
		ranges.push({
			from: Number(match[1]),
			to: Number(match[2]),
			family: slug(label),
			label,
		});
	}

	if (ranges.length === 0) throw new Error('No ranges found in the Error schema description');

	const families = new Set(ranges.map((entry) => entry.family));
	if (families.size !== ranges.length) {
		// Two ranges of the same family would make the generated union smaller than the list, and
		// the advice table would silently cover both with one entry.
		throw new Error('Two ranges slug to the same family: the labels need to stay distinguishable');
	}

	return ranges.sort((a, b) => a.from - b.from);
}

function slug(label) {
	return label
		.split(',')[0]
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

const cataloguePath = process.env.PLANVORTEX_ERROR_CATALOGUE ?? DEFAULT_CATALOGUE;
const openapiPath = process.env.PLANVORTEX_OPENAPI ?? DEFAULT_OPENAPI;

let catalogueSource;
try {
	catalogueSource = await readSource(cataloguePath);
} catch (error) {
	console.error(`FAILED: ${error.message}`);
	console.error(
		'The error catalogue lives in PlanVortexServer, which is not published anywhere. Check ' +
			'that repository out next to this one, or point PLANVORTEX_ERROR_CATALOGUE at its ' +
			'src/util/ErrorHandler.ts.',
	);
	process.exit(1);
}

let openapiSource;
try {
	openapiSource = await readSource(openapiPath);
} catch (error) {
	console.error(
		`Could not read ${openapiPath} (${error.message}); falling back to the published copy.`,
	);
	openapiSource = await readSource(PUBLISHED_OPENAPI);
}

const snapshot = {
	$comment:
		'Generated by scripts/sync-errors.mjs — do not edit by hand. The codes come from ' +
		'PlanVortexServer/src/util/ErrorHandler.ts and the ranges from the published OpenAPI ' +
		'document. Run `npm run errors:sync` to refresh it, then `npm run errors:generate`.',
	ranges: parseRanges(JSON.parse(openapiSource)),
	rateLimited: parseRateLimited(catalogueSource),
	codes: parseCatalogue(catalogueSource),
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(snapshot, null, '\t')}\n`, 'utf8');

console.log(
	`OK: ${snapshot.codes.length} codes and ${snapshot.ranges.length} ranges written to ` +
		path.relative(ROOT, OUTPUT),
);
console.log('Now run `npm run errors:generate` and commit both files.');
