import express from "express";
import { HttpError, asyncHandler } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { ROLES } from "../lib/roles.js";
import {
  authRequired,
  clientIp,
  comparePassword,
  generateRawToken,
  hashPassword,
  hashToken,
  signAccessToken,
} from "../middleware/auth.js";
import { emailService } from "../lib/email.js";

const MAX_SESSIONS = Number(process.env.MAX_SESSIONS || 3);
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 24);
const LOCK_AFTER_FAILS = Number(process.env.LOCK_AFTER_FAILS || 5);
const LOCK_MINUTES = Number(process.env.LOCK_MINUTES || 15);
const IP_WINDOW_MINUTES = 15;
const IP_MAX_ATTEMPTS = Number(process.env.IP_MAX_ATTEMPTS || 20);
const RESET_TOKEN_TTL_MINUTES = Number(process.env.RESET_TOKEN_TTL_MINUTES || 15);
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const publicUser = (r) => ({ id: r.id, email: r.email, name: r.name, role: r.role });

async function recordAttempt(pool, { email, ip, success }) {
  await pool.query("INSERT INTO login_attempts (email, ip, success) VALUES ($1, $2, $3)", [email, ip, success]);
}

async function enforceIpLimit(pool, ip) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM login_attempts WHERE ip = $1 AND success = FALSE AND created_at > NOW() - ($2 || ' minutes')::interval`,
    [ip, String(IP_WINDOW_MINUTES)],
  );
  if (rows[0].n >= IP_MAX_ATTEMPTS) {
    throw new HttpError(429, "TOO_MANY_REQUESTS", "Слишком много неудачных попыток входа с этого адреса. Повторите позже.");
  }
}

async function createSession(pool, user, req) {
  const tokenHash = hashToken(generateRawToken());
  const ip = clientIp(req);
  const userAgent = req.headers["user-agent"] || "";

  await pool.query("DELETE FROM sessions WHERE expires_at < NOW()");

  const existing = await pool.query("SELECT id FROM sessions WHERE user_id = $1 ORDER BY created_at ASC", [user.id]);
  const overflow = existing.rows.length - (MAX_SESSIONS - 1);
  if (overflow > 0) {
    const ids = existing.rows.slice(0, overflow).map((r) => r.id);
    await pool.query("DELETE FROM sessions WHERE id = ANY($1::int[])", [ids]);
    logger.info({ event: "session.evicted", userId: user.id, count: overflow }, "old_sessions_evicted");
  }

  const { rows } = await pool.query(
    `INSERT INTO sessions (user_id, token_hash, user_agent, ip, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + ($5 || ' hours')::interval)
     RETURNING id, created_at, expires_at`,
    [user.id, tokenHash, userAgent, ip, String(SESSION_TTL_HOURS)],
  );

  return {
    accessToken: signAccessToken({ sub: user.id, role: user.role, sid: tokenHash, email: user.email }),
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
    session: { id: rows[0].id, createdAt: rows[0].created_at, expiresAt: rows[0].expires_at },
    user: publicUser(user),
  };
}

export function createAuthRouter(pool) {
  const router = express.Router();

  router.post(
    "/register",
    asyncHandler(async (req, res) => {
      const { email, password, name } = req.body || {};
      if (!email || !emailRe.test(String(email).toLowerCase())) {
        throw new HttpError(400, "VALIDATION_ERROR", "Укажите корректный email");
      }
      if (!name || String(name).trim().length < 2) {
        throw new HttpError(400, "VALIDATION_ERROR", "Имя должно быть не короче 2 символов");
      }
      if (!password || String(password).length < 8) {
        throw new HttpError(400, "VALIDATION_ERROR", "Пароль должен содержать минимум 8 символов");
      }

      const normalized = String(email).trim().toLowerCase();
      const existing = await pool.query("SELECT id FROM users WHERE email = $1", [normalized]);
      if (existing.rows.length) {
        throw new HttpError(409, "CONFLICT", "Пользователь с таким email уже существует");
      }

      const passwordHash = await hashPassword(password);
      const { rows } = await pool.query(
        `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role`,
        [normalized, passwordHash, String(name).trim(), ROLES.GUEST],
      );

      logger.info({ event: "user.registered", userId: rows[0].id, role: rows[0].role }, "user_registered");
      const payload = await createSession(pool, rows[0], req);
      res.status(201).json(payload);
    }),
  );

  router.post(
    "/login",
    asyncHandler(async (req, res) => {
      const { email, password } = req.body || {};
      const ip = clientIp(req);
      await enforceIpLimit(pool, ip);

      if (!email || !password) {
        throw new HttpError(400, "VALIDATION_ERROR", "Укажите email и пароль");
      }

      const normalized = String(email).trim().toLowerCase();
      const found = await pool.query("SELECT * FROM users WHERE email = $1", [normalized]);

      const onFail = async (status, code, message) => {
        await recordAttempt(pool, { email: normalized, ip, success: false });
        if (found.rows.length) {
          const user = found.rows[0];
          const fails = user.failed_logins + 1;
          const shouldLock = fails >= LOCK_AFTER_FAILS;
          await pool.query(
            `UPDATE users
             SET failed_logins = $1,
                 locked_until = CASE WHEN $2 THEN NOW() + ($3 || ' minutes')::interval ELSE locked_until END
             WHERE id = $4`,
            [fails, shouldLock, String(LOCK_MINUTES), user.id],
          );
          if (shouldLock) {
            logger.warn({ event: "auth.lock", userId: user.id, ip }, "account_locked");
            throw new HttpError(423, "ACCOUNT_LOCKED", `Аккаунт временно заблокирован на ${LOCK_MINUTES} мин. после нескольких неверных попыток.`);
          }
        }
        throw new HttpError(status, code, message);
      };

      if (!found.rows.length) {
        await onFail(401, "INVALID_CREDENTIALS", "Неверный email или пароль");
      }

      const user = found.rows[0];
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        await recordAttempt(pool, { email: normalized, ip, success: false });
        throw new HttpError(423, "ACCOUNT_LOCKED", "Аккаунт временно заблокирован. Попробуйте позже.");
      }

      const ok = await comparePassword(password, user.password_hash);
      if (!ok) {
        await onFail(401, "INVALID_CREDENTIALS", "Неверный email или пароль");
      }

      await pool.query("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1", [user.id]);
      await recordAttempt(pool, { email: normalized, ip, success: true });

      const payload = await createSession(pool, user, req);
      logger.info({ event: "auth.login", userId: user.id, role: user.role, ip }, "login_success");
      res.status(200).json(payload);
    }),
  );

  router.post(
    "/logout",
    authRequired(pool),
    asyncHandler(async (req, res) => {
      await pool.query("DELETE FROM sessions WHERE id = $1", [req.user.sessionId]);
      logger.info({ event: "auth.logout", userId: req.user.id }, "logout");
      res.status(204).send();
    }),
  );

  router.post(
    "/logout-all",
    authRequired(pool),
    asyncHandler(async (req, res) => {
      await pool.query("DELETE FROM sessions WHERE user_id = $1", [req.user.id]);
      logger.info({ event: "auth.logout_all", userId: req.user.id }, "logout_all");
      res.status(204).send();
    }),
  );

  router.get(
    "/me",
    authRequired(pool),
    asyncHandler(async (req, res) => {
      const { rows } = await pool.query("SELECT id, email, name, role FROM users WHERE id = $1", [req.user.id]);
      res.status(200).json({ user: publicUser(rows[0]) });
    }),
  );

  router.get(
    "/sessions",
    authRequired(pool),
    asyncHandler(async (req, res) => {
      const { rows } = await pool.query(
        `SELECT id, user_agent, ip, created_at, expires_at FROM sessions WHERE user_id = $1 ORDER BY created_at DESC`,
        [req.user.id],
      );
      res.status(200).json({
        maxSessions: MAX_SESSIONS,
        sessions: rows.map((s) => ({
          id: s.id,
          userAgent: s.user_agent,
          ip: s.ip,
          createdAt: s.created_at,
          expiresAt: s.expires_at,
          current: s.id === req.user.sessionId,
        })),
      });
    }),
  );

  router.delete(
    "/sessions/:id",
    authRequired(pool),
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        throw new HttpError(400, "VALIDATION_ERROR", "Некорректный идентификатор сессии");
      }
      const { rows } = await pool.query("DELETE FROM sessions WHERE id = $1 AND user_id = $2 RETURNING id", [id, req.user.id]);
      if (!rows.length) {
        throw new HttpError(404, "NOT_FOUND", "Сессия не найдена");
      }
      res.status(204).send();
    }),
  );

  router.post(
    "/forgot-password",
    asyncHandler(async (req, res) => {
      const { email } = req.body || {};
      if (!email || !emailRe.test(String(email).trim().toLowerCase())) {
        throw new HttpError(400, "VALIDATION_ERROR", "Укажите корректный email");
      }

      const normalized = String(email).trim().toLowerCase();
      const { rows } = await pool.query("SELECT id, email, name FROM users WHERE email = $1", [normalized]);

      let devToken = null;
      if (rows.length > 0) {
        const user = rows[0];
        const rawToken = generateRawToken();
        const tokenHash = hashToken(rawToken);

        await pool.query("UPDATE password_resets SET used = TRUE WHERE user_id = $1 AND used = FALSE", [user.id]);
        await pool.query(
          `INSERT INTO password_resets (user_id, token_hash, expires_at)
           VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval)`,
          [user.id, tokenHash, String(RESET_TOKEN_TTL_MINUTES)],
        );

        const origin = req.headers.origin || "http://localhost:3000";
        await emailService.sendPasswordResetEmail({
          to: user.email,
          userName: user.name,
          resetToken: rawToken,
          expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
          origin,
        });

        logger.info({ event: "auth.forgot_password_requested", userId: user.id }, "forgot_password_requested");
        if (process.env.NODE_ENV !== "production") devToken = rawToken;
      } else {
        logger.info({ event: "auth.forgot_password_unknown_email", email: normalized }, "forgot_password_unknown_email");
      }

      res.status(200).json({
        message: "Если данный email зарегистрирован в системе, на него отправлены инструкции по сбросу пароля.",
        ...(devToken ? { devResetToken: devToken } : {}),
      });
    }),
  );

  router.post(
    "/reset-password",
    asyncHandler(async (req, res) => {
      const { token, newPassword } = req.body || {};
      if (!token || typeof token !== "string" || !token.trim().length) {
        throw new HttpError(400, "VALIDATION_ERROR", "Укажите ключ восстановления пароля");
      }
      if (!newPassword || String(newPassword).length < 8) {
        throw new HttpError(400, "VALIDATION_ERROR", "Новый пароль должен содержать минимум 8 символов");
      }

      const tokenHash = hashToken(token.trim());
      const { rows } = await pool.query(
        `SELECT pr.id AS reset_id, pr.user_id, pr.expires_at, pr.used FROM password_resets pr WHERE pr.token_hash = $1`,
        [tokenHash],
      );

      if (!rows.length || rows[0].used || new Date(rows[0].expires_at) < new Date()) {
        throw new HttpError(400, "INVALID_OR_EXPIRED_TOKEN", "Временный ключ восстановления недействителен или срок его действия истёк");
      }

      const resetRecord = rows[0];
      const passwordHash = await hashPassword(newPassword);

      await pool.query("UPDATE users SET password_hash = $1, failed_logins = 0, locked_until = NULL WHERE id = $2", [
        passwordHash,
        resetRecord.user_id,
      ]);
      await pool.query("UPDATE password_resets SET used = TRUE WHERE id = $1", [resetRecord.reset_id]);
      await pool.query("DELETE FROM sessions WHERE user_id = $1", [resetRecord.user_id]);

      logger.info({ event: "auth.password_reset_success", userId: resetRecord.user_id }, "password_reset_success");
      res.status(200).json({
        message: "Пароль успешно изменён. Теперь вы можете войти в систему с новым паролем.",
      });
    }),
  );

  return router;
}
