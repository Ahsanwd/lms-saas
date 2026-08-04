import type { Guide } from '../types';

export const studentGuide: Guide = {
  role: 'student',
  title: 'Student Guide',
  description: 'How to find courses, enroll, learn, take quizzes and assignments, and earn certificates on Coursel.',
  articles: [
    {
      slug: 'getting-started',
      title: 'Getting Started as a Student',
      summary: 'Create your account and find your way around your dashboard.',
      icon: '🚀',
      blocks: [
        {
          type: 'steps',
          items: [
            'Sign up directly on the school\'s website, or accept an invitation email if your school added you directly.',
            'Once logged in, you land on your Student Dashboard — this shows your enrolled courses and recent activity at a glance.',
            'Use the sidebar to reach My Learning (your enrolled courses), Assignments, Quizzes, Certificates, and Chat.',
            'Visit Settings to add a profile photo and update your details.',
          ],
        },
      ],
    },
    {
      slug: 'enrolling-in-a-course',
      title: 'Enrolling in a Course',
      summary: 'How to browse, purchase, and enroll in a course — free, paid, bundled, or via membership.',
      icon: '🛒',
      blocks: [
        {
          type: 'steps',
          items: [
            'Browse available courses from your school\'s public website or the Courses page in your dashboard.',
            'Open a course to see its full description, curriculum outline, and price.',
            'For a free course, click Enroll and you\'re in immediately.',
            'For a paid course, click Enroll to go to checkout, apply a coupon code if you have one, and complete payment.',
            'Some courses are sold as part of a Bundle (several courses at one price) — enroll in the bundle once to get access to every course inside it.',
            'If your school offers Membership Plans, subscribing gives you ongoing access to every course included in that plan without buying them individually.',
            'If a course requires approval, submit your application and wait for the school to approve it — you\'ll be notified either way.',
          ],
        },
      ],
    },
    {
      slug: 'taking-a-course',
      title: 'Taking a Course',
      summary: 'How lessons, progress tracking, and live classes work once you\'re enrolled.',
      icon: '🎓',
      blocks: [
        {
          type: 'steps',
          items: [
            'Open the course from My Learning to enter the course player.',
            'Work through lessons in order — video lessons, text lessons, downloadable resources, and any interactive content are all in the same lesson list.',
            'Your progress is tracked automatically as you complete each lesson, shown as a percentage on the course.',
            'If the course includes live classes, you\'ll see scheduled sessions on the course page — join at the scheduled time from the same screen.',
            'Missed a live session? If a recording was enabled, it appears on the course page afterward.',
          ],
        },
        { type: 'tip', text: 'You can leave a course and come back anytime — your progress is saved automatically, nothing is lost.' },
      ],
    },
    {
      slug: 'quizzes',
      title: 'Quizzes',
      summary: 'How to take a quiz, see your score, and retake it if allowed.',
      icon: '📝',
      blocks: [
        {
          type: 'steps',
          items: [
            'Open a quiz from within its course section when you reach it in your lesson list.',
            'Answer each question — if the quiz has a time limit, it\'s shown on screen and the quiz submits automatically when time runs out.',
            'Submit the quiz to see your score immediately (if the instructor has enabled instant results).',
            'If you didn\'t reach the passing score and retakes are allowed, click Retake to try again.',
          ],
        },
      ],
    },
    {
      slug: 'assignments',
      title: 'Assignments',
      summary: 'How to submit an assignment and see your grade and feedback.',
      icon: '✅',
      blocks: [
        {
          type: 'steps',
          items: [
            'Open the assignment from your course to read the instructions and check the due date.',
            'Upload your work (file or written response, depending on what the assignment asks for) and click Submit.',
            'Once your instructor grades it, you\'ll get a notification with your score and any written feedback.',
            'Check the Assignments page anytime to see the status of everything you\'ve submitted — pending, graded, or overdue.',
          ],
        },
      ],
    },
    {
      slug: 'earning-certificates',
      title: 'Earning Certificates',
      summary: 'How certificates are issued and how to download or share yours.',
      icon: '🏆',
      blocks: [
        {
          type: 'steps',
          items: [
            'Complete 100% of a course that has a certificate enabled — this happens automatically as you finish lessons, no extra step needed.',
            'Your certificate appears on the Certificates page as soon as it\'s issued.',
            'Download it as a PDF or share the public verification link — anyone can use that link to confirm the certificate is genuine.',
          ],
        },
      ],
    },
    {
      slug: 'payments-and-membership',
      title: 'Payments & Membership',
      summary: 'Where to find your payment history and manage a membership subscription.',
      icon: '💳',
      blocks: [
        {
          type: 'list',
          items: [
            'Payment History — every purchase (courses, bundles, memberships) with receipts is listed on the Payment History page.',
            'Membership — if you\'re subscribed to a membership plan, manage or cancel it from the Membership page.',
            'Refunds — if you\'re not satisfied with a paid course, you can request a refund from your purchase; your school will review and respond to the request.',
          ],
        },
      ],
    },
    {
      slug: 'getting-help',
      title: 'Getting Help',
      summary: 'How to reach your instructor or school, and where course discussions happen.',
      icon: '💬',
      blocks: [
        {
          type: 'list',
          items: [
            'Chat — message your instructor or the school directly for questions.',
            'Forum — some courses have a discussion forum where you can ask questions and see what other students are asking.',
            'Announcements — check here for updates posted by your instructor or school.',
            'Contact — your school\'s public website has a contact form if you need to reach them outside of a specific course.',
          ],
        },
      ],
    },
  ],
};
