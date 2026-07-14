const https   = require('https');
const { URLSearchParams } = require('url');
const jwt     = require('jsonwebtoken');
const ZoomCredential = require('../../database/models/ZoomCredential.model');
const { encrypt, decrypt } = require('../../utils/crypto');
const AppError = require('../../utils/AppError');
const logger = require('../../utils/logger');

// Zoom's newer General Apps (created via Platform Studio) require the
// marketplace v2 authorize endpoint, not the legacy zoom.us/oauth/authorize
// — confirmed by comparing against Zoom's own "Generate Authorization URL"
// output under Local Test, which used this exact host+path and worked.
const ZOOM_AUTH_URL = 'https://marketplace.zoom.us/v2/authorize';
const ZOOM_API_BASE = 'https://api.zoom.us/v2';

// ── Low-level HTTPS helpers ────────────────────────────────────────────────────

function zoomTokenRequest(form, basicAuth) {
  return new Promise((resolve, reject) => {
    const bodyStr = form.toString();
    const req = https.request(
      {
        hostname: 'zoom.us',
        port: 443,
        path: '/oauth/token',
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(bodyStr),
        },
      },
      res => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid Zoom token response')); }
        });
      }
    );
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function zoomApiRequest(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = https.request(
      {
        hostname: 'api.zoom.us',
        port: 443,
        path: `/v2${path}`,
        method,
        headers,
      },
      res => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(data); } catch { parsed = data; }
          if (res.statusCode >= 400) {
            reject(new AppError(parsed?.message || `Zoom API error ${res.statusCode}`, res.statusCode));
          } else {
            resolve(parsed);
          }
        });
      }
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function getBasicAuth() {
  const { ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = process.env;
  if (!ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET)
    throw new AppError('Zoom OAuth is not configured on this server', 503);
  return Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');
}

function getStateSecret() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new AppError('ENCRYPTION_KEY not set', 500);
  return key.slice(0, 32);
}

// ── Public API ─────────────────────────────────────────────────────────────────

// Returns the Zoom OAuth authorization URL. State JWT encodes tenantId + the
// connecting user's id — role is deliberately NOT trusted from this state and
// is re-derived fresh from the authenticated session at exchange time.
function getAuthUrl(tenantId, requestingUserId) {
  const { ZOOM_CLIENT_ID, ZOOM_REDIRECT_URI } = process.env;
  if (!ZOOM_CLIENT_ID || !ZOOM_REDIRECT_URI)
    throw new AppError('Zoom OAuth is not configured on this server', 503);

  const state = jwt.sign(
    { tenantId: tenantId.toString(), requestingUserId: requestingUserId.toString() },
    getStateSecret(),
    { expiresIn: '10m' }
  );

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: ZOOM_CLIENT_ID,
    redirect_uri: ZOOM_REDIRECT_URI,
    state,
  });

  return `${ZOOM_AUTH_URL}?${params.toString()}`;
}

// Exchanges the authorization code for tokens and saves a credential scoped
// to the connecting user: instructors get their own personal doc
// (userId: their id), tenant_admin/super_admin get the tenant-wide fallback
// doc (userId: null). `requestingUser` is the live req.user, not the state —
// role/tenant are always re-checked fresh, never trusted from the OAuth state.
async function exchangeToken(code, stateToken, requestingUser) {
  let decoded;
  try {
    decoded = jwt.verify(stateToken, getStateSecret());
  } catch {
    throw new AppError('Invalid or expired Zoom state — please try connecting again', 400);
  }

  const { tenantId, requestingUserId } = decoded;

  if (requestingUserId !== requestingUser.sub) {
    throw new AppError('State mismatch', 403);
  }
  if (tenantId !== requestingUser.tenantId?.toString()) {
    throw new AppError('State mismatch', 403);
  }

  const { ZOOM_REDIRECT_URI } = process.env;
  const tokenData = await zoomTokenRequest(
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: ZOOM_REDIRECT_URI }),
    getBasicAuth()
  );

  if (!tokenData.access_token) {
    throw new AppError(tokenData.reason || 'Failed to exchange Zoom authorization code', 400);
  }

  const { access_token, refresh_token, expires_in } = tokenData;
  const userInfo = await zoomApiRequest('GET', '/users/me', { token: access_token });

  const targetUserId = requestingUser.role === 'instructor' ? requestingUser.sub : null;

  await ZoomCredential.findOneAndUpdate(
    { tenantId, userId: targetUserId },
    {
      tenantId,
      userId: targetUserId,
      connectedBy: requestingUser.sub,
      accessToken:  encrypt(access_token),
      refreshToken: encrypt(refresh_token),
      expiresAt:    new Date(Date.now() + expires_in * 1000),
      zoomUserId:   userInfo.id,
      zoomEmail:    userInfo.email,
    },
    { upsert: true, new: true }
  );

  return { email: userInfo.email };
}

// Resolves which credential doc should be used for a given course: the
// instructor's own account if they've connected one, else the tenant's
// shared fallback. Returns { doc: null, source: null } if neither exists.
async function resolveCredentialDoc(tenantId, instructorId) {
  if (instructorId) {
    const own = await ZoomCredential.findOne({ tenantId, userId: instructorId });
    if (own) return { doc: own, source: 'instructor' };
  }
  const fallback = await ZoomCredential.findOne({ tenantId, userId: null });
  if (fallback) return { doc: fallback, source: 'tenant' };
  return { doc: null, source: null };
}

