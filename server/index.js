import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import pkg from "pg";
import { logger, httpLogger } from "./lib/logger.js";
import { HttpError, asyncHandler, errorHandler, notFoundHandler } from "./lib/errors.js";
import { createAuthRouter } from "./routes/auth.js";
import { authRequired, requireRoles, hashPassword } from "./middleware/auth.js";
import { ROLES } from "./lib/roles.js";

const { Pool } = pkg;
const app = express();
const PORT = process.env.PORT || 5001;

const pool = new Pool({
  host: process.env.DB_HOST || "db",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "hotel_db",
  port: Number(process.env.DB_PORT || 5432),
});

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Разрешены только изображения"));
    }
  },
});

const deleteUploadIfExists = (imageUrl) => {
  if (!imageUrl || !imageUrl.startsWith("/uploads/")) return;
  const filePath = path.join(uploadDir, path.basename(imageUrl));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
};

const parsePrice = (price) => {
  const p = parseFloat(price);
  return isNaN(p) || p <= 0 ? null : p;
};

const parseBookedFlag = (val) => {
  if (typeof val === "boolean") return val;
  return val === "true" || val === "1" ? true : val === "false" || val === "0" ? false : Boolean(val);
};

const parseId = (id) => {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "Некорректный идентификатор");
  }
  return n;
};

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));
app.use(httpLogger);
app.use("/uploads", express.static(uploadDir));

app.get("/api/health", (req, res) => res.status(200).json({ status: "ok" }));
app.use("/api/auth", createAuthRouter(pool));

app.get(
  "/api/rooms",
  authRequired(pool),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query("SELECT * FROM rooms ORDER BY id DESC");
    res.status(200).json(rows);
  }),
);

app.get(
  "/api/rooms/:id",
  authRequired(pool),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { rows } = await pool.query("SELECT * FROM rooms WHERE id = $1", [id]);
    if (!rows.length) throw new HttpError(404, "NOT_FOUND", "Номер не найден");
    res.status(200).json(rows[0]);
  }),
);

app.post(
  "/api/rooms",
  authRequired(pool),
  requireRoles(ROLES.MANAGER, ROLES.ADMIN),
  upload.single("image"),
  asyncHandler(async (req, res) => {
    const { title, price, description } = req.body;
    if (!title || !title.trim()) throw new HttpError(400, "VALIDATION_ERROR", "Название номера обязательно");

    const parsedPrice = parsePrice(price);
    if (parsedPrice === null) throw new HttpError(400, "VALIDATION_ERROR", "Укажите корректную цену больше 0");

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const { rows } = await pool.query(
      "INSERT INTO rooms (title, price, description, image_url) VALUES ($1, $2, $3, $4) RETURNING *",
      [title.trim(), parsedPrice, description || "", imageUrl],
    );

    logger.info({ event: "room.created", roomId: rows[0].id, userId: req.user.id }, "room_created");
    res.status(201).json(rows[0]);
  }),
);

app.put(
  "/api/rooms/:id",
  authRequired(pool),
  requireRoles(ROLES.MANAGER, ROLES.ADMIN),
  upload.single("image"),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { title, price, description, is_booked } = req.body;

    if (!title || !title.trim()) throw new HttpError(400, "VALIDATION_ERROR", "Название номера обязательно");
    const parsedPrice = parsePrice(price);
    if (parsedPrice === null) throw new HttpError(400, "VALIDATION_ERROR", "Укажите корректную цену");

    const existing = await pool.query("SELECT image_url FROM rooms WHERE id = $1", [id]);
    if (!existing.rows.length) throw new HttpError(404, "NOT_FOUND", "Ресурс не найден для обновления");

    let imageUrl = existing.rows[0].image_url;
    if (req.file) {
      deleteUploadIfExists(imageUrl);
      imageUrl = `/uploads/${req.file.filename}`;
    }

    const { rows } = await pool.query(
      "UPDATE rooms SET title = $1, price = $2, description = $3, is_booked = $4, image_url = $5 WHERE id = $6 RETURNING *",
      [title.trim(), parsedPrice, description || "", parseBookedFlag(is_booked), imageUrl, id],
    );

    logger.info({ event: "room.updated", roomId: id, userId: req.user.id }, "room_updated");
    res.status(200).json(rows[0]);
  }),
);

app.patch(
  "/api/rooms/:id/book",
  authRequired(pool),
  requireRoles(ROLES.GUEST, ROLES.MANAGER, ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { is_booked } = req.body;

    const { rows } = await pool.query("UPDATE rooms SET is_booked = $1 WHERE id = $2 RETURNING *", [Boolean(is_booked), id]);
    if (!rows.length) throw new HttpError(404, "NOT_FOUND", "Номер не найден");

    logger.info({ event: "room.booked", roomId: id, userId: req.user.id, is_booked: Boolean(is_booked) }, "room_booking_changed");
    res.status(200).json(rows[0]);
  }),
);

app.delete(
  "/api/rooms/:id",
  authRequired(pool),
  requireRoles(ROLES.ADMIN),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { rows } = await pool.query("DELETE FROM rooms WHERE id = $1 RETURNING *", [id]);
    if (!rows.length) throw new HttpError(404, "NOT_FOUND", "Номер не найден для удаления");

    deleteUploadIfExists(rows[0].image_url);
    logger.info({ event: "room.deleted", roomId: id, userId: req.user.id }, "room_deleted");
    res.status(200).json({ message: "Номер успешно удален", id });
  }),
);

app.use(notFoundHandler);
app.use(errorHandler(logger));

const seedUsers = async () => {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM users");
  if (rows[0].n > 0) return;

  const seeds = [
    { email: "admin@hotel.local", password: "Admin12345", name: "Администратор", role: ROLES.ADMIN },
    { email: "manager@hotel.local", password: "Manager12345", name: "Менеджер", role: ROLES.MANAGER },
    { email: "guest@hotel.local", password: "Guest12345", name: "Гость", role: ROLES.GUEST },
  ];

  for (const u of seeds) {
    const passwordHash = await hashPassword(u.password);
    await pool.query("INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4)", [
      u.email,
      passwordHash,
      u.name,
      u.role,
    ]);
  }
  logger.info({ event: "db.seeded", users: seeds.length }, "demo_users_created");
};

const initDb = async () => {
  try {
    const sql = fs.readFileSync(path.join(process.cwd(), "schema.sql"), "utf8");
    await pool.query(sql);
    await seedUsers();
    app.listen(PORT, "0.0.0.0", () => {
      logger.info({ event: "server.start", port: PORT }, "server_listening");
    });
  } catch (err) {
    logger.error({ err, event: "db.init_failed" }, "db_init_retry");
    setTimeout(initDb, 5000);
  }
};

initDb();

