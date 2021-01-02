/* eslint-disable import/extensions */
import dotenv from 'dotenv';
import express from 'express';
import log4js from 'log4js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import Stripe from 'stripe';
import Mongo from './mongo.js';
import Transporter from './transporter.js';
import { checkEnvironment, createEmail } from './utils.js';

// Configure dotenv, will be mostly dev going forward.
dotenv.config();

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
  MONGODB_PASSWORD: mongoPassword,
});

// Logging
log4js.configure({
  appenders: {
    file: { type: 'file', filename: logDir },
  },
  categories: {
    default: { appenders: ['file'], level: 'info' },
  },
});

// Build out clients
const app = express();
const logger = log4js.getLogger('app');
const mongo = new Mongo(mongoHost, mongoPort, mongoUser, mongoPassword);
const transporter = new Transporter(smtpHost, smtpPort, smtpUser, smtpPassword);
const stripe = Stripe(stripeToken);

// Middleware
app.use(
  cors({
    origin: 'https://rachelshawstudio.com',
    optionsSuccessStatus: 200,
  })
);
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
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
      ),
  })
);

// Site routes
app.get('/api/art', async (req, res) => {
  try {
    const documents = await mongo.findAllDocuments();
    res.status(200).send(documents);
  } catch (err) {
    logger.error(err);
    res.status(500).send({ message: 'Failed to retrieve art documents' });
  }
});

app.get('/api/art/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const document = await mongo.findDocument(id);
    res.status(200).send(document);
  } catch (err) {
    logger.error(err);
    res.status(500).send({ message: 'Failed to retrieve art' });
  }
});

app.post('/api/contact', async (req, res) => {
  const { firstName, lastName, email, message } = req.body;

  if (!firstName || !lastName || !email || !message) {
    res.status(500).send({ message: 'Missing required parameters to send email' });
  }

  try {
    const transportMessage = createEmail(firstName, lastName, email, message);
    await transporter.sendMail(email, transportMessage);
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
    const document = await mongo.findDocument(artID);

    // TODO: Add an 'amount left' integer to each art document
    // First check if we have already sold this piece
    if (document.sold) {
      res.status(400).send({ message: 'Already sold' });
    } else {
      // Process the payment through Stripe.
      await stripe.charges.create({
        amount: price ? price * 100 : document.price * 100,
        currency: 'usd',
        description: `${document.title}${price !== document.price ? ' print' : ''} for ${email}`,
        source: token,
        receipt_email: email,
      });

      // TODO: Add a type to each art document
      if (price === document.price) {
        // Mark the art document as sold.
        await mongo.updateDocument(artID, {
          $set: { sold: true },
        });
      }

      // Respond with the current ID so that the UI can self-update.
      res.status(200).send(artID);
    }
  } catch (err) {
    logger.error(err);
    res.status(500).send({ message: 'Failed to purchase art' });
  }
});

app.listen(port, () => logger.info(`Listening on port ${port}`));
