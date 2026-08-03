// Seeds the Website Design library — the "Default" design applied to every
// new tenant at signup (registerTenant() in auth.service.js), plus any
// additional designs a tenant_admin can later apply from the Website
// Builder's design library. Upsert-by-slug per design — safe to re-run any
// time content needs tweaking (same idempotent pattern already used for
// plan seeding in seed.js).
//
// Usage: node src/scripts/seedDefaultWebsiteDesign.js
require('dotenv').config();
require('dns').setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const config = require('../config');

const defaultPages = [
  {
    slug: 'home',
    title: 'Home',
    isHomePage: true,
    isPublished: true,
    navOrder: 0,
    instituteType: null,
    sections: [
      {
        type: 'hero',
        order: 0,
        data: {
          eyebrow: 'Keep Learning',
          headline: 'Learn Without Limits',
          subheadline: 'Practical, hands-on courses taught by real practitioners — built to get you job-ready, on your own schedule.',
          ctaText: 'Get Started',
          ctaLink: '/register',
          backgroundImageUrl: null,
          badgeText: '⭐ 4.9 · 500+ students',
        },
      },
      {
        type: 'about',
        order: 1,
        data: {
          eyebrow: 'Who We Are',
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
          eyebrow: 'Explore',
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
          { name: 'Sarah M.', role: 'Student', quote: 'The hands-on approach made all the difference — I actually retained what I learned.', avatarUrl: null, rating: 5 },
          { name: 'James O.', role: 'Student', quote: 'Clear, practical, and genuinely engaging from start to finish.', avatarUrl: null, rating: 5 },
          { name: 'Priya K.', role: 'Parent', quote: 'My child looks forward to every class. Couldn\'t ask for more.', avatarUrl: null, rating: 5 },
        ],
      },
      {
        type: 'cta',
        order: 4,
        data: {
          eyebrow: 'Join Us',
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
    isPublished: true,
    navOrder: 1,
    instituteType: null,
    sections: [
      {
        type: 'about',
        order: 0,
        data: {
          eyebrow: 'Our Story',
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
    isPublished: true,
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

const warmAcademyPages = [
  {
    slug: 'home',
    title: 'Home',
    isHomePage: true,
    isPublished: true,
    navOrder: 0,
    instituteType: null,
    sections: [
      {
        type: 'hero',
        order: 0,
        data: {
          eyebrow: 'A Warm Welcome',
          headline: 'A Warm Place to Learn and Grow',
          subheadline: 'Friendly, hands-on classes where every student is known by name — for kids, teens, and lifelong learners alike.',
          ctaText: 'Join Our Community',
          ctaLink: '/register',
          backgroundImageUrl: null,
          badgeText: '💛 Loved by 300+ families',
        },
      },
      {
        type: 'about',
        order: 1,
        data: {
          eyebrow: 'Who We Are',
          heading: 'A Little About Us',
          body: 'We\'re more than a school — we\'re a community. Small classes, caring instructors, and a genuine love of learning are at the heart of everything we do.',
          imageUrl: null,
          ctaText: 'Get to Know Us',
          ctaLink: '/about',
        },
      },
      {
        type: 'coursesSection',
        order: 2,
        data: {
          eyebrow: 'Discover',
          heading: 'Explore Our Classes',
          subheading: 'Something for every curious mind.',
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
          { name: 'Amina R.', role: 'Parent', quote: 'My daughter runs to class every week — she\'s never been this excited about learning.', avatarUrl: null, rating: 5 },
          { name: 'Noah T.', role: 'Student', quote: 'It feels like a second family here, not just a classroom.', avatarUrl: null, rating: 5 },
          { name: 'Grace L.', role: 'Parent', quote: 'The instructors genuinely care. You can feel it in every class.', avatarUrl: null, rating: 5 },
        ],
      },
      {
        type: 'cta',
        order: 4,
        data: {
          eyebrow: 'Join Us',
          heading: 'Come learn with us',
          subtext: 'Enrollment is open — we\'d love to welcome you into our community.',
          buttonText: 'Join Our Community',
          buttonLink: '/register',
        },
      },
    ],
  },
  {
    slug: 'about',
    title: 'About',
    isHomePage: false,
    isPublished: true,
    navOrder: 1,
    instituteType: null,
    sections: [
      {
        type: 'about',
        order: 0,
        data: {
          eyebrow: 'Our Story',
          heading: 'A Little About Us',
          body: 'We started this place because we believe learning should feel warm, not intimidating. Every instructor here is chosen not just for what they know, but for how much they care about the people they teach.\n\nWhether you\'re here for a single class or a whole new path, we want you to feel like you belong from the very first day.',
          imageUrl: null,
          ctaText: 'See What We Offer',
          ctaLink: '/courses',
        },
      },
    ],
  },
  {
    slug: 'contact',
    title: 'Contact',
    isHomePage: false,
    isPublished: true,
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

const designs = [
  {
    slug: 'default',
    name: 'Default',
    description: 'The starter design every new tenant gets at signup — a populated Home, About, and Contact page.',
    isDefault: true,
    header: {},
    footer: {},
    pages: defaultPages,
  },
  {
    slug: 'warm-academy',
    name: 'Warm Academy',
    description: 'A warm, friendly light theme suited to schools and kids academies — softer colors, welcoming copy.',
    isDefault: false,
    header: { backgroundColor: '#FFF8F0', menuTextColor: '#7C4A2D', buttonStyle: 'solid' },
    footer: { backgroundColor: '#FDF3E7', textColor: '#9C6B47', tagline: 'Learning, the friendly way.' },
    pages: warmAcademyPages,
  },
];

async function seed() {
  await mongoose.connect(config.mongodb.uri);
  console.log('Connected to MongoDB');

  const WebsiteDesign = require('../database/models/WebsiteDesign.model');
  const { RESERVED_SLUGS } = require('../modules/tenantPage/tenantPage.service');

  for (const design of designs) {
    for (const page of design.pages) {
      if (page.slug !== 'home' && RESERVED_SLUGS.has(page.slug)) {
        throw new Error(`Design "${design.slug}" page slug "${page.slug}" collides with a reserved app route — pick a different slug.`);
      }
    }

    const saved = await WebsiteDesign.findOneAndUpdate(
      { slug: design.slug },
      {
        $set: {
          name: design.name,
          description: design.description,
          isDefault: design.isDefault,
          isActive: true,
          header: design.header,
          footer: design.footer,
          pages: design.pages,
        },
      },
      { upsert: true, new: true }
    );

    console.log(`Seeded design "${saved.name}" (${saved._id}), isDefault=${saved.isDefault}, ${saved.pages.length} pages`);
  }

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
