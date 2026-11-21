import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  aliasExistingDigestToTag,
  assertConclusiveAnonymousDenial,
  verifyPostPushDigestPrivacy,
  verifyPrePushPackagePrivacy,
} from './verify-ghcr-privacy.mjs';

const OCI_DENIED_401 = JSON.stringify({
  errors: [{ code: 'UNAUTHORIZED', message: 'authentication required' }],
});

const SAMPLE_MANIFEST_BYTES = Buffer.from(
  JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.index.v1+json' }),
  'utf8',
);
const SAMPLE_DIGEST = `sha256:${crypto.createHash('sha256').update(SAMPLE_MANIFEST_BYTES).digest('hex')}`;

function makeResponse(status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  const hdrMap = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]),
  );
  return {
    status,
    headers: {
      get(name) {
        return hdrMap.get(name.toLowerCase()) ?? null;
      },
    },
    async text() {
      return buf.toString('utf8');
    },
    async arrayBuffer() {
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    },
  };
}

test('rejects 200 (public), 404 (not found / wrong media type), 503 (outage), and non-OCI 401 HTML bodies', () => {
  assert.throws(
    () => assertConclusiveAnonymousDenial(200, '{"schemaVersion":2}', 'anon probe'),
    /publicly accessible/,
  );
  assert.throws(
    () => assertConclusiveAnonymousDenial(404, '{"errors":[{"code":"MANIFEST_UNKNOWN"}]}', 'anon probe'),
    /inconclusive HTTP 404/,
  );
  assert.throws(
    () => assertConclusiveAnonymousDenial(503, 'Service Unavailable', 'anon probe'),
    /inconclusive HTTP 503/,
  );
  assert.throws(
    () => assertConclusiveAnonymousDenial(401, '<html>401 proxy gateway</html>', 'anon probe'),
    /valid OCI UNAUTHORIZED\/DENIED JSON/,
  );
  assert.deepEqual(assertConclusiveAnonymousDenial(401, OCI_DENIED_401, 'anon probe'), {
    status: 401,
    codes: ['UNAUTHORIZED'],
  });
});

