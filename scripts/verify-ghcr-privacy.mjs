import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const OCI_MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
].join(', ');

const VALID_DENIAL_CODES = new Set(['UNAUTHORIZED', 'DENIED']);

function parseOciDenialBody(rawBody) {
  if (!rawBody || typeof rawBody !== 'string') {
    return { valid: false, codes: [] };
  }
  try {
    const parsed = JSON.parse(rawBody);
    if (!Array.isArray(parsed?.errors) || parsed.errors.length === 0) {
      return { valid: false, codes: [] };
    }
    const codes = parsed.errors
      .map((e) => (typeof e?.code === 'string' ? e.code : ''))
      .filter(Boolean);
    const valid = codes.length > 0 && codes.every((c) => VALID_DENIAL_CODES.has(c));
    return { valid, codes };
  } catch {
    return { valid: false, codes: [] };
  }
}

export function assertConclusiveAnonymousDenial(status, rawBody, contextLabel) {
  if (status === 200) {
    throw new Error(
      `${contextLabel}: expected private denial (401/403), but received HTTP 200 (package/manifest is publicly accessible)`,
    );
  }
  if (status !== 401 && status !== 403) {
    throw new Error(
      `${contextLabel}: inconclusive HTTP ${status} (expected 401 or 403 OCI denial; 404/429/5xx/outage responses are rejected)`,
    );
  }
  const denial = parseOciDenialBody(rawBody);
  if (!denial.valid) {
    throw new Error(
      `${contextLabel}: HTTP ${status} did not contain a valid OCI UNAUTHORIZED/DENIED JSON error payload`,
    );
  }
  return { status, codes: denial.codes };
}

export async function acquireGhcrBearerToken({
  owner,
  pkg,
  scopes = 'pull',
  actor,
  token,
  registryOrigin = 'https://ghcr.io',
  fetchImpl = fetch,
}) {
  if (!actor || !token) {
    throw new Error('GHCR credentials (actor and token) are required for authenticated probe');
  }
  const url = `${registryOrigin}/token?service=ghcr.io&scope=repository:${owner}/${pkg}:${scopes}`;
  const basic = Buffer.from(`${actor}:${token}`, 'utf8').toString('base64');
  const res = await fetchImpl(url, {
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: 'application/json',
    },
  });
  const bodyText = await res.text();
  if (res.status !== 200) {
    throw new Error(
      `GHCR authenticated token exchange failed for ${owner}/${pkg} (${scopes}): HTTP ${res.status}`,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new Error(`GHCR authenticated token exchange returned invalid JSON for ${owner}/${pkg}`);
  }
  const bearer = parsed?.token ?? parsed?.access_token;
  if (typeof bearer !== 'string' || bearer.length === 0) {
    throw new Error(`GHCR authenticated token exchange returned empty token for ${owner}/${pkg}`);
  }
  return bearer;
}

export async function verifyPrePushPackagePrivacy({
  owner,
  packages,
  actor,
  token,
  registryOrigin = 'https://ghcr.io',
  fetchImpl = fetch,
}) {
  const results = [];

  for (const pkg of packages) {
    const repoLabel = `${owner}/${pkg}`;

    // 1. Authenticated tags/list must return 200 so we prove (a) GHCR is online and
    // (b) the package already exists before docker push (preventing public auto-creation).
    const bearer = await acquireGhcrBearerToken({
      owner,
      pkg,
      scopes: 'pull',
      actor,
      token,
      registryOrigin,
      fetchImpl,
    });

    const authTagsRes = await fetchImpl(`${registryOrigin}/v2/${owner}/${pkg}/tags/list`, {
      headers: {
        Authorization: `Bearer ${bearer}`,
        Accept: 'application/json',
      },
    });
    const authTagsBody = await authTagsRes.text();
    if (authTagsRes.status !== 200) {
      throw new Error(
        `Pre-push check failed for ${repoLabel}: authenticated tags/list returned HTTP ${authTagsRes.status} (package must already exist as private in GHCR before workflow push)`,
      );
    }
    let parsedTags;
    try {
      parsedTags = JSON.parse(authTagsBody);
    } catch {
      throw new Error(`Pre-push check failed for ${repoLabel}: invalid JSON from authenticated tags/list`);
    }
    if (parsedTags?.name !== `${owner}/${pkg}`) {
      throw new Error(
        `Pre-push check failed for ${repoLabel}: unexpected repository name "${parsedTags?.name ?? ''}"`,
      );
    }

    // 2. Unauthenticated tags/list must return conclusive 401/403 OCI error JSON.
    const unauthTagsRes = await fetchImpl(`${registryOrigin}/v2/${owner}/${pkg}/tags/list`, {
      headers: { Accept: 'application/json' },
    });
    const unauthTagsBody = await unauthTagsRes.text();
    assertConclusiveAnonymousDenial(
      unauthTagsRes.status,
      unauthTagsBody,
      `Pre-push unauthenticated tags/list (${repoLabel})`,
    );

    // 3. Anonymous token endpoint must conclusively deny pull token issuance (401/403 OCI JSON).
    // On GHCR, public packages return HTTP 200 with {"token":"..."}; outages return 5xx/HTML.
    const anonTokenRes = await fetchImpl(
      `${registryOrigin}/token?service=ghcr.io&scope=repository:${owner}/${pkg}:pull`,
      { headers: { Accept: 'application/json' } },
    );
    const anonTokenBody = await anonTokenRes.text();
    const anonDenial = assertConclusiveAnonymousDenial(
      anonTokenRes.status,
      anonTokenBody,
      `Pre-push anonymous token probe (${repoLabel})`,
    );

    results.push({
      package: `ghcr.io/${repoLabel}`,
      prePushAuthTagsHttp: authTagsRes.status,
      prePushAnonTokenHttp: anonDenial.status,
      prePushDenialCodes: anonDenial.codes,
    });
  }

  return results;
}

