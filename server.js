const express = require('express');
const dotenv = require('dotenv')
const session = require('express-session');
const passport = require('passport');
const MongoStore = require('connect-mongo');

// Access environment variables (must run before requiring routers that read process.env at load time)
dotenv.config();

const db = require(__dirname + '/config/db');
const brand = require('./config/brand');
const { stripeMode } = require('./lib/stripeMode');

// Safety banner - never logs the key itself, only which mode it belongs to.
// Payment gateway validation must run in TEST mode; this makes that visible
// in the Render logs on every boot instead of requiring a dashboard check.
switch (stripeMode()) {
  case 'live':
    console.warn('[Stripe] LIVE mode detected - real charges will be made.');
    break;
  case 'test':
    console.log('[Stripe] TEST mode - no real charges will be made.');
    break;
  case 'unconfigured':
    console.log('[Stripe] Not configured (SECRET_KEY unset) - online payments disabled.');
    break;
  default:
    console.warn('[Stripe] SECRET_KEY format not recognized - unable to determine mode.');
}

const app = express()
app.set('view engine', 'ejs');
// Trust the first proxy hop (Render/Vercel sit in front of the app) so req.ip
// and req.protocol reflect the real client/scheme - needed for correct rate-limit
// keying and for the password-reset email to link to https:// in production.
app.set('trust proxy', 1);
app.use(express.static('public'));

// Stripe webhook MUST be mounted before the urlencoded body parser, session and
// CSRF middleware: signature verification needs the exact RAW request body, and
// the route authenticates via Stripe's signature (not a browser session), so it
// is the ONLY route outside CSRF - by construction, not by weakening the global
// middleware. Registered here so later app.use() layers never touch it.
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), require('./routes/stripeWebhook'));

// Middleware to handle HTTP post requests
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
    }),
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

const { attachCsrfToken, verifyCsrfToken } = require('./middleware/csrf');
app.use(attachCsrfToken);
app.use(verifyCsrfToken);

// Make brand + current user available to every view (centralized branding).
app.use((req, res, next) => {
  res.locals.brand = brand;
  res.locals.currentUser = req.user || null;
  res.locals.stripeMode = stripeMode(); // 'test' | 'live' | 'unconfigured' | 'unknown' - never the key itself
  next();
});

db.connectDB()

// Closed private portal: the public entry point is the login page.
app.get("/", (req, res) => res.redirect(req.isAuthenticated() ? "/home" : "/login"));

app.use(require('./routes/auth'));
app.use(require('./routes/resident'));
app.use(require('./routes/members'));
app.use(require('./routes/admins'));
app.use(require('./routes/notice'));
app.use(require('./routes/bill'));
app.use(require('./routes/finance'));
app.use(require('./routes/helpdesk'));
app.use(require('./routes/contacts'));
app.use(require('./routes/units'));

app.get("/health", (req, res) => {
  res.status(200).send("Server is running");
});

app.listen(
  process.env.PORT || 3000,
  console.log("Server started")
);
