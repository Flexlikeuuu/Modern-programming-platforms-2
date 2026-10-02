import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { HttpError, asyncHandler } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { canAccess } from "../lib/roles.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

export const hashToken = (token) => createHash("sha256").update(token).digest("hex");
export const generateRawToken = () => randomBytes(32).toString("hex");
export const signAccessToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
export const hashPassword = (password) => bcrypt.hash(password, 10);
export const comparePassword = (password, hash) => bcrypt.compare(password, hash);

export const clientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
};

export const authRequired = (pool) =>
  asyncHandler(async (req, res, next) => {
    const [scheme, token] = (req.headers.authorization || "").split(" ");
    if (scheme !== "Bearer" || !token) {
      throw new HttpError(401, "UNAUTHORIZED", "Требуется временный ключ доступа");
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      throw new HttpError(
        401,
        err.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
        err.name === "TokenExpiredError" ? "Срок действия ключа истёк" : "Недействительный ключ доступа",
      );
    }

    const { rows } = await pool.query(
      `SELECT s.id, s.user_id, s.expires_at, u.email, u.name, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1`,
      [decoded.sid],
    );

    if (!rows.length) {
      throw new HttpError(401, "SESSION_REVOKED", "Сессия отозвана или не найдена");
    }

    if (new Date(rows[0].expires_at) < new Date()) {
      await pool.query("DELETE FROM sessions WHERE id = $1", [rows[0].id]);
      throw new HttpError(401, "SESSION_EXPIRED", "Сессия истекла");
    }

    req.user = {
      id: rows[0].user_id,
      email: rows[0].email,
      name: rows[0].name,
      role: rows[0].role,
      sessionId: rows[0].id,
      sessionHash: decoded.sid,
    };

    logger.debug({ event: "auth.ok", userId: req.user.id, role: req.user.role }, "authenticated");
    next();
  });

export const requireRoles = (...roles) => (req, res, next) => {
  if (!req.user) {
    return next(new HttpError(401, "UNAUTHORIZED", "Требуется авторизация"));
  }
  if (!canAccess(req.user.role, roles)) {
    return next(
      new HttpError(403, "FORBIDDEN", "Недостаточно прав для этого действия", {
        required: roles,
        actual: req.user.role,
      }),
    );
  }
  next();
};

