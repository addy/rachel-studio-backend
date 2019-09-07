/* eslint-disable no-console */
const express = require('express');
const redis = require('redis');
const bcrypt = require('bcrypt');
const passport = require('passport');
const uuidv4 = require('uuid/v4');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const sanitizeHtml = require('sanitize-html');
const { Client } = require('base-api-io');
const RedisStore = require('connect-redis')(session);
const { checkEnvironment } = require('./utils');

const port = process.env.PORT || 5000;
const userEmail = process.env.USER_EMAIL || null;
const baseToken = process.env.BASE_ACCESS_TOKEN || null;
const stripeToken = process.env.STRIPE_ACCESS_TOKEN || null;

// Check all required environment variables
checkEnvironment({
  USER_EMAIL: userEmail,
  BASE_ACCESS_TOKEN: baseToken,
  STRIPE_ACCESS_TOKEN: stripeToken
});

const app = express();
const redisClient = redis.createClient();
const baseClient = new Client(baseToken);
// eslint-disable-next-line import/order
const stripe = require('stripe')(stripeToken);

app.use(express.json());
app.use(express.urlencoded());
app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: 'test',
    resave: false,
    saveUninitialized: false
  })
);

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

passport.use(
  new LocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password'
    },
    (email, password, done) => {
      findUserByEmail(email, (err, user) => {
        if (err) return done(err);
        if (!user) return done(null, false);

        bcrypt.compare(password, user.password, (bErr, valid) => {
          if (bErr) return done(bErr);
          if (valid) return done(null, user);
          return done(null, false);
        });
      });
    }
  )
);

passport.serializeUser((user, cb) => cb(null, user.id));
passport.deserializeUser((id, cb) => findUserByID(id, cb));

app.use(passport.initialize());
app.use(passport.session());

const sendMail = async ({ firstName, lastName, email, message }) => {
  if (!firstName || !lastName || !email || !message) return 500;

  const sanitizedText = sanitizeHtml(message, {
    allowedTags: [],
    allowedAttributes: {}
  });

  const basicText = `Rachel Shaw Studio - Contact Form\nRespond to: ${email}\nMessage:\n${sanitizedText}`;

  // Doesn't look like the service handles from correctly :(
  const status = await baseClient.emails
    .send(
      `rachelshawstudio.com - Contact from (${lastName}, ${firstName} <${email}>)`,
      'admin@rachelshawstudio.com',
      userEmail,
      `<h1>Rachel Shaw Studio - Contact Form</h1><h3>Respond to: ${email}</h3><p>${sanitizedText}</p><a href="rachelshawstudio.com">rachelshawstudio.com</a>`,
      basicText
    )
    .then(res => {
      console.info(res);
      return 200;
    })
    .catch(rej => {
      console.info(rej);
      return 500;
    });

  return status;
};

app.post('/api/contact', (req, res) => {
  sendMail(req.body)
    .then(responseCode => {
      res.sendStatus(responseCode);
    })
    .catch(err => {
      console.info(err);
      res.sendStatus(500);
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
              redisClient.hmset(id, {
                id,
                email,
                password: hash
              });

              redisClient.hmset(email, {
                id,
                email,
                password: hash
              });

              res.status(200).send({ id, email });
            }
          });
        }
      });
    }
  });
});

app.post('/api/login', passport.authenticate('local'));

app.listen(port, () => console.log(`Listening on port ${port}`));
