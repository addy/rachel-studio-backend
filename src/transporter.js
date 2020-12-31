import log4js from 'log4js';
import nodemailer from 'nodemailer';

const logger = log4js.getLogger('transporter');

class Transporter {
  constructor(host, port, user, pass, email) {
    this.user = user;
    this.email = email;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: true,
      auth: {
        user,
        pass,
      },
    });

    this.verifiedPromise = this.transporter.verify();
  }

  initialize = async () => {
    // Prevent multiple verifications
    if (this.verified) return;

    try {
      // TODO: Do something with this?
      await this.verifiedPromise();
      this.verified = true;
    } catch (err) {
      logger.error(err);
      throw new Error('Could not validate the SMTP transport');
    }
  };

  sendMail = async (replyTo, message) => {
    const { user, email, transporter } = this;
    const { subject, text, html } = message;

    const mail = {
      from: user,
      replyTo,
      to: email,
      subject,
      text,
      html,
    };

    try {
      // TODO: Pool email connections?
      await transporter.sendMail(mail);
    } catch (err) {
      logger.error(err);
      throw new Error('Could not send email through the Transporter');
    }
  };
}

export default Transporter;
