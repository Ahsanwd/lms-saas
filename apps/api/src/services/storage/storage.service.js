const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const { v4: uuidv4 } = require('uuid');
const config  = require('../../config');
const AppError = require('../../utils/AppError');

const UPLOAD_ROOT = path.resolve(config.storage.localPath || './uploads');
const USE_S3      = config.storage.driver === 's3';

const ALLOWED_TYPES = {
  thumbnail: ['image/jpeg', 'image/png', 'image/webp'],
  video:     ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
  chat: [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
  ],
  attachment: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'text/plain',
    'image/jpeg', 'image/png', 'image/webp',
  ],
};

const MAX_SIZE = {
  thumbnail:  5   * 1024 * 1024,        // 5 MB
  video:      2   * 1024 * 1024 * 1024, // 2 GB
  attachment: 50  * 1024 * 1024,        // 50 MB
  chat:       10  * 1024 * 1024,        // 10 MB
};

// ── Build S3Client (lazy singleton) ──────────────────────────────────────────

let _s3Client = null;
function getS3Client() {
  if (_s3Client) return _s3Client;
  const { S3Client } = require('@aws-sdk/client-s3');
  const s3 = config.storage.s3;
  _s3Client = new S3Client({
    region: s3.region || 'auto',
    endpoint: s3.endpoint || undefined,
    credentials: {
      accessKeyId:     s3.accessKeyId,
      secretAccessKey: s3.secretAccessKey,
    },
  });
  return _s3Client;
}

function r2PublicUrl(key) {
  const s3 = config.storage.s3;
  if (s3.cdnUrl) return `${s3.cdnUrl}/${key}`;
  // R2 public URL format (requires bucket to have public access enabled)
  return `${s3.endpoint}/${s3.bucket}/${key}`;
}

// ── Custom multer storage engine for R2 ───────────────────────────────────────
// Implements the multer storage engine interface (_handleFile / _removeFile).
// After upload, sets file.path = public R2 URL so controllers need no changes.

class R2StorageEngine {
  constructor(category) {
    this.category = category;
  }

  _handleFile(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const key = `${this.category}s/${uuidv4()}${ext}`;

    // Collect stream into buffer
    const chunks = [];
    file.stream.on('data', chunk => chunks.push(chunk));
    file.stream.on('error', cb);
    file.stream.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const { PutObjectCommand } = require('@aws-sdk/client-s3');
        await getS3Client().send(new PutObjectCommand({
          Bucket:      config.storage.s3.bucket,
          Key:         key,
          Body:        buffer,
          ContentType: file.mimetype,
        }));

        cb(null, {
          key,
          path:     r2PublicUrl(key),  // controllers read req.file.path
          size:     buffer.length,
          filename: path.basename(key),
        });
      } catch (err) {
        cb(err);
      }
    });
  }

  _removeFile(req, file, cb) {
    if (!file.key) return cb(null);
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    getS3Client()
      .send(new DeleteObjectCommand({ Bucket: config.storage.s3.bucket, Key: file.key }))
      .then(() => cb(null))
      .catch(cb);
  }
}

// ── Local disk storage ────────────────────────────────────────────────────────

function getLocalStorage(category) {
  const dest = path.join(UPLOAD_ROOT, `${category}s`);
  fs.mkdirSync(dest, { recursive: true });
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dest),
    filename:    (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${uuidv4()}${ext}`);
    },
  });
}

// ── Public upload() function (used by all routes) ────────────────────────────
// Returns a configured multer instance.
// STORAGE_DRIVER=local  → saves to disk, req.file.path = absolute fs path
// STORAGE_DRIVER=s3     → uploads to R2,  req.file.path = public R2 URL

function upload(category) {
  const storage = USE_S3
    ? new R2StorageEngine(category)
    : getLocalStorage(category);

  return multer({
    storage,
    limits:     { fileSize: MAX_SIZE[category] || MAX_SIZE.attachment },
    fileFilter: (req, file, cb) => {
      const allowed = ALLOWED_TYPES[category] || [];
      if (!allowed.includes(file.mimetype)) {
        return cb(new AppError(`File type not allowed for ${category}`, 400));
      }
      cb(null, true);
    },
  });
}

// ── getPublicUrl ──────────────────────────────────────────────────────────────
// Local: converts absolute fs path → https://api.host/uploads/...
// R2:    path is already a full URL — returned as-is

function getPublicUrl(filePath) {
  if (!filePath) return null;
  // Already a full URL (R2 upload or external link)
  if (filePath.startsWith('http')) return filePath;
  // Local path → public URL
  const relative = path.relative(UPLOAD_ROOT, filePath).replace(/\\/g, '/');
  return `${config.app.apiUrl}/uploads/${relative}`;
}

// ── deleteFile ────────────────────────────────────────────────────────────────

async function deleteFile(fileRef) {
  if (!fileRef) return;
  try {
    if (USE_S3) {
      // Extract key from URL
      const s3 = config.storage.s3;
      const base = s3.cdnUrl || `${s3.endpoint}/${s3.bucket}`;
      if (!fileRef.startsWith(base)) return;
      const key = fileRef.slice(base.length + 1);
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
      await getS3Client().send(new DeleteObjectCommand({ Bucket: s3.bucket, Key: key }));
    } else {
      const filePath = _resolveToPath(fileRef);
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  } catch { /* non-fatal */ }
}

function _resolveToPath(fileRef) {
  if (!fileRef) return null;
  if (fileRef.startsWith('http')) {
    const prefix = `${config.app.apiUrl}/uploads/`;
    if (!fileRef.startsWith(prefix)) return null;
    return path.join(UPLOAD_ROOT, fileRef.slice(prefix.length));
  }
  return fileRef;
}

// ── getFileSizeBytes ──────────────────────────────────────────────────────────

function getFileSizeBytes(fileRef) {
  try {
    if (USE_S3 || (fileRef && fileRef.startsWith('http'))) return 0; // size tracked at upload time
    const filePath = _resolveToPath(fileRef);
    if (!filePath) return 0;
    return fs.statSync(filePath).size;
  } catch { return 0; }
}

// ── Presigned upload URL (large video direct-to-R2 from browser) ──────────────

async function generatePresignedUploadUrl(key, mimetype, expiresIn = 3600) {
  const s3 = config.storage.s3;
  if (!s3.bucket || !s3.accessKeyId) {
    throw new AppError('R2/S3 storage is not configured. Set STORAGE_DRIVER=s3 and S3_* env vars.', 500);
  }

  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl }     = require('@aws-sdk/s3-request-presigner');

  const command = new PutObjectCommand({
    Bucket:      s3.bucket,
    Key:         key,
    ContentType: mimetype,
  });

  const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn });
  const publicUrl = r2PublicUrl(key);

  return { uploadUrl, publicUrl, key };
}

module.exports = {
  upload,
  getPublicUrl,
  deleteFile,
  getFileSizeBytes,
  generatePresignedUploadUrl,
  UPLOAD_ROOT,
};
