#!/usr/bin/env node
// Build gate for the prerendered landing (package.json build chain). Fails the build when the
// landing silently loses the thing this feature exists for: its content in the served HTML.
//
// Runs AFTER generate-landing-page (head injected) and BEFORE build-sw (so a broken landing never
// reaches the precache). Never rewrites anything - a gate that fixes what it guards is not a gate.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { findLandingPrerenderViolations } from './landing-prerender-policy.mjs';

const ROOT = process.cwd();

async function main() {
  const landingPath = resolve(ROOT, 'build/client/landing.html');
  const shellPath = resolve(ROOT, 'build/client/index.html');

  let landing;
  let shell;
  try {
    landing = await readFile(landingPath, 'utf8');
    shell = await readFile(shellPath, 'utf8');
  } catch (error) {
    console.error('verify-landing-prerender: FAILED - cannot read the built documents.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  const violations = findLandingPrerenderViolations({ landing, shell });
  if (violations.length > 0) {
    console.error('verify-landing-prerender: FAILED');
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `verify-landing-prerender: OK — landing ${landing.length} B with its body, shell ${shell.length} B clean.`,
  );
}

await main();
