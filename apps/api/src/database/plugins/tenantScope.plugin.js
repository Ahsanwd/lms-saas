const mongoose = require('mongoose');

// Automatically scopes all queries to the current tenant.
// tenantId must be the first field in all compound indexes.
function tenantScopePlugin(schema) {
  schema.pre(/^find/, function (next) {
    if (this._tenantId) {
      this.where({ tenantId: this._tenantId });
    }
    next();
  });

  schema.pre('save', function (next) {
    if (!this.tenantId) {
      return next(new Error('tenantId is required'));
    }
    next();
  });

  schema.query.byTenant = function (tenantId) {
    this._tenantId = tenantId;
    return this.where({ tenantId });
  };
}

module.exports = tenantScopePlugin;
