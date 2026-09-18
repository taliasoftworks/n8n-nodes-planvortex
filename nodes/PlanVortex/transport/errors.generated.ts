/**
 * GENERATED FILE — do not edit. Run `npm run errors:generate` instead.
 *
 * The PlanVortex error catalogue, as much of it as this node needs. It is generated rather than
 * written because this package may not depend on `planvortex` (n8n requires zero runtime
 * dependencies), and a catalogue copied by hand is a catalogue that drifts: the numbers stay
 * right and the meanings go stale.
 *
 * Its source is `errors/planvortex-errors.json`, refreshed from the server catalogue and the
 * published OpenAPI document by `npm run errors:sync`.
 */

/** The families the API documents, one per range of codes. */
export type PlanVortexErrorFamily =
	| 'auth'
	| 'user'
	| 'social_accounts'
	| 'files'
	| 'publications'
	| 'general'
	| 'organizations'
	| 'roles'
	| 'client_plan'
	| 'organization_plan'
	| 'messaging'
	| 'contacts'
	| 'payments'
	| 'products'
	| 'ai_plans'
	| 'integrations';

export interface PlanVortexErrorRange {
	readonly from: number;
	readonly to: number;
	readonly family: PlanVortexErrorFamily;
}

/**
 * The ranges, exactly as the API documentation states them.
 *
 * `to` is documented, not enforced: the catalogue grows past it and the sentence in the docs is
 * updated later. See {@link errorFamily} for what that means in practice.
 */
export const PLANVORTEX_ERROR_RANGES: readonly PlanVortexErrorRange[] = [
	{ from: 500, to: 546, family: 'auth' },
	{ from: 601, to: 612, family: 'user' },
	{ from: 700, to: 715, family: 'social_accounts' },
	{ from: 800, to: 810, family: 'files' },
	{ from: 900, to: 986, family: 'publications' },
	{ from: 1000, to: 1003, family: 'general' },
	{ from: 1100, to: 1111, family: 'organizations' },
	{ from: 1200, to: 1207, family: 'roles' },
	{ from: 1300, to: 1308, family: 'client_plan' },
	{ from: 1400, to: 1408, family: 'organization_plan' },
	{ from: 1500, to: 1512, family: 'messaging' },
	{ from: 1600, to: 1601, family: 'contacts' },
	{ from: 1900, to: 1906, family: 'payments' },
	{ from: 2000, to: 2099, family: 'products' },
	{ from: 2100, to: 2199, family: 'ai_plans' },
	{ from: 2200, to: 2299, family: 'integrations' },
];

/**
 * Every code the server can answer with today.
 *
 * It exists for its type more than for its contents: `PlanVortexErrorCode` is what makes a
 * per-code note for a code that no longer exists a build error.
 */
export const PLANVORTEX_ERROR_CODES = [
	500, 501, 502, 503, 504, 505, 506, 507, 508, 509, 510, 511, 512, 513, 514, 515, 516, 517, 518,
	519, 520, 521, 522, 523, 524, 525, 526, 527, 528, 529, 530, 531, 532, 533, 534, 535, 536, 537,
	538, 539, 540, 541, 542, 543, 544, 545, 546, 547, 548, 601, 603, 604, 605, 606, 607, 608, 609,
	610, 611, 612, 700, 701, 702, 703, 704, 706, 707, 708, 709, 710, 711, 712, 713, 714, 715, 716,
	800, 801, 802, 803, 804, 805, 806, 807, 808, 809, 810, 900, 901, 902, 903, 904, 905, 906, 907,
	908, 909, 910, 911, 912, 913, 914, 915, 916, 917, 918, 919, 920, 921, 922, 923, 925, 926, 927,
	928, 929, 930, 931, 932, 933, 934, 935, 936, 937, 938, 939, 940, 941, 942, 943, 944, 945, 946,
	947, 948, 949, 950, 951, 952, 953, 954, 955, 956, 957, 958, 959, 960, 961, 962, 963, 964, 965,
	966, 967, 968, 969, 970, 971, 972, 973, 974, 975, 976, 977, 978, 979, 980, 981, 982, 983, 984,
	985, 986, 1000, 1001, 1002, 1003, 1100, 1101, 1102, 1103, 1104, 1105, 1106, 1107, 1108, 1109,
	1110, 1111, 1200, 1201, 1202, 1203, 1204, 1205, 1206, 1207, 1300, 1301, 1303, 1304, 1305, 1306,
	1307, 1308, 1400, 1402, 1403, 1404, 1405, 1406, 1407, 1408, 1500, 1501, 1502, 1503, 1504, 1505,
	1506, 1507, 1508, 1509, 1510, 1511, 1512, 1600, 1601, 1900, 1901, 1902, 1903, 1904, 1905, 1906,
	2000, 2100, 2101, 2102, 2103, 2104, 2105, 2106, 2107, 2108, 2109, 2110, 2111, 2112, 2113, 2114,
	2115, 2116, 2117, 2200, 2201, 2202, 2203, 2204, 2205, 2206,
] as const;

export type PlanVortexErrorCode = (typeof PLANVORTEX_ERROR_CODES)[number];

/**
 * The codes answered with HTTP 429 rather than the 400 everything else uses — the only transient
 * failures in the catalogue, and the only ones where retrying is the right answer.
 */
export const RATE_LIMITED_ERROR_CODES: readonly number[] = [545, 926, 978, 979];

/**
 * Catalogue messages that are not in English, which this node may not show as they are: n8n's
 * verification requires every error message to be English. Each one needs a replacement, and the
 * compiler asks for it.
 */
export const NON_ENGLISH_ERROR_CODES = [919] as const;

/**
 * The family a code belongs to.
 *
 * A family runs from its own first code up to the next family's, and NOT up to the `to` its
 * range documents. That is not sloppiness, it is the one failure this lookup exists to avoid: the
 * server adds codes to the end of a family every month and the published ceiling is raised
 * afterwards, so on the day of writing 547, 548 and 716 already sat above theirs. Reading the
 * ceiling literally would answer "unknown family" for them — and the generic advice that comes
 * with it says "do not just retry", while 716 means precisely "this was temporary, it is already
 * being retried". A stale ceiling would hand out the opposite advice, quietly.
 *
 * The last family is the exception, because nothing bounds it from above: there its documented
 * ceiling is all there is. `npm run errors:sync` reports a code that passes it.
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
