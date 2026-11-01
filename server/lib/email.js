import nodemailer from "nodemailer";
import { logger } from "./logger.js";

const sentEmails = [];
let transporterPromise = null;

const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = (process.env.SMTP_PASS || "").replace(/\s+/g, "");

async function getTransporter(to) {
  if (to && to.endsWith(".local")) {
    return nodemailer.createTransport({ jsonTransport: true });
  }

  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    if (
      process.env.NODE_ENV === "test" ||
      process.argv.some((a) => a.includes("test"))
    ) {
      return nodemailer.createTransport({ jsonTransport: true });
    }

    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const port = Number(process.env.SMTP_PORT || 465);
    const secure = process.env.SMTP_SECURE !== "false";

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  })();

  return transporterPromise;
}

export const emailService = {
  async sendPasswordResetEmail({
    to,
    userName = "пользователь",
    resetToken,
    expiresInMinutes = 15,
    origin = "http://localhost:3000",
  }) {
    const resetUrl = `${origin}/#reset-token=${encodeURIComponent(resetToken)}`;

    const text = [
      `Здравствуйте, ${userName}!`,
      "",
      "Запрос на восстановление пароля для вашего аккаунта.",
      `Ваш временный ключ для сброса пароля: ${resetToken}`,
      `Ссылка для сброса: ${resetUrl}`,
      "",
      `Срок действия ключа: ${expiresInMinutes} минут.`,
      "Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.",
    ].join("\n");

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .badge { display: inline-block; padding: 4px 12px; background: #eff6ff; color: #2563eb; font-weight: 600; font-size: 13px; border-radius: 20px; margin-bottom: 16px; }
    h1 { font-size: 22px; color: #0f172a; margin: 0 0 16px 0; }
    p { font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 16px 0; }
    .btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 8px 0 20px 0; }
    .token-box { background: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 14px; font-family: monospace; font-size: 16px; font-weight: bold; color: #0f172a; word-break: break-all; margin: 12px 0 20px 0; text-align: center; }
    .footer { font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="badge">Hotel Booking System</div>
    <h1>Восстановление доступа к аккаунту</h1>
    <p>Здравствуйте, <strong>${userName}</strong>!</p>
    <p>Был получен запрос на сброс пароля для вашей учетной записи.</p>
    <p>Вы можете нажать кнопку ниже, чтобы сразу перейти к установке нового пароля:</p>
    <div>
      <a href="${resetUrl}" class="btn" target="_blank">Сбросить пароль</a>
    </div>
    <p>Или скопируйте временный ключ и вставьте его вручную в форме сброса:</p>
    <div class="token-box">${resetToken}</div>
    <p>⏳ Срок действия ключа: <strong>${expiresInMinutes} минут</strong>.</p>
    <div class="footer">
      Если вы не отправляли данный запрос, проигнорируйте это письмо. Ваш пароль останется неизменным.
    </div>
  </div>
</body>
</html>
    `;

    const fromAddress =
      process.env.SMTP_FROM || `"Hotel Booking System" <${SMTP_USER}>`;
    let previewUrl = null;
    let messageId = null;

    try {
      const transporter = await getTransporter(to);
      const info = await transporter.sendMail({
        from: fromAddress,
        to,
        subject: "Восстановление доступа к аккаунту",
        text,
        html,
      });
      messageId = info?.messageId || null;
      previewUrl = nodemailer.getTestMessageUrl(info) || null;
      if (previewUrl) {
        logger.info(
          { event: "email.preview_url", previewUrl },
          `Email Preview: ${previewUrl}`,
        );
      }
    } catch (err) {
      logger.error(
        { event: "email.send_failed", error: err.message },
        "Failed to send email via transport",
      );
    }

    const message = {
      to,
      subject: "Восстановление доступа к аккаунту",
      text,
      html,
      createdAt: new Date(),
      expiresInMinutes,
      resetToken,
      previewUrl,
      messageId,
    };

    sentEmails.push(message);
    if (sentEmails.length > 50) sentEmails.shift();

    logger.info(
      {
        event: "email.password_reset_sent",
        recipient: to,
        expiresInMinutes,
        previewUrl,
      },
      "password_reset_email_sent",
    );

    return message;
  },

  getLastSentEmail: () =>
    sentEmails.length ? sentEmails[sentEmails.length - 1] : null,
  clearHistory: () => {
    sentEmails.length = 0;
  },
};
