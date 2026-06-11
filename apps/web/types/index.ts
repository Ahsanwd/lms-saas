// ─── User & Auth ─────────────────────────────────────────────────────────────

export type Role = 'super_admin' | 'tenant_admin' | 'instructor' | 'student';

export interface User {
  _id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  status: 'unverified' | 'active' | 'suspended';
  avatar?: string;
  lastLoginAt?: string;
  twoFactorEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  sessionId: string;
  deviceInfo: {
    userAgent?: string;
    ip?: string;
  };
  lastUsedAt: string;
  createdAt: string;
  isCurrent?: boolean;
}

export interface AuthTokens {
  accessToken: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  tenantName?: string;
  subdomain?: string;
}

// ─── Tenant ───────────────────────────────────────────────────────────────────

export interface TenantSettings {
  logo?: string;
  primaryColor?: string;
  language: string;
  timezone: string;
  allowSelfRegistration: boolean;
  requireEmailVerification: boolean;
  idleTimeoutMinutes: number;
}

export interface Tenant {
  _id: string;
  name: string;
  subdomain: string;
  customDomain?: string;
  status: 'active' | 'suspended' | 'plan_expired' | 'deleted';
  settings: TenantSettings;
  storageUsedBytes: number;
  plan: Plan;
  createdAt: string;
}

// ─── Plan & Billing ───────────────────────────────────────────────────────────

export interface Plan {
  _id: string;
  name: string;
  slug: string;
  price: {
    monthly: number;
    yearly: number;
  };
  limits: {
    students: number;
    instructors: number;
    courses: number;
    storageGB: number;
    maxSessions: number;
  };
  features: string[];
  dbMode: 'shared' | 'dedicated';
}

export interface Subscription {
  _id: string;
  tenantId: string;
  planId: Plan;
  status: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'expired';
  billingCycle: 'monthly' | 'yearly';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialStart?: string;
  trialEnd?: string;
}

export interface Invoice {
  _id: string;
  invoiceNumber: string;
  tenantId: string;
  planId: Plan;
  subtotal: number;
  discountAmount: number;
  total: number;
  status: 'unpaid' | 'paid' | 'cancelled' | 'refunded';
  dueDate: string;
  paidAt?: string;
  createdAt: string;
}

// ─── Course ───────────────────────────────────────────────────────────────────

export type CourseLevel = 'beginner' | 'intermediate' | 'advanced';
export type CourseStatus = 'draft' | 'published' | 'archived';
export type LessonType = 'video' | 'text' | 'file' | 'quiz' | 'audio' | 'live';

export interface Category {
  _id: string;
  name: string;
  slug: string;
  parentId?: string;
  courseCount: number;
}

export interface Course {
  _id: string;
  title: string;
  slug: string;
  description: string;
  shortDescription?: string;
  thumbnail?: string;
  instructorId: User | string;
  categoryId: Category | string;
  level: CourseLevel;
  language?: string;
  tags?: string[];
  price: number;
  isFree: boolean;
  status: CourseStatus;
  totalSections: number;
  totalLessons: number;
  totalDurationSeconds: number;
  enrollmentCount: number;
  capacity?: number;
  waitlistEnabled?: boolean;
  enrollmentType?: 'open' | 'access_code' | 'approval';
  accessDurationDays?: number;
  trialEnabled?: boolean;
  trialDurationDays?: number;
  prerequisites?: Array<{ _id: string; title: string }> | string[];
  enrollmentStartsAt?: string | null;
  enrollmentEndsAt?: string | null;
  rating: { average: number; count: number };
  requirements?: string[];
  objectives?: string[];
  certificateEnabled?: boolean;
  allowPreview?: boolean;
  passingScore?: number;
  ctaLabel?: string;
  displayLayout?: 'classic' | 'hero' | 'minimal';
  createdAt: string;
}

export interface Section {
  _id: string;
  courseId: string;
  title: string;
  order: number;
  isPublished: boolean;
  totalLessons: number;
  totalDurationSeconds: number;
  lessons?: Lesson[];
}

export interface Lesson {
  _id: string;
  courseId: string;
  sectionId: string;
  title: string;
  type: LessonType;
  content?: string;
  dripDays: number;
  dripLockedUntil?: string | null;
  video?: {
    url: string | null;
    durationSeconds: number;
    provider: 'local' | 's3' | 'youtube' | 'vimeo' | 'bunny' | 'cloudflare' | 'external' | 'embed';
    thumbnailUrl?: string | null;
    embedCode?: string | null;
    settings?: {
      watermarkText?: string | null;
      watermarkEnabled?: boolean;
      disableDownload?: boolean;
      allowSpeedControl?: boolean;
    };
  };
  audio?: {
    url: string | null;
    durationSeconds: number;
    provider: 'local' | 's3' | 'external' | 'soundcloud' | 'spotify' | 'embed';
    embedCode?: string | null;
  };
  file?: {
    url: string | null;
    name: string | null;
    mimeType: string | null;
    sizeBytes: number;
    provider?: 'local' | 's3' | 'external' | 'gdrive' | 'dropbox' | 'onedrive' | 'embed';
    embedCode?: string | null;
  };
  liveClass?: {
    meetingUrl: string | null;
    platform: 'zoom' | 'meet' | 'teams' | 'youtube_live' | 'custom';
    scheduledAt: string | null;
    durationMinutes: number;
    instructions: string | null;
    status?: 'scheduled' | 'live' | 'ended' | 'cancelled';
    recordingUrl?: string | null;
    zoomMeetingId?: string | null;
  };
  attachments?: {
    _id: string;
    name: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
  }[];
  isPreview: boolean;
  isPublished: boolean;
  discussionEnabled: boolean;
  order: number;
}

