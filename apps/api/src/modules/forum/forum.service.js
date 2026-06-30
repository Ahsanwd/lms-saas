const forumRepo      = require('../../database/repositories/forum.repository');
const enrollmentRepo = require('../../database/repositories/enrollment.repository');
const courseRepo     = require('../../database/repositories/course.repository');
const userRepo       = require('../../database/repositories/user.repository');
const tenantRepo     = require('../../database/repositories/tenant.repository');
const AppError       = require('../../utils/AppError');
const { sendMail }   = require('../../services/email/email.service');
const forumReplyTpl  = require('../../services/email/templates/forumReply');
const config         = require('../../config');

const MOD_ROLES = ['instructor', 'tenant_admin'];

const FLAG_REASONS = ['spam', 'offensive', 'misinformation', 'other'];

// ── Verify user can access this course forum ──────────────────────────────────
async function checkAccess(tenantId, courseId, user) {
  const course = await courseRepo.findById(tenantId, courseId);
  if (!course) throw new AppError('Course not found', 404);

  if (MOD_ROLES.includes(user.role)) return course;

  const enrollment = await enrollmentRepo.findByUserAndCourse(tenantId, user.sub, courseId);
  if (!enrollment || !['active', 'completed'].includes(enrollment.status))
    throw new AppError('You must be enrolled in this course to access the forum', 403);

  return course;
}

function formatThread(thread, userId) {
  const obj = thread.toObject ? thread.toObject() : { ...thread };
  const likeIds = (obj.likes ?? []).map(id => id.toString());
  obj.likeCount    = likeIds.length;
  obj.isLikedByMe  = likeIds.includes(userId);
  obj.isSubscribed = (obj.subscribers ?? []).map(id => id.toString()).includes(userId);
  obj.flagCount    = (obj.flags ?? []).length;
  delete obj.likes;
  delete obj.subscribers;
  delete obj.flags;
  return obj;
}

function formatReply(reply, userId) {
  const obj = reply.toObject ? reply.toObject() : { ...reply };
  const likeIds = (obj.likes ?? []).map(id => id.toString());
  obj.likeCount   = likeIds.length;
  obj.isLikedByMe = likeIds.includes(userId);
  obj.flagCount   = (obj.flags ?? []).length;
  delete obj.likes;
  delete obj.flags;
  return obj;
}

