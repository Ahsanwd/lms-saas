const logger = require('../utils/logger');

// Zoom recordings take a few minutes to process after the meeting ends.
// This task fires 30 minutes after session end and polls the Zoom recordings API.
// If the recording is ready it saves the play URL to lesson.liveClass.recordingUrl.
// If not ready yet, it throws so the dispatcher retries with backoff.
async function handleZoomRecordingFetch(payload) {
  const { tenantId, lessonId, meetingId } = payload;

  const Lesson    = require('../database/models/Lesson.model');
  const zoomSvc   = require('../modules/zoom/zoom.service');

  const doc = await Lesson.findOne({ _id: lessonId, tenantId, type: 'live', deletedAt: null });
  if (!doc) return;

  // Already has a recording URL — skip
  if (doc.liveClass?.recordingUrl) return;

  const recordingUrl = await zoomSvc.fetchRecordingUrl(tenantId, meetingId);
  if (!recordingUrl) {
    // Recording not ready yet — throw to trigger retry
    throw new Error(`Recording not available yet for meeting ${meetingId}`);
  }

  await Lesson.findByIdAndUpdate(lessonId, {
    $set: { 'liveClass.recordingUrl': recordingUrl },
  });

  logger.info(`Zoom recording saved for lesson ${lessonId}: ${recordingUrl}`);
}

module.exports = { handleZoomRecordingFetch };
