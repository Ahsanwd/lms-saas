const discussionRepo  = require('../../database/repositories/discussion.repository');
const lessonRepo      = require('../../database/repositories/lesson.repository');
const enrollmentRepo  = require('../../database/repositories/enrollment.repository');
const userRepo        = require('../../database/repositories/user.repository');
const AppError        = require('../../utils/AppError');

const EDITOR_ROLES = ['tenant_admin', 'instructor'];

// ── Verify lesson exists and discussion is enabled ────────────────────────────
async function checkLesson(tenantId, lessonId) {
  const lesson = await lessonRepo.findById(tenantId, lessonId);
  if (!lesson) throw new AppError('Lesson not found', 404);
  if (!lesson.discussionEnabled) throw new AppError('Discussion is not enabled for this lesson', 403);
  return lesson;
}

// ── For posting/replying: also require active enrollment for students ──────────
async function checkWriteAccess(tenantId, lessonId, user) {
  const lesson = await checkLesson(tenantId, lessonId);
  if (user.role === 'student') {
    const enrollment = await enrollmentRepo.findByUserAndCourse(
      tenantId, user.sub, lesson.courseId.toString()
    );
    if (!enrollment || !['active', 'completed'].includes(enrollment.status))
      throw new AppError('You must be enrolled to post in discussions', 403);
  }
  return lesson;
}

function formatPost(post, userId) {
  const obj = post.toObject ? post.toObject() : { ...post };
  const upvoteIds = (obj.upvotes ?? []).map(id => id.toString());
  obj.upvoteCount  = upvoteIds.length;
  obj.isUpvotedByMe = upvoteIds.includes(userId);
  delete obj.upvotes;
  return obj;
}

// ── List all top-level posts + their replies for a lesson ─────────────────────
async function list(tenantId, lessonId, user) {
  await checkLesson(tenantId, lessonId);

  const topLevel = await discussionRepo.findTopLevel(tenantId, lessonId);
  if (!topLevel.length) return { discussions: [] };

  const parentIds = topLevel.map(d => d._id);
  const replies   = await discussionRepo.findReplies(tenantId, parentIds);

  const replyMap = {};
  for (const r of replies) {
    const pid = r.parentId.toString();
    if (!replyMap[pid]) replyMap[pid] = [];
    replyMap[pid].push(formatPost(r, user.sub));
  }

  return {
    discussions: topLevel.map(p => ({
      ...formatPost(p, user.sub),
      replies: replyMap[p._id.toString()] ?? [],
    })),
  };
}

// ── Post a new top-level discussion ──────────────────────────────────────────
async function post(tenantId, lessonId, user, body) {
  if (!body?.trim()) throw new AppError('Body is required', 400);

  const lesson  = await checkWriteAccess(tenantId, lessonId, user);
  const userDoc = await userRepo.findByIdRaw(user.sub);

  return discussionRepo.create({
    tenantId,
    courseId:   lesson.courseId,
    lessonId,
    parentId:   null,
    userId:     user.sub,
    authorName: `${userDoc.firstName} ${userDoc.lastName}`,
    authorRole: user.role,
    body:       body.trim(),
  });
}

// ── Reply to an existing top-level post ───────────────────────────────────────
async function reply(tenantId, parentId, user, body) {
  if (!body?.trim()) throw new AppError('Body is required', 400);

  const parent = await discussionRepo.findById(tenantId, parentId);
  if (!parent) throw new AppError('Discussion not found', 404);
  if (parent.parentId) throw new AppError('Cannot reply to a reply', 400);

  await checkWriteAccess(tenantId, parent.lessonId.toString(), user);

  const userDoc = await userRepo.findByIdRaw(user.sub);

  return discussionRepo.create({
    tenantId,
    courseId:   parent.courseId,
    lessonId:   parent.lessonId,
    parentId:   parent._id,
    userId:     user.sub,
    authorName: `${userDoc.firstName} ${userDoc.lastName}`,
    authorRole: user.role,
    body:       body.trim(),
  });
}

// ── Edit body of own post ─────────────────────────────────────────────────────
async function edit(tenantId, id, user, body) {
  if (!body?.trim()) throw new AppError('Body is required', 400);

  const existing = await discussionRepo.findById(tenantId, id);
  if (!existing) throw new AppError('Discussion not found', 404);

  const isOwner = existing.userId.toString() === user.sub;
  if (!isOwner && !EDITOR_ROLES.includes(user.role)) throw new AppError('Forbidden', 403);

  return discussionRepo.updateById(tenantId, id, { body: body.trim(), editedAt: new Date() });
}

// ── Delete (soft) own post, or instructor/admin deletes any ──────────────────
async function remove(tenantId, id, user) {
  const existing = await discussionRepo.findById(tenantId, id);
  if (!existing) throw new AppError('Discussion not found', 404);

  const isOwner = existing.userId.toString() === user.sub;
  if (!isOwner && !EDITOR_ROLES.includes(user.role)) throw new AppError('Forbidden', 403);

  return discussionRepo.softDelete(tenantId, id);
}

// ── Toggle resolved on top-level posts (own post or instructor/admin) ─────────
async function resolve(tenantId, id, user) {
  const existing = await discussionRepo.findById(tenantId, id);
  if (!existing) throw new AppError('Discussion not found', 404);
  if (existing.parentId) throw new AppError('Only top-level posts can be resolved', 400);

  const isOwner = existing.userId.toString() === user.sub;
  if (!isOwner && !EDITOR_ROLES.includes(user.role)) throw new AppError('Forbidden', 403);

  return discussionRepo.updateById(tenantId, id, { isResolved: !existing.isResolved });
}

// ── Toggle pinned on top-level posts (instructor/admin only) ─────────────────
async function pin(tenantId, id, user) {
  if (!EDITOR_ROLES.includes(user.role)) throw new AppError('Forbidden', 403);

  const existing = await discussionRepo.findById(tenantId, id);
  if (!existing) throw new AppError('Discussion not found', 404);
  if (existing.parentId) throw new AppError('Only top-level posts can be pinned', 400);

  return discussionRepo.updateById(tenantId, id, { isPinned: !existing.isPinned });
}

// ── Toggle upvote ─────────────────────────────────────────────────────────────
async function upvote(tenantId, id, userId) {
  const existing = await discussionRepo.findById(tenantId, id);
  if (!existing) throw new AppError('Discussion not found', 404);

  const already = existing.upvotes.some(uid => uid.toString() === userId);
  const update  = already ? { $pull: { upvotes: userId } } : { $addToSet: { upvotes: userId } };

  return discussionRepo.updateById(tenantId, id, update);
}

module.exports = { list, post, reply, edit, remove, resolve, pin, upvote };