export async function verifyPostPushDigestPrivacy({
  owner,
  artifacts,
  actor,
  token,
  registryOrigin = 'https://ghcr.io',
  fetchImpl = fetch,
}) {
  const results = [];

  for (const artifact of artifacts) {
    const { pkg, digest, tags = [] } = artifact;
    const repoLabel = `${owner}/${pkg}`;
    if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
      throw new Error(`Post-push check (${repoLabel}): invalid digest "${digest}"`);
    }

    const bearer = await acquireGhcrBearerToken({
      owner,
      pkg,
      scopes: 'pull',
      actor,
      token,
      registryOrigin,
      fetchImpl,
    });

    // 1. Authenticated GET on exact digest must succeed with HTTP 200 and matching digest/sha256.
    const authManifestRes = await fetchImpl(
      `${registryOrigin}/v2/${owner}/${pkg}/manifests/${digest}`,
      {
        headers: {
          Authorization: `Bearer ${bearer}`,
          Accept: OCI_MANIFEST_ACCEPT,
        },
      },
    );
    const authBytes = Buffer.from(await authManifestRes.arrayBuffer());
    if (authManifestRes.status !== 200) {
      throw new Error(
        `Post-push check (${repoLabel}@${digest}): authenticated manifest fetch failed with HTTP ${authManifestRes.status}`,
      );
    }
    const computedDigest = `sha256:${crypto.createHash('sha256').update(authBytes).digest('hex')}`;
    const headerDigest = authManifestRes.headers.get('docker-content-digest');
    if (computedDigest !== digest || (headerDigest && headerDigest !== digest)) {
      throw new Error(
        `Post-push check (${repoLabel}): manifest digest mismatch (expected ${digest}, computed ${computedDigest}, header ${headerDigest ?? 'none'})`,
      );
    }

    // Verify every expected tag (e.g. sha-<short> and vX.Y.Z) resolves to this exact same digest.
    for (const tagRef of tags) {
      const shortTag = tagRef.includes(':') ? tagRef.slice(tagRef.lastIndexOf(':') + 1) : tagRef;
      const tagRes = await fetchImpl(
        `${registryOrigin}/v2/${owner}/${pkg}/manifests/${shortTag}`,
        {
          headers: {
            Authorization: `Bearer ${bearer}`,
            Accept: OCI_MANIFEST_ACCEPT,
          },
        },
      );
      const tagBytes = Buffer.from(await tagRes.arrayBuffer());
      if (tagRes.status !== 200) {
        throw new Error(
          `Post-push tag check (${repoLabel}:${shortTag}): authenticated fetch returned HTTP ${tagRes.status}`,
        );
      }
      const tagComputed = `sha256:${crypto.createHash('sha256').update(tagBytes).digest('hex')}`;
      if (tagComputed !== digest) {
        throw new Error(
          `Post-push tag check (${repoLabel}:${shortTag}): tag points to ${tagComputed}, expected ${digest}`,
        );
      }
    }

    // 2. Unauthenticated GET on exact manifest digest must conclusively return 401/403 OCI JSON.
    const unauthManifestRes = await fetchImpl(
      `${registryOrigin}/v2/${owner}/${pkg}/manifests/${digest}`,
      { headers: { Accept: OCI_MANIFEST_ACCEPT } },
    );
    const unauthManifestBody = await unauthManifestRes.text();
    const unauthDenial = assertConclusiveAnonymousDenial(
      unauthManifestRes.status,
      unauthManifestBody,
      `Post-push unauthenticated manifest probe (${repoLabel}@${digest})`,
    );

    // 3. Anonymous token probe must conclusively return 401/403 OCI JSON (or, if a registry ever
    // issued a pull token, the subsequent anonymous manifest fetch must return 401/403 OCI JSON;
    // 200, 404, and 5xx are always rejected).
    const anonTokenRes = await fetchImpl(
      `${registryOrigin}/token?service=ghcr.io&scope=repository:${owner}/${pkg}:pull`,
      { headers: { Accept: 'application/json' } },
    );
    const anonTokenBody = await anonTokenRes.text();
    let effectiveAnonStatus;

    if (anonTokenRes.status === 200) {
      let parsedAnonToken;
      try {
        parsedAnonToken = JSON.parse(anonTokenBody);
      } catch {
        throw new Error(
          `Post-push anonymous token probe (${repoLabel}): HTTP 200 with invalid JSON`,
        );
      }
      const anonBearer = parsedAnonToken?.token ?? parsedAnonToken?.access_token;
      if (!anonBearer) {
        throw new Error(
          `Post-push anonymous token probe (${repoLabel}): HTTP 200 without token or OCI denial`,
        );
      }
      const anonManifestRes = await fetchImpl(
        `${registryOrigin}/v2/${owner}/${pkg}/manifests/${digest}`,
        {
          headers: {
            Authorization: `Bearer ${anonBearer}`,
            Accept: OCI_MANIFEST_ACCEPT,
          },
        },
      );
      const anonManifestBody = await anonManifestRes.text();
      const anonManifestDenial = assertConclusiveAnonymousDenial(
        anonManifestRes.status,
        anonManifestBody,
        `Post-push anonymous-bearer manifest probe (${repoLabel}@${digest})`,
      );
      effectiveAnonStatus = anonManifestDenial.status;
    } else {
      const tokenDenial = assertConclusiveAnonymousDenial(
        anonTokenRes.status,
        anonTokenBody,
        `Post-push anonymous token probe (${repoLabel}@${digest})`,
      );
      effectiveAnonStatus = tokenDenial.status;
    }

    results.push({
      package: `ghcr.io/${repoLabel}`,
      digest,
      visibility: 'private',
      authManifestHttp: 200,
      unauthManifestHttp: unauthDenial.status,
      anonymousPullHttpStatus: effectiveAnonStatus,
    });
  }

  return results;
}

