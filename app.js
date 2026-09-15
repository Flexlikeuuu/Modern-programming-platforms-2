const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const dataFilePath = path.join(__dirname, "data.json");

const loadItems = () => {
  if (!fs.existsSync(dataFilePath)) {
    fs.writeFileSync(dataFilePath, JSON.stringify([], null, 2));
    return [];
  }
  try {
    const data = fs.readFileSync(dataFilePath, "utf8");
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
};

const saveItems = (items) => {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(items, null, 2));
  } catch (err) {}
};

let items = loadItems();

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

// Подключение статической папки public (CSS, JS на клиенте, картинки)
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadDir));

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
    saveItems(items);
  }

  res.redirect("/");
});

app.post("/items/:id/status", (req, res) => {
  const itemId = Number(req.params.id);
  const { status } = req.body;

  const item = items.find((i) => i.id === itemId);
  if (item && ["pending", "in_progress", "completed"].includes(status)) {
    item.status = status;
    saveItems(items);
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
    saveItems(items);
  }

  res.redirect("/");
});

app.post("/items/:id/delete", (req, res) => {
  const itemId = Number(req.params.id);
  items = items.filter((i) => i.id !== itemId);
  saveItems(items);
  res.redirect("/");
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
