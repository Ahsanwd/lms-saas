const Submission = require('../models/Submission.model');

class SubmissionRepository {
  findAll(tenantId, assignmentId, filter = {}, { page = 1, limit = 20 } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    const query = { tenantId, assignmentId, ...filter };
    return Promise.all([
      Submission.find(query)
        .populate('studentId', 'firstName lastName email')
        .populate('gradedBy', 'firstName lastName')
        .populate('comments.userId', 'firstName lastName role')
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Submission.countDocuments(query),
    ]);
  }

  findByStudent(tenantId, assignmentId, studentId) {
    return Submission.findOne({ tenantId, assignmentId, studentId })
      .populate('comments.userId', 'firstName lastName role');
  }

  findById(tenantId, id) {
    return Submission.findOne({ _id: id, tenantId })
      .populate('studentId', 'firstName lastName email')
      .populate('assignmentId', 'title totalMarks dueDate')
      .populate('gradedBy', 'firstName lastName');
  }

  // Upsert: a student can update their submission before due date.
  // Pass inc = { attemptCount: 1 } on re-submissions to track attempt number.
  upsert(tenantId, assignmentId, studentId, data, inc = null) {
    const update = { $set: data };
    if (inc) update.$inc = inc;
    return Submission.findOneAndUpdate(
      { tenantId, assignmentId, studentId },
      update,
      { new: true, upsert: true, runValidators: false }
    );
  }

  updateById(tenantId, id, update) {
    return Submission.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: update },
      { new: true }
    )
      .populate('studentId', 'firstName lastName email')
      .populate('gradedBy', 'firstName lastName');
  }

  countByAssignment(tenantId, assignmentId) {
    const { Types } = require('mongoose');
    return Submission.aggregate([
      { $match: { tenantId: new Types.ObjectId(tenantId), assignmentId: new Types.ObjectId(assignmentId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
  }

  addComment(tenantId, submissionId, comment) {
    return Submission.findOneAndUpdate(
      { _id: submissionId, tenantId },
      { $push: { comments: comment } },
      { new: true }
    ).populate('comments.userId', 'firstName lastName role');
  }

  // Get all submissions for a student across multiple assignments
  findByStudentBulk(tenantId, studentId, assignmentIds) {
    return Submission.find({
      tenantId,
      studentId,
      assignmentId: { $in: assignmentIds },
    }).select('assignmentId status marks submittedAt');
  }
}

module.exports = new SubmissionRepository();
