const WebsiteDesign = require('../models/WebsiteDesign.model');

class WebsiteDesignRepository {
  findDefault() {
    return WebsiteDesign.findOne({ isDefault: true, isActive: true });
  }

  findAll() {
    return WebsiteDesign.find({ isActive: true }).sort({ createdAt: 1 });
  }

  findBySlug(slug) {
    return WebsiteDesign.findOne({ slug });
  }

  findById(id) {
    return WebsiteDesign.findById(id);
  }

  create(data) {
    return WebsiteDesign.create(data);
  }
}

module.exports = new WebsiteDesignRepository();
