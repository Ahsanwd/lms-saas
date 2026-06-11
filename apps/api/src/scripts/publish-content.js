require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config');

async function run() {
  await mongoose.connect(config.mongodb.uri);
  const Section = require('../database/models/Section.model');
  const Lesson = require('../database/models/Lesson.model');
  const s = await Section.updateMany({ isPublished: false }, { $set: { isPublished: true } });
  const l = await Lesson.updateMany({ isPublished: false }, { $set: { isPublished: true } });
  console.log(`Published ${s.modifiedCount} sections, ${l.modifiedCount} lessons`);
  await mongoose.disconnect();
}

run().catch(e => { console.error(e.message); process.exit(1); });
