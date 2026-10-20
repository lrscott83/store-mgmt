// Pure policy for the prerendered landing build gate (Vitest-covered). Kept free of I/O so the
// rules can be read and tested as data, mirroring csp-nginx.mjs / externalize-inline-scripts.mjs.
//
// The only structural claim about "the body rendered" is the <h1> tag, never the copy: rewording
// the hero must not fail a prerender gate with a misleading "the body was not prerendered".
const H1_TAG_RE = /<h1[\s>]/i;

const JSON_LD_SCRIPT_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>/gi;
const ANY_SCRIPT_RE = /<script\b[^>]*>/gi;

function executableInlineScripts(html) {
  return (html.match(ANY_SCRIPT_RE) ?? []).filter(
    (tag) => !/\bsrc[\s=]/i.test(tag) && !/application\/ld\+json/i.test(tag),
  );
}

function titles(html) {
  return (html.match(/<title[\s>]/gi) ?? []).length;
}

export function findLandingPrerenderViolations({ landing, shell }) {
  const violations = [];

  if (!landing || !landing.trim()) {
    violations.push('landing.html is empty');
    return violations;
  }
  if (!shell || !shell.trim()) {
    violations.push('index.html (SPA shell) is empty');
    return violations;
  }

  if (!H1_TAG_RE.test(landing)) {
    violations.push('landing.html has no <h1>: the body was not prerendered');
  }
  if (titles(landing) !== 1) {
    violations.push(`landing.html carries ${titles(landing)} <title> tags, expected exactly 1`);
  }
  const jsonLdCount = (landing.match(JSON_LD_SCRIPT_RE) ?? []).length;
  if (jsonLdCount !== 1) {
    violations.push(
      `landing.html carries ${jsonLdCount} JSON-LD blocks, expected exactly 1`,
    );
  }
  const inline = executableInlineScripts(landing);
  if (inline.length > 0) {
    violations.push(
      `landing.html keeps ${inline.length} executable inline script(s) that the static CSP cannot hash`,
    );
  }

  if (H1_TAG_RE.test(shell)) {
    violations.push('index.html (SPA shell) carries landing markup: the split did not run');
  }
  if (titles(shell) !== 0) {
    violations.push('index.html (SPA shell) carries a <title>: landing metadata leaked into every route');
  }

  return violations;
}
