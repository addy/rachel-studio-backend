import sanitizeHtml from 'sanitize-html';

export function checkEnvironment(envVars) {
  Object.entries(envVars).forEach(([key, value]) => {
    if (!value) throw new Error(`Missing ${key} environment variable`);
  });
}

export function createEmail(firstName, lastName, email, message) {
  // Cut out any HTML tags that users inserted into the message.
  const sanitizedText = sanitizeHtml(message, {
    allowedTags: [],
    allowedAttributes: {},
  });

  const subject = `rachelshawstudio.com - Contact from (${lastName}, ${firstName} <${email}>)`;
  const text = `Rachel Shaw Studio - Contact Form\nMessage:\n${sanitizedText}`;
  const html = `<h1>Rachel Shaw Studio - Contact Form</h1><p>${sanitizedText}</p><a href="rachelshawstudio.com">rachelshawstudio.com</a>`;

  return {
    subject,
    text,
    html,
  };
}
