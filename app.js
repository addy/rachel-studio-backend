/* eslint-disable no-console */
const express = require('express');
const { Client } = require('base-api-io');

const app = express();
const port = process.env.PORT || 5000;
const user = process.env.USER_EMAIL || undefined;
const token = process.env.ACCESS_TOKEN || undefined;

app.use(express.json());
app.use(express.urlencoded());

const sendMail = (firstName, lastName, fromEmail, text) => {
  const client = new Client(token);

  // Doesn't look like the service handles from correctly :(
  client.emails.send(
    `Rachel Shaw Studio - Contact from ${firstName} ${lastName}`,
    fromEmail,
    user,
    text,
    text
  );
};

app.post('/api/contact', (req, res) => {
  if (user === undefined || token === undefined) {
    res.sendStatus(500);
  } else {
    const { firstName, lastName, email, message } = req.body;
    sendMail(firstName, lastName, email, message);
    res.sendStatus(200);
  }
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
