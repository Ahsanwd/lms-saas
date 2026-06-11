const svc = require('./forum.service');

const ok  = (res, data, status = 200) => res.status(status).json({ success: true, data });
const tid = (req) => req.tenant.tenantId;

// ── Threads ───────────────────────────────────────────────────────────────────

exports.listThreads = async (req, res, next) => {
  try { ok(res, await svc.listThreads(tid(req), req.params.courseId, req.user, req.query)); }
  catch (e) { next(e); }
};

exports.createThread = async (req, res, next) => {
  try { ok(res, await svc.createThread(tid(req), req.params.courseId, req.user, req.body), 201); }
  catch (e) { next(e); }
};

exports.getThread = async (req, res, next) => {
  try { ok(res, await svc.getThread(tid(req), req.params.threadId, req.user)); }
  catch (e) { next(e); }
};

exports.editThread = async (req, res, next) => {
  try { ok(res, await svc.editThread(tid(req), req.params.threadId, req.user, req.body)); }
  catch (e) { next(e); }
};

exports.deleteThread = async (req, res, next) => {
  try { ok(res, await svc.deleteThread(tid(req), req.params.threadId, req.user)); }
  catch (e) { next(e); }
};

exports.pinThread = async (req, res, next) => {
  try { ok(res, await svc.pinThread(tid(req), req.params.threadId, req.user)); }
  catch (e) { next(e); }
};

exports.resolveThread = async (req, res, next) => {
  try { ok(res, await svc.resolveThread(tid(req), req.params.threadId, req.user)); }
  catch (e) { next(e); }
};

exports.closeThread = async (req, res, next) => {
  try { ok(res, await svc.closeThread(tid(req), req.params.threadId, req.user)); }
  catch (e) { next(e); }
};

exports.likeThread = async (req, res, next) => {
  try { ok(res, await svc.likeThread(tid(req), req.params.threadId, req.user)); }
  catch (e) { next(e); }
};

// ── Replies ───────────────────────────────────────────────────────────────────

exports.createReply = async (req, res, next) => {
  try { ok(res, await svc.createReply(tid(req), req.params.threadId, req.user, req.body, req.io), 201); }
  catch (e) { next(e); }
};

exports.editReply = async (req, res, next) => {
  try { ok(res, await svc.editReply(tid(req), req.params.replyId, req.user, req.body)); }
  catch (e) { next(e); }
};

exports.deleteReply = async (req, res, next) => {
  try { ok(res, await svc.deleteReply(tid(req), req.params.replyId, req.user)); }
  catch (e) { next(e); }
};

exports.likeReply = async (req, res, next) => {
  try { ok(res, await svc.likeReply(tid(req), req.params.replyId, req.user)); }
  catch (e) { next(e); }
};

exports.acceptReply = async (req, res, next) => {
  try { ok(res, await svc.acceptReply(tid(req), req.params.replyId, req.user)); }
  catch (e) { next(e); }
};

// ── Subscriptions ─────────────────────────────────────────────────────────────

exports.subscribeThread = async (req, res, next) => {
  try { ok(res, await svc.subscribeThread(tid(req), req.params.threadId, req.user)); }
  catch (e) { next(e); }
};

exports.unsubscribeThread = async (req, res, next) => {
  try { ok(res, await svc.unsubscribeThread(tid(req), req.params.threadId, req.user)); }
  catch (e) { next(e); }
};

// ── Flags ─────────────────────────────────────────────────────────────────────

exports.flagThread = async (req, res, next) => {
  try { ok(res, await svc.flagThread(tid(req), req.params.threadId, req.user, req.body.reason)); }
  catch (e) { next(e); }
};

exports.flagReply = async (req, res, next) => {
  try { ok(res, await svc.flagReply(tid(req), req.params.replyId, req.user, req.body.reason)); }
  catch (e) { next(e); }
};

exports.clearThreadFlags = async (req, res, next) => {
  try { ok(res, await svc.clearThreadFlags(tid(req), req.params.threadId, req.user)); }
  catch (e) { next(e); }
};

exports.clearReplyFlags = async (req, res, next) => {
  try { ok(res, await svc.clearReplyFlags(tid(req), req.params.replyId, req.user)); }
  catch (e) { next(e); }
};

exports.getFlaggedContent = async (req, res, next) => {
  try { ok(res, await svc.getFlaggedContent(tid(req), req.user, req.query)); }
  catch (e) { next(e); }
};

// ── Admin ─────────────────────────────────────────────────────────────────────

exports.adminListThreads = async (req, res, next) => {
  try { ok(res, await svc.adminListThreads(tid(req), req.query)); }
  catch (e) { next(e); }
};
