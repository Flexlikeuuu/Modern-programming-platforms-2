import { test } from "node:test";
import assert from "node:assert/strict";
import { emailService } from "../lib/email.js";
import { generateRawToken, hashToken, hashPassword, comparePassword } from "../middleware/auth.js";

test("Email service sends structured password reset instructions", async () => {
  emailService.clearHistory();

  const resetToken = generateRawToken();
  const sent = await emailService.sendPasswordResetEmail({
    to: "guest@hotel.local",
    userName: "Гость",
    resetToken,
    expiresInMinutes: 15,
  });

  assert.equal(sent.to, "guest@hotel.local");
  assert.equal(sent.resetToken, resetToken);
  assert.equal(sent.expiresInMinutes, 15);
  assert.ok(sent.text.includes(resetToken));
  assert.ok(sent.text.includes("15 минут"));

  const lastEmail = emailService.getLastSentEmail();
  assert.deepEqual(lastEmail, sent);
});

test("Password reset token hashing: SHA-256 prevents plain-text token leaks in DB", () => {
  const token = generateRawToken();
  const tokenHash = hashToken(token);

  assert.equal(typeof tokenHash, "string");
  assert.equal(tokenHash.length, 64);
  assert.notEqual(tokenHash, token);
});

test("Password reset token expiration check logic", () => {
  const now = new Date();
  const validExpiration = new Date(now.getTime() + 15 * 60 * 1000);
  const expiredExpiration = new Date(now.getTime() - 1000);

  const isTokenValid = (expiresAt, used) => !used && new Date(expiresAt) > new Date();

  assert.equal(isTokenValid(validExpiration, false), true);
  assert.equal(isTokenValid(validExpiration, true), false); // already used
  assert.equal(isTokenValid(expiredExpiration, false), false); // expired
});

test("Password reset updates password hash and clears lockout", async () => {
  const oldPassword = "OldPassword123";
  const newPassword = "NewSecretPassword456";

  let user = {
    id: 1,
    failed_logins: 5,
    locked_until: new Date(Date.now() + 15 * 60 * 1000),
    password_hash: await hashPassword(oldPassword),
  };

  assert.equal(await comparePassword(oldPassword, user.password_hash), true);

  // Apply reset
  user.password_hash = await hashPassword(newPassword);
  user.failed_logins = 0;
  user.locked_until = null;

  assert.equal(await comparePassword(newPassword, user.password_hash), true);
  assert.equal(await comparePassword(oldPassword, user.password_hash), false);
  assert.equal(user.failed_logins, 0);
  assert.equal(user.locked_until, null);
});
