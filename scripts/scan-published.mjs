/**
 * Runs n8n's scanner against a version that is already on npm — the check n8n runs on a
 * submission to the Creator Portal. In order: the provenance attestation, the source at the
 * commit that attestation names (downloaded from GitHub, so the repository must be public), and
 * the tarball itself.
 *
 * It exists because the published CLI, `npx @n8n/scan-community-package`, prints a ❌ and still
 * **exits 0** when a package fails. A CI step built on it is green whatever it finds, which is
 * the false green this repository keeps running into. This calls the same function and turns the
 * verdict into an exit code.
 *
 *   npm run scan:published                # the version in package.json
 *   npm run scan:published -- 0.1.0       # any other one
 */
import { analyzePackageByName } from '@n8n/scan-community-package/scanner/scanner.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const { name, version: localVersion } = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const version = process.argv[2] ?? localVersion;

const result = await analyzePackageByName(name, version);

if (result.passed) {
	console.log(`OK: ${name}@${result.version} passed n8n's scan of the published package`);
	process.exit(0);
}

console.error(`FAILED: ${name}@${result.version ?? version} — ${result.message}`);
if (result.details) console.error(result.details);
process.exit(1);
