import type { IDataObject } from 'n8n-workflow';
import {
	errorFamily,
	NON_ENGLISH_ERROR_CODES,
	RATE_LIMITED_ERROR_CODES,
	type PlanVortexErrorCode,
	type PlanVortexErrorFamily,
} from './errors.generated';

/**
 * What a PlanVortex error code means for somebody building a workflow.
 *
 * THE MISTAKE THIS FILE EXISTS TO NOT MAKE. The catalogue groups codes by range, and a range is
 * not a diagnosis. Codes 516 (the plan is the free one), 519 (an app may never make this call)
 * and 520 (the app is missing a permission) all live in the range the documentation calls "auth",
 * and all three are fixed in different places by different people — while 1101, an organization
 * that does not exist, lives somewhere else entirely. Advice given by range told a user with
 * perfect credentials to go and check their credentials; that is a real bug, it shipped in the
 * MCP server, and it took a live test to find because nothing about it looks wrong.
 *
 * So the lookup is per code first and per family second, and the family text is written to be
 * true of everything in it rather than of its most common member.
 *
 * Everything here is in English, including every sentence a user can end up reading. n8n's
 * verification is literal about it and error messages are where another language creeps back in,
 * because they are written quickly and nobody reads them until they fire.
 */

/** The body every PlanVortex error answers with: `{code, message, data}`. */
export interface PlanVortexErrorBody {
	code: number;
	message?: string;
	data?: IDataObject;
}

/** The headline and the subtitle n8n shows, in the two fields it shows them in. */
export interface DescribedError {
	message: string;
	description: string;
}

type Advice = string | ((data: IDataObject) => string);

/**
 * English for the catalogue messages that are not written in English.
 *
 * The API's own message is what this node shows, so a Spanish one would go straight into the n8n
 * panel — which the verification guidelines forbid in as many words. The keys come from the
 * generated file, so this table cannot fall behind: a new one upstream stops the build here, and
 * so does one that gets fixed at the source.
 */
const ENGLISH_MESSAGES: Record<(typeof NON_ENGLISH_ERROR_CODES)[number], string> = {
	919: 'Something went wrong while scheduling the publication. Contact an administrator.',
};

/**
 * What to do about one specific code.
 *
 * A code is only listed when the family text would be wrong or useless for it — not to restate
 * the message the API already sent. The type comes from the generated catalogue, so a code that
 * the server retires (924 and 1401 went that way when publications became unlimited) stops
 * compiling instead of quietly advising about something that can no longer happen.
 */
