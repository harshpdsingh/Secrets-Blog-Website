require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const session = require('express-session');
const passport = require("passport");
const passportLocal = require("passport-local").Strategy;
const MongoStore = require('connect-mongo');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");

const app = express();

// Database connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err));

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, sparse: true },
  password: String,
  google_id: String,
  secrets: [String]
});

const User = mongoose.model("User", userSchema);

// Middleware
app.use(express.static("public"));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));

// Session setup
app.use(session({
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { name: 'myAppSession' }
}));

app.use(passport.initialize());
app.use(passport.session());

// Local Authentication
passport.use(new passportLocal(async (username, password, done) => {
  try {
    const user = await User.findOne({ email: username });
    if (!user) return done(null, false);
    const match = await bcrypt.compare(password, user.password);
    if (!match) return done(null, false);
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, cb) => {
  try {
    console.log("Google OAuth Success:", profile); // Debugging info

    let email = profile.emails ? profile.emails[0].value : null;
    if (!email) return cb(new Error("Email is required for authentication"), null);

    let user = await User.findOne({ $or: [{ google_id: profile.id }, { email }] });

    if (!user) {
      user = await User.create({ google_id: profile.id, email });
    } else if (!user.google_id) {
      user.google_id = profile.id;
      await user.save();
    }

    return cb(null, user);
  } catch (err) {
    console.error("Google OAuth Error:", err);
    return cb(err, null);
  }
}));


// Routes
app.get("/", (req, res) => res.render("home"));

app.get("/auth/google", passport.authenticate('google', { scope: ["profile", "email"] }));

app.get("/auth/google/secrets", 
  passport.authenticate('google', { failureRedirect: "/login" }), 
  (req, res) => res.redirect("/secrets")
);

app.get("/login", (req, res) => res.render("login"));
app.get("/register", (req, res) => res.render("register"));

app.get("/secrets", async (req, res) => {
  try {
    const usersWithSecrets = await User.find({ secrets: { $exists: true, $ne: [] } });
    res.render("secrets", { usersWithSecrets, currentUserId: req.user ? req.user.id : null });
  } catch (err) {
    console.error(err);
    res.redirect("/");
  }
});

app.get("/submit", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("submit");
  } else {
    res.redirect("/login");
  }
});

app.post("/submit", async (req, res) => {
  try {
    const secret = req.body.secret;
    await User.findByIdAndUpdate(req.user.id, { $push: { secrets: secret } });
    res.redirect("/secrets");
  } catch (err) {
    console.error(err);
    res.redirect("/");
  }
});

app.get("/logout", (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.redirect("/");
  });
});

app.post("/register", async (req, res) => {
  try {
    const existingUser = await User.findOne({ email: req.body.username });
    if (existingUser) {
      return res.send("<script>alert('User already registered!'); window.location='/register';</script>");
    }
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    await User.create({ email: req.body.username, password: hashedPassword });
    res.redirect("/login");
  } catch (err) {
    console.error(err);
    res.redirect("/register");
  }
});

app.post("/login", passport.authenticate("local", {
  successRedirect: "/secrets",
  failureRedirect: "/login"
}));

app.post("/delete", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login");
  }

  try {
    const secretToDelete = req.body.secret;
    await User.findByIdAndUpdate(req.user.id, { $pull: { secrets: secretToDelete } });
    res.redirect("/secrets");
  } catch (err) {
    console.error(err);
    res.redirect("/");
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start the server
app.listen(process.env.PORT || 3000, () => {
  console.log("Server started on port 3000.");
});
