const https   = require('https');
const { URLSearchParams } = require('url');
const jwt     = require('jsonwebtoken');
const ZoomCredential = require('../../database/models/ZoomCredential.model');
const { encrypt, decrypt } = require('../../utils/crypto');
const AppError = require('../../utils/AppError');

const ZOOM_AUTH_URL = 'https://zoom.us/oauth/authorize';
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

// Returns the Zoom OAuth authorization URL. State JWT encodes tenantId + adminUserId.
function getAuthUrl(tenantId, adminUserId) {
  const { ZOOM_CLIENT_ID, ZOOM_REDIRECT_URI } = process.env;
  if (!ZOOM_CLIENT_ID || !ZOOM_REDIRECT_URI)
    throw new AppError('Zoom OAuth is not configured on this server', 503);

  const state = jwt.sign(
    { tenantId: tenantId.toString(), adminUserId: adminUserId.toString() },
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

// Exchanges the authorization code for tokens and saves one credential per tenant.
async function exchangeToken(code, stateToken, requestingUserId) {
  let decoded;
  try {
    decoded = jwt.verify(stateToken, getStateSecret());
  } catch {
    throw new AppError('Invalid or expired Zoom state — please try connecting again', 400);
  }

  const { tenantId, adminUserId } = decoded;

  if (adminUserId !== requestingUserId.toString()) {
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

  await ZoomCredential.findOneAndUpdate(
    { tenantId },
    {
      tenantId,
      connectedBy: requestingUserId,
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

// Returns a valid access token for the tenant, refreshing if needed.
async function getValidToken(tenantId) {
  const cred = await ZoomCredential.findOne({ tenantId });
  if (!cred) throw new AppError('No Zoom account connected for this organisation. Ask your admin to connect one in Settings.', 400, 'ZOOM_NOT_CONNECTED');

  if (Date.now() < cred.expiresAt.getTime() - 300_000) {
    return decrypt(cred.accessToken);
  }

  const tokenData = await zoomTokenRequest(
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: decrypt(cred.refreshToken) }),
    getBasicAuth()
  );

  if (!tokenData.access_token) {
    await ZoomCredential.deleteOne({ tenantId });
    throw new AppError('Zoom session expired. Admin must reconnect in Settings → Zoom.', 401, 'ZOOM_REAUTH');
  }

  cred.accessToken  = encrypt(tokenData.access_token);
  cred.refreshToken = encrypt(tokenData.refresh_token || decrypt(cred.refreshToken));
  cred.expiresAt    = new Date(Date.now() + tokenData.expires_in * 1000);
  await cred.save();

  return tokenData.access_token;
}

async function getStatus(tenantId) {
  const cred = await ZoomCredential.findOne({ tenantId }).lean();
  if (!cred) return { connected: false };
  return { connected: true, email: cred.zoomEmail, zoomUserId: cred.zoomUserId };
}

async function disconnect(tenantId) {
  await ZoomCredential.deleteOne({ tenantId });
}

async function createMeeting(tenantId, { topic, startTime, durationMinutes }) {
  const token = await getValidToken(tenantId);

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
  };
}

// Fetches the cloud recording download URL for a completed Zoom meeting.
// Returns the first mp4 play_url, or null if no recording is available yet.
async function fetchRecordingUrl(tenantId, meetingId) {
  try {
    const token = await getValidToken(tenantId);
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

async function deleteMeeting(tenantId, meetingId) {
  try {
    const token = await getValidToken(tenantId);
    await zoomApiRequest('DELETE', `/meetings/${meetingId}`, { token });
  } catch (e) {
    if (e.statusCode !== 404 && !e.message?.includes('3001')) throw e;
  }
}

module.exports = {
  getAuthUrl,
  exchangeToken,
  getStatus,
  disconnect,
  createMeeting,
  deleteMeeting,
  fetchRecordingUrl,
};