test('pre-push privacy check passes only when package exists authenticated (200) and denies anonymous access (401)', async () => {
  const mockFetch = async (url, init = {}) => {
    const auth = init.headers?.Authorization ?? '';
    if (url.includes('/token?')) {
      if (auth.startsWith('Basic ')) {
        return makeResponse(200, JSON.stringify({ token: 'auth-tok' }));
      }
      return makeResponse(401, OCI_DENIED_401);
    }
    if (url.endsWith('/tags/list')) {
      if (auth === 'Bearer auth-tok') {
        const pkgMatch = /\/v2\/([^/]+\/[^/]+)\/tags\/list$/.exec(url);
        return makeResponse(200, JSON.stringify({ name: pkgMatch[1], tags: ['bootstrap'] }));
      }
      return makeResponse(401, OCI_DENIED_401);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const ok = await verifyPrePushPackagePrivacy({
    owner: 'kontentwave',
    packages: ['qa-evidence-hub-api', 'qa-evidence-hub-web'],
    actor: 'KontentWave',
    token: 'secret',
    fetchImpl: mockFetch,
  });
  assert.equal(ok.length, 2);
  assert.equal(ok[0].prePushAnonTokenHttp, 401);

  // Fails before pushing if package does not exist yet (404 on authenticated tags/list)
  await assert.rejects(
    () =>
      verifyPrePushPackagePrivacy({
        owner: 'kontentwave',
        packages: ['qa-evidence-hub-api'],
        actor: 'KontentWave',
        token: 'secret',
        fetchImpl: async (url, init = {}) => {
          if (url.includes('/token?') && init.headers?.Authorization?.startsWith('Basic ')) {
            return makeResponse(200, '{"token":"t"}');
          }
          return makeResponse(404, '{"errors":[{"code":"NAME_UNKNOWN"}]}');
        },
      }),
    /package must already exist as private/,
  );

  // Fails before pushing if anonymous token returns 200 (public package) or 503 (outage)
  for (const badStatus of [200, 503]) {
    await assert.rejects(
      () =>
        verifyPrePushPackagePrivacy({
          owner: 'kontentwave',
          packages: ['qa-evidence-hub-api'],
          actor: 'KontentWave',
          token: 'secret',
          fetchImpl: async (url, init = {}) => {
            const auth = init.headers?.Authorization ?? '';
            if (url.includes('/token?')) {
              if (auth.startsWith('Basic ')) return makeResponse(200, '{"token":"t"}');
              return makeResponse(
                badStatus,
                badStatus === 200 ? '{"token":"anon"}' : 'Service Unavailable',
              );
            }
            if (auth === 'Bearer t') {
              return makeResponse(200, '{"name":"kontentwave/qa-evidence-hub-api","tags":[]}');
            }
            return makeResponse(401, OCI_DENIED_401);
          },
        }),
      badStatus === 200 ? /publicly accessible/ : /inconclusive HTTP 503/,
    );
  }
});

test('post-push privacy check rejects simulated 404/503 responses even when anon token is issued, and verifies tag digest parity', async () => {
  for (const simulatedFailureStatus of [200, 404, 503]) {
    await assert.rejects(
      () =>
        verifyPostPushDigestPrivacy({
          owner: 'kontentwave',
          actor: 'KontentWave',
          token: 'secret',
          artifacts: [{ pkg: 'qa-evidence-hub-api', digest: SAMPLE_DIGEST, tags: ['v0.2.1'] }],
          fetchImpl: async (url, init = {}) => {
            const auth = init.headers?.Authorization ?? '';
            if (url.includes('/token?')) {
              if (auth.startsWith('Basic ')) return makeResponse(200, '{"token":"auth-tok"}');
              return makeResponse(200, '{"token":"anon-tok"}');
            }
            if (auth === 'Bearer auth-tok') {
              return makeResponse(200, SAMPLE_MANIFEST_BYTES, {
                'docker-content-digest': SAMPLE_DIGEST,
              });
            }
            if (auth === 'Bearer anon-tok') {
              return makeResponse(simulatedFailureStatus, 'simulated response');
            }
            return makeResponse(401, OCI_DENIED_401);
          },
        }),
      simulatedFailureStatus === 200
        ? /publicly accessible/
        : new RegExp(`inconclusive HTTP ${simulatedFailureStatus}`),
    );
  }

  // Conclusive pass when authenticated manifest & tags match SAMPLE_DIGEST and anon gets 401 OCI JSON
  const res = await verifyPostPushDigestPrivacy({
    owner: 'kontentwave',
    actor: 'KontentWave',
    token: 'mock',
    artifacts: [
      {
        pkg: 'qa-evidence-hub-api',
        digest: SAMPLE_DIGEST,
        tags: ['ghcr.io/kontentwave/qa-evidence-hub-api:sha-000000000000', 'v0.2.1'],
      },
    ],
    fetchImpl: async (url, init = {}) => {
      const auth = init.headers?.Authorization ?? '';
      if (url.includes('/token?')) {
        if (auth.startsWith('Basic ')) return makeResponse(200, '{"token":"auth-tok"}');
        return makeResponse(401, OCI_DENIED_401);
      }
      if (auth === 'Bearer auth-tok') {
        return makeResponse(200, SAMPLE_MANIFEST_BYTES, {
          'docker-content-digest': SAMPLE_DIGEST,
        });
      }
      return makeResponse(401, OCI_DENIED_401);
    },
  });
  assert.equal(res[0].visibility, 'private');
  assert.equal(res[0].anonymousPullHttpStatus, 401);
});

test('aliasExistingDigestToTag promotes exact manifest bytes and Content-Type without altering digest', async () => {
  let observedPut = null;
  const aliased = await aliasExistingDigestToTag({
    owner: 'kontentwave',
    pkg: 'qa-evidence-hub-api',
    digest: SAMPLE_DIGEST,
    newTag: 'v0.2.1',
    actor: 'KontentWave',
    token: 'secret',
    fetchImpl: async (url, init = {}) => {
      if (url.includes('/token?')) {
        assert.match(url, /pull,push/);
        return makeResponse(200, '{"token":"rw-tok"}');
      }
      if ((init.method ?? 'GET') === 'GET') {
        return makeResponse(200, SAMPLE_MANIFEST_BYTES, {
          'content-type': 'application/vnd.oci.image.index.v1+json',
          'docker-content-digest': SAMPLE_DIGEST,
        });
      }
      if (init.method === 'PUT') {
        observedPut = { url, headers: init.headers, body: init.body };
        return makeResponse(201, '', { 'docker-content-digest': SAMPLE_DIGEST });
      }
      throw new Error(`Unexpected call: ${url}`);
    },
  });
  assert.equal(aliased.digest, SAMPLE_DIGEST);
  assert.equal(observedPut.headers['Content-Type'], 'application/vnd.oci.image.index.v1+json');
  assert.equal(Buffer.compare(observedPut.body, SAMPLE_MANIFEST_BYTES), 0);
});
