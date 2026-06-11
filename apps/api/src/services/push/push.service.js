const webpush          = require('web-push');
const config           = require('../../config');
const PushSubscription = require('../../database/models/PushSubscription.model');
const logger           = require('../../utils/logger');

// Initialise VAPID only when keys are present (not required in dev if SKIP_PUSH=true)
let initialised = false;
function init() {
  if (initialised) return;
  const { publicKey, privateKey, subject } = config.webPush;
  if (!publicKey || !privateKey) return;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  initialised = true;
}

// ── Get public VAPID key (sent to frontend so it can subscribe) ───────────────
function getPublicKey() {
  return config.webPush.publicKey || null;
}

// ── Save or update a browser subscription ─────────────────────────────────────
async function subscribe(tenantId, userId, { endpoint, keys, userAgent }) {
  await PushSubscription.findOneAndUpdate(
    { endpoint },
    { tenantId, userId, endpoint, keys, userAgent: userAgent || null },
    { upsert: true, new: true }
  );
}

// ── Remove a subscription (user unsubscribed in browser) ─────────────────────
async function unsubscribe(tenantId, userId, endpoint) {
  await PushSubscription.deleteOne({ tenantId, userId, endpoint });
}

// ── Send a push notification to all subscriptions of a user ──────────────────
async function sendToUser(tenantId, userId, { title, body, url = '/' }) {
  if (process.env.SKIP_PUSH === 'true') {
    logger.info(`[DEV] Push skipped — user:${userId} title:"${title}"`);
    return;
  }

  init();
  if (!initialised) return;

  const subs = await PushSubscription.find({ tenantId, userId });
  if (!subs.length) return;

  const payload = JSON.stringify({ title, body, url });

  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payload
      ).catch(async (err) => {
        // 410 Gone = subscription expired/revoked — clean up
        if (err.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
        }
        throw err;
      })
    )
  );

  const failed = results.filter(r => r.status === 'rejected').length;
  if (failed) logger.warn(`Push: ${failed}/${subs.length} failed for user ${userId}`);
}

// ── Send to multiple users (bulk announcements etc.) ─────────────────────────
async function sendToUsers(tenantId, userIds, payload) {
  if (!userIds?.length) return;
  await Promise.allSettled(userIds.map(uid => sendToUser(tenantId, uid.toString(), payload)));
}

module.exports = { getPublicKey, subscribe, unsubscribe, sendToUser, sendToUsers };