const CODE_ADVICE: Partial<Record<PlanVortexErrorCode, Advice>> = {
	// ── Credentials, and the three things in this range that are not about credentials ────────
	501: 'n8n asks for a new token by itself when one expires, so this means the credential cannot get one at all. Check the Client ID, the Client Secret and the Base URL of the PlanVortex credential.',
	503: 'One of the IDs in this call is not a PlanVortex ID. An expression that resolves to an empty string arrives here too, and the message names the organization whichever field was actually empty.',
	507: 'No organization was found with that ID. Pick it from the Organization dropdown instead of passing one in.',
	511: 'This is a plan limitation, not a credentials problem: the call is fine and the plan does not include enough users for it. Retrying will fail the same way.',
	515: 'This is a plan limitation, not a credentials problem: the plan does not include conversations. Retrying will fail the same way.',
	516: 'This is a PlanVortex plan limitation, not a credentials problem: the app is authenticated, the call is well formed, and the account is on the free plan. The comment inbox and comment replies need a paid plan. Retrying will fail the same way.',
	517: 'The PlanVortex account is disabled over its subscription, and this is not about the credentials. A person has to sort the billing out in the PlanVortex panel before any of this works.',
	512: "This call cannot be made with an app's credentials at all, and an app is all an n8n credential has: it needs a signed-in person in the PlanVortex panel.",
	519: "This call cannot be made with an app's credentials at all. Connecting a social account in particular is an OAuth flow with a person clicking Authorize on the network's own screen — use the Account > Create Connect Link operation and give the link to that person.",
	520: (data) => {
		const missing = requiredPermissions(data);
		const detail = missing.length > 0 ? ` Missing: ${missing.join(', ')}.` : '';
		return `The app is authenticated but does not have the permissions this call needs.${detail} Retrying will not help: somebody has to grant them to the app in the PlanVortex panel, under Apps.`;
	},
	522: 'n8n renews an expired token by itself, so this means the credential cannot get one at all. Check the Client ID and the Client Secret of the PlanVortex credential.',
	537: 'The app behind this credential belongs to a different PlanVortex client than that organization. Pick an organization from the dropdown, which only lists the ones this credential reaches.',
	539: 'The Client ID or the Client Secret is wrong. They are the credentials of an app, created in the PlanVortex panel under Apps — not the email and password of a user.',
	542: 'This is a plan limitation, not a credentials problem: the call needs the Custom plan specifically. Retrying will fail the same way.',
	543: 'A connect link is single use, and that one has already been used. Run Account > Create Connect Link again to get a fresh one.',
	544: 'That connect link was issued for a different social network. A link is tied to the network it was asked for, so ask for a new one for this network.',
	546: "The PlanVortex account's email address has to be verified before it can create apps. That is done once, in the panel.",

	// ── Connected accounts ───────────────────────────────────────────────────────────────────
	702: 'The account has no usable social network on it. This node reads the network off the account rather than asking for it, so this normally means the account itself is in a bad state — check it with Account > Get Many.',
	706: 'The plan has no free account slots left. This is a plan limit and not a transient failure: either a connected account is removed, or the plan grows.',
	707: 'The connected account is in an error state and has to be reconnected, which needs a person: use Account > Create Connect Link and give them the link. Retrying the workflow will not repair it.',
	711: 'That social account is already connected in another organization. It can only live in one, so either manage it there or disconnect it before connecting it here.',
	714: 'There is no account with that ID in this organization. Pick one from the Account dropdown, which lists only the accounts this organization has.',
	716: 'This one is temporary and nothing is broken: the account session could not be refreshed at that exact moment and PlanVortex is already retrying it. Run the workflow again in a few minutes.',

	// ── Files ────────────────────────────────────────────────────────────────────────────────
	804: "The organization's storage is full. Old uploads have to be deleted in the PlanVortex panel, or the plan's space has to grow.",
	806: 'That upload ID does not belong to this organization. The IDs for File IDs come from the Media > Upload operation, which answers with the upload it created.',

	// ── Publications ─────────────────────────────────────────────────────────────────────────
	915: 'A publication needs either some text or at least one file. Both Text and File IDs came through empty, which is usually an expression that resolved to nothing.',
	919: 'This one failed on PlanVortex’s side while scheduling the post, and nothing about the workflow is wrong. Running it again is reasonable; if it keeps happening it needs support rather than another attempt.',
	917: 'No publication exists with that ID in this organization. It was never created, it belongs elsewhere, or it has been deleted.',
	921: 'This post has already gone out, and a published post cannot be edited or rescheduled through PlanVortex. A different text has to be a new publication.',
	923: 'That publication type is not one this network accepts. The message above lists the ones it does.',
	926: 'This is a per-account cap and not a problem with the post: a shorter text or different media will fail exactly the same way. The cap is monthly and per account, so either wait or publish from another account.',
	942: 'That social network does not publish at all. WhatsApp and Google Business can be connected but have no feed — the Account dropdown of this operation filters them out, though an ID passed in by expression is not filtered.',
	978: 'Too many publications too fast on this account, and this one is temporary. Space them out, or give them a Publish Date so PlanVortex sends them on a schedule.',
	979: "That social network has a daily publishing cap and this account has reached it today. It is the network's own ceiling, not a PlanVortex plan limit, so a bigger plan does not lift it: schedule the rest for tomorrow.",
	980: 'The PlanVortex app is not in that Slack channel, and nothing about the post is wrong. Somebody with access has to type `/invite @PlanVortex` inside the channel — on a private channel that is the only way, because Slack has no API for an app to join one.',
	984: 'Slack is rate limiting this workspace and the retry window ran out. It is temporary and it has nothing to do with the post, but Slack counts per workspace, so other channels of the same workspace will hit it too. Space the messages out or schedule them.',
	985: 'That Slack channel is archived or no longer exists, so nothing can be published to it. Somebody has to unarchive it, or the account has to be reconnected to a different channel.',

	// ── Organizations ────────────────────────────────────────────────────────────────────────
	1101: 'That organization does not exist. Pick one from the Organization dropdown, which lists exactly the organizations this credential reaches.',
	1110: 'That organization has been deleted. Pick another one from the Organization dropdown.',

	// ── Plan limits ──────────────────────────────────────────────────────────────────────────
	1400: 'The organization has no account slots left in its plan. Retrying will fail the same way: a connected account has to go, or the plan has to grow.',
	1403: 'The organization has run out of storage in its plan. Retrying will fail the same way.',
	1408: 'The organization has run out of AI credits for this month. Retrying will fail the same way.',
};

/**
 * What to do about a family, when the code has nothing more specific to say.
 *
 * Total on purpose: the type comes from the generated catalogue, so a family added upstream
 * breaks the build here rather than falling into a default that says nothing.
 */
