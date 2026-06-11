const svc = require('./chat.service');

const ok  = (res, data) => res.json({ success: true, data });
const tid = (req) => req.tenant.tenantId;

// ── Conversations ──────────────────────────────────────────────────────────────

exports.listConversations = async (req, res, next) => {
  try { ok(res, await svc.listConversations(tid(req), req.user, req.query)); }
  catch (e) { next(e); }
};

exports.startConversation = async (req, res, next) => {
  try {
    const result = await svc.startConversation(tid(req), req.user, req.body);
    res.status(result.created ? 201 : 200).json({ success: true, data: result });
  } catch (e) { next(e); }
};

exports.getConversation = async (req, res, next) => {
  try { ok(res, await svc.getConversation(tid(req), req.params.id, req.user)); }
  catch (e) { next(e); }
};

exports.closeConversation = async (req, res, next) => {
  try { ok(res, await svc.closeConversation(tid(req), req.params.id, req.user)); }
  catch (e) { next(e); }
};

exports.deleteConversation = async (req, res, next) => {
  try {
    await svc.deleteConversation(tid(req), req.params.id, req.user);
    ok(res, { deleted: true });
  } catch (e) { next(e); }
};

// ── Messages ───────────────────────────────────────────────────────────────────

exports.getMessages = async (req, res, next) => {
  try { ok(res, await svc.getMessages(tid(req), req.params.id, req.user, req.query)); }
  catch (e) { next(e); }
};

exports.sendMessage = async (req, res, next) => {
  try {
    const { getPublicUrl } = require('../../services/storage/storage.service');
    const file = req.file
      ? { url: getPublicUrl(req.file.path), name: req.file.originalname, mimeType: req.file.mimetype, sizeBytes: req.file.size }
      : null;
    const result = await svc.sendMessage(tid(req), req.params.id, req.user, req.body, req.io, file);
    res.status(201).json({ success: true, data: result });
  } catch (e) { next(e); }
};

exports.searchMessages = async (req, res, next) => {
  try { ok(res, await svc.searchMessages(tid(req), req.params.id, req.user, req.query)); }
  catch (e) { next(e); }
};

exports.editMessage = async (req, res, next) => {
  try { ok(res, await svc.editMessage(tid(req), req.params.id, req.params.msgId, req.user, req.body)); }
  catch (e) { next(e); }
};

exports.deleteMessage = async (req, res, next) => {
  try {
    await svc.deleteMessage(tid(req), req.params.id, req.params.msgId, req.user, req.io);
    ok(res, { deleted: true });
  } catch (e) { next(e); }
};

// ── Unread count ───────────────────────────────────────────────────────────────

exports.getUnreadCount = async (req, res, next) => {
  try { ok(res, await svc.getTotalUnread(tid(req), req.user)); }
  catch (e) { next(e); }
};
