const logger                = require('../utils/logger');
const { queueEmail }        = require('./email.job');
const Tenant                = require('../database/models/Tenant.model');
const User                  = require('../database/models/User.model');
const Enrollment            = require('../database/models/Enrollment.model');
const CoursePayment         = require('../database/models/CoursePayment.model');
const LessonProgress        = require('../database/models/LessonProgress.model');
const mongoose              = require('mongoose');
const analyticsWeeklySummaryTemplate = require('../services/email/templates/analyticsWeeklySummary');

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

async function runAnalyticsWeeklyReport() {
  const now     = new Date();
  const since   = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const dateFilter = { $gte: since, $lte: now };

  const tenants = await Tenant.find({ status: 'active', deletedAt: null })
    .select('name contactEmail settings emailSettings').lean();

  logger.info(`[analytics.report] Sending weekly summary to ${tenants.length} tenant(s)`);

  for (const tenant of tenants) {
    try {
      const tid = new mongoose.Types.ObjectId(tenant._id);

      const admin = await User.findOne({ tenantId: tid, role: 'tenant_admin', deletedAt: null })
        .select('firstName email').lean();
      if (!admin?.email) continue;

      const [newStudents, newEnrollments, completions, revenueAgg, topCourses] = await Promise.all([
        User.countDocuments({ tenantId: tid, role: 'student', deletedAt: null, createdAt: dateFilter }),
        Enrollment.countDocuments({ tenantId: tid, enrolledAt: dateFilter }),
        Enrollment.countDocuments({ tenantId: tid, status: 'completed', updatedAt: dateFilter }),
        CoursePayment.aggregate([
          { $match: { tenantId: tid, status: 'completed', createdAt: dateFilter } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        LessonProgress.aggregate([
          { $match: { tenantId: tid, updatedAt: dateFilter } },
          { $group: { _id: '$courseId', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 3 },
          { $lookup: { from: 'courses', localField: '_id', foreignField: '_id', as: 'course' } },
          { $unwind: { path: '$course', preserveNullAndEmpty: true } },
        ]),
      ]);

      const stats = {
        newStudents,
        newEnrollments,
        completions,
        revenue: revenueAgg[0]?.total ?? 0,
        topCourses: topCourses.map(c => ({
          title: c.course?.title ?? 'Unknown',
          count: c.count,
        })),
      };

      const branding = {
        logoUrl:      tenant.settings?.logo         || null,
        primaryColor: tenant.settings?.primaryColor || null,
      };

      await queueEmail({
        to: admin.email,
        tenantId: tenant._id.toString(),
        ...analyticsWeeklySummaryTemplate({
          adminName:    admin.firstName || 'Admin',
          tenantName:   tenant.name,
          stats,
          analyticsUrl: `${APP_URL}/analytics`,
          branding,
        }),
      });
    } catch (err) {
      logger.error(`[analytics.report] Failed for tenant ${tenant._id}: ${err.message}`);
    }
  }

  logger.info(`[analytics.report] Weekly summary job complete`);
}

module.exports = { runAnalyticsWeeklyReport };
