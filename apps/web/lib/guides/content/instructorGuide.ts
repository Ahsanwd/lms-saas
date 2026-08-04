import type { Guide } from '../types';

export const instructorGuide: Guide = {
  role: 'instructor',
  title: 'Instructor Guide',
  description: 'How to create courses, build quizzes and assignments, run live classes, and support your students on Coursel.',
  articles: [
    {
      slug: 'getting-started',
      title: 'Getting Started as an Instructor',
      summary: 'What you can see and do once your school admin adds you as an instructor.',
      icon: '🚀',
      blocks: [
        { type: 'p', text: 'As an instructor, you get your own Dashboard scoped to the courses assigned to you — you won\'t see other instructors\' courses, billing, or school-wide settings.' },
        {
          type: 'steps',
          items: [
            'Accept your invitation email and log in — you\'ll land on your Instructor Dashboard.',
            'Check the sidebar: Learning (your courses, quizzes, assignments), Chat and Announcements to reach students, and Analytics to track performance.',
            'Open Profile & Settings to add a bio and profile photo — this appears on your courses\' public pages.',
            'If you were assigned an existing course, open it from Courses to review its content before students arrive.',
          ],
        },
      ],
    },
    {
      slug: 'creating-and-editing-a-course',
      title: 'Creating & Editing a Course',
      summary: 'Every step to build a course, from a blank page to publishing it for your students.',
      icon: '📚',
      blocks: [
        { type: 'p', text: 'If your admin has given you course-creation access, building a course works the same way end-to-end:' },
        {
          type: 'steps',
          items: [
            'Go to Courses → New Course.',
            'Enter the course title, description, and category, and upload a thumbnail image.',
            'Add Sections to structure the course (e.g. "Week 1", "Week 2").',
            'Inside each section, add Lessons — video (upload or link), text/article content, downloadable attachments, or SCORM packages.',
            'Attach a quiz to a section once you\'ve built one (see Building Quizzes below).',
            'Set the course to Draft while you\'re working on it — nothing is visible to students yet.',
            'Use Preview to check exactly what a student will see.',
            'When ready, publish the course — or notify your admin if publishing requires their approval on your school.',
          ],
        },
        { type: 'tip', text: 'You can go back and edit a published course at any time — sections, lessons, and quizzes can be added, reordered, or updated after launch.' },
      ],
    },
    {
      slug: 'building-quizzes',
      title: 'Building Quizzes',
      summary: 'Create quizzes, add questions, and attach them to your course sections.',
      icon: '📝',
      blocks: [
        {
          type: 'steps',
          items: [
            'Go to Quizzes → New Quiz.',
            'Give the quiz a title and, optionally, a time limit.',
            'Add questions — multiple choice, true/false, and short answer are all supported. Mark the correct answer(s) for each.',
            'Set a passing score percentage and choose whether students can retake the quiz if they don\'t pass.',
            'Save the quiz, then attach it to a course section from the course editor or directly from the quiz\'s own settings.',
            'View quiz analytics (average score, pass rate) once students start attempting it.',
          ],
        },
      ],
    },
    {
      slug: 'assignments-and-grading',
      title: 'Assignments & Grading',
      summary: 'Create assignments for students to submit, then review and grade their work.',
      icon: '✅',
      blocks: [
        {
          type: 'steps',
          items: [
            'Go to Assignments → New Assignment.',
            'Write clear instructions, set a due date, and set the maximum score.',
            'Attach the assignment to the relevant course/section so students see it in context.',
            'As students submit their work, open the assignment to see the list of submissions.',
            'Open each submission, enter a score, and leave written feedback — the student is notified automatically once you grade it.',
          ],
        },
        { type: 'tip', text: 'Submissions that come in after the due date are still visible and gradable — late submission is flagged for you, not blocked.' },
      ],
    },
    {
      slug: 'running-live-classes',
      title: 'Running Live Classes',
      summary: 'Schedule and host live sessions for students enrolled in your course.',
      icon: '🎥',
      blocks: [
        {
          type: 'steps',
          items: [
            'From your course, schedule a live session with a date and time — enrolled students see it on their course page and get notified.',
            'At the scheduled time, join the live room from your course — you\'ll have host controls (mute participants, share your screen).',
            'Students join from the same course page when the session goes live.',
            'Recordings, if enabled, are saved and made available to students afterward so anyone who missed it can catch up.',
          ],
        },
      ],
    },
    {
      slug: 'messaging-students',
      title: 'Messaging Students',
      summary: 'Use chat and announcements to communicate with your students.',
      icon: '💬',
      blocks: [
        {
          type: 'list',
          items: [
            'Chat — message individual students or groups directly for one-on-one questions and support.',
            'Announcements — post an update visible to everyone enrolled in a course, useful for schedule changes or new content drops.',
            'Notifications — students are notified automatically about grades, new announcements, and messages, so you don\'t need to chase them separately.',
          ],
        },
      ],
    },
    {
      slug: 'your-profile-and-settings',
      title: 'Your Profile & Settings',
      summary: 'Manage your instructor profile and account preferences.',
      icon: '⚙️',
      blocks: [
        {
          type: 'steps',
          items: [
            'Go to Settings to update your name, profile photo, and bio — your bio appears on the public page of every course you teach.',
            'Update your password and notification preferences from the same page.',
            'Check Analytics regularly to see enrollment trends and quiz/assignment performance across your courses.',
          ],
        },
      ],
    },
  ],
};
