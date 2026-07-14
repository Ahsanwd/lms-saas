'use strict';

const https = require('https');
const jwt   = require('jsonwebtoken');
const AppError = require('../../utils/AppError');

// ── Low-level CF API helper (JSON endpoints) ──────────────────────────────────
function cfRequest(method, accountId, apiToken, path, body = null) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.cloudflare.com',
      path: `/client/v4/accounts/${accountId}${path}`,
      method,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    };
    if (bodyStr) options.headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (!data.trim()) { resolve(null); return; }
        try {
          const parsed = JSON.parse(data);
          if (parsed.success === false) {
            reject(new AppError(`Cloudflare Stream error: ${parsed.errors?.[0]?.message || 'unknown error'}`, 502));
          } else {
            resolve(parsed.result !== undefined ? parsed.result : parsed);
          }
        } catch {
          reject(new AppError(`Cloudflare Stream returned an unexpected response (HTTP ${res.statusCode})`, 502));
        }
      });
    });
    req.on('error', (err) => reject(new AppError(`Could not reach Cloudflare Stream: ${err.message}`, 502)));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// DELETE returns 204 empty body
function cfDelete(accountId, apiToken, path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.cloudflare.com',
      path: `/client/v4/accounts/${accountId}${path}`,
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiToken}` },
    }, res => {
      res.on('data', () => {});
      res.on('end', () => resolve());
    });
    req.on('error', reject);
    req.end();
  });
}

// GraphQL Analytics API lives at a top-level path, not under /accounts/{id} like
// the REST endpoints above, so it needs its own low-level request helper.
function cfGraphQL(apiToken, query, variables) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify({ query, variables });
    const options = {
      hostname: 'api.cloudflare.com',
      path: '/client/v4/graphql',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.errors?.length) { reject(new Error(parsed.errors[0].message)); return; }
          resolve(parsed.data);
        } catch {
          reject(new Error('Invalid JSON from Cloudflare GraphQL API'));
        }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

// Verify credentials work
async function testConnection(accountId, apiToken) {
  await cfRequest('GET', accountId, apiToken, '/stream?limit=1');
  return true;
}

// Create a Direct Creator Upload URL — browser uploads directly to CF (no server memory used)
async function createDirectUpload(accountId, apiToken, opts = {}) {
  const result = await cfRequest('POST', accountId, apiToken, '/stream/direct_upload', {
    maxDurationSeconds: opts.maxDurationSeconds || 7200,
    expiry: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
    requireSignedURLs: true,
    meta: opts.meta || {},
  });
  return { uploadUrl: result.uploadURL, videoUid: result.uid };
}

// Poll video readiness after upload
async function getVideoStatus(accountId, apiToken, videoUid) {
  const result = await cfRequest('GET', accountId, apiToken, `/stream/${videoUid}`);
  return {
    uid:           result.uid,
    status:        result.status?.state || 'unknown',
    readyToStream: result.readyToStream ?? false,
    duration:      result.duration || 0,
    thumbnail:     result.thumbnail || null,
  };
}

// Remove a video from CF Stream
async function deleteVideo(accountId, apiToken, videoUid) {
  await cfDelete(accountId, apiToken, `/stream/${videoUid}`);
}

// Generate a signed playback token (RS256 JWT) so only enrolled students can watch
// CF Stream requires: kid in JWT *header*, sub=videoUid in payload
// `signingKeyPem` is the raw PEM (from platform-level config, not DB-encrypted)
function generateSignedToken(videoUid, signingKeyId, signingKeyPem) {
  if (!signingKeyPem) throw new Error('Cloudflare Stream signing key not configured');
  return jwt.sign(
    { sub: videoUid },
    signingKeyPem,
    { algorithm: 'RS256', expiresIn: '1h', keyid: signingKeyId }
  );
}

// Sum minutes-viewed (delivery) across a tenant's video UIDs since `sinceDate`,
// via CF's GraphQL Analytics API (only populated when CF's own iframe/Stream
// Player is used for playback — true here, see learn/page.tsx CfStreamPlayer).
// NOTE: the `uid_in` array filter is best-effort against CF's public docs
// (only single-`uid` examples are published) — same "unverified until tested
// against a real account" caveat this codebase already carries for Safepay.
async function getViewerMinutesSince(accountId, apiToken, videoUids, sinceDate) {
  if (!videoUids?.length) return 0;
  const query = `
    query($accountTag: String!, $uids: [String!], $since: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          videoPlaybackEventsAdaptiveGroups(
            filter: { date_geq: $since, uid_in: $uids }
            limit: 1000
          ) {
            sum { timeViewedMinutes }
          }
        }
      }
    }
  `;
  const since = sinceDate.toISOString().slice(0, 10); // Date scalar = YYYY-MM-DD
  const data = await cfGraphQL(apiToken, query, { accountTag: accountId, uids: videoUids, since });
  const groups = data?.viewer?.accounts?.[0]?.videoPlaybackEventsAdaptiveGroups ?? [];
  return groups.reduce((sum, g) => sum + (g.sum?.timeViewedMinutes || 0), 0);
}

module.exports = {
  testConnection, createDirectUpload, getVideoStatus, deleteVideo, generateSignedToken,
  getViewerMinutesSince,
};
