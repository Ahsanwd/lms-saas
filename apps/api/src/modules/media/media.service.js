const mediaRepo = require('../../database/repositories/media.repository');
const AppError = require('../../utils/AppError');

async function listMedia(tenantId, query) {
  const { category, search, page = 1, limit = 20 } = query;

  const filter = {};
  if (category) filter.category = category;
  if (search) filter.filename = { $regex: search, $options: 'i' };

  const [media, total] = await mediaRepo.findAll(tenantId, filter, { page, limit });

  return {
    media,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)) || 1,
    },
  };
}

async function deleteMedia(tenantId, mediaId, user) {
  const media = await mediaRepo.findById(tenantId, mediaId);
  if (!media) throw new AppError('Media not found', 404);

  const limitGuardSvc = require('../../services/limitGuard/limitGuard.service');

  if (media.provider === 'cloudflare') {
    const config = require('../../config');
    const cf = config.cloudflareStream;
    if (cf.accountId && cf.apiToken) {
      const cfSvc = require('../../services/cloudflareStream/cloudflareStream.service');
      await cfSvc.deleteVideo(cf.accountId, cf.apiToken, media.key || media.url).catch(() => {});
    }
    if (media.durationSeconds > 0) {
      await limitGuardSvc.decrementStreamStorageUsed(tenantId, media.durationSeconds / 60);
    }
  } else {
    const { deleteFile } = require('../../services/storage/storage.service');
    await deleteFile(media.url).catch(() => {});
    if (media.sizeBytes > 0) {
      await limitGuardSvc.decrementStorageUsed(tenantId, media.sizeBytes);
    }
  }

  await mediaRepo.softDelete(tenantId, mediaId, user.sub);
  return { deleted: true };
}

module.exports = { listMedia, deleteMedia };
