import type { Guide } from '../types';

export const adminGuide: Guide = {
  role: 'admin',
  title: 'Admin Guide',
  description: 'Everything a school owner or tenant admin needs to set up, run, and grow their academy on Coursel.',
  articles: [
    {
      slug: 'getting-started',
      title: 'Getting Started as an Admin',
      summary: 'A tour of your dashboard and the first things to set up after signing up.',
      icon: '🚀',
      blocks: [
        { type: 'p', text: 'When you register a new school on Coursel, you land on your own Dashboard — this is your control center for everything: courses, students, instructors, payments, and your public website.' },
        {
          type: 'steps',
          items: [
            'Open the sidebar and note the four main areas: Learning (courses, quizzes, assignments, certificates), Monetization (website builder, coupons, bundles, groups), Engage (chat, announcements, submissions), and Admin (users, billing, media).',
            'Go to Settings and set your school name, logo, and brand color — this instantly re-colors your entire dashboard and public website to match your brand.',
            'If you have a custom domain, add it under Settings → Domain, then follow the DNS instructions shown there.',
            'Check your Dashboard home page for the "Get started" checklist — it tracks branding, your first course, your first instructor, and your first student, and disappears once all four are done.',
          ],
        },
        { type: 'tip', text: 'You don\'t have to finish every setup step before inviting people — students and instructors can join while you\'re still building your first course.' },
      ],
    },
    {
      slug: 'building-your-website',
      title: 'Building Your Website',
      summary: 'Use the Website Builder to launch a public site for your school with pages, branding, and a design library.',
      icon: '🎨',
      blocks: [
        { type: 'p', text: 'Every school gets a public website at its own subdomain (e.g. yourschool.coursel.space, or your own custom domain once connected). The Website Builder is where you design it.' },
        {
          type: 'steps',
          items: [
            'Open Website Builder from the sidebar. You\'ll see your current pages (Home, About, Contact by default) listed on the left.',
            'Open the Design Library to browse pre-built designs and apply one with a single click — this replaces your page content with a fully designed starting point you can still edit afterward.',
            'Click any page to edit it section by section — each section (Hero, About, Courses, Testimonials, Contact, CTA) has its own editable fields like headline, image, and button text.',
            'Use "Add Page" to create additional pages (e.g. an FAQ or a special landing page), and drag sections to reorder them within a page.',
            'Edit your Header and Footer once — these apply across every page of your site automatically.',
            'Use the live Preview panel to see exactly what visitors will see as you edit, then Publish the page when you\'re happy with it.',
          ],
        },
        { type: 'tip', text: 'Unpublished pages are only visible to you in the builder — visitors never see a page until you publish it.' },
      ],
    },
    {
      slug: 'creating-a-course',
      title: 'Creating a Course',
      summary: 'The full step-by-step walkthrough for building a course from scratch, publishing it, and opening enrollment.',
      icon: '📚',
      blocks: [
        { type: 'p', text: 'Courses are the core of your school. Here is every step, from a blank course to a published, sellable one.' },
        {
          type: 'steps',
          items: [
            'Go to Courses → New Course.',
            'Fill in the course title, a short description, and choose a category — these are what students see on your course listing pages.',
            'Upload a course thumbnail image — this appears on course cards across your site and dashboard.',
            'Add Sections to organize your course (e.g. "Module 1: Introduction"). A course can have as many sections as you need.',
            'Inside each section, add Lessons. A lesson can be a video (upload a file or paste a link), a text/article lesson, a downloadable attachment, or a SCORM package for interactive content.',
            'Optionally attach a Quiz to a section or lesson — build the quiz separately under Quizzes, then link it in from the course editor (see the Quizzes & Assignments guide for how to build one).',
            'Set enrollment options: choose whether the course is free or paid, set a price, and decide whether students self-enroll or need approval via a course application.',
            'Assign an Instructor to the course if someone other than you will teach it, under the course\'s Instructors tab.',
            'Preview the course exactly as a student would see it using the Preview button.',
            'When everything looks right, switch the course from Draft to Published — only published courses appear on your public site and are enrollable.',
          ],
        },
        { type: 'tip', text: 'You can keep a course in Draft indefinitely while you build it out — nothing is visible to students until you publish.' },
        { type: 'tip', text: 'Certificates, if enabled, are issued automatically once a student completes 100% of a course — set this up once in the Certificates section below.' },
      ],
    },
    {
      slug: 'managing-instructors-and-students',
      title: 'Managing Instructors & Students',
      summary: 'Invite instructors, add students, and manage everyone\'s access from the Users page.',
      icon: '👥',
      blocks: [
        { type: 'p', text: 'The Users page is where you manage everyone who has an account on your school — instructors and students alike.' },
        {
          type: 'steps',
          items: [
            'Go to Users in the sidebar.',
            'Click "Invite" and choose whether you\'re inviting an Instructor or a Student, then enter their email address.',
            'They\'ll receive an email invitation to set up their account and log in.',
            'Alternatively, share an Enrollment Link or Share Link (from a specific course) so people can self-register as students without an individual invite.',
            'From the Users list, you can view each person\'s enrolled/taught courses, deactivate an account, or resend an invitation that hasn\'t been accepted yet.',
          ],
        },
        { type: 'tip', text: 'Instructors can only manage the courses assigned to them — they don\'t see your billing, other instructors\' courses, or school-wide settings.' },
      ],
    },
    {
      slug: 'quizzes-and-assignments',
      title: 'Quizzes & Assignments',
      summary: 'How quizzes and assignments work across your school, and what you can oversee as an admin.',
      icon: '📝',
      blocks: [
        { type: 'p', text: 'Quizzes and assignments can be created by you or by instructors, and are attached to courses to test and reinforce learning.' },
        {
          type: 'steps',
          items: [
            'Go to Quizzes → New Quiz to build one: add a title, a time limit (optional), and questions — supporting multiple choice, true/false, short answer, and more.',
            'Set a passing score and choose whether students can retake the quiz.',
            'Attach the quiz to a course section from either the Quizzes page or the course editor.',
            'Go to Assignments → New Assignment to create a task students submit work for — add instructions, a due date, and a maximum score.',
            'As submissions come in, open the assignment to grade each one and leave feedback — students are notified automatically.',
          ],
        },
        { type: 'tip', text: 'As admin, you can see every quiz and assignment across all instructors and courses — useful for spot-checking quality before a course goes live.' },
      ],
    },
    {
      slug: 'certificates',
      title: 'Certificates',
      summary: 'Design a certificate template and have it issued automatically when students finish a course.',
      icon: '🏆',
      blocks: [
        {
          type: 'steps',
          items: [
            'Go to Certificate Builder in the sidebar.',
            'Design your certificate template: add your school logo, choose a layout, and place fields like student name, course title, and completion date.',
            'Save the template, then assign it to one or more courses.',
            'Once a student completes 100% of a course that has a certificate template assigned, their certificate is generated and issued automatically — no manual step needed.',
            'Every issued certificate has a public verification link, so anyone can confirm it\'s genuine by visiting that link.',
          ],
        },
      ],
    },
    {
      slug: 'selling-and-monetization',
      title: 'Selling & Monetization',
      summary: 'Coupons, bundles, membership plans, groups, and cohorts — the tools for pricing and selling your courses.',
      icon: '💰',
      blocks: [
        { type: 'p', text: 'Beyond single-course pricing, Coursel gives you several ways to package and sell what you teach.' },
        {
          type: 'list',
          items: [
            'Coupons — create discount codes with a percentage or fixed amount off, an expiry date, and a usage limit, from the Coupons page.',
            'Bundles — group several courses together and sell them at one combined price from the Bundles page.',
            'Membership Plans — offer a recurring subscription that gives students ongoing access to a set of courses, managed from Membership Plans.',
            'Groups — organize students into groups (e.g. a cohort of a corporate client) for easier bulk management and reporting.',
            'Cohorts — run a course on a fixed schedule with a defined start date, useful for live, date-bound programs rather than always-open self-paced courses.',
          ],
        },
        { type: 'tip', text: 'You can combine these — for example, a bundle can be discounted further with a coupon at checkout.' },
      ],
    },
    {
      slug: 'billing-and-subscription',
      title: 'Billing & Subscription',
      summary: 'Understand your plan, usage limits, and how to upgrade.',
      icon: '💳',
      blocks: [
        {
          type: 'steps',
          items: [
            'Go to Billing in the sidebar to see your current plan, its limits (students, instructors, courses, storage), and your usage against those limits.',
            'To upgrade or change plans, choose a new plan from the Billing page and complete checkout — your new limits apply immediately.',
            'Payment history and invoices are listed on the same page for your records.',
            'If your subscription lapses, you and your team can still log in to reactivate billing — your data is never deleted, but student-facing features pause until you\'re back on an active plan.',
          ],
        },
      ],
    },
    {
      slug: 'managing-inquiries',
      title: 'Managing Inquiries',
      summary: 'Contact form submissions, course applications, and refund requests — where they show up and how to act on them.',
      icon: '📥',
      blocks: [
        {
          type: 'list',
          items: [
            'Contact Submissions — messages sent through your public website\'s contact form land here; mark each as read/resolved as you handle it.',
            'Course Applications — if a course requires approval to enroll, applications appear here for you to approve or reject.',
            'Refund Requests — students can request a refund on a paid course; review and approve or deny each request from this page.',
          ],
        },
        { type: 'tip', text: 'Unread items in each of these sections show a badge count in the sidebar so nothing gets missed.' },
      ],
    },
  ],
};
