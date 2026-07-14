const mongoose = require('mongoose');
const softDeletePlugin = require('../plugins/softDelete.plugin');
const auditFieldsPlugin = require('../plugins/auditFields.plugin');

const attachmentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  mimeType: { type: String, default: null },
  sizeBytes: { type: Number, default: 0 },
}, { _id: true });

const lessonSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },

    title: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['video', 'text', 'file', 'quiz', 'audio', 'live'],
      required: true,
    },
    order: { type: Number, required: true, default: 0 },
    isPublished:       { type: Boolean, default: false },
    isPreview:         { type: Boolean, default: false },
    discussionEnabled: { type: Boolean, default: false },
    // Drip: 0 = available immediately; N = unlock N days after enrollment
    dripDays: { type: Number, default: 0, min: 0 },
    // Absolute release date (alternative to dripDays; if set, takes precedence)
    dripDate: { type: Date, default: null },

    // For type = 'text'
    content: { type: String, default: null },

    // For type = 'video'
    video: {
      url:             { type: String, default: null },
      durationSeconds: { type: Number, default: 0 },
      provider: {
        type: String,
        enum: ['local', 's3', 'youtube', 'vimeo', 'bunny', 'cloudflare', 'external', 'embed'],
        default: 'local',
      },
      thumbnailUrl: { type: String, default: null },
      embedCode:    { type: String, default: null }, // raw HTML for 'embed' provider
      // Video delivery settings
      settings: {
        watermarkText:      { type: String, default: null },
        watermarkEnabled:   { type: Boolean, default: false },
        disableDownload:    { type: Boolean, default: false },
        allowSpeedControl:  { type: Boolean, default: true },
      },
    },

    // For type = 'audio'
    audio: {
      url:             { type: String, default: null },
      durationSeconds: { type: Number, default: 0 },
      provider: {
        type: String,
        enum: ['local', 's3', 'external', 'soundcloud', 'spotify', 'embed'],
        default: 'local',
      },
      embedCode: { type: String, default: null }, // raw HTML for 'embed' / SoundCloud widget
    },

    // For type = 'file' (includes PDF, Word, Excel, PowerPoint, Text)
    file: {
      url:       { type: String, default: null },
      name:      { type: String, default: null },
      mimeType:  { type: String, default: null },
      sizeBytes: { type: Number, default: 0 },
      provider: {
        type: String,
        enum: ['local', 's3', 'external', 'gdrive', 'dropbox', 'onedrive', 'embed'],
        default: 'local',
      },
      embedCode:     { type: String, default: null },
      // Converted HTML for Word/Excel (populated async after upload)
      convertedHtml: { type: String, default: null },
      isConverted:   { type: Boolean, default: false },
    },

    // For type = 'live'
    liveClass: {
      meetingUrl:      { type: String, default: null },
      platform: {
        type: String,
        enum: ['zoom', 'meet', 'teams', 'youtube_live', 'custom'],
        default: 'zoom',
      },
      scheduledAt:     { type: Date,    default: null },
      durationMinutes: { type: Number,  default: 60 },
      instructions:    { type: String,  default: null },

      // Session lifecycle
      status: {
        type: String,
        enum: ['scheduled', 'live', 'ended', 'cancelled'],
        default: 'scheduled',
      },
      liveStartedAt:  { type: Date,    default: null },
      liveEndedAt:    { type: Date,    default: null },

      // Recording
      recordingUrl:   { type: String,  default: null },

      // Attendance
      attendanceEnabled: { type: Boolean, default: true },
      checkinWindowHours: { type: Number, default: 24 }, // hours after session ends when self check-in is allowed

      // Zoom auto-created meeting ID (used to regenerate/delete via API)
      zoomMeetingId: { type: String, default: null },
      // Which ZoomCredential actually hosted this meeting (null = tenant's
      // shared account, a User id = that instructor's own account) — recorded
      // at creation time so recording-fetch/delete/regenerate always target
      // the real host, never re-resolve via fallback logic after the fact.
      zoomHostUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

      // Restricts this session to one batch. null (default, every existing
      // lesson) means visible to every enrolled student, same as today.
      cohortId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cohort', default: null },
    },

    // Attachments available for any lesson type
    attachments: [attachmentSchema],

    // If type = 'quiz', stores reference to Quiz document
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', default: null },

    durationSeconds: { type: Number, default: 0 },
    notes: { type: String, default: null },
  },
  { timestamps: true }
);

lessonSchema.index({ tenantId: 1, courseId: 1, sectionId: 1, order: 1 });
lessonSchema.index({ tenantId: 1, courseId: 1, isPublished: 1 });

lessonSchema.plugin(softDeletePlugin);
lessonSchema.plugin(auditFieldsPlugin);

module.exports = mongoose.model('Lesson', lessonSchema);
