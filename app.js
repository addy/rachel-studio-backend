/* eslint-disable import/order */
/* eslint-disable no-console */
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const redis = require('redis');
const log4js = require('log4js');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const passport = require('passport');
const uuidv4 = require('uuid/v4');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const sanitizeHtml = require('sanitize-html');
const { Client } = require('base-api-io');
const RedisStore = require('connect-redis')(session);
const { checkEnvironment } = require('./utils');
const { checkBearerToken } = require('./middleware');

// ENV config variables
const port = process.env.PORT || 5000;
const logDir = process.env.LOG_DIRECTORY || '/var/log/studio-backend-output.log';
const fromEmail = process.env.FROM_EMAIL || 'admin@rachelshawstudio.com';
const userEmail = process.env.USER_EMAIL || null;
const baseToken = process.env.BASE_ACCESS_TOKEN || null;
const stripeToken = process.env.STRIPE_ACCESS_TOKEN || null;
const authSecret = process.env.AUTH_SECRET || null;
const sessionSecret = process.env.SESSION_SECRET || null;

// Check all required environment variables
checkEnvironment({
  USER_EMAIL: userEmail,
  BASE_ACCESS_TOKEN: baseToken,
  STRIPE_ACCESS_TOKEN: stripeToken,
  AUTH_SECRET: authSecret,
  SESSION_SECRET: sessionSecret
});

// Build out clients
const app = express();
const redisClient = redis.createClient();
const baseClient = new Client(baseToken);
const stripe = require('stripe')(stripeToken);

// Middleware
app.use(express.json());
app.use(express.urlencoded());
app.use(cookieParser());
app.use(
  cors({
    origin: 'https://rachelshawstudio.com',
    optionsSuccessStatus: 200
  })
);
app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false
  })
);

// User retrieval helper functions
const findUserByID = (id, callback) => {
  redisClient.hgetall(id, (err, user) => {
    if (err) return callback(err);

    if (!user) {
      const error = new Error('Incorrect email or password');
      error.name = 'IncorrectCredentialsError';

      return callback(error);
    }

    callback(null, user);
  });
};

const findUserByEmail = (email, callback) => {
  redisClient.hgetall(email, (err, user) => {
    if (err) return callback(err);

    if (!user) {
      const error = new Error('Incorrect email or password');
      error.name = 'IncorrectCredentialsError';

      return callback(error);
    }

    callback(null, user);
  });
};

// Set up passport authentication
passport.use(
  new LocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password'
    },
    (email, password, done) => {
      findUserByEmail(email, (err, user) => {
        if (err) done(err);
        else if (!user) done(null, false);
        else {
          bcrypt.compare(password, user.password, (bErr, valid) => {
            if (bErr) done(bErr);
            else if (!valid) done(null, false);
            else done(null, user);
          });
        }
      });
    }
  )
);

passport.serializeUser((user, cb) => cb(null, user.id));
passport.deserializeUser((id, cb) => findUserByID(id, cb));

app.use(passport.initialize());
app.use(passport.session());

// Logging
log4js.configure({
  appenders: {
    file: { type: 'file', filename: logDir }
  },
  categories: {
    default: { appenders: ['file'], level: 'info' }
  }
});

const logger = log4js.getLogger('default');
app.use(
  log4js.connectLogger(logger, {
    level: 'info',
    format: (req, res, format) =>
      format(
        `:remote-addr ${
          req.user ? `- ${JSON.stringify(req.user)} - ` : ''
        }":method :url HTTP/:http-version" :status :content-length ":referrer" ":user-agent"${
          req.method === 'POST' || req.method === 'PUT' ? ` ${JSON.stringify(req.body)}` : ''
        }`
      )
  })
);

// Routes
app.get('/api/user', checkBearerToken, (req, res) => {
  const { decoded } = req;
  res.status(200).send({ user: decoded });
});

app.post('/api/contact', (req, res) => {
  const { firstName, lastName, email, message } = req.body;
  if (!firstName || !lastName || !email || !message)
    res.status(500).send({ message: 'Missing required parameters to send email' });

  // Cut out any HTML tags that users inserted into the message.
  const sanitizedText = sanitizeHtml(message, {
    allowedTags: [],
    allowedAttributes: {}
  });

  // This is what $USER_EMAIL will see if their email client has HTML disabled.
  const basicText = `Rachel Shaw Studio - Contact Form\nRespond to: ${email}\nMessage:\n${sanitizedText}`;

  // This is the HTML version of the above.
  const htmlText = `<h1>Rachel Shaw Studio - Contact Form</h1><h3>Respond to: ${email}</h3><p>${sanitizedText}</p><a href="rachelshawstudio.com">rachelshawstudio.com</a>`;

  // And our trusty email title.
  const title = `rachelshawstudio.com - Contact from (${lastName}, ${firstName} <${email}>)`;

  // Unfortunately, the from parameter will not work unless it has the same domain as the mail server.
  // Best way for now is to override with a bogus email (of the same domain) and make a note in the message body
  // who the email was really from.
  baseClient.emails
    .send(title, fromEmail, userEmail, htmlText, basicText)
    .then(() => {
      res.sendStatus(200);
    })
    .catch(() => {
      res.status(500).send({ message: 'Failed to send email' });
    });
});

app.post('/api/user', (req, res) => {
  const { email, password } = req.body;
  redisClient.exists(email, (err, reply) => {
    if (err) {
      res.status(500).send({ message: 'Could not check Redis.' });
    } else if (reply) {
      res.status(409).send({ message: 'User already exists.' });
    } else {
      bcrypt.genSalt(10, (saltErr, salt) => {
        if (saltErr) {
          res.status(500).send({ message: 'Could not salt password.' });
        } else {
          bcrypt.hash(password, salt, (hashErr, hash) => {
            if (hashErr) {
              res.status(500).send({ message: 'Could not hash password.' });
            } else {
              const id = uuidv4();
              // Bearer token is a signature of User ID & User Email.
              const token = jwt.sign({ id, email }, authSecret);
              const user = {
                id,
                email,
                token,
                password: hash
              };

              redisClient.hmset(id, user);
              redisClient.hmset(email, user);
              redisClient.hmset(token, user);

              res.status(200).send({ token });
            }
          });
        }
      });
    }
  });
});

app.post('/api/login', passport.authenticate('local'), (req, res) => {
  const { token } = req.user;
  res.status(200).send({ token });
});

app.listen(port, () => logger.info(`Listening on port ${port}`));
