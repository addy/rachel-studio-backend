/* eslint-disable import/order */
/* eslint-disable no-console */
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const log4js = require('log4js');
const cors = require('cors');
const sanitizeHtml = require('sanitize-html');
const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');
const { Client } = require('base-api-io');
const { checkEnvironment } = require('./utils');

// ENV config variables
const port = process.env.PORT || 5000;
const logDir = process.env.LOG_DIRECTORY || '/var/log/studio-backend-output.log';
const fromEmail = process.env.FROM_EMAIL || 'admin@rachelshawstudio.com';
const userEmail = process.env.USER_EMAIL || null;
const baseToken = process.env.BASE_ACCESS_TOKEN || null;
const stripeToken = process.env.STRIPE_ACCESS_TOKEN || null;
const domain = process.env.DOMAIN || null;
const audience = process.env.AUDIENCE || null;

// Check all required environment variables
checkEnvironment({
  USER_EMAIL: userEmail,
  BASE_ACCESS_TOKEN: baseToken,
  STRIPE_ACCESS_TOKEN: stripeToken,
  DOMAIN: domain,
  AUDIENCE: audience
});

// Build out clients
const app = express();
const baseClient = new Client(baseToken);
const stripe = require('stripe')(stripeToken);

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: 'https://rachelshawstudio.com',
    optionsSuccessStatus: 200
  })
);
app.use(express.urlencoded());
app.use(cookieParser());

// Auth Middleware
const checkJwt = jwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://${domain}/.well-known/jwks.json`
  }),

  audience,
  issuer: `https://${domain}/`,
  algorithm: ['RS256']
});

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
        }":method :url HTTP/:http-version" - ${JSON.stringify(
          req.headers
        )} - :status :content-length ":referrer" ":user-agent"${
          req.method === 'POST' || req.method === 'PUT' ? ` ${JSON.stringify(req.body)}` : ''
        }`
      )
  })
);

// Site routes
app.post('/api/contact', async (req, res) => {
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

  try {
    // Unfortunately, the from parameter will not work unless it has the same domain as the mail server.
    // Best way for now is to override with a bogus email (of the same domain) and make a note in the message body
    // who the email was really from.
    await baseClient.emails.send(title, fromEmail, userEmail, htmlText, basicText);
    res.sendStatus(200);
  } catch (err) {
    console.log(err);
    res.status(500).send({ message: 'Failed to send email' });
  }
});

// Payment routes
app.post('/api/charge', async (req, res) => {
  try {
    const { token, email } = req.body;

    const { status } = await stripe.charges.create({
      amount: 2000,
      currency: 'usd',
      description: 'An example charge',
      source: token,
      receipt_email: email
    });

    res.json({ status });
  } catch (err) {
    console.log(err);
    res.status(500).send({ message: 'Failed to charge card' });
  }
});

// Auth routes
app.get('/api/external', checkJwt, (req, res) => {
  res.status(200).send({ message: 'Your Access Token was successfully validated!' });
});

app.listen(port, () => logger.info(`Listening on port ${port}`));
