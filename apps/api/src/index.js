require('dotenv').config();
// Override DNS to bypass broken local DNS proxy (127.0.0.1 not responding)
require('dns').setServers(['8.8.8.8', '8.8.4.4']);

// Prevent Redis/queue connection errors from crashing the process
process.on('unhandledRejection', (reason) => {
  require('./utils/logger').error('Unhandled Promise Rejection', { reason: String(reason) });
});
const http        = require('http');
const express     = require('express');
const helmet      = require('helmet');
const cors        = require('cors');
const compression = require('compression');
const morgan      = require('morgan');
const cookieParser = require('cookie-parser');
const { Server }  = require('socket.io');

const config = require('./config');
const logger = require('./utils/logger');
const { connectDefault } = require('./database/connection');
const swaggerUi   = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
require('./jobs/email.job'); // Register email job processor (Bull, optional — dormant when SKIP_REDIS=true)

// ── Background jobs — plain node-cron + MongoDB, no Redis/Bull ───────────────
// Group A: fixed daily/weekly cron jobs (membership renewal, tenant expiry,
// weekly analytics report, assignment-due reminders, trial-expiring reminders)
require('./jobs/scheduler');
// Group B: one-off delayed tasks (scheduled announcement publish, live-class
// reminders, zoom-recording fetch), polled from MongoDB every minute
require('./jobs/taskDispatcher');

const app    = express();
// Trust Render's proxy so express-rate-limit reads the correct client IP
app.set('trust proxy', 1);
const server = http.createServer(app);
const io     = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const appDomain = process.env.APP_DOMAIN;
      // Same fix as the Express CORS config below: escape every dot (not
      // just the first) and allow an optional :port, or a non-default-port
      // origin (any local/dev deployment) could never match.
      const domainRe  = appDomain ? new RegExp(`^https?://([a-z0-9-]+\\.)?${appDomain.replace(/\./g, '\\.')}(:\\d+)?$`) : null;
      const ok = /\.vercel\.app$/.test(origin)
        || /localhost/.test(origin)
        || (process.env.ALLOWED_ORIGIN && origin === process.env.ALLOWED_ORIGIN)
        || (domainRe && domainRe.test(origin));
      cb(null, ok);
    },
    credentials: true,
  },
});

const { setIO } = require('./services/socket/io');
setIO(io);

require('./modules/chat/chat.socket')(io);

// Attach io to every request so controllers can emit events
app.use((req, _res, next) => { req.io = io; next(); });

app.use(helmet());

// Build allowed origins from env — supports exact URLs and wildcard domain patterns
const _extraOrigin = process.env.ALLOWED_ORIGIN; // e.g. https://yourdomain.com
const _appDomain   = process.env.APP_DOMAIN;      // e.g. yourdomain.com  (for wildcard subdomains)
const allowedOrigins = [
  config.app.url,
  _extraOrigin,
  /\.vercel\.app$/,
  /localhost:\d+$/,
  // Match all subdomains of APP_DOMAIN (tenant subdomains). Escapes every
  // dot (String#replace with a string pattern only replaces the first
  // occurrence, which silently under-escaped any domain with 2+ dots) and
  // allows an optional :port — without it, a non-default-port origin (any
  // local/dev deployment) could never match, since the browser's Origin
  // header always includes an explicit port in that case.
  _appDomain ? new RegExp(`^https?://([a-z0-9-]+\\.)?${_appDomain.replace(/\./g, '\\.')}(:\\d+)?$`) : null,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const allowed = allowedOrigins.some(o =>
      o instanceof RegExp ? o.test(origin) : o === origin
    );
    cb(null, allowed ? origin : false);
  },
  credentials: true,
}));
app.use(compression());

// Stripe webhook MUST receive the raw body — register before express.json()
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  require('./modules/webhook/stripe.webhook').handleWebhook
);

// Lemon Squeezy webhook — raw body required for HMAC-SHA256 signature verification
app.post(
  '/api/ls/webhook',
  express.raw({ type: 'application/json' }),
  require('./modules/webhook/lemonSqueezy.webhook').handleWebhook
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// Serve uploaded files (thumbnails, videos, attachments)
// cross-origin header needed so browsers on localhost:3000 can load images from localhost:5000
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(require('path').resolve(config.storage.localPath || './uploads')));

app.get('/health', (req, res) => res.json({ status: 'ok', env: config.env }));

// ── API Docs (disabled in production) ────────────────────────────────────────
if (config.env !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'LMS API Docs',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: { persistAuthorization: true },
  }));
  app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));
  logger.info('API docs available at http://localhost:' + config.port + '/api-docs');
}

// This is a dynamic multi-tenant API — no GET response should ever be cached
// or conditionally-revalidated by the browser. Without this, Express's default
// ETag generation lets the browser cache-and-reuse a response via a 304, even
// across auth-state changes (e.g. a race-condition request that went out
// before the auth token was attached gets its 401 error body permanently
// stuck in the browser cache and served back on every later, authenticated
// retry to the same URL).
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use('/api', require('./routes'));

app.use((err, req, res, next) => {
  if (err.isOperational) {
    return res.status(err.statusCode || 400).json({
      success: false,
      message: err.message,
      code: err.code || null,
    });
  }
  logger.error(err.message, { stack: err.stack });
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

async function start() {
  await connectDefault();
  server.listen(config.port, () => {
    logger.info(`API running on port ${config.port} [${config.env}]`);
  });
}

start().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});

