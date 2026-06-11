const svc = require('./discussion.service');

const ok  = (res, data) => res.json({ success: true, data });
const tid = (req) => req.tenant.tenantId;

exports.list    = async (req, res, next) => {
  try { ok(res, await svc.list(tid(req), req.params.lessonId, req.user)); }
  catch (e) { next(e); }
};

exports.post    = async (req, res, next) => {
  try { ok(res, await svc.post(tid(req), req.params.lessonId, req.user, req.body.body)); }
  catch (e) { next(e); }
};

exports.reply   = async (req, res, next) => {
  try { ok(res, await svc.reply(tid(req), req.params.id, req.user, req.body.body)); }
  catch (e) { next(e); }
};

exports.edit    = async (req, res, next) => {
  try { ok(res, await svc.edit(tid(req), req.params.id, req.user, req.body.body)); }
  catch (e) { next(e); }
};

exports.remove  = async (req, res, next) => {
  try { await svc.remove(tid(req), req.params.id, req.user); ok(res, { removed: true }); }
  catch (e) { next(e); }
};

exports.resolve = async (req, res, next) => {
  try { ok(res, await svc.resolve(tid(req), req.params.id, req.user)); }
  catch (e) { next(e); }
};

exports.pin     = async (req, res, next) => {
  try { ok(res, await svc.pin(tid(req), req.params.id, req.user)); }
  catch (e) { next(e); }
};

exports.upvote  = async (req, res, next) => {
  try { ok(res, await svc.upvote(tid(req), req.params.id, req.user.sub)); }
  catch (e) { next(e); }
};
