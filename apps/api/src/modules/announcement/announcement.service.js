const announcementRepo = require('../../database/repositories/announcement.repository');
const AppError         = require('../../utils/AppError');
const Enrollment       = require('../../database/models/Enrollment.model');
const User             = require('../../database/models/User.model');
const Tenant           = require('../../database/models/Tenant.model');

function canManage(announcement, user) {
  if (user.permissions.includes('announcement:manage')) return true;
  const authorId = announcement.authorId?._id?.toString() ?? announcement.authorId?.toString();
  return authorId === user.sub;
}

// ─── Shared: fire-and-forget notifications + email after publish ──────────────
async function _triggerPublishNotifications(tenantId, existing) {
  try {
    const notifySvc  = require('../notification/notification.service');
    const tenant     = await Tenant.findById(tenantId).select('name').lean();
    const tenantName = tenant?.name || 'Learning Platform';
    const courseId   = existing.courseId?._id?.toString() ?? null;
    const courseName = existing.courseId?.title ?? null;

    let userIds = [];
    if (courseId) {
      const enrollments = await Enrollment.find({ tenantId, courseId, status: 'active' }).distinct('userId');
      userIds = enrollments.map(id => id.toString());
    } else {
      const users = await User.find({ tenantId, status: 'active', deletedAt: null }).distinct('_id');
      userIds = users.map(id => id.toString());
    }

    if (userIds.length) {
      await notifySvc.notifyAnnouncement(tenantId, userIds, existing.title, courseId, {
        announcementBody: existing.body,
        courseName,
        tenantName,
      });
    }
  } catch { /* non-critical */ }
}

// ─── Shared: schedule a delayed publish task ──────────────────────────────────
async function _enqueueScheduledPublish(announcementId, tenantId, publishAt) {
  const scheduledTaskRepo = require('../../database/repositories/scheduledTask.repository');
  const runAt = new Date(Math.max(publishAt.getTime(), Date.now() + 1000));
  await scheduledTaskRepo.schedule({
    type:   'scheduled-publish',
    jobKey: `announcement-publish-${announcementId}`,
    payload: {
      announcementId: announcementId.toString(),
      tenantId:       tenantId.toString(),
      scheduledAt:    publishAt.toISOString(),
    },
    runAt,
    maxAttempts: 3,
    backoffMs:   5000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────

async function listAnnouncements(tenantId, user, query) {
  const filter = {};
  const canSeeAll = user.permissions.includes('announcement:manage') ||
    user.permissions.includes('announcement:update');
  if (!canSeeAll) filter.isPublished = true;
  if (query.courseId) filter.courseId = query.courseId;
  const announcements = await announcementRepo.findAll(tenantId, filter);
  return { announcements };
}

async function getAnnouncement(tenantId, id, user) {
  const announcement = await announcementRepo.findById(tenantId, id);
  if (!announcement) throw new AppError('Announcement not found', 404);
  const canSeeAll = user.permissions.includes('announcement:manage') ||
    user.permissions.includes('announcement:update');
  if (!announcement.isPublished && !canSeeAll) throw new AppError('Announcement not found', 404);
  return { announcement };
}

async function createAnnouncement(tenantId, body, user) {
  const data = {
    tenantId,
    title:    body.title.trim(),
    body:     body.body.trim(),
    authorId: user.sub,
    courseId: body.courseId || null,
  };

  let scheduledPublishAt = null;
  if (body.scheduledPublishAt) {
    const publishAt = new Date(body.scheduledPublishAt);
    if (!isNaN(publishAt.getTime()) && publishAt > new Date()) {
      scheduledPublishAt = publishAt;
      data.scheduledPublishAt = publishAt;
    }
  }

  const announcement = await announcementRepo.create(data);
  if (scheduledPublishAt) {
    await _enqueueScheduledPublish(announcement._id, tenantId, scheduledPublishAt);
  }
  return { announcement };
}

async function updateAnnouncement(tenantId, id, body, user) {
  const existing = await announcementRepo.findById(tenantId, id);
  if (!existing) throw new AppError('Announcement not found', 404);
  if (!canManage(existing, user)) throw new AppError('Forbidden', 403);

  const update = {};
  if (body.title    !== undefined) update.title    = body.title.trim();
  if (body.body     !== undefined) update.body     = body.body.trim();
  if (body.courseId !== undefined) update.courseId = body.courseId || null;

  let newScheduledAt = null;
  if ('scheduledPublishAt' in body) {
    if (!body.scheduledPublishAt) {
      update.scheduledPublishAt = null;
    } else if (!existing.isPublished) {
      const publishAt = new Date(body.scheduledPublishAt);
      if (!isNaN(publishAt.getTime()) && publishAt > new Date()) {
        update.scheduledPublishAt = publishAt;
        newScheduledAt = publishAt;
      }
    }
  }

  const announcement = await announcementRepo.updateById(tenantId, id, update);
  if (newScheduledAt) await _enqueueScheduledPublish(id, tenantId, newScheduledAt);
  return { announcement };
}

async function publishAnnouncement(tenantId, id, user) {
  const existing = await announcementRepo.findById(tenantId, id);
  if (!existing) throw new AppError('Announcement not found', 404);
  if (!canManage(existing, user)) throw new AppError('Forbidden', 403);
  const announcement = await announcementRepo.updateById(tenantId, id, {
    isPublished: true, publishedAt: new Date(), scheduledPublishAt: null,
  });
  setImmediate(() => _triggerPublishNotifications(tenantId, existing));
  return { announcement };
}

// Called by the scheduled Bull job — no user auth check
async function publishAnnouncementSystem(tenantId, id) {
  const existing = await announcementRepo.findById(tenantId, id);
  if (!existing || existing.isPublished) return;
  await announcementRepo.updateById(tenantId, id, {
    isPublished: true, publishedAt: new Date(), scheduledPublishAt: null,
  });
  setImmediate(() => _triggerPublishNotifications(tenantId, existing));
}

async function unpublishAnnouncement(tenantId, id, user) {
  const existing = await announcementRepo.findById(tenantId, id);
  if (!existing) throw new AppError('Announcement not found', 404);
  if (!canManage(existing, user)) throw new AppError('Forbidden', 403);
  const announcement = await announcementRepo.updateById(tenantId, id, {
    isPublished: false, publishedAt: null,
  });
  return { announcement };
}

async function deleteAnnouncement(tenantId, id, user) {
  const existing = await announcementRepo.findById(tenantId, id);
  if (!existing) throw new AppError('Announcement not found', 404);
  if (!canManage(existing, user)) throw new AppError('Forbidden', 403);
  await announcementRepo.softDelete(tenantId, id, user.sub);
}

module.exports = {
  listAnnouncements, getAnnouncement, createAnnouncement,
  updateAnnouncement, publishAnnouncement, publishAnnouncementSystem,
  unpublishAnnouncement, deleteAnnouncement,
};
