// Adds soft delete to collections. Excluded collections use hard delete.
// Excluded: payments, invoices, quiz_attempts, submissions, audit_logs, lesson_progress, course_progress
function softDeletePlugin(schema) {
  schema.add({
    deletedAt: { type: Date, default: null },
    deletedBy: { type: require('mongoose').Schema.Types.ObjectId, default: null, ref: 'User' },
  });

  schema.pre(/^find/, function (next) {
    if (!this.getFilter().deletedAt && !this._includeDeleted) {
      this.where({ deletedAt: null });
    }
    next();
  });

  schema.methods.softDelete = async function (userId) {
    this.deletedAt = new Date();
    this.deletedBy = userId;
    return this.save();
  };

  schema.methods.restore = async function () {
    this.deletedAt = null;
    this.deletedBy = null;
    return this.save();
  };

  schema.query.includeDeleted = function () {
    this._includeDeleted = true;
    return this;
  };

  schema.query.onlyDeleted = function () {
    this._includeDeleted = true;
    return this.where({ deletedAt: { $ne: null } });
  };
}

module.exports = softDeletePlugin;
