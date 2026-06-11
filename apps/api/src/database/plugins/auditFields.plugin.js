const mongoose = require('mongoose');

// Adds createdBy and updatedBy to every document automatically.
function auditFieldsPlugin(schema) {
  schema.add({
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  });
}

module.exports = auditFieldsPlugin;