// ── Thread: List ──────────────────────────────────────────────────────────────
async function listThreads(tenantId, courseId, user, query) {
  await checkAccess(tenantId, courseId, user);

  const page  = Math.max(1, parseInt(query.page)  || 1);
  const limit = Math.min(50, parseInt(query.limit) || 20);
  const sort  = ['latest', 'top', 'unanswered'].includes(query.sort) ? query.sort : 'latest';
  const tag   = query.tag || null;

  const [threads, total] = await forumRepo.listThreads(tenantId, courseId, { sort, page, limit, tag });

  return {
    threads: threads.map(t => formatThread(t, user.sub)),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

// ── Thread: Create ────────────────────────────────────────────────────────────
async function createThread(tenantId, courseId, user, { title, body, tags }) {
  if (!title?.trim()) throw new AppError('Title is required', 400);
  if (!body?.trim())  throw new AppError('Body is required', 400);

  await checkAccess(tenantId, courseId, user);
  const userDoc = await userRepo.findByIdRaw(user.sub);

  const thread = await forumRepo.createThread({
    tenantId,
    courseId,
    authorId:    user.sub,
    authorName:  `${userDoc.firstName} ${userDoc.lastName}`,
    authorRole:  user.role,
    title:       title.trim(),
    body:        body.trim(),
    tags:        (tags ?? []).map(t => t.trim()).filter(Boolean).slice(0, 5),
    subscribers: [user.sub],
  });

  return formatThread(thread, user.sub);
}

// ── Thread: Get detail ────────────────────────────────────────────────────────
async function getThread(tenantId, threadId, user) {
  const thread = await forumRepo.findThreadById(tenantId, threadId);
  if (!thread) throw new AppError('Thread not found', 404);

  await checkAccess(tenantId, thread.courseId.toString(), user);

  forumRepo.incrementViews(tenantId, threadId).catch(() => {});

  const replies = await forumRepo.listReplies(tenantId, threadId);

  // Build nested structure: top-level replies with their nested children
  const topLevel = replies.filter(r => !r.parentReplyId);
  const nested   = replies.filter(r => !!r.parentReplyId);

  const replyMap = {};
  for (const r of nested) {
    const pid = r.parentReplyId.toString();
    if (!replyMap[pid]) replyMap[pid] = [];
    replyMap[pid].push(formatReply(r, user.sub));
  }

  return {
    thread: formatThread(thread, user.sub),
    replies: topLevel.map(r => ({
      ...formatReply(r, user.sub),
      children: replyMap[r._id.toString()] ?? [],
    })),
  };
}

// ── Thread: Edit ──────────────────────────────────────────────────────────────
async function editThread(tenantId, threadId, user, { title, body, tags }) {
  const thread = await forumRepo.findThreadById(tenantId, threadId);
  if (!thread) throw new AppError('Thread not found', 404);

  const isOwner = thread.authorId.toString() === user.sub;
  if (!isOwner && !MOD_ROLES.includes(user.role)) throw new AppError('Forbidden', 403);

  if (thread.isClosed && !MOD_ROLES.includes(user.role))
    throw new AppError('This thread is closed', 403);

  const updates = { editedAt: new Date() };
  if (title?.trim())   updates.title = title.trim();
  if (body?.trim())    updates.body  = body.trim();
  if (Array.isArray(tags)) updates.tags = tags.map(t => t.trim()).filter(Boolean).slice(0, 5);

  const updated = await forumRepo.updateThread(tenantId, threadId, updates);
  return formatThread(updated, user.sub);
}

// ── Thread: Delete ────────────────────────────────────────────────────────────
async function deleteThread(tenantId, threadId, user) {
  const thread = await forumRepo.findThreadById(tenantId, threadId);
  if (!thread) throw new AppError('Thread not found', 404);

  const isOwner = thread.authorId.toString() === user.sub;
  if (!isOwner && !MOD_ROLES.includes(user.role)) throw new AppError('Forbidden', 403);

  await forumRepo.softDeleteThread(tenantId, threadId);
  return { deleted: true };
}

// ── Thread: Pin ───────────────────────────────────────────────────────────────
async function pinThread(tenantId, threadId, user) {
  if (!MOD_ROLES.includes(user.role)) throw new AppError('Forbidden', 403);

  const thread = await forumRepo.findThreadById(tenantId, threadId);
  if (!thread) throw new AppError('Thread not found', 404);

  const updated = await forumRepo.updateThread(tenantId, threadId, { isPinned: !thread.isPinned });
  return formatThread(updated, user.sub);
}

// ── Thread: Resolve ───────────────────────────────────────────────────────────
async function resolveThread(tenantId, threadId, user) {
  const thread = await forumRepo.findThreadById(tenantId, threadId);
  if (!thread) throw new AppError('Thread not found', 404);

  const isOwner = thread.authorId.toString() === user.sub;
  if (!isOwner && !MOD_ROLES.includes(user.role)) throw new AppError('Forbidden', 403);

  const updated = await forumRepo.updateThread(tenantId, threadId, { isResolved: !thread.isResolved });
  return formatThread(updated, user.sub);
}

// ── Thread: Close ─────────────────────────────────────────────────────────────
async function closeThread(tenantId, threadId, user) {
  if (!MOD_ROLES.includes(user.role)) throw new AppError('Forbidden', 403);

  const thread = await forumRepo.findThreadById(tenantId, threadId);
  if (!thread) throw new AppError('Thread not found', 404);

  const updated = await forumRepo.updateThread(tenantId, threadId, { isClosed: !thread.isClosed });
  return formatThread(updated, user.sub);
}

// ── Thread: Like ──────────────────────────────────────────────────────────────
async function likeThread(tenantId, threadId, user) {
  const thread = await forumRepo.findThreadById(tenantId, threadId);
  if (!thread) throw new AppError('Thread not found', 404);

  const already  = thread.likes.some(id => id.toString() === user.sub);
  const update   = already ? { $pull: { likes: user.sub } } : { $addToSet: { likes: user.sub } };
  const updated  = await forumRepo.updateThread(tenantId, threadId, update);
  return formatThread(updated, user.sub);
}

// ── Reply: Create ─────────────────────────────────────────────────────────────
async function createReply(tenantId, threadId, user, { body, parentReplyId }, io) {
  if (!body?.trim()) throw new AppError('Body is required', 400);

  const thread = await forumRepo.findThreadById(tenantId, threadId);
  if (!thread) throw new AppError('Thread not found', 404);
  if (thread.isClosed) throw new AppError('This thread is closed', 403);

  await checkAccess(tenantId, thread.courseId.toString(), user);

  if (parentReplyId) {
    const parent = await forumRepo.findReplyById(tenantId, parentReplyId);
    if (!parent) throw new AppError('Parent reply not found', 404);
    if (parent.parentReplyId) throw new AppError('Cannot nest replies more than one level', 400);
  }

  const userDoc = await userRepo.findByIdRaw(user.sub);

  const reply = await forumRepo.createReply({
    tenantId,
    courseId:      thread.courseId,
    threadId,
    parentReplyId: parentReplyId || null,
    authorId:      user.sub,
    authorName:    `${userDoc.firstName} ${userDoc.lastName}`,
    authorRole:    user.role,
    body:          body.trim(),
  });

  await forumRepo.updateThread(tenantId, threadId, {
    $inc:           { replyCount: 1 },
    lastActivityAt: new Date(),
  });

  // Auto-subscribe the reply author
  await forumRepo.subscribeThread(tenantId, threadId, user.sub);

  // Notify subscribers (fire-and-forget — don't block the response)
  const replyAuthorName = `${userDoc.firstName} ${userDoc.lastName}`;
  const preview         = body.trim().slice(0, 120);
  const threadUrl       = `${config.app?.url || ''}/courses/${thread.courseId}/forum/${threadId}`;

  setImmediate(async () => {
    try {
      const fresh = await forumRepo.findThreadById(tenantId, threadId);
      const subscriberIds = (fresh.subscribers ?? [])
        .map(id => id.toString())
        .filter(id => id !== user.sub);

      const { tenantName, branding } = await tenantRepo.getBranding(tenantId);

      for (const sid of subscriberIds) {
        try {
          const sub = await userRepo.findByIdRaw(sid);
          if (!sub?.email) continue;

          // Socket push notification
          if (io) {
            io.to(`user:${sid}`).emit('forum_notification', {
              threadId, threadTitle: thread.title, replyAuthorName, preview,
            });
          }

          // Email notification
          const tpl = forumReplyTpl({
            recipientName: `${sub.firstName} ${sub.lastName}`,
            replyAuthorName,
            threadTitle: thread.title,
            preview,
            threadUrl,
            tenantName,
            branding,
          });
          await sendMail({ to: sub.email, subject: tpl.subject, html: tpl.html });
        } catch (_) { /* skip individual failures */ }
      }
    } catch (_) { /* ignore */ }
  });

  return formatReply(reply, user.sub);
}

// ── Reply: Edit ───────────────────────────────────────────────────────────────
async function editReply(tenantId, replyId, user, { body }) {
  if (!body?.trim()) throw new AppError('Body is required', 400);

  const reply = await forumRepo.findReplyById(tenantId, replyId);
  if (!reply) throw new AppError('Reply not found', 404);

  const thread = await forumRepo.findThreadById(tenantId, reply.threadId.toString());
  if (thread?.isClosed && !MOD_ROLES.includes(user.role))
    throw new AppError('This thread is closed', 403);

  const isOwner = reply.authorId.toString() === user.sub;
  if (!isOwner && !MOD_ROLES.includes(user.role)) throw new AppError('Forbidden', 403);

  const updated = await forumRepo.updateReply(tenantId, replyId, {
    body: body.trim(),
    editedAt: new Date(),
  });
  return formatReply(updated, user.sub);
}

// ── Reply: Delete ─────────────────────────────────────────────────────────────
async function deleteReply(tenantId, replyId, user) {
  const reply = await forumRepo.findReplyById(tenantId, replyId);
  if (!reply) throw new AppError('Reply not found', 404);

  const isOwner = reply.authorId.toString() === user.sub;
  if (!isOwner && !MOD_ROLES.includes(user.role)) throw new AppError('Forbidden', 403);

  await forumRepo.softDeleteReply(tenantId, replyId);

  // Decrement thread reply count
  await forumRepo.updateThread(tenantId, reply.threadId.toString(), {
    $inc: { replyCount: -1 },
  });

  return { deleted: true };
}

// ── Reply: Like ───────────────────────────────────────────────────────────────
async function likeReply(tenantId, replyId, user) {
  const reply   = await forumRepo.findReplyById(tenantId, replyId);
  if (!reply) throw new AppError('Reply not found', 404);

  const already = reply.likes.some(id => id.toString() === user.sub);
  const update  = already ? { $pull: { likes: user.sub } } : { $addToSet: { likes: user.sub } };
  const updated = await forumRepo.updateReply(tenantId, replyId, update);
  return formatReply(updated, user.sub);
}

// ── Reply: Accept ─────────────────────────────────────────────────────────────
async function acceptReply(tenantId, replyId, user) {
  const reply = await forumRepo.findReplyById(tenantId, replyId);
  if (!reply) throw new AppError('Reply not found', 404);

  const thread = await forumRepo.findThreadById(tenantId, reply.threadId.toString());
  if (!thread) throw new AppError('Thread not found', 404);

  const isThreadOwner = thread.authorId.toString() === user.sub;
  if (!isThreadOwner && !MOD_ROLES.includes(user.role)) throw new AppError('Forbidden', 403);

  // Toggle: if already accepted, un-accept it; otherwise accept and clear others
  if (reply.isAccepted) {
    const updated = await forumRepo.updateReply(tenantId, replyId, { isAccepted: false });
    return formatReply(updated, user.sub);
  }

  await forumRepo.clearAccepted(tenantId, reply.threadId.toString());
  const updated = await forumRepo.updateReply(tenantId, replyId, { isAccepted: true });

  // Mark thread as resolved when an answer is accepted
  await forumRepo.updateThread(tenantId, reply.threadId.toString(), { isResolved: true });

  return formatReply(updated, user.sub);
}

// ── Subscribe / Unsubscribe ───────────────────────────────���───────────────────

async function subscribeThread(tenantId, threadId, user) {
  const thread = await forumRepo.findThreadById(tenantId, threadId);
  if (!thread) throw new AppError('Thread not found', 404);
  await checkAccess(tenantId, thread.courseId.toString(), user);
  const updated = await forumRepo.subscribeThread(tenantId, threadId, user.sub);
  return formatThread(updated, user.sub);
}

async function unsubscribeThread(tenantId, threadId, user) {
  const thread = await forumRepo.findThreadById(tenantId, threadId);
  if (!thread) throw new AppError('Thread not found', 404);
  const updated = await forumRepo.unsubscribeThread(tenantId, threadId, user.sub);
  return formatThread(updated, user.sub);
}

// ── Flag / Unflag ─────────────────────────────────────────────────────────────

async function flagThread(tenantId, threadId, user, reason) {
  if (!FLAG_REASONS.includes(reason)) throw new AppError('Invalid reason', 400);
  const thread = await forumRepo.findThreadById(tenantId, threadId);
  if (!thread) throw new AppError('Thread not found', 404);
  if (thread.authorId.toString() === user.sub) throw new AppError('Cannot flag your own thread', 400);
  const updated = await forumRepo.flagThread(tenantId, threadId, user.sub, reason);
  if (!updated) throw new AppError('Already flagged', 400);
  return { flagged: true };
}

async function flagReply(tenantId, replyId, user, reason) {
  if (!FLAG_REASONS.includes(reason)) throw new AppError('Invalid reason', 400);
  const reply = await forumRepo.findReplyById(tenantId, replyId);
  if (!reply) throw new AppError('Reply not found', 404);
  if (reply.authorId.toString() === user.sub) throw new AppError('Cannot flag your own reply', 400);
  const updated = await forumRepo.flagReply(tenantId, replyId, user.sub, reason);
  if (!updated) throw new AppError('Already flagged', 400);
  return { flagged: true };
}

async function clearThreadFlags(tenantId, threadId, user) {
  if (!MOD_ROLES.includes(user.role)) throw new AppError('Forbidden', 403);
  const updated = await forumRepo.clearThreadFlags(tenantId, threadId);
  return formatThread(updated, user.sub);
}

async function clearReplyFlags(tenantId, replyId, user) {
  if (!MOD_ROLES.includes(user.role)) throw new AppError('Forbidden', 403);
  await forumRepo.clearReplyFlags(tenantId, replyId);
  return { cleared: true };
}

async function getFlaggedContent(tenantId, user, query) {
  if (!MOD_ROLES.includes(user.role)) throw new AppError('Forbidden', 403);
  const [threads, replies] = await forumRepo.listFlaggedContent(tenantId, query);
  return {
    threads: threads.map(t => formatThread(t, user.sub)),
    replies: replies.map(r => formatReply(r, user.sub)),
  };
}

// ── Admin: List all threads ───────────────────────────────────────────────────
async function adminListThreads(tenantId, query) {
  const page     = Math.max(1, parseInt(query.page)  || 1);
  const limit    = Math.min(50, parseInt(query.limit) || 20);
  const courseId = query.courseId || null;

  const [threads, total] = await forumRepo.adminListThreads(tenantId, { page, limit, courseId });
  return {
    // Raw docs still carry the `flags` subdocument array — collapse it to the
    // flagCount the frontend actually reads, same as formatThread() does for
    // every other forum endpoint. Without this, flagged threads always read
    // as flagCount: undefined (?? 0) and never surface in the admin view.
    threads: threads.map(t => {
      const obj = t.toObject ? t.toObject() : { ...t };
      obj.flagCount = (obj.flags ?? []).length;
      delete obj.flags;
      return obj;
    }),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

module.exports = {
  listThreads, createThread, getThread, editThread, deleteThread,
  pinThread, resolveThread, closeThread, likeThread,
  createReply, editReply, deleteReply, likeReply, acceptReply,
  subscribeThread, unsubscribeThread,
  flagThread, flagReply, clearThreadFlags, clearReplyFlags, getFlaggedContent,
  adminListThreads,
};
