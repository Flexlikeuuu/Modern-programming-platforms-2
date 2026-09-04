const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});
const upload = multer({ storage });

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadDir));

let items = [
  {
    id: 1,
    title: "Разработать архитектуру БД",
    category: "Backend",
    status: "in_progress",
    dueDate: "2026-09-10",
    attachments: [],
  },
  {
    id: 2,
    title: "Подготовить макеты UI",
    category: "Design",
    status: "completed",
    dueDate: "2026-09-01",
    attachments: [],
  },
];

app.get("/", (req, res) => {
  const { statusFilter, categoryFilter } = req.query;

  let filteredItems = [...items];

  if (statusFilter && statusFilter !== "all") {
    filteredItems = filteredItems.filter(
      (item) => item.status === statusFilter,
    );
  }

  if (categoryFilter && categoryFilter !== "all") {
    filteredItems = filteredItems.filter(
      (item) => item.category === categoryFilter,
    );
  }

  const categories = [...new Set(items.map((item) => item.category))];

  res.render("index", {
    items: filteredItems,
    categories,
    selectedStatus: statusFilter || "all",
    selectedCategory: categoryFilter || "all",
  });
});

app.post("/items/create", (req, res) => {
  const { title, category, dueDate } = req.body;

  if (title && category && dueDate) {
    const newItem = {
      id: Date.now(),
      title: title.trim(),
      category: category.trim(),
      status: "pending",
      dueDate,
      attachments: [],
    };
    items.push(newItem);
  }

  res.redirect("/");
});

app.post("/items/:id/status", (req, res) => {
  const itemId = Number(req.params.id);
  const { status } = req.body;

  const item = items.find((i) => i.id === itemId);
  if (item && ["pending", "in_progress", "completed"].includes(status)) {
    item.status = status;
  }

  res.redirect("/");
});

app.post("/items/:id/upload", upload.single("attachment"), (req, res) => {
  const itemId = Number(req.params.id);
  const item = items.find((i) => i.id === itemId);

  if (item && req.file) {
    item.attachments.push({
      originalName: req.file.originalname,
      filename: req.file.filename,
      path: `/uploads/${req.file.filename}`,
    });
  }

  res.redirect("/");
});

app.post("/items/:id/delete", (req, res) => {
  const itemId = Number(req.params.id);
  items = items.filter((i) => i.id !== itemId);
  res.redirect("/");
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
