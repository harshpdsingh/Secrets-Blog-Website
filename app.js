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
mongoose.set('strictQuery', false);
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err));

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, sparse: true },
  password: String,
  google_id: String,
  secrets: [{
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    text: String,
    replies: [{
      _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
      text: String,
      authorId: String
    }]
  }]
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

// Place this after your User model definition, before any routes
//For migrating old secrets format to new object format
// This migration script will run once to convert old string secrets to the new object format
(async () => {
  const users = await User.find({ "secrets.0": { $type: "string" } });
  for (const user of users) {
    user.secrets = user.secrets.map(secret =>
      typeof secret === "string"
        ? { text: secret, replies: [] }
        : secret
    );
    await user.save();
  }
  if (users.length > 0) {
    console.log("Migrated old secrets to new object format.");
  }
})();

// Routes
app.get("/", (req, res) => res.render("home"));

app.get("/auth/google", passport.authenticate('google', { scope: ["profile", "email"] }));

app.get("/auth/google/callback", 
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
    await User.findByIdAndUpdate(req.user.id, { $push: { secrets: { text: secret, replies: [] } } });
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

app.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) return next(err);
    
    if (!user) {
      return res.send("<script>alert('Incorrect email or password! Please try again.'); window.location='/login';</script>");
    }

    req.logIn(user, (err) => {
      if (err) return next(err);
      res.redirect("/secrets");
    });
  })(req, res, next);
});


app.post("/delete", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login");
  }

  try {
    const secretToDelete = req.body.secretId || req.body.secret; // support both field names
    await User.findByIdAndUpdate(req.user.id, { $pull: { secrets: { _id: secretToDelete } } });
    res.redirect("/secrets");
  } catch (err) {
    console.error(err);
    res.redirect("/");
  }
});

// Add a reply to a secret
app.post("/reply", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login");
  }
  try {
    const { secretId, replyText } = req.body;
    // Find the user who owns the secret
    const user = await User.findOne({ "secrets._id": secretId });
    if (!user) return res.redirect("/secrets");

    // Find the secret and push the reply
    const secret = user.secrets.id(secretId);
    if (!secret) return res.redirect("/secrets");

    secret.replies = secret.replies || [];
    secret.replies.push({
      text: replyText,
      authorId: req.user.id
    });

    await user.save();
    res.redirect("/secrets");
  } catch (err) {
    console.error(err);
    res.redirect("/secrets");
  }
});

// Delete a reply from a secret
app.post("/delete-reply", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login");
  }
  try {
    const { secretId, replyId } = req.body;
    // Find the user who owns the secret
    const user = await User.findOne({ "secrets._id": secretId });
    if (!user) return res.redirect("/secrets");

    const secret = user.secrets.id(secretId);
    if (!secret) return res.redirect("/secrets");

    // Only allow the author to delete their reply
    const reply = secret.replies.id(replyId);
    if (reply && reply.authorId === req.user.id) {
      reply.remove();
      await user.save();
    }
    res.redirect("/secrets");
  } catch (err) {
    console.error(err);
    res.redirect("/secrets");
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
