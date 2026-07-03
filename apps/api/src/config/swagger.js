const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'LMS SaaS API',
      version: '1.0.0',
      description: `
Multi-tenant LMS SaaS REST API.

## Authentication
All protected routes require a **Bearer token** in the \`Authorization\` header:
\`\`\`
Authorization: Bearer <accessToken>
\`\`\`
Tokens are obtained from \`POST /api/auth/login\`.

## Multi-tenancy
Every request is resolved to a tenant via the subdomain or \`x-tenant-id\` header.
All data is scoped to that tenant automatically.

## Response Format
All responses follow the shape:
\`\`\`json
{ "success": true, "data": { ... }, "message": "..." }
\`\`\`
Errors:
\`\`\`json
{ "success": false, "message": "...", "code": "ERROR_CODE" }
\`\`\`
      `,
    },
    servers: [
      { url: 'http://localhost:5000/api', description: 'Local development' },
      { url: 'https://api.yourdomain.com/api', description: 'Production' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token from POST /auth/login',
        },
      },
      schemas: {
        // ── Shared primitives ──────────────────────────────────────────────
        ObjectId: {
          type: 'string',
          pattern: '^[a-f\\d]{24}$',
          example: '664f1a2b3c4d5e6f7a8b9c0d',
        },
        Timestamp: {
          type: 'string',
          format: 'date-time',
          example: '2026-01-15T10:30:00.000Z',
        },
        Pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer', example: 42 },
            page:  { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            pages: { type: 'integer', example: 3 },
          },
        },
        ApiSuccess: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data:    { type: 'object' },
            message: { type: 'string', example: 'OK' },
          },
        },
        ApiError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Resource not found' },
            code:    { type: 'string', example: 'NOT_FOUND' },
          },
        },

        // ── Auth ──────────────────────────────────────────────────────────
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email:    { type: 'string', format: 'email', example: 'admin@acme.com' },
            password: { type: 'string', format: 'password', example: 'Secret123!' },
          },
        },
        RegisterRequest: {
          type: 'object',
          required: ['email', 'password', 'firstName', 'lastName'],
          properties: {
            email:     { type: 'string', format: 'email' },
            password:  { type: 'string', minLength: 8 },
            firstName: { type: 'string', example: 'Jane' },
            lastName:  { type: 'string', example: 'Doe' },
          },
        },
        AuthTokens: {
          type: 'object',
          properties: {
            accessToken:  { type: 'string' },
            refreshToken: { type: 'string' },
            expiresIn:    { type: 'integer', example: 900 },
          },
        },
        UserProfile: {
          type: 'object',
          properties: {
            _id:       { $ref: '#/components/schemas/ObjectId' },
            email:     { type: 'string', format: 'email' },
            firstName: { type: 'string' },
            lastName:  { type: 'string' },
            role:      { type: 'string', enum: ['super_admin', 'tenant_admin', 'instructor', 'student'] },
            avatar:    { type: 'string', nullable: true },
            createdAt: { $ref: '#/components/schemas/Timestamp' },
          },
        },

        // ── Course ────────────────────────────────────────────────────────
        CourseStatus: {
          type: 'string',
          enum: ['draft', 'published', 'archived'],
        },
        CourseLevel: {
          type: 'string',
          enum: ['beginner', 'intermediate', 'advanced'],
        },
        Course: {
          type: 'object',
          properties: {
            _id:             { $ref: '#/components/schemas/ObjectId' },
            title:           { type: 'string', example: 'Advanced React Patterns' },
            description:     { type: 'string' },
            slug:            { type: 'string', example: 'advanced-react-patterns' },
            status:          { $ref: '#/components/schemas/CourseStatus' },
            level:           { $ref: '#/components/schemas/CourseLevel' },
            isFree:          { type: 'boolean' },
            price:           { type: 'number', example: 49.99 },
            thumbnail:       { type: 'string', nullable: true },
            enrollmentCount: { type: 'integer' },
            totalLessons:    { type: 'integer' },
            totalSections:   { type: 'integer' },
            capacity:        { type: 'integer', example: 0, description: '0 = unlimited' },
            waitlistEnabled: { type: 'boolean' },
            createdAt:       { $ref: '#/components/schemas/Timestamp' },
          },
        },
        CreateCourseRequest: {
          type: 'object',
          required: ['title'],
          properties: {
            title:       { type: 'string', example: 'My New Course' },
            description: { type: 'string' },
            level:       { $ref: '#/components/schemas/CourseLevel' },
            isFree:      { type: 'boolean', default: false },
            price:       { type: 'number', example: 29.99 },
            capacity:    { type: 'integer', default: 0 },
          },
        },

        // ── Enrollment ────────────────────────────────────────────────────
        Enrollment: {
          type: 'object',
          properties: {
            _id:        { $ref: '#/components/schemas/ObjectId' },
            courseId:   { $ref: '#/components/schemas/ObjectId' },
            userId:     { $ref: '#/components/schemas/ObjectId' },
            status:     { type: 'string', enum: ['active', 'completed', 'expired', 'cancelled'] },
            pricePaid:  { type: 'number' },
            enrolledAt: { $ref: '#/components/schemas/Timestamp' },
            expiresAt:  { $ref: '#/components/schemas/Timestamp', nullable: true },
          },
        },
        EnrollRequest: {
          type: 'object',
          properties: {
            couponCode:   { type: 'string', example: 'SAVE20' },
            accessCode:   { type: 'string' },
          },
        },

        // ── Coupon ────────────────────────────────────────────────────────
        Coupon: {
          type: 'object',
          properties: {
            _id:          { $ref: '#/components/schemas/ObjectId' },
            code:         { type: 'string', example: 'SUMMER30' },
            description:  { type: 'string' },
            discountType: { type: 'string', enum: ['percentage', 'fixed'] },
            discountValue:{ type: 'number', example: 30 },
            maxUses:      { type: 'integer', example: 100, description: '0 = unlimited' },
            usedCount:    { type: 'integer', example: 12 },
            expiresAt:    { $ref: '#/components/schemas/Timestamp', nullable: true },
            isActive:     { type: 'boolean' },
          },
        },
        CreateCouponRequest: {
          type: 'object',
          required: ['code', 'discountType', 'discountValue'],
          properties: {
            code:              { type: 'string', example: 'SAVE20' },
            description:       { type: 'string' },
            discountType:      { type: 'string', enum: ['percentage', 'fixed'] },
            discountValue:     { type: 'number', example: 20 },
            maxUses:           { type: 'integer', default: 0 },
            expiresAt:         { type: 'string', format: 'date', nullable: true },
            applicableCourses: { type: 'array', items: { $ref: '#/components/schemas/ObjectId' } },
          },
        },

        // ── Waitlist ──────────────────────────────────────────────────────
        WaitlistEntry: {
          type: 'object',
          properties: {
            _id:      { $ref: '#/components/schemas/ObjectId' },
            position: { type: 'integer', example: 3 },
            status:   { type: 'string', enum: ['waiting', 'promoted', 'cancelled'] },
            joinedAt: { $ref: '#/components/schemas/Timestamp' },
            userId: {
              type: 'object',
              properties: {
                _id:       { $ref: '#/components/schemas/ObjectId' },
                firstName: { type: 'string' },
                lastName:  { type: 'string' },
                email:     { type: 'string' },
              },
            },
          },
        },

        // ── Quiz ──────────────────────────────────────────────────────────
        Quiz: {
          type: 'object',
          properties: {
            _id:               { $ref: '#/components/schemas/ObjectId' },
            title:             { type: 'string' },
            passingScore:      { type: 'integer', example: 70 },
            maxAttempts:       { type: 'integer', example: 3 },
            timerEnabled:      { type: 'boolean' },
            timerMinutes:      { type: 'integer' },
            questionCount:     { type: 'integer' },
            status:            { type: 'string', enum: ['draft', 'published'] },
          },
        },

        // ── Notification ──────────────────────────────────────────────────
        Notification: {
          type: 'object',
          properties: {
            _id:     { $ref: '#/components/schemas/ObjectId' },
            type:    { type: 'string', example: 'enrollment_confirmed' },
            title:   { type: 'string' },
            body:    { type: 'string' },
            isRead:  { type: 'boolean' },
            createdAt: { $ref: '#/components/schemas/Timestamp' },
          },
        },
      },

      responses: {
        Unauthorized: {
          description: 'Missing or invalid access token',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiError' },
              example: { success: false, message: 'Unauthorized', code: 'UNAUTHORIZED' },
            },
          },
        },
        Forbidden: {
          description: 'Insufficient permissions',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiError' },
              example: { success: false, message: 'Forbidden', code: 'FORBIDDEN' },
            },
          },
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiError' },
              example: { success: false, message: 'Not found', code: 'NOT_FOUND' },
            },
          },
        },
        BadRequest: {
          description: 'Validation error or bad input',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiError' },
            },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth',          description: 'Registration, login, tokens, 2FA, OAuth' },
      { name: 'Courses',       description: 'Course CRUD, publish, clone, curriculum' },
      { name: 'Enrollment',    description: 'Enroll, drop, my enrollments, certificates' },
      { name: 'Waitlist',      description: 'Join/leave waitlist, admin management' },
      { name: 'Coupons',       description: 'Coupon CRUD and validation' },
      { name: 'Quiz',          description: 'Quiz management and attempts' },
      { name: 'Assignments',   description: 'Assignment CRUD and submissions' },
      { name: 'Notifications', description: 'In-app notification inbox' },
      { name: 'Users',         description: 'User management' },
      { name: 'Groups',        description: 'Groups, chat, announcements' },
      { name: 'Cohorts',       description: 'Cohort enrollment and graduation' },
      { name: 'Analytics',     description: 'Tenant analytics and reports' },
      { name: 'Search',        description: 'Global search' },
      { name: 'Chat',          description: 'Direct messaging' },
      { name: 'Forum',         description: 'Course discussion forums' },
      { name: 'Payments',      description: 'Stripe payment initiation' },
      { name: 'Billing',       description: 'Subscription plans and invoices' },
    ],
  },
  // Scan all route files for @swagger JSDoc annotations
  // Use forward slashes — glob does not support Windows backslashes
  apis: [
    path.join(__dirname, '../modules/**/*.routes.js').replace(/\\/g, '/'),
    path.join(__dirname, '../routes/*.js').replace(/\\/g, '/'),
  ],
};

module.exports = swaggerJsdoc(options);
