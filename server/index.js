import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import pkg from "pg";

const { Pool } = pkg;
const app = express();
const PORT = process.env.PORT || 5001;

const pool = new Pool({
  host: process.env.DB_HOST || "db",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "hotel_db",
  port: 5432,
});

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Разрешены только изображения"));
    }
  },
});

const deleteUploadIfExists = (imageUrl) => {
  if (!imageUrl || !imageUrl.startsWith("/uploads/")) return;
  const filePath = path.join(uploadDir, path.basename(imageUrl));
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

const parsePrice = (price) => {
  const parsed = parseFloat(price);
  if (isNaN(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseBookedFlag = (value) => {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return Boolean(value);
};

app.use(cors({ origin: true }));
app.use(express.json());
app.use("/uploads", express.static(uploadDir));

app.get("/api/rooms", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM rooms ORDER BY id DESC");
    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({ error: "Ошибка при получении списка номеров" });
  }
});

app.get("/api/rooms/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query("SELECT * FROM rooms WHERE id = $1", [
      id,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Номер не найден" });
    }
    res.status(200).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.post("/api/rooms", upload.single("image"), async (req, res) => {
  try {
    const { title, price, description } = req.body;

    if (!title || title.trim() === "") {
      return res.status(400).json({ error: "Название номера обязательно" });
    }
    const parsedPrice = parsePrice(price);
    if (parsedPrice === null) {
      return res
        .status(400)
        .json({ error: "Укажите корректную цену больше 0" });
    }

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const { rows } = await pool.query(
      "INSERT INTO rooms (title, price, description, image_url) VALUES ($1, $2, $3, $4) RETURNING *",
      [title.trim(), parsedPrice, description || "", imageUrl],
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    res
      .status(500)
      .json({ error: err.message || "Ошибка при создании номера" });
  }
});

app.put("/api/rooms/:id", upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, price, description, is_booked } = req.body;

    if (!title || title.trim() === "") {
      return res.status(400).json({ error: "Название номера обязательно" });
    }
    const parsedPrice = parsePrice(price);
    if (parsedPrice === null) {
      return res.status(400).json({ error: "Укажите корректную цену" });
    }

    const existing = await pool.query(
      "SELECT image_url FROM rooms WHERE id = $1",
      [id],
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Ресурс не найден для обновления" });
    }

    let imageUrl = existing.rows[0].image_url;
    if (req.file) {
      deleteUploadIfExists(imageUrl);
      imageUrl = `/uploads/${req.file.filename}`;
    }

    const { rows } = await pool.query(
      "UPDATE rooms SET title = $1, price = $2, description = $3, is_booked = $4, image_url = $5 WHERE id = $6 RETURNING *",
      [
        title.trim(),
        parsedPrice,
        description || "",
        parseBookedFlag(is_booked),
        imageUrl,
        id,
      ],
    );

    res.status(200).json(rows[0]);
  } catch (err) {
    res
      .status(500)
      .json({ error: err.message || "Ошибка при обновлении номера" });
  }
});

app.patch("/api/rooms/:id/book", async (req, res) => {
  try {
    const { id } = req.params;
    const { is_booked } = req.body;

    const { rows } = await pool.query(
      "UPDATE rooms SET is_booked = $1 WHERE id = $2 RETURNING *",
      [Boolean(is_booked), id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Номер не найден" });
    }

    res.status(200).json(rows[0]);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Ошибка при изменении статуса бронирования" });
  }
});

app.delete("/api/rooms/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      "DELETE FROM rooms WHERE id = $1 RETURNING *",
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Номер не найден для удаления" });
    }

    deleteUploadIfExists(rows[0].image_url);

    res.status(200).json({ message: "Номер успешно удален", id });
  } catch (err) {
    res.status(500).json({ error: "Ошибка при удалении номера" });
  }
});

const initDb = async () => {
  try {
    const sql = fs.readFileSync(path.join(process.cwd(), "schema.sql"), "utf8");
    await pool.query(sql);
    app.listen(PORT, "0.0.0.0", () =>
      console.log(`Server running on port ${PORT}`),
    );
  } catch (err) {
    console.error("Ошибка инициализации БД:", err);
    setTimeout(initDb, 5000);
  }
};

initDb();
