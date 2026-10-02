import { logger } from "./logger.js";

// In-memory store for recent sent emails (useful for testing, dev and inspection)
const sentEmails = [];

export const emailService = {
  /**
   * Sends a password reset email to the specified recipient.
   *
   * @param {Object} options
   * @param {string} options.to - Recipient email
   * @param {string} options.userName - Recipient name
   * @param {string} options.resetToken - Raw reset token
   * @param {number} [options.expiresInMinutes=15] - Expiration duration in minutes
   * @param {string} [options.origin] - Base client URL
   */
  async sendPasswordResetEmail({
    to,
    userName,
    resetToken,
    expiresInMinutes = 15,
    origin = "http://localhost:3000",
  }) {
    const resetUrl = `${origin}/#reset-token=${encodeURIComponent(resetToken)}`;

    const message = {
      to,
      subject: "Восстановление доступа к аккаунту",
      text: [
        `Здравствуйте, ${userName || "пользователь"}!`,
        "",
        "Мы получили запрос на восстановление пароля для вашего аккаунта.",
        `Ваш временный ключ для сброса пароля: ${resetToken}`,
        `Либо перейдите по ссылке: ${resetUrl}`,
        "",
        `Срок действия ключа: ${expiresInMinutes} минут.`,
        "Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.",
      ].join("\n"),
      createdAt: new Date(),
      expiresInMinutes,
      resetToken,
    };

    sentEmails.push(message);
    if (sentEmails.length > 50) {
      sentEmails.shift();
    }

    logger.info(
      {
        event: "email.password_reset_sent",
        recipient: to,
        expiresInMinutes,
      },
      "password_reset_email_sent",
    );

    return message;
  },

  /**
   * Retrieves the last sent email (used by tests and debugging).
   */
  getLastSentEmail() {
    return sentEmails.length > 0 ? sentEmails[sentEmails.length - 1] : null;
  },

  /**
   * Clears email history (used by tests).
   */
  clearHistory() {
    sentEmails.length = 0;
  },
};