// Returns a valid access token for an already-fetched credential doc,
// refreshing it (and persisting the refresh) if it's within 5 minutes of
// expiry. On refresh failure the doc is deleted and ZOOM_REAUTH is thrown —
// logged loudly when it's the tenant-wide fallback, since that now silently
// affects every instructor without their own account, not just one admin.
async function getValidTokenForDoc(cred) {
  if (Date.now() < cred.expiresAt.getTime() - 300_000) {
    return decrypt(cred.accessToken);
  }

  const tokenData = await zoomTokenRequest(
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: decrypt(cred.refreshToken) }),
    getBasicAuth()
  );

  if (!tokenData.access_token) {
    if (cred.userId === null) {
      logger.warn(`Zoom fallback (tenant-wide) credential failed to refresh and was deleted — tenant ${cred.tenantId}. Every instructor without their own Zoom account will now fail to create meetings until an admin reconnects.`);
    }
    await ZoomCredential.deleteOne({ _id: cred._id });
    throw new AppError('Zoom session expired. Please reconnect in Settings → Zoom.', 401, 'ZOOM_REAUTH');
  }

  cred.accessToken  = encrypt(tokenData.access_token);
  cred.refreshToken = encrypt(tokenData.refresh_token || decrypt(cred.refreshToken));
  cred.expiresAt    = new Date(Date.now() + tokenData.expires_in * 1000);
  await cred.save();

  return tokenData.access_token;
}

// { instructorId } → resolved "would this lesson's meeting-creation work"
// status (lesson editor). Otherwise { userId } → the requesting user's own
// scope status (Settings page: instructor's personal doc, or the tenant
// default for an admin).
async function getStatus(tenantId, { userId, instructorId } = {}) {
  if (instructorId !== undefined) {
    const { doc, source } = await resolveCredentialDoc(tenantId, instructorId);
    if (!doc) return { connected: false };
    return { connected: true, source, email: doc.zoomEmail };
  }
  const cred = await ZoomCredential.findOne({ tenantId, userId: userId ?? null }).lean();
  if (!cred) return { connected: false };
  return { connected: true, email: cred.zoomEmail, zoomUserId: cred.zoomUserId };
}

async function disconnect(tenantId, userId = null) {
  await ZoomCredential.deleteOne({ tenantId, userId });
}

async function createMeeting({ tenantId, instructorId, topic, startTime, durationMinutes }) {
  const { doc } = await resolveCredentialDoc(tenantId, instructorId);
  if (!doc) {
    throw new AppError('Neither the instructor nor the organisation has a Zoom account connected. Connect one in Settings → Zoom.', 400, 'ZOOM_NOT_CONNECTED');
  }
  const token = await getValidTokenForDoc(doc);

  const startIso = startTime
    ? new Date(startTime).toISOString()
    : new Date(Date.now() + 86_400_000).toISOString();

  const meeting = await zoomApiRequest('POST', '/users/me/meetings', {
    token,
    body: {
      topic: topic || 'Live Class',
      type: 2,
      start_time: startIso,
      duration: durationMinutes || 60,
      timezone: 'UTC',
      settings: {
        join_before_host: true,
        waiting_room: false,
        auto_recording: 'none',
        approval_type: 2,
      },
    },
  });

  return {
    meetingId: String(meeting.id),
    joinUrl:   meeting.join_url,
    startUrl:  meeting.start_url,
    password:  meeting.password || null,
    hostUserId: doc.userId,
  };
}

// Fetches the cloud recording download URL for a completed Zoom meeting.
// `hostUserId` is the literal credential that created this specific meeting
// (from lesson.liveClass.zoomHostUserId) — never re-resolved via fallback,
// since a recording only exists under the account that actually hosted it.
// Returns the first mp4 play_url, or null if no recording / no credential.
async function fetchRecordingUrl(tenantId, meetingId, hostUserId = null) {
  try {
    const cred = await ZoomCredential.findOne({ tenantId, userId: hostUserId });
    if (!cred) return null;
    const token = await getValidTokenForDoc(cred);
    const data = await zoomApiRequest('GET', `/meetings/${meetingId}/recordings`, { token });
    const files = data?.recording_files ?? [];
    const mp4 = files.find(f => f.file_type === 'MP4' && f.status === 'completed');
    return mp4 ? (mp4.play_url || mp4.download_url || null) : null;
  } catch (e) {
    // 3301 = recording not found; silently return null
    if (e.message?.includes('3301') || e.statusCode === 404) return null;
    throw e;
  }
}

async function deleteMeeting(tenantId, meetingId, hostUserId = null) {
  try {
    const cred = await ZoomCredential.findOne({ tenantId, userId: hostUserId });
    if (!cred) return;
    const token = await getValidTokenForDoc(cred);
    await zoomApiRequest('DELETE', `/meetings/${meetingId}`, { token });
  } catch (e) {
    if (e.statusCode !== 404 && !e.message?.includes('3001')) throw e;
  }
}

module.exports = {
  getAuthUrl,
  exchangeToken,
  resolveCredentialDoc,
  getStatus,
  disconnect,
  createMeeting,
  deleteMeeting,
  fetchRecordingUrl,
};
