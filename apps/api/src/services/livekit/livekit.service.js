const crypto = require('crypto');
const { AccessToken } = require('livekit-server-sdk');
const AppError = require('../../utils/AppError');

// LiveKit Cloud is one platform-wide project (unlike Zoom, which required
// each instructor/tenant to connect their own account via OAuth) — these
// are plain server env vars, never per-tenant credentials.
function assertConfigured() {
  if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET)
    throw new AppError('Live classes are not configured on this server', 503);
}

// Rooms auto-create on first participant join and auto-close once empty —
// no explicit "create meeting" API call needed like Zoom required. A fresh
// name is generated on "Create"/"Regenerate"; the old room simply dies out
// once nobody's in it.
function generateRoomName(lessonId) {
  return `lesson-${lessonId}-${crypto.randomBytes(4).toString('hex')}`;
}

// Per-participant join token. TTL is tied to the lesson's own duration
// (+ a buffer) rather than a long fixed default — the room name is static
// across recurring occurrences of the same lesson, so a short, duration-
// scoped TTL is what actually bounds a token from being replayable into a
// future occurrence (enrollment/status is only re-checked at mint time).
async function createAccessToken({ roomName, identity, name, durationMinutes }) {
  assertConfigured();
  const ttlMinutes = Math.max(durationMinutes ?? 60, 30) + 30;
  const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity, name, ttl: ttlMinutes * 60,
  });
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true });
  return at.toJwt();
}

module.exports = { generateRoomName, createAccessToken };
