require('dotenv').config();
const fs = require('fs');
const path = require('path');

const readKey = (inlineKey, keyPath) => {
  // Prefer inline env var (production/Render) over file path (local dev)
  if (inlineKey) return inlineKey.replace(/\\n/g, '\n');
  if (!keyPath) return null;
  const resolved = path.resolve(keyPath);
  if (!fs.existsSync(resolved)) return null;
  return fs.readFileSync(resolved, 'utf8');
};

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,

  mongodb: {
    uri: process.env.MONGODB_URI,
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    accessPrivateKey: readKey(process.env.JWT_ACCESS_PRIVATE_KEY, process.env.JWT_ACCESS_PRIVATE_KEY_PATH),
    accessPublicKey: readKey(process.env.JWT_ACCESS_PUBLIC_KEY, process.env.JWT_ACCESS_PUBLIC_KEY_PATH),
    refreshPrivateKey: readKey(process.env.JWT_REFRESH_PRIVATE_KEY, process.env.JWT_REFRESH_PRIVATE_KEY_PATH),
    refreshPublicKey: readKey(process.env.JWT_REFRESH_PUBLIC_KEY, process.env.JWT_REFRESH_PUBLIC_KEY_PATH),
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },

  email: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM,
  },

  app: {
    url: process.env.APP_URL || 'http://localhost:3000',
    apiUrl: process.env.API_URL || 'http://localhost:5000',
    requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION !== 'false',
  },

  storage: {
    driver: process.env.STORAGE_DRIVER || 'local',
    localPath: process.env.LOCAL_STORAGE_PATH || './uploads',
    s3: {
      bucket:          process.env.S3_BUCKET          || null,
      region:          process.env.S3_REGION          || 'us-east-1',
      endpoint:        process.env.S3_ENDPOINT        || null, // R2: https://<account>.r2.cloudflarestorage.com
      accessKeyId:     process.env.S3_ACCESS_KEY_ID     || null,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || null,
      cdnUrl:          process.env.CDN_URL             || null, // e.g. https://cdn.yourdomain.com
    },
  },

  log: {
    level: process.env.LOG_LEVEL || 'debug',
  },

  webPush: {
    publicKey:  process.env.VAPID_PUBLIC_KEY  || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject:    process.env.VAPID_SUBJECT     || `mailto:${process.env.EMAIL_FROM || 'no-reply@lms.com'}`,
  },
};
