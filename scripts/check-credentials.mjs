/**
 * Proves, against a real deployment, that the credential this package ships can actually get a
 * token and use it — the gate of phase 2 of the roadmap.
 *
 * It exists because n8n's generic OAuth2 credential has a history with the client-credentials
 * grant (n8n#16857: in some versions it either fails to obtain the token or sends a malformed
 * request to the token endpoint), and because the half of that exchange we own — PlanVortex's
 * `POST /oauth/token` — is worth checking on its own before blaming n8n. Everything here is done
 * exactly as n8n does it, so a failure points at one side or the other rather than at both.
 *
 * Nothing is written and nothing is published: the only call after the token is a read.
 *
 *   PLANVORTEX_CLIENT_ID=... PLANVORTEX_CLIENT_SECRET=... node scripts/check-credentials.mjs
 *
 * `PLANVORTEX_BASE_URL` overrides the default of https://api.planvortex.com/v1.0.0.
 */

const BASE_URL = (process.env.PLANVORTEX_BASE_URL ?? 'https://api.planvortex.com/v1.0.0').replace(
	/\/+$/,
	'',
);
const CLIENT_ID = process.env.PLANVORTEX_CLIENT_ID;
const CLIENT_SECRET = process.env.PLANVORTEX_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
	console.error('Set PLANVORTEX_CLIENT_ID and PLANVORTEX_CLIENT_SECRET.');
	process.exit(1);
}

const tokenUrl = `${BASE_URL}/oauth/token`;
let failures = 0;

function report(ok, label, detail) {
	if (!ok) failures += 1;
	console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

/**
 * The two ways a client may present its credentials, both standard (RFC 6749 §2.3.1) and both
 * accepted by PlanVortex. The shipped credential pins `client_secret_post`, which is what n8n
 * sends with `authentication: 'body'`; `client_secret_basic` is what it sends with `'header'`.
 * Both are checked so the day that hidden field has to change, it is known to be a safe change.
 */
async function requestToken(style) {
	const body = new URLSearchParams({ grant_type: 'client_credentials' });
	const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

	if (style === 'client_secret_post') {
		body.set('client_id', CLIENT_ID);
		body.set('client_secret', CLIENT_SECRET);
	} else {
		headers.Authorization = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`;
	}

	const response = await fetch(tokenUrl, { method: 'POST', headers, body });
	const payload = await response.json().catch(() => ({}));
	return { status: response.status, payload };
}

async function get(path, accessToken) {
	const response = await fetch(`${BASE_URL}${path}`, {
		headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
	});
	const payload = await response.json().catch(() => ({}));
	return { status: response.status, payload };
}

console.log(`Checking ${BASE_URL} with client ${CLIENT_ID}\n`);

const post = await requestToken('client_secret_post');
report(
	post.status === 200 && typeof post.payload.access_token === 'string',
	'client_secret_post (what the shipped credential sends)',
	post.status === 200 ? undefined : `${post.status} ${post.payload.error ?? ''}`,
);

const basic = await requestToken('client_secret_basic');
report(
	basic.status === 200 && typeof basic.payload.access_token === 'string',
	'client_secret_basic (the other form n8n can send)',
	basic.status === 200 ? undefined : `${basic.status} ${basic.payload.error ?? ''}`,
);

if (post.status === 200) {
	// n8n stores the token and reuses it until the API answers 401, so how long it lasts is how
	// often a busy workflow goes back to the token endpoint — and the rate limit there is per
	// client and IP.
	report(
		typeof post.payload.expires_in === 'number' && post.payload.expires_in > 0,
		'token carries expires_in',
		`${post.payload.expires_in}s`,
	);
	report(
		(post.payload.token_type ?? '').toLowerCase() === 'bearer',
		'token_type is Bearer',
		post.payload.token_type,
	);

	const accessToken = post.payload.access_token;

	const first = await get('/clients_organizations', accessToken);
	const clients = Array.isArray(first.payload.clients) ? first.payload.clients : undefined;
	report(
		first.status === 200 && clients !== undefined,
		'GET /clients_organizations (the credential test, and the dropdowns)',
		first.status === 200 ? `${clients?.length ?? 0} client(s)` : `${first.status}`,
	);

	if (clients?.length) {
		const organizations = clients.flatMap((client) => client.organizations ?? []);
		report(
			organizations.length > 0,
			'the app can see at least one organization',
			`${organizations.length} organization(s)`,
		);
	}

	// The second call reuses the same token deliberately. n8n caches it between executions, so a
	// token the API refused to accept twice would break every workflow after the first run.
	const second = await get('/clients_organizations', accessToken);
	report(second.status === 200, 'the same token works on a second call (n8n caches it)');
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
// `process.exitCode` and not `process.exit()`: on Windows, exiting while fetch still holds a
// keep-alive socket trips a libuv assertion and the process dies with 127 — which a CI reads as
// "command not found" rather than as a failed check.
process.exitCode = failures === 0 ? 0 : 1;
