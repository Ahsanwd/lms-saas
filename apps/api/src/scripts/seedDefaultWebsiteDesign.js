// Seeds the one default Website Design applied to every new tenant at
// signup (registerTenant() in auth.service.js). Upsert-by-slug — safe to
// re-run any time content needs tweaking (same idempotent pattern already
// used for plan seeding in seed.js).
//
// Usage: node src/scripts/seedDefaultWebsiteDesign.js
require('dotenv').config();
require('dns').setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const config = require('../config');

const DESIGN_SLUG = 'default';

const pages = [
  {
    slug: 'home',
    title: 'Home',
    isHomePage: true,
    navOrder: 0,
    instituteType: null,
    sections: [
      {
        type: 'hero',
        order: 0,
        data: {
          headline: 'Learn Without Limits',
          subheadline: 'Practical, hands-on courses taught by real practitioners — built to get you job-ready, on your own schedule.',
          ctaText: 'Get Started',
          ctaLink: '/register',
          backgroundImageUrl: null,
        },
      },
      {
        type: 'about',
        order: 1,
        data: {
          heading: 'About Us',
          body: 'We believe great education should be accessible, practical, and genuinely enjoyable. Our courses are built by instructors who\'ve done the work themselves — not just taught it.',
          imageUrl: null,
          ctaText: 'Learn More',
          ctaLink: '/about',
        },
      },
      {
        type: 'coursesSection',
        order: 2,
        data: {
          heading: 'Our Courses',
          subheading: 'Explore what you can learn with us.',
          displayMode: 'all',
          categoryId: null,
          courseIds: [],
          layout: 'grid',
        },
      },
      {
        type: 'testimonials',
        order: 3,
        data: [
          { name: 'Sarah M.', role: 'Student', quote: 'The hands-on approach made all the difference — I actually retained what I learned.', avatarUrl: null },
          { name: 'James O.', role: 'Student', quote: 'Clear, practical, and genuinely engaging from start to finish.', avatarUrl: null },
          { name: 'Priya K.', role: 'Parent', quote: 'My child looks forward to every class. Couldn\'t ask for more.', avatarUrl: null },
        ],
      },
      {
        type: 'cta',
        order: 4,
        data: {
          heading: 'Ready to get started?',
          subtext: 'Join today and take the first step toward your goals.',
          buttonText: 'Sign Up Free',
          buttonLink: '/register',
        },
      },
    ],
  },
  {
    slug: 'about',
    title: 'About',
    isHomePage: false,
    navOrder: 1,
    instituteType: null,
    sections: [
      {
        type: 'about',
        order: 0,
        data: {
          heading: 'About Us',
          body: 'We\'re on a mission to make high-quality education accessible to everyone, everywhere. Our team of instructors brings real-world experience into every course, so what you learn here actually applies out there.\n\nWhether you\'re just starting out or leveling up an existing skill, we\'ve built this place to meet you where you are and help you get where you\'re going.',
          imageUrl: null,
          ctaText: 'Browse Our Courses',
          ctaLink: '/courses',
        },
      },
    ],
  },
  {
    slug: 'contact',
    title: 'Contact',
    isHomePage: false,
    navOrder: 2,
    instituteType: null,
    sections: [
      {
        type: 'contact',
        order: 0,
        data: { email: '', phone: '', address: '' },
      },
    ],
  },
];

async function seed() {
  await mongoose.connect(config.mongodb.uri);
  console.log('Connected to MongoDB');

  const WebsiteDesign = require('../database/models/WebsiteDesign.model');
  const { RESERVED_SLUGS } = require('../modules/tenantPage/tenantPage.service');

  for (const page of pages) {
    if (page.slug !== 'home' && RESERVED_SLUGS.has(page.slug)) {
      throw new Error(`Seed page slug "${page.slug}" collides with a reserved app route — pick a different slug.`);
    }
  }

  const design = await WebsiteDesign.findOneAndUpdate(
    { slug: DESIGN_SLUG },
    {
      $set: {
        name: 'Default',
        description: 'The starter design every new tenant gets at signup — a populated Home, About, and Contact page.',
        isDefault: true,
        isActive: true,
        header: {},
        footer: {},
        pages,
      },
    },
    { upsert: true, new: true }
  );

  console.log(`Seeded design "${design.name}" (${design._id}), isDefault=${design.isDefault}, ${design.pages.length} pages`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
