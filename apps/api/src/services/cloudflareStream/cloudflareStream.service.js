'use strict';

const https = require('https');
const jwt   = require('jsonwebtoken');
const { encrypt, decrypt } = require('../../utils/crypto');

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
            reject(new Error(parsed.errors?.[0]?.message || 'Cloudflare API error'));
          } else {
            resolve(parsed.result !== undefined ? parsed.result : parsed);
          }
        } catch {
          reject(new Error('Invalid JSON from Cloudflare API'));
        }
      });
    });
    req.on('error', reject);
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
function generateSignedToken(videoUid, signingKeyId, signingKeyEnc) {
  const pem = decrypt(signingKeyEnc);
  if (!pem) throw new Error('Cloudflare Stream signing key not configured');
  return jwt.sign(
    { sub: videoUid, kid: signingKeyId },
    pem,
    { algorithm: 'RS256', expiresIn: '1h' }
  );
}

module.exports = { testConnection, createDirectUpload, getVideoStatus, deleteVideo, generateSignedToken, encrypt, decrypt };