export async function resolveExistingTagDigest({
  owner,
  pkg,
  tag,
  actor,
  token,
  registryOrigin = 'https://ghcr.io',
  fetchImpl = fetch,
}) {
  const bearer = await acquireGhcrBearerToken({
    owner,
    pkg,
    scopes: 'pull',
    actor,
    token,
    registryOrigin,
    fetchImpl,
  });
  const res = await fetchImpl(`${registryOrigin}/v2/${owner}/${pkg}/manifests/${tag}`, {
    headers: {
      Authorization: `Bearer ${bearer}`,
      Accept: OCI_MANIFEST_ACCEPT,
    },
  });
  if (res.status === 404) {
    return null;
  }
  const rawBytes = Buffer.from(await res.arrayBuffer());
  if (res.status !== 200) {
    throw new Error(
      `Failed checking existing tag ${owner}/${pkg}:${tag}: unexpected HTTP ${res.status}`,
    );
  }
  return `sha256:${crypto.createHash('sha256').update(rawBytes).digest('hex')}`;
}

export async function aliasExistingDigestToTag({
  owner,
  pkg,
  digest,
  newTag,
  actor,
  token,
  registryOrigin = 'https://ghcr.io',
  fetchImpl = fetch,
}) {
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
    throw new Error(`Invalid digest for tag alias: "${digest}"`);
  }
  const bearer = await acquireGhcrBearerToken({
    owner,
    pkg,
    scopes: 'pull,push',
    actor,
    token,
    registryOrigin,
    fetchImpl,
  });

  const getRes = await fetchImpl(`${registryOrigin}/v2/${owner}/${pkg}/manifests/${digest}`, {
    headers: {
      Authorization: `Bearer ${bearer}`,
      Accept: OCI_MANIFEST_ACCEPT,
    },
  });
  const rawBytes = Buffer.from(await getRes.arrayBuffer());
  if (getRes.status !== 200) {
    throw new Error(
      `Unable to fetch manifest ${owner}/${pkg}@${digest} for tag promotion (HTTP ${getRes.status})`,
    );
  }
  const contentType = getRes.headers.get('content-type');
  if (!contentType) {
    throw new Error(`Missing Content-Type header on manifest ${owner}/${pkg}@${digest}`);
  }
  const verifiedDigest = `sha256:${crypto.createHash('sha256').update(rawBytes).digest('hex')}`;
  if (verifiedDigest !== digest) {
    throw new Error(
      `Fetched manifest bytes sha256 (${verifiedDigest}) did not match expected ${digest}`,
    );
  }

  const putRes = await fetchImpl(`${registryOrigin}/v2/${owner}/${pkg}/manifests/${newTag}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': contentType,
    },
    body: rawBytes,
  });
  await putRes.text();
  if (putRes.status !== 200 && putRes.status !== 201) {
    throw new Error(
      `Failed aliasing ${owner}/${pkg}:${newTag} -> ${digest}: HTTP ${putRes.status}`,
    );
  }
  const putDigest = putRes.headers.get('docker-content-digest');
  if (putDigest && putDigest !== digest) {
    throw new Error(
      `Tag alias ${owner}/${pkg}:${newTag} produced digest ${putDigest}, expected ${digest}`,
    );
  }
  return { package: `ghcr.io/${owner}/${pkg}`, tag: newTag, digest };
}

function getArg(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : '';
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const actor = process.env.GHCR_ACTOR ?? process.env.GITHUB_ACTOR ?? '';
  const token = process.env.GHCR_TOKEN ?? process.env.GITHUB_TOKEN ?? '';

  if (command === 'pre-push') {
    const owner = getArg(rest, '--owner').toLowerCase();
    const packages = (getArg(rest, '--packages') || 'qa-evidence-hub-api,qa-evidence-hub-web')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await verifyPrePushPackagePrivacy({ owner, packages, actor, token });
    process.stdout.write(`${JSON.stringify({ ok: true, results: res })}\n`);
    return;
  }

  if (command === 'resolve-existing-sha') {
    const owner = getArg(rest, '--owner').toLowerCase();
    const shortSha = getArg(rest, '--short-sha');
    const tag = `sha-${shortSha}`;
    const [apiDigest, webDigest] = await Promise.all([
      resolveExistingTagDigest({ owner, pkg: 'qa-evidence-hub-api', tag, actor, token }),
      resolveExistingTagDigest({ owner, pkg: 'qa-evidence-hub-web', tag, actor, token }),
    ]);
    process.stdout.write(
      `${JSON.stringify({
        reusedExisting: Boolean(apiDigest && webDigest),
        apiDigest,
        webDigest,
      })}\n`,
    );
    return;
  }

  if (command === 'alias-tag') {
    const owner = getArg(rest, '--owner').toLowerCase();
    const pkg = getArg(rest, '--package');
    const digest = getArg(rest, '--digest');
    const newTag = getArg(rest, '--tag');
    const res = await aliasExistingDigestToTag({ owner, pkg, digest, newTag, actor, token });
    process.stdout.write(`${JSON.stringify(res)}\n`);
    return;
  }

  if (command === 'post-push') {
    const owner = getArg(rest, '--owner').toLowerCase();
    const apiDigest = getArg(rest, '--api-digest');
    const webDigest = getArg(rest, '--web-digest');
    const apiTags = (getArg(rest, '--api-tags') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const webTags = (getArg(rest, '--web-tags') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await verifyPostPushDigestPrivacy({
      owner,
      actor,
      token,
      artifacts: [
        { pkg: 'qa-evidence-hub-api', digest: apiDigest, tags: apiTags },
        { pkg: 'qa-evidence-hub-web', digest: webDigest, tags: webTags },
      ],
    });
    process.stdout.write(`${JSON.stringify({ ok: true, results: res })}\n`);
    return;
  }

  process.stderr.write(
    'Usage: node scripts/verify-ghcr-privacy.mjs <pre-push|resolve-existing-sha|alias-tag|post-push> [options]\n',
  );
  process.exit(1);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
