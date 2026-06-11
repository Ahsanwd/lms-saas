const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_HEX   = process.env.ENCRYPTION_KEY || '';

function getKey() {
  if (!KEY_HEX || KEY_HEX.length !== 64)
    throw new Error('ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  return Buffer.from(KEY_HEX, 'hex');
}

/**
 * Encrypt plaintext → returns "iv:authTag:ciphertext" (all hex), safe to store in DB.
 */
function encrypt(plaintext) {
  if (!plaintext) return null;
  const iv         = crypto.randomBytes(12);          // 96-bit IV for GCM
  const cipher     = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag    = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt "iv:authTag:ciphertext" → plaintext string.
 */
function decrypt(stored) {
  if (!stored) return null;
  const [ivHex, tagHex, dataHex] = stored.split(':');
  if (!ivHex || !tagHex || !dataHex) return null;
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(dataHex, 'hex')) + decipher.final('utf8');
}

module.exports = { encrypt, decrypt };
