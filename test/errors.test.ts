import { describe, expect, it } from 'vitest';
import { describeApiError } from '../nodes/PlanVortex/transport/errors';
import {
	errorFamily,
	NON_ENGLISH_ERROR_CODES,
	PLANVORTEX_ERROR_CODES,
	PLANVORTEX_ERROR_RANGES,
	RATE_LIMITED_ERROR_CODES,
} from '../nodes/PlanVortex/transport/errors.generated';

/**
 * The translation of a PlanVortex error into something a workflow author can act on.
 *
 * The compiler already guards the shape of this table — a retired code or a new family stops the
 * build (see CLAUDE.md, *The error catalogue*). What it cannot check is whether the sentence that
 * comes out is the right one, and that is the bug this whole file exists for: advice given by
 * range told users with perfect credentials to go and check their credentials, it shipped in the
 * MCP server, and nothing about it looked wrong.
 *
 * So the tests below are about meaning, not coverage: which sentence a code gets, and which
 * sentence it must not get.
 */

/**
 * The advice a code nobody has heard of falls back to, read from the code rather than copied,
 * so these tests keep meaning what they mean when the wording is improved.
 */
const UNKNOWN_ADVICE = describeApiError({ code: 999999 }).description.replace(
	' (PlanVortex error 999999)',
	'',
);

describe('describeApiError', () => {
	it('keeps the API message as the headline and adds the code to the description', () => {
		const described = describeApiError({
			code: 926,
			message: 'Monthly publication limit reached for this account',
		});

		// The live message says things a table here could not — which limit, and by how much.
		expect(described.message).toBe('Monthly publication limit reached for this account');
		expect(described.description).toContain('(PlanVortex error 926)');
	});

	it('answers with the code when the API sends no message at all', () => {
		expect(describeApiError({ code: 917 }).message).toBe('PlanVortex answered error 917');
		expect(describeApiError({ code: 917, message: '' }).message).toBe(
			'PlanVortex answered error 917',
		);
	});

	/**
	 * The three that share a panel in phase 4's "Hecho cuando", and the reason the lookup is per
	 * code before per family. Two of them — 516 and 520 — live in the same range, the one the
	 * documentation calls `auth`, so a family-first lookup would hand them the same sentence.
	 */
	it('tells a free plan, a missing permission and a wrong organization apart', () => {
		const freePlan = describeApiError({ code: 516, message: 'Comments need a paid plan' });
		const permission = describeApiError({ code: 520, message: 'Missing permissions' });
		const organization = describeApiError({ code: 1101, message: 'Organization not found' });

		expect(freePlan.description).toContain('free plan');
		expect(freePlan.description).toContain('not a credentials problem');

		expect(permission.description).toContain('permissions this call needs');
		expect(permission.description).toContain('under Apps');

		expect(organization.description).toContain('does not exist');
		expect(organization.description).toContain('Organization dropdown');

		const descriptions = [freePlan, permission, organization].map((one) => one.description);
		expect(new Set(descriptions).size).toBe(3);
	});

	it('names the permissions a 520 is missing, from the data the API sent with it', () => {
		const described = describeApiError({
			code: 520,
			message: 'Missing permissions',
			data: { permissions: ['publications:write'], client_permissions: ['organizations:read'] },
		});

		expect(described.description).toContain('Missing: publications:write, organizations:read.');
	});

	it('says nothing about permissions when the API did not name any', () => {
		expect(describeApiError({ code: 520, message: 'Missing permissions' }).description).not.toContain(
			'Missing:',
		);
	});

	/**
	 * 545 is the one rate limit with no note of its own, and it sits inside `auth` — whose family
	 * text is about credentials and the app. Retrying is exactly right here and exactly wrong for
	 * its neighbours, which is why the rate-limit check runs before the family.
	 */
	it('advises retrying on a rate limit, whatever family it sits in', () => {
		expect(errorFamily(545)).toBe('auth');
		expect(describeApiError({ code: 545, message: 'Too many requests' }).description).toContain(
			'temporary',
		);
	});

	it('falls back to the family when a code has nothing specific to say', () => {
		// 1500 is a messaging failure with no note of its own: the family text is the right answer.
		const described = describeApiError({ code: 1500, message: 'Message not sent' });
		expect(errorFamily(1500)).toBe('messaging');
		expect(described.description).toContain('24 hours');
		expect(described.description).not.toContain(UNKNOWN_ADVICE);
	});

	it('does not pretend to know a code that is not in the catalogue', () => {
		const described = describeApiError({ code: 4242, message: 'Something new' });
		expect(described.message).toBe('Something new');
		expect(described.description).toContain(UNKNOWN_ADVICE);
	});

	/**
	 * Rule 1 of this repository, enforced against the catalogue rather than against ourselves:
	 * the message the node shows is the server's own, and the server does not owe us English.
	 * The generator marks the ones that are not, the compiler demands a replacement, and this is
	 * the test that the replacement is actually the thing shown.
	 */
	it('replaces every catalogue message that is not in English', () => {
		for (const code of NON_ENGLISH_ERROR_CODES) {
			const spanish = 'Ocurrió un error al intentar programar una publicación';
			const described = describeApiError({ code, message: spanish });
			expect(described.message).not.toBe(spanish);
			expect(described.message.length).toBeGreaterThan(0);
		}
	});

	/**
	 * Not a coverage count: a code that reaches the unknown fallback is a code whose family was
	 * not found, and the generic advice it carries ("do not just retry") is the opposite of the
	 * truth for a good part of the catalogue.
	 */
	it('has something to say about every code the server can answer with', () => {
		const unknown = PLANVORTEX_ERROR_CODES.filter((code) =>
			describeApiError({ code, message: 'x' }).description.includes(UNKNOWN_ADVICE),
		);

		expect(unknown).toEqual([]);
	});
});