export interface Enrollment {
  _id: string;
  courseId: Course | string;
  userId: User | string;
  status: 'active' | 'completed' | 'refunded';
  enrolledAt: string;
  completedAt?: string;
}

export interface CourseProgress {
  _id: string;
  courseId: string;
  userId: string;
  completedLessons: number;
  totalLessons: number;
  percentage: number;
  lastLessonId?: string;
}

// ─── Quiz ─────────────────────────────────────────────────────────────────────

export type QuestionType =
  | 'multiple_choice'
  | 'multiple_select'
  | 'true_false'
  | 'fill_blank'
  | 'short_answer'
  | 'essay'
  | 'matching'
  | 'ordering'
  | 'image';

export interface Question {
  _id: string;
  type: QuestionType;
  text: string;
  options?: Array<{ text: string; isCorrect: boolean }>;
  points: number;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
}

export interface Quiz {
  _id: string;
  courseId: string;
  title: string;
  settings: {
    timer?: number;
    maxAttempts: number;
    passingScore: number;
    negativeMarking: boolean;
    shuffleQuestions: boolean;
    showCorrectAnswers: boolean;
  };
  gradingType: 'auto' | 'manual' | 'mixed';
}

export interface QuizAttempt {
  _id: string;
  quizId: string;
  userId: string;
  status: 'in_progress' | 'submitted' | 'auto_graded' | 'manually_graded' | 'pending_manual';
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  startedAt: string;
  submittedAt?: string;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface SuperAdminStats {
  tenants:  { total: number; active: number; suspended: number; trial: number };
  users:    { total: number; students: number; instructors: number; tenantAdmins: number };
  courses:  { total: number };
  revenue:  { total: number; monthly: number; invoiceCount: number; monthlyHistory: unknown[] };
  alerts:   { expiringSubscriptions: unknown[]; unpaidInvoices: unknown[] };
}

export interface TenantAdminStats {
  users: { total: number; instructors: number; students: number };
  courses: { total: number; published: number };
  enrollments: { total: number; thisMonth: number };
  avgCompletion: number;
}

export interface InstructorStats {
  courses: { total: number; published: number; draft: number };
  students: { total: number; completed: number; averageCompletion: number };
  quizzes: { totalAttempts: number; averageScore: number; passRate: number; pendingGrades: number };
}

export interface StudentStats {
  enrollments: { total: number; active: number; completed: number };
  avgProgress: number;
  quizzesTaken: number;
  certificates: number;
}

// ─── Assignment ───────────────────────────────────────────────────────────────

export type AssignmentStatus = 'draft' | 'published' | 'archived';
export type SubmissionStatus = 'submitted' | 'late' | 'graded';

export interface DeadlineExtension {
  studentId: string;
  extendedDueDate: string;
  note: string | null;
  grantedAt: string;
}

export interface Assignment {
  _id: string;
  tenantId: string;
  courseId: { _id: string; title: string } | string;
  lessonId?: { _id: string; title: string } | string | null;
  instructorId: { _id: string; firstName: string; lastName: string; email: string } | string;
  title: string;
  description: string | null;
  instructions: string | null;
  attachmentUrl: string | null;
  dueDate: string | null;
  totalMarks: number;
  allowLateSubmission: boolean;
  allowedFileTypes: string[];
  extensions: DeadlineExtension[];
  myExtension?: { extendedDueDate: string; note: string | null } | null;
  status: AssignmentStatus;
  submissionCount: number;
  gradedCount: number;
  rubric: RubricCriterion[];
  maxSubmissions: number;
  createdAt: string;
  updatedAt: string;
}

export interface RubricCriterion {
  criterion: string;
  maxPoints: number;
}

export interface AssignmentTemplate {
  _id: string;
  instructorId: string;
  title: string;
  description: string | null;
  instructions: string | null;
  totalMarks: number;
  allowLateSubmission: boolean;
  rubric: RubricCriterion[];
  createdAt: string;
}

export interface RubricScore {
  criterion: string;
  maxPoints: number;
  awardedPoints: number;
}

export interface SubmissionComment {
  _id: string;
  userId: { _id: string; firstName: string; lastName: string; role: string } | string;
  text: string;
  createdAt: string;
}

export interface Submission {
  _id: string;
  assignmentId: { _id: string; title: string; totalMarks: number; dueDate: string | null } | string;
  studentId: { _id: string; firstName: string; lastName: string; email: string } | string;
  submissionText: string | null;
  fileUrl: string | null;
  originalFileName: string | null;
  submittedAt: string;
  marks: number | null;
  feedback: string | null;
  gradedBy: { _id: string; firstName: string; lastName: string } | string | null;
  gradedAt: string | null;
  status: SubmissionStatus;
  attemptCount: number;
  rubricScores: RubricScore[];
  comments: SubmissionComment[];
}

// ─── API ──────────────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}