const FAMILY_ADVICE: Record<PlanVortexErrorFamily, string> = {
	// Read the message first, and only then this: the range the documentation calls "auth" also
	// holds the app's own settings and the things an app is simply never allowed to do, so "check
	// your credentials" is wrong for a good part of it. That is the mistake this whole file is
	// built around, and the family text is the last place it could hide.
	auth: 'The message above is the specific one. This part of the catalogue covers credentials, the app itself and what an app is allowed to do, so not all of it is about the credential — if it does read like one, check the Client ID and Client Secret of the PlanVortex credential and the permissions the app was given in the panel.',
	user: 'This is about a PlanVortex user account, which a workflow cannot change. It has to be sorted out in the panel.',
	social_accounts:
		'Something about the connected social account is wrong. Account > Get Many shows the state of each one; reconnecting an account needs a person, through Account > Create Connect Link.',
	files:
		'The file was rejected. Check its format and its size against the per-network limits before uploading it again.',
	publications:
		'The post itself is what was rejected, and the message above says what to change — the text, the media, or the network it was aimed at. Sending it again unchanged will fail the same way.',
	general:
		'A value in the call is out of bounds, usually a date or a date range. The message above says which one.',
	organizations:
		'Check the organization. Picking it from the dropdown rather than passing an ID avoids most of these, since the dropdown lists only the organizations this credential reaches.',
	roles:
		'This is about roles and permissions inside PlanVortex, which are granted in the panel and not from a workflow.',
	client_plan:
		'This is a limit of the PlanVortex plan, not a transient failure: retrying will fail the same way. The plan has to grow for this to work.',
	organization_plan:
		'The organization has used up something its plan allows — accounts, storage or credits. Retrying will fail the same way.',
	messaging:
		'The message was not sent. On Facebook, Instagram and WhatsApp a free-form message is only allowed within 24 hours of the contact writing; outside that window WhatsApp needs an approved template.',
	contacts:
		'This is about a contact in the PlanVortex inbox, and the message above says what is wrong with it.',
	payments:
		'The subscription or the payment failed. A person has to sort it out in the PlanVortex panel before this works.',
	products:
		"This is about a product catalogue, which this node does not manage. The message above is the API's own.",
	ai_plans:
		"This is about an AI content plan, which this node does not create. The message above is the API's own.",
	integrations:
		'The integration is not usable. Connecting or repairing one is done by a person in the PlanVortex panel.',
};

/** Said about the four codes the API answers with a 429, whatever family they sit in. */
const RATE_LIMIT_ADVICE =
	'This one is temporary: nothing is wrong with the request and waiting fixes it. Retry after the seconds the Retry-After header asks for, and space the calls out if it keeps happening.';

/** Neither a known code nor a known family: the catalogue grows, and an unknown code is normal. */
const UNKNOWN_ADVICE =
	'Read the message above before retrying: most PlanVortex errors are not fixed by repeating the same call.';

/**
 * The headline and the subtitle for one API failure.
 *
 * The message stays the API's own — it is the live one, and it says things a table here could
 * not, like which limit was exceeded and by how much. What this adds is the sentence underneath
 * saying what to do about it, and the code, which is what somebody searches for in the
 * documentation or quotes to support.
 */
export function describeApiError(body: PlanVortexErrorBody): DescribedError {
	const code = body.code;
	const known = ENGLISH_MESSAGES[code as (typeof NON_ENGLISH_ERROR_CODES)[number]];
	const message =
		known ??
		(body.message === undefined || body.message === '' ? fallbackMessage(code) : body.message);

	return { message, description: `${adviceFor(code, body.data ?? {})} (PlanVortex error ${code})` };
}

function fallbackMessage(code: number): string {
	return `PlanVortex answered error ${code}`;
}

function adviceFor(code: number, data: IDataObject): string {
	const specific = CODE_ADVICE[code as PlanVortexErrorCode];
	if (specific !== undefined) return typeof specific === 'function' ? specific(data) : specific;

	// Before the family, and deliberately: a rate limit is transient and every one of its
	// neighbours is not, so the family text would be the exact opposite of the truth.
	if (RATE_LIMITED_ERROR_CODES.includes(code)) return RATE_LIMIT_ADVICE;

	const family = errorFamily(code);
	return family === undefined ? UNKNOWN_ADVICE : FAMILY_ADVICE[family];
}

/** The permissions a 520 names in its `data`: `{permissions, client_permissions}`. */
function requiredPermissions(data: IDataObject): string[] {
	const out: string[] = [];
	for (const key of ['permissions', 'client_permissions']) {
		const value = data[key];
		if (Array.isArray(value)) out.push(...value.map((item) => String(item)));
		else if (typeof value === 'string' && value !== '') out.push(value);
	}
	return out;
}