describe('errorFamily', () => {
	/**
	 * The trap this lookup was written for. The ranges published in the documentation lag behind
	 * the server: on the day of writing, 547 and 548 sat above the `auth` ceiling and 716 above
	 * the `social_accounts` one. Reading a ceiling literally answers "unknown family", and the
	 * advice that comes with it says "do not just retry" — while 716 means precisely "this was
	 * temporary and it is already being retried".
	 */
	it('reads past a documented ceiling, up to where the next family starts', () => {
		expect(errorFamily(547)).toBe('auth');
		expect(errorFamily(548)).toBe('auth');
		expect(errorFamily(716)).toBe('social_accounts');
	});

	it('knows nothing below the first family or above the last', () => {
		expect(errorFamily(1)).toBeUndefined();
		expect(errorFamily(499)).toBeUndefined();

		const last = PLANVORTEX_ERROR_RANGES[PLANVORTEX_ERROR_RANGES.length - 1];
		expect(errorFamily(last.to + 1)).toBeUndefined();
	});

	/**
	 * The accepted cost of reading past the ceiling: a code landing in the gap between two
	 * families is given the earlier one. It is the right trade for the codes that exist — every
	 * one of them is an extension of the family below — and there is nothing in the gaps today.
	 */
	it('gives a code in the gap between two families to the one below it', () => {
		expect(errorFamily(1700)).toBe('contacts');
	});

	it('places every code of the catalogue in a family', () => {
		const homeless = PLANVORTEX_ERROR_CODES.filter((code) => errorFamily(code) === undefined);
		expect(homeless).toEqual([]);
	});
});

describe('the generated catalogue', () => {
	it('lists the ranges in ascending order, which is what the family lookup walks', () => {
		const starts = PLANVORTEX_ERROR_RANGES.map((range) => range.from);
		expect(starts).toEqual([...starts].sort((a, b) => a - b));

		for (const range of PLANVORTEX_ERROR_RANGES) {
			expect(range.to).toBeGreaterThanOrEqual(range.from);
		}
	});

	it('only marks codes the server actually answers with', () => {
		const codes = new Set<number>(PLANVORTEX_ERROR_CODES);
		for (const code of RATE_LIMITED_ERROR_CODES) expect(codes.has(code)).toBe(true);
		for (const code of NON_ENGLISH_ERROR_CODES) expect(codes.has(code)).toBe(true);
	});
});
