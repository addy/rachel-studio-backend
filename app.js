/* eslint-disable no-console */
const express = require('express');
const sanitizeHtml = require('sanitize-html');
const { Client } = require('base-api-io');

const app = express();
const port = process.env.PORT || 5000;
const user = process.env.USER_EMAIL || undefined;
const token = process.env.ACCESS_TOKEN || undefined;

app.use(express.json());
app.use(express.urlencoded());

const sendMail = async (firstName, lastName, fromEmail, text) => {
  if (user === undefined || token === undefined) return 500;

  const sanitizedText = sanitizeHtml(text, {
    allowedTags: [],
    allowedAttributes: {}
  });

  const basicText = `
    Rachel Shaw Studio - Contact Form
    Respond to: ${fromEmail}
    Message:
    ${sanitizedText}
  `;

  // Create our Base API Client
  const client = new Client(token);

  // Doesn't look like the service handles from correctly :(
  const status = await client.emails
    .send(
      `rachelshawstudio.com - Contact from (${lastName}, ${firstName} <${fromEmail}>)`,
      fromEmail,
      user,
      `<h1>Rachel Shaw Studio - Contact Form</h1><h3>Respond to: ${fromEmail}</h3><p>${sanitizedText}</p><a href="rachelshawstudio.com">rachelshawstudio.com</a>`,
      basicText
    )
    .then(() => {
      return 200;
    })
    .catch(() => {
      return 500;
    });

  return status;
};

app.post('/api/contact', (req, res) => {
  const { firstName, lastName, email, message } = req.body;
  sendMail(firstName, lastName, email, message).then(responseCode => {
    res.sendStatus(responseCode);
  });
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
