import { logger } from "./logger.js";

const sentEmails = [];

export const emailService = {
  async sendPasswordResetEmail({
    to,
    userName = "пользователь",
    resetToken,
    expiresInMinutes = 15,
    origin = "http://localhost:3000",
  }) {
    const message = {
      to,
      subject: "Восстановление доступа к аккаунту",
      text: [
        `Здравствуйте, ${userName}!`,
        "",
        "Запрос на восстановление пароля для вашего аккаунта.",
        `Ваш временный ключ для сброса пароля: ${resetToken}`,
        `Ссылка для сброса: ${origin}/#reset-token=${encodeURIComponent(resetToken)}`,
        "",
        `Срок действия ключа: ${expiresInMinutes} минут.`,
      ].join("\n"),
      createdAt: new Date(),
      expiresInMinutes,
      resetToken,
    };

    sentEmails.push(message);
    if (sentEmails.length > 50) sentEmails.shift();

    logger.info({ event: "email.password_reset_sent", recipient: to, expiresInMinutes }, "password_reset_email_sent");
    return message;
  },

  getLastSentEmail: () => (sentEmails.length ? sentEmails[sentEmails.length - 1] : null),
  clearHistory: () => { sentEmails.length = 0; },
};

