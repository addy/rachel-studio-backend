/* eslint-disable no-console */
const express = require('express');
const sanitizeHtml = require('sanitize-html');
const { Client } = require('base-api-io');

const app = express();
const port = process.env.PORT || 5000;
const user = process.env.USER_EMAIL || null;
const token = process.env.ACCESS_TOKEN || null;

if (!user) throw Error('Missing USER_EMAIL environment variable');
if (!token) throw Error('Missing ACCESS_TOKEN environment variable');

app.use(express.json());
app.use(express.urlencoded());

const sendMail = async ({ firstName, lastName, email, message }) => {
  if (!firstName || !lastName || !email || !message) return 500;

  const sanitizedText = sanitizeHtml(message, {
    allowedTags: [],
    allowedAttributes: {}
  });

  const basicText = `Rachel Shaw Studio - Contact Form\nRespond to: ${email}\nMessage:\n${sanitizedText}`;

  // Create our Base API Client
  const client = new Client(token);

  // Doesn't look like the service handles from correctly :(
  const status = await client.emails
    .send(
      `rachelshawstudio.com - Contact from (${lastName}, ${firstName} <${email}>)`,
      'admin@rachelshawstudio.com',
      user,
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

app.listen(port, () => console.log(`Listening on port ${port}`));
