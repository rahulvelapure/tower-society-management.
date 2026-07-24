const express = require('express');
const dotenv = require('dotenv')
const session = require('express-session');
const passport = require('passport');
const MongoStore = require('connect-mongo');

// Access environment variables (must run before requiring routers that read process.env at load time)
dotenv.config();

const user_collection = require("./models/userModel");
const society_collection = require("./models/societyModel");
const visit_collection = require("./models/visitModel");
const db = require(__dirname + '/config/db');

const app = express()
app.set('view engine', 'ejs');
// Trust the first proxy hop (Render/Vercel sit in front of the app) so req.ip
// and req.protocol reflect the real client/scheme - needed for correct rate-limit
// keying and for the password-reset email to link to https:// in production.
app.set('trust proxy', 1);
app.use(express.static('public'));
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

db.connectDB()

app.get("/", async (req, res) => {
  // Track page visits + users & societies registered
  try {
    let pageVisit = await visit_collection.Visit.findOne();
    if (!pageVisit) {
      pageVisit = new visit_collection.Visit({
        count: 0
      });
    }
    if (process.env.NODE_ENV === 'production') {
      pageVisit.count += 1;
    }
    await pageVisit.save();

    const societies = await society_collection.Society.find();
    const cities = societies.map(society => society.societyAddress.city.toLowerCase());
    const cityCount = new Set(cities).size;

    const foundUser = await user_collection.User.find();

    res.render("index", {
      city: cityCount,
      society: societies.length,
      user: foundUser.length,
      visit: pageVisit.count
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

app.use(require('./routes/auth'));
app.use(require('./routes/resident'));
app.use(require('./routes/notice'));
app.use(require('./routes/bill'));
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
