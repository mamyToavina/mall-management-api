const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT),
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

const sendActivationEmail = async (to, activationLink, firstName) => {
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Bienvenue ${firstName} 👋</h2>
      <p>Votre compte boutique a été créé par l'administration.</p>
      <p>Veuillez cliquer sur le lien ci-dessous pour activer votre compte :</p>
      <p>
        <a href="${activationLink}" 
           style="background:#007bff;color:#fff;padding:10px 15px;text-decoration:none;border-radius:5px;">
           Activer mon compte
        </a>
      </p>
      <p>Ce lien expire dans 24 heures.</p>
      <br/>
      <small>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</small>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: "Activation de votre compte",
    html
  });
};

module.exports = { sendActivationEmail };
