'use strict';

const https  = require('https');
const crypto = require('crypto');
const { encrypt, decrypt } = require('../../utils/crypto');

// ── Low-level Bunny.net API helper ────────────────────────────────────────────
function apiRequest(method, path, apiKey, body = null) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'video.bunnycdn.com',
      path,
      method,
      headers: {
        AccessKey: apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    };
    if (bodyStr) options.headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (!data.trim()) { resolve(null); return; }
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON from Bunny.net API')); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

async function testConnection(libraryId, apiKey) {
  const result = await apiRequest('GET', `/library/${libraryId}`, apiKey);
  if (!result || result.Id == null) throw new Error('Invalid Bunny.net credentials');
  return true;
}

async function createVideo(libraryId, apiKey, title) {
  const result = await apiRequest('POST', `/library/${libraryId}/videos`, apiKey, { title });
  if (!result?.guid) throw new Error('Failed to create video in Bunny.net');
  return { guid: result.guid };
}

// Generate TUS upload auth headers for direct browser → Bunny upload
function generateTusAuth(libraryId, apiKey, videoId) {
  const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  const signature = crypto
    .createHash('sha256')
    .update(String(libraryId) + apiKey + String(expiry) + videoId)
    .digest('hex');
  return { signature, expiry };
}

async function getVideoStatus(libraryId, apiKey, videoId) {
  const result = await apiRequest('GET', `/library/${libraryId}/videos/${videoId}`, apiKey);
  // Bunny status codes: 0=NotUploaded 1=Uploaded 2=Processing 3=Transcoding 4=Finished 5=Error 6=UploadFailed
  const statusMap = {
    0: 'not_uploaded', 1: 'uploaded', 2: 'processing',
    3: 'transcoding', 4: 'finished', 5: 'error', 6: 'failed',
  };
  return {
    guid:          result?.guid || videoId,
    status:        statusMap[result?.status] || 'unknown',
    readyToStream: result?.status === 4,
    duration:      result?.length || 0,
  };
}

async function deleteVideo(libraryId, apiKey, videoId) {
  await apiRequest('DELETE', `/library/${libraryId}/videos/${videoId}`, apiKey);
}

// Generate signed or unsigned embed URL for playback
function generateEmbedUrl(libraryId, videoId, tokenAuthKey) {
  if (tokenAuthKey) {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = crypto
      .createHash('sha256')
      .update(tokenAuthKey + videoId + expires)
      .digest('hex');
    return `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}?token=${token}&expires=${expires}`;
  }
  return `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}`;
}

module.exports = {
  testConnection, createVideo, generateTusAuth,
  getVideoStatus, deleteVideo, generateEmbedUrl,
  encrypt, decrypt,
};
