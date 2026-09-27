import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { HttpError, asyncHandler } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { canAccess } from "../lib/roles.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateRawToken() {
  return randomBytes(32).toString("hex");
}

export function signAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export function authRequired(pool) {
  return asyncHandler(async (req, res, next) => {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      throw new HttpError(401, "UNAUTHORIZED", "Требуется временный ключ доступа");
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        throw new HttpError(401, "TOKEN_EXPIRED", "Срок действия ключа истёк");
      }
      throw new HttpError(401, "INVALID_TOKEN", "Недействительный ключ доступа");
    }

    const session = await pool.query(
      `SELECT s.id, s.user_id, s.expires_at, u.email, u.name, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1`,
      [decoded.sid],
    );

    if (session.rows.length === 0) {
      throw new HttpError(401, "SESSION_REVOKED", "Сессия отозвана или не найдена");
    }

    if (new Date(session.rows[0].expires_at) < new Date()) {
      await pool.query("DELETE FROM sessions WHERE id = $1", [session.rows[0].id]);
      throw new HttpError(401, "SESSION_EXPIRED", "Сессия истекла");
    }

    const row = session.rows[0];
    req.user = {
      id: row.user_id,
      email: row.email,
      name: row.name,
      role: row.role,
      sessionId: row.id,
      sessionHash: decoded.sid,
    };

    logger.debug(
      { event: "auth.ok", userId: req.user.id, role: req.user.role },
      "authenticated",
    );
    next();
  });
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new HttpError(401, "UNAUTHORIZED", "Требуется авторизация"));
    }
    if (!canAccess(req.user.role, roles)) {
      return next(
        new HttpError(
          403,
          "FORBIDDEN",
          "Недостаточно прав для этого действия",
          { required: roles, actual: req.user.role },
        ),
      );
    }
    next();
  };
}
