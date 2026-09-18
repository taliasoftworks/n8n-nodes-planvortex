/**
 * Turns `errors/planvortex-errors.json` into `nodes/PlanVortex/transport/errors.generated.ts`.
 *
 *   npm run errors:generate     # also runs automatically before every build
 *
 * It reads the committed snapshot and nothing else, so it works offline, in CI and in a clone
 * with no sibling repositories. Refreshing the snapshot from upstream is the other script,
 * `sync-errors.mjs`.
 *
 * WHAT IT EMITS, AND WHY EACH PIECE IS THERE. The point of generating is not to save typing — it
 * is to make the hand-written half **fail to compile** when the catalogue moves underneath it:
 *
 * - `PLANVORTEX_ERROR_CODES` doubles as the type `PlanVortexErrorCode`, so a per-code note for a
 *   code that was retired (924 and 1401 were, when publications became unlimited) or mistyped is
 *   a build error rather than a note nobody will ever see.
 * - `PlanVortexErrorFamily` is a union of exactly the families the API documents, so the table of
 *   per-family advice is a total `Record` and a new family cannot slip through uncovered.
 * - `NON_ENGLISH_ERROR_CODES` carries the catalogue messages that are not in English. n8n's
 *   verification is literal about error messages being English only, and the API's message is
 *   what this node shows, so each one needs a replacement here — and the compiler asks for it.
 * - `RATE_LIMITED_ERROR_CODES` are the only transient failures in the catalogue. Everything
 *   around them is advised "do not retry" and these four are the exact opposite, so a new one
 *   appearing upstream has to arrive with the right advice on its own.
 *
 * Prettier formats the output here rather than leaving it to the linter: a generated file that
 * the formatter would rewrite is a file that fails CI the first time somebody runs the generator.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = path.join(ROOT, 'errors', 'planvortex-errors.json');
const OUTPUT = path.join(ROOT, 'nodes', 'PlanVortex', 'transport', 'errors.generated.ts');

/**
 * The characters that only Spanish writes.
 *
 * The check is deliberately narrow. A wider one — looking for Spanish function words — would
 * report English messages now and then, and a false positive here asks somebody to "translate" a
 * sentence that is already English. The cost of the narrow version is knowing it: a Spanish
 * message written without accents would go through unnoticed, so this catches the leak rather
 * than proving the whole catalogue is English.
 */
const SPANISH_ONLY = /[áéíóúüñ¿¡ÁÉÍÓÚÜÑ]/;

const snapshot = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const { ranges, rateLimited, codes } = snapshot;

const nonEnglish = codes.filter((entry) => SPANISH_ONLY.test(entry.message)).map((e) => e.code);

/**
 * Reports the codes the documented ranges no longer reach, which is what the generated
 * `errorFamily` is built to survive rather than to hide.
 */
const outOfRange = codes
	.filter((entry) => !ranges.some((range) => entry.code >= range.from && entry.code <= range.to))
	.map((entry) => entry.code);

const header = `/**
 * GENERATED FILE — do not edit. Run \`npm run errors:generate\` instead.
 *
 * The PlanVortex error catalogue, as much of it as this node needs. It is generated rather than
 * written because this package may not depend on \`planvortex\` (n8n requires zero runtime
 * dependencies), and a catalogue copied by hand is a catalogue that drifts: the numbers stay
 * right and the meanings go stale.
 *
 * Its source is \`errors/planvortex-errors.json\`, refreshed from the server catalogue and the
 * published OpenAPI document by \`npm run errors:sync\`.
 */`;

const familyUnion = ranges.map((range) => `\t| '${range.family}'`).join('\n');

const rangeRows = ranges
	.map((range) => `\t{ from: ${range.from}, to: ${range.to}, family: '${range.family}' },`)
	.join('\n');

const body = `${header}

/** The families the API documents, one per range of codes. */
export type PlanVortexErrorFamily =
${familyUnion};

export interface PlanVortexErrorRange {
	readonly from: number;
	readonly to: number;
	readonly family: PlanVortexErrorFamily;
}

/**
 * The ranges, exactly as the API documentation states them.
 *
 * \`to\` is documented, not enforced: the catalogue grows past it and the sentence in the docs is
 * updated later. See {@link errorFamily} for what that means in practice.
 */
export const PLANVORTEX_ERROR_RANGES: readonly PlanVortexErrorRange[] = [
${rangeRows}
];

/**
 * Every code the server can answer with today.
 *
 * It exists for its type more than for its contents: \`PlanVortexErrorCode\` is what makes a
 * per-code note for a code that no longer exists a build error.
 */
export const PLANVORTEX_ERROR_CODES = [${codes.map((entry) => entry.code).join(', ')}] as const;

export type PlanVortexErrorCode = (typeof PLANVORTEX_ERROR_CODES)[number];

/**
 * The codes answered with HTTP 429 rather than the 400 everything else uses — the only transient
 * failures in the catalogue, and the only ones where retrying is the right answer.
 */
export const RATE_LIMITED_ERROR_CODES: readonly number[] = [${rateLimited.join(', ')}];

/**
 * Catalogue messages that are not in English, which this node may not show as they are: n8n's
 * verification requires every error message to be English. Each one needs a replacement, and the
 * compiler asks for it.
 */
export const NON_ENGLISH_ERROR_CODES = [${nonEnglish.join(', ')}] as const;

/**
 * The family a code belongs to.
 *
 * A family runs from its own first code up to the next family's, and NOT up to the \`to\` its
 * range documents. That is not sloppiness, it is the one failure this lookup exists to avoid: the
 * server adds codes to the end of a family every month and the published ceiling is raised
 * afterwards, so on the day of writing 547, 548 and 716 already sat above theirs. Reading the
 * ceiling literally would answer "unknown family" for them — and the generic advice that comes
 * with it says "do not just retry", while 716 means precisely "this was temporary, it is already
 * being retried". A stale ceiling would hand out the opposite advice, quietly.
 *
 * The last family is the exception, because nothing bounds it from above: there its documented
 * ceiling is all there is. \`npm run errors:sync\` reports a code that passes it.
 */
export function errorFamily(code: number): PlanVortexErrorFamily | undefined {
	for (let index = 0; index < PLANVORTEX_ERROR_RANGES.length; index++) {
		const range = PLANVORTEX_ERROR_RANGES[index];
		const next = PLANVORTEX_ERROR_RANGES[index + 1];
		if (code < range.from) return undefined;
		const ceiling = next === undefined ? range.to : next.from - 1;
		if (code <= ceiling) return range.family;
	}
	return undefined;
}
`;

const prettierConfig = await resolveConfig(OUTPUT);
const formatted = await format(body, { ...prettierConfig, filepath: OUTPUT });

fs.writeFileSync(OUTPUT, formatted, 'utf8');

console.log(
	`OK: ${codes.length} codes, ${ranges.length} families -> ${path.relative(ROOT, OUTPUT)}`,
);
if (nonEnglish.length > 0) {
	console.log(`     ${nonEnglish.length} message(s) not in English: ${nonEnglish.join(', ')}`);
}
if (outOfRange.length > 0) {
	console.log(
		`     ${outOfRange.length} code(s) above their documented range: ${outOfRange.join(', ')} ` +
			'— the family is resolved from the next range instead, and the OpenAPI sentence is ' +
			'what wants updating.',
	);
}
