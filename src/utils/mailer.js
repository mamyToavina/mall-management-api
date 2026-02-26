const nodemailer = require('nodemailer');

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).toLowerCase() === 'true';
};

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT),
    secure: parseBoolean(process.env.MAIL_SECURE, false),
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS
    },
    tls: {
      rejectUnauthorized: parseBoolean(process.env.MAIL_TLS_REJECT_UNAUTHORIZED, true)
    }
  });
};

const sendActivationEmail = async (to, activationLink, firstName) => {
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Bienvenue ${firstName} 👋</h2>
      <p>Votre compte boutique a ete cree par l'administration.</p>
      <p>Veuillez cliquer sur le lien ci-dessous pour activer votre compte :</p>
      <p>
        <a href="${activationLink}"
           style="background:#007bff;color:#fff;padding:10px 15px;text-decoration:none;border-radius:5px;">
           Activer mon compte
        </a>
      </p>
      <p>Ce lien expire dans 24 heures.</p>
      <br/>
      <small>Si vous n'etes pas a l'origine de cette demande, ignorez cet email.</small>
    </div>
  `;

  const transporter = createTransporter();

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: 'Activation de votre compte',
    html
  });
};

const sendAccountBlockedEmail = async ({ to, pseudo, reason, blockedAt }) => {
  if (!to) return;

  const when = blockedAt instanceof Date && !Number.isNaN(blockedAt.getTime())
    ? blockedAt.toLocaleString('fr-FR')
    : new Date().toLocaleString('fr-FR');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <div style="max-width: 640px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%); color: #fff; padding: 18px 20px;">
          <h2 style="margin:0; font-size:20px;">Notification de blocage de compte</h2>
        </div>
        <div style="padding: 20px; background:#ffffff;">
          <p>Bonjour ${pseudo || 'utilisateur'},</p>
          <p>Votre compte a ete bloque par l'administration.</p>
          <p><strong>Date:</strong> ${when}</p>
          <p><strong>Motif:</strong></p>
          <div style="padding: 12px; border-radius: 10px; background: #f8fafc; border: 1px solid #e2e8f0; white-space: pre-wrap;">${String(reason || '-')}</div>
          <p style="margin-top: 16px;">Pour plus d'informations, veuillez contacter le support administratif.</p>
        </div>
      </div>
    </div>
  `;

  const transporter = createTransporter();
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: 'Votre compte a ete bloque',
    html
  });
};

module.exports = { sendActivationEmail, sendAccountBlockedEmail };
