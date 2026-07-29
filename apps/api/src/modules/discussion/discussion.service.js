const discussionRepo  = require('../../database/repositories/discussion.repository');
const lessonRepo      = require('../../database/repositories/lesson.repository');
const enrollmentRepo  = require('../../database/repositories/enrollment.repository');
const userRepo        = require('../../database/repositories/user.repository');
const courseRepo      = require('../../database/repositories/course.repository');
const notificationSvc = require('../notification/notification.service');
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
      throw new AppError('You must be enrolled to access this lesson\'s discussions', 403);
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
// Reads were only gated by checkLesson() (lesson exists + discussionEnabled),
// unlike the parallel forum module, which requires enrollment for both reads
// and writes via checkAccess(). That let any authenticated tenant user read
// a lesson's Q&A without ever being enrolled in the course. Reusing
// checkWriteAccess() here brings reads in line with forum's behavior.
async function list(tenantId, lessonId, user) {
  await checkWriteAccess(tenantId, lessonId, user);

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

  const discussion = await discussionRepo.create({
    tenantId,
    courseId:   lesson.courseId,
    lessonId,
    parentId:   null,
    userId:     user.sub,
    authorName: `${userDoc.firstName} ${userDoc.lastName}`,
    authorRole: user.role,
    body:       body.trim(),
  });

  // Notify instructor + all tenant admins — fire-and-forget
  if (user.role === 'student') {
    setImmediate(async () => {
      try {
        const User = require('../../database/models/User.model');
        const course = await courseRepo.findById(tenantId, lesson.courseId.toString());
        if (!course) return;

        // instructorId is populated as a user object — extract _id safely
        const instructorId = course.instructorId?._id?.toString() ?? course.instructorId?.toString();
        const link = `/courses/${lesson.courseId}/learn?lesson=${lessonId}`;
        const notifyIds = new Set();

        if (instructorId && instructorId !== user.sub) notifyIds.add(instructorId);

        // Also notify all active tenant admins
        const admins = await User.find({ tenantId, role: 'tenant_admin', status: 'active', deletedAt: null }).select('_id').lean();
        for (const a of admins) {
          const aid = a._id.toString();
          if (aid !== user.sub) notifyIds.add(aid);
        }

        const studentName = `${userDoc.firstName} ${userDoc.lastName}`;
        const payload = {
          type: 'discussion_comment',
          title: 'New student question',
          message: `${studentName} posted in "${lesson.title}"`,
          link,
          ctx: { studentName, lessonTitle: lesson.title, preview: body.trim().slice(0, 200), link },
        };
        for (const id of notifyIds) {
          notificationSvc.create(tenantId, id, payload).catch(() => {});
        }
      } catch {}
    });
  }

  return discussion;
}

// ── Reply to an existing top-level post ───────────────────────────────────────
async function reply(tenantId, parentId, user, body) {
  if (!body?.trim()) throw new AppError('Body is required', 400);

  const parent = await discussionRepo.findById(tenantId, parentId);
  if (!parent) throw new AppError('Discussion not found', 404);
  if (parent.parentId) throw new AppError('Cannot reply to a reply', 400);

  const lesson  = await checkWriteAccess(tenantId, parent.lessonId.toString(), user);
  const userDoc = await userRepo.findByIdRaw(user.sub);

  const replyDoc = await discussionRepo.create({
    tenantId,
    courseId:   parent.courseId,
    lessonId:   parent.lessonId,
    parentId:   parent._id,
    userId:     user.sub,
    authorName: `${userDoc.firstName} ${userDoc.lastName}`,
    authorRole: user.role,
    body:       body.trim(),
  });

  // Notify original post author if someone else replied — fire-and-forget
  setImmediate(async () => {
    try {
      const originalAuthorId = parent.userId.toString();
      if (originalAuthorId === user.sub) return; // replying to own post
      const link = `/courses/${parent.courseId}/learn?lesson=${parent.lessonId}`;
      const replyAuthorName = `${userDoc.firstName} ${userDoc.lastName}`;
      await notificationSvc.create(tenantId, originalAuthorId, {
        type: 'discussion_reply',
        title: 'New reply to your post',
        message: `${replyAuthorName} replied to your comment`,
        link,
        ctx: { replyAuthorName, threadTitle: lesson.title, preview: body.trim().slice(0, 200), link },
      });
    } catch {}
  });

  return replyDoc;
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
