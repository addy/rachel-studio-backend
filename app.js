/* eslint-disable import/order */
/* eslint-disable no-console */
require('dotenv').config();
const express = require('express');
const nodemailer = require("nodemailer");
const cookieParser = require('cookie-parser');
const log4js = require('log4js');
const cors = require('cors');
const sanitizeHtml = require('sanitize-html');
const { MongoClient, ObjectId } = require('mongodb');
const { checkEnvironment } = require('./utils');

// ENV config variables
const port = process.env.PORT || 5000;
const logDir = process.env.LOG_DIRECTORY || '/var/log/studio-backend-output.log';
const stripeToken = process.env.STRIPE_ACCESS_TOKEN || null;
const smtpHost = process.env.SMTP_HOST || null;
const smtpPort = process.env.SMTP_PORT || '465';
const smtpUser = process.env.SMTP_USER || null;
const smtpPassword = process.env.SMTP_PASSWORD || null;
const toEmail = process.env.TO_EMAIL || null;
const mongoHost = process.env.MONGODB_HOST || 'localhost';
const mongoPort = process.env.MONGODB_PORT || '27017';
const mongoUser = process.env.MONGODB_USER || null;
const mongoPassword = process.env.MONGODB_PASSWORD || null;

// Check all required environment variables
checkEnvironment({
  STRIPE_ACCESS_TOKEN: stripeToken,
  SMTP_HOST: smtpHost,
  SMTP_USER: smtpUser,
  SMTP_PASSWORD: smtpPassword,
  TO_EMAIL: toEmail,
  MONGODB_USER: mongoUser,
  MONGODB_PASSWORD: mongoPassword
});

// Build out clients
const app = express();
const stripe = require('stripe')(stripeToken);
const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: true,
  auth: {
    user: smtpUser,
    pass: smtpPassword,
  },
});

let db;

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: 'https://rachelshawstudio.com',
    optionsSuccessStatus: 200
  })
);

app.use(express.urlencoded({ extended: true }));
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

  // And our trusty email subject.
  const subject = `rachelshawstudio.com - Contact from (${lastName}, ${firstName} <${email}>)`;

  // This is what $TO_EMAIL will see if their email client has HTML disabled.
  const text = `Rachel Shaw Studio - Contact Form\nMessage:\n${sanitizedText}`;

  // This is the HTML version of the above.
  const html = `<h1>Rachel Shaw Studio - Contact Form</h1><p>${sanitizedText}</p><a href="rachelshawstudio.com">rachelshawstudio.com</a>`;

  try {
    // Nodemailer is deprecating their rate limiter API, so I will do single connections until I can build out the rate limiter myself.
    const message = {
      from: smtpUser,
      replyTo: email,
      to: toEmail,
      subject,
      text,
      html,
    };
    
    await transporter.sendMail(message);
    res.sendStatus(200);
  } catch (err) {
    logger.error(err);
    res.status(500).send({ message: 'Failed to send email' });
  }
});

// // Payment routes
app.post('/api/charge', async (req, res) => {
  const { token, email, artID, price } = req.body;

  try {
    const doc = await db.collection('art').findOne({ _id: ObjectId(artID) });

    // First check if we have already sold this piece
    if (doc.sold) {
      res.status(400).send({ message: 'Already sold' });
    } else {
      // Process the payment through Stripe.
      await stripe.charges.create({
        amount: price ? price * 100 : doc.price * 100,
        currency: 'usd',
        description: `${doc.title}${price !== doc.price ? ' print' : ''} for ${email}`,
        source: token,
        receipt_email: email
      });

      // Not selling a print. I hate this.
      if (price === doc.price) {
        // Mark the art document as sold.
        await db.collection('art').updateOne(
          { _id: ObjectId(artID) },
          {
            $set: { sold: true }
          }
        );
      }

      // Respond with the current ID so that the UI can self-update.
      res.status(200).send(artID);
    }
  } catch (err) {
    logger.error(err);
    res.status(500).send({ message: 'Failed to purchase art' });
  }
});

app.listen(port, async () => {
  try {
    const client = await MongoClient.connect(`mongodb://${mongoUser}:${mongoPassword}@${mongoHost}:${mongoPort}`, { useUnifiedTopology: true });
    db = client.db('art');

    // Validate the transport once
    await transporter.verify()
  } catch (err) {
    logger.error(err);
    throw new Error(`Could not connect to MongoDB`);
  }

  logger.info(`Listening on port ${port}`);
});
