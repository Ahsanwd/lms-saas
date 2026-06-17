const jwt    = require('jsonwebtoken');
const fs     = require('fs');
const path   = require('path');
const Lesson = require('../../database/models/Lesson.model');
const Enrollment = require('../../database/models/Enrollment.model');
const AppError   = require('../../utils/AppError');
const config     = require('../../config');
const { UPLOAD_ROOT } = require('../../services/storage/storage.service');

// Dedicated symmetric secret for short-lived file tokens (separate from RS256 auth tokens)
const FILE_SECRET = process.env.FILE_TOKEN_SECRET || 'lms-file-token-secret-change-in-prod';

function signFileToken(lessonId, userId, tenantId) {
  return jwt.sign(
    { lessonId: String(lessonId), userId: String(userId), tenantId: String(tenantId), p: 'fs' },
    FILE_SECRET,
    { expiresIn: '5m' }
  );
}

function verifyFileToken(token) {
  const payload = jwt.verify(token, FILE_SECRET);
  if (payload.p !== 'fs') throw new Error('wrong purpose');
  return payload;
}

// ── GET /api/files/token?lessonId=xxx ─────────────────────────────────────────
// Requires: Bearer auth (authenticate middleware) + tenant already resolved OR
//           tenant derived from JWT (when mounted before resolveTenant).
async function getFileToken(req, res, next) {
  try {
    const { lessonId } = req.query;
    if (!lessonId) throw new AppError('lessonId required', 400);

    const userId   = req.user.sub;
    const tenantId = req.user.tenantId;   // from JWT — safe even without resolveTenant
    const role     = req.user.role;

    const lesson = await Lesson.findOne({ _id: lessonId, tenantId, deletedAt: null }).lean();
    if (!lesson?.file) throw new AppError('Lesson or file not found', 404);

    // Students must have an active enrollment in the course
    if (role === 'student') {
      const enrolled = await Enrollment.findOne({
        tenantId, courseId: lesson.courseId, userId, status: 'active',
      }).lean();
      if (!enrolled) throw new AppError('Not enrolled in this course', 403);
    }

    const token = signFileToken(lessonId, userId, tenantId);

    return res.json({
      success: true,
      data: {
        token,
        fileName:      lesson.file.name,
        mimeType:      lesson.file.mimeType,
        sizeBytes:     lesson.file.sizeBytes,
        isConverted:   lesson.file.isConverted ?? false,
        // Return converted HTML inline — avoids a second round-trip
        convertedHtml: lesson.file.isConverted ? lesson.file.convertedHtml : null,
      },
    });
  } catch (err) { next(err); }
}

// ── GET /api/files/serve/:token ───────────────────────────────────────────────
// No Bearer header needed — the signed file token IS the credential.
// Streams the file with headers that prevent browser download/caching.
async function serveFile(req, res, next) {
  try {
    let payload;
    try { payload = verifyFileToken(req.params.token); }
    catch { return next(new AppError('Invalid or expired file link', 401)); }

    const lesson = await Lesson.findOne({
      _id:      payload.lessonId,
      tenantId: payload.tenantId,
      deletedAt: null,
    }).lean();

    if (!lesson?.file?.url) return next(new AppError('File not found', 404));

    const mime     = lesson.file.mimeType || 'application/octet-stream';
    const safeName = encodeURIComponent(lesson.file.name || 'file');

    // Security headers — no caching, no download, no embedding outside our origin
    res.setHeader('Cache-Control',             'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma',                    'no-cache');
    res.setHeader('X-Content-Type-Options',    'nosniff');
    res.setHeader('X-Frame-Options',           'SAMEORIGIN');
    res.setHeader('Content-Security-Policy',   "default-src 'none'");
    res.setHeader('Content-Disposition',       `inline; filename="${safeName}"`);
    res.setHeader('Content-Type',              mime);

    const USE_S3 = config.storage?.driver === 's3';

    if (USE_S3) {
      // Stream directly from R2 via AWS SDK — no public CDN access required
      try {
        const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
        const s3cfg = config.storage.s3;
        const s3 = new S3Client({
          region: s3cfg.region || 'auto',
          endpoint: s3cfg.endpoint,
          credentials: { accessKeyId: s3cfg.accessKeyId, secretAccessKey: s3cfg.secretAccessKey },
        });

        // Extract the object key from the stored URL
        const cdnBase = (s3cfg.cdnUrl || `${s3cfg.endpoint}/${s3cfg.bucket}`).replace(/\/$/, '');
        const key = lesson.file.url.startsWith(cdnBase)
          ? lesson.file.url.slice(cdnBase.length + 1)
          : lesson.file.url.replace(/^https?:\/\/[^/]+\//, '');

        const cmd = new GetObjectCommand({ Bucket: s3cfg.bucket, Key: key });
        const s3Res = await s3.send(cmd);

        if (lesson.file.sizeBytes) res.setHeader('Content-Length', lesson.file.sizeBytes);
        s3Res.Body.pipe(res);
      } catch (err) {
        return next(new AppError('File could not be retrieved from storage', 502));
      }
    } else {
      // Local disk — resolve path from public URL
      const apiBase = (config.app?.apiUrl || '').replace(/\/$/, '');
      const prefix  = `${apiBase}/uploads/`;
      let filePath;
      if (lesson.file.url.startsWith(prefix)) {
        filePath = path.join(UPLOAD_ROOT, lesson.file.url.slice(prefix.length));
      } else if (lesson.file.url.startsWith('/uploads/')) {
        filePath = path.join(UPLOAD_ROOT, lesson.file.url.slice('/uploads/'.length));
      } else {
        filePath = lesson.file.url; // absolute path fallback
      }

      if (!fs.existsSync(filePath)) return next(new AppError('File not found on disk', 404));

      const stat = fs.statSync(filePath);
      res.setHeader('Content-Length', stat.size);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) { next(err); }
}

module.exports = { getFileToken, serveFile };
