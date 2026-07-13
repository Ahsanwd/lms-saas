const CohortMember = require('../models/CohortMember.model');

class CohortMemberRepository {
  // Cohort IDs a user actively belongs to for a given course (dropped members excluded).
  async findUserCohortIds(tenantId, userId, courseId) {
    const members = await CohortMember.find({ tenantId, userId, courseId, status: { $ne: 'dropped' } })
      .select('cohortId')
      .lean();
    return members.map((m) => m.cohortId.toString());
  }

  findUserCohortIdsAcrossTenant(tenantId, userId) {
    return CohortMember.find({ tenantId, userId, status: { $ne: 'dropped' } })
      .select('cohortId')
      .lean()
      .then((members) => members.map((m) => m.cohortId.toString()));
  }
}

module.exports = new CohortMemberRepository();
