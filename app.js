/* eslint-disable import/order */
/* eslint-disable no-console */
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const log4js = require('log4js');
const cors = require('cors');
const sanitizeHtml = require('sanitize-html');
const { MongoClient, ObjectId } = require('mongodb');
const { Client } = require('base-api-io');
const { checkEnvironment } = require('./utils');

// ENV config variables
const port = process.env.PORT || 5000;
const logDir = process.env.LOG_DIRECTORY || '/var/log/studio-backend-output.log';
const fromEmail = process.env.FROM_EMAIL || 'admin@rachelshawstudio.com';
const userEmail = process.env.USER_EMAIL || null;
const baseToken = process.env.BASE_ACCESS_TOKEN || null;
const stripeToken = process.env.STRIPE_ACCESS_TOKEN || null;
const mongoHost = process.env.MONGODB_HOST || 'localhost';
const mongoPort = process.env.MONGODB_PORT || '27017';
const mongoUser = process.env.MONGODB_USER || null;
const mongoPassword = process.env.MONGODB_PASSWORD || null;

// Check all required environment variables
checkEnvironment({
  USER_EMAIL: userEmail,
  BASE_ACCESS_TOKEN: baseToken,
  STRIPE_ACCESS_TOKEN: stripeToken,
  MONGODB_USER: mongoUser,
  MONGODB_PASSWORD: mongoPassword
});

// Build out clients
const app = express();
const baseClient = new Client(baseToken);
const stripe = require('stripe')(stripeToken);

let db;

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
app.get('/api/art', async (req, res) => {
  try {
    const documents = await db
      .collection('art')
      .find({})
      .toArray();

    res.status(200).send(documents);
  } catch (err) {
    logger.error(err);
    res.status(500).send({ message: 'Failed to retrieve art documents' });
  }
});

app.get('/api/art/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const document = await db.collection('art').findOne({ _id: ObjectId(id) });
    res.status(200).send(document);
  } catch (err) {
    logger.error(err);
    res.status(500).send({ message: 'Failed to retrieve art' });
  }
});

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
    logger.error(err);
    res.status(500).send({ message: 'Failed to send email' });
  }
});

// // Payment routes
app.post('/api/charge', async (req, res) => {
  const { token, email, artID } = req.body;

  try {
    const doc = await db.collection('art').findOne({ _id: ObjectId(artID) });

    // First check if we have already sold this piece
    if (doc.sold) {
      res.status(400).send({ message: 'Already sold' });
    } else {
      // Process the payment through Stripe.
      await stripe.charges.create({
        amount: doc.price * 100,
        currency: 'usd',
        description: doc.title,
        source: token,
        receipt_email: email
      });

      // Mark the art document as sold.
      await db.collection('art').updateOne(
        { _id: ObjectId(artID) },
        {
          $set: { sold: true }
        }
      );

      // Respond with the current ID so that the UI can self-update.
      res.status(200).send(artID);
    }
  } catch (err) {
    logger.error(err);
    res.status(500).send({ message: 'Failed to purchase art' });
  }
});

MongoClient.connect(
  `mongodb://${mongoUser}:${mongoPassword}@${mongoHost}:${mongoPort}`,
  (err, _db) => {
    if (err) throw new Error(`Could not connect to MongoDB`);
    db = _db.db('art');
  }
);

app.listen(port, () => logger.info(`Listening on port ${port}`));
