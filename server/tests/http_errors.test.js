import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HttpError,
  httpErrorBody,
  errorHandler,
  notFoundHandler,
} from "../lib/errors.js";

// Mock logger that doesn't output to stdout during tests
const mockLogger = {
  warn: () => {},
  error: () => {},
  info: () => {},
  debug: () => {},
};

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(s) {
      this.statusCode = s;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    send() {
      return this;
    },
  };
  return res;
}

test("HttpError constructor sets status, code, message and details", () => {
  const err = new HttpError(422, "UNPROCESSABLE", "Неверный формат", { field: "price" });
  assert.equal(err.status, 422);
  assert.equal(err.code, "UNPROCESSABLE");
  assert.equal(err.message, "Неверный формат");
  assert.deepEqual(err.details, { field: "price" });
});

test("httpErrorBody creates RFC-compliant structured error object", () => {
  const body = httpErrorBody(400, "VALIDATION_ERROR", "Неверные данные", {
    email: "Некорректный email",
  });
  assert.deepEqual(body, {
    error: {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Неверные данные",
      details: { email: "Некорректный email" },
    },
  });
});

test("errorHandler correctly processes HttpError with semantic HTTP status", () => {
  const handler = errorHandler(mockLogger);
  const testCases = [
    { status: 400, code: "VALIDATION_ERROR", msg: "Ошибка валидации" },
    { status: 401, code: "UNAUTHORIZED", msg: "Требуется авторизация" },
    { status: 403, code: "FORBIDDEN", msg: "Недостаточно прав" },
    { status: 404, code: "NOT_FOUND", msg: "Ресурс не найден" },
    { status: 409, code: "CONFLICT", msg: "Пользователь уже существует" },
    { status: 415, code: "UNSUPPORTED_MEDIA_TYPE", msg: "Разрешены только изображения" },
    { status: 423, code: "ACCOUNT_LOCKED", msg: "Аккаунт заблокирован" },
    { status: 429, code: "TOO_MANY_REQUESTS", msg: "Слишком много запросов" },
  ];

  for (const tc of testCases) {
    const err = new HttpError(tc.status, tc.code, tc.msg);
    const req = { originalUrl: "/test", method: "GET", id: "req-1" };
    const res = createMockRes();

    handler(err, req, res, () => {});

    assert.equal(res.statusCode, tc.status);
    assert.equal(res.body.error.status, tc.status);
    assert.equal(res.body.error.code, tc.code);
    assert.equal(res.body.error.message, tc.msg);
  }
});

test("errorHandler transforms Multer LIMIT_FILE_SIZE error into 413 Payload Too Large", () => {
  const handler = errorHandler(mockLogger);
  const multerErr = new Error("File too large");
  multerErr.name = "MulterError";
  multerErr.code = "LIMIT_FILE_SIZE";

  const req = { originalUrl: "/api/rooms", method: "POST" };
  const res = createMockRes();

  handler(multerErr, req, res, () => {});

  assert.equal(res.statusCode, 413);
  assert.equal(res.body.error.code, "UPLOAD_ERROR");
});

test("errorHandler transforms unexpected exceptions into 500 Internal Server Error", () => {
  const handler = errorHandler(mockLogger);
  const internalErr = new TypeError("Cannot read property of undefined");

  const req = { originalUrl: "/crash", method: "GET", id: "req-crash" };
  const res = createMockRes();

  handler(internalErr, req, res, () => {});

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error.status, 500);
  assert.equal(res.body.error.code, "INTERNAL_ERROR");
});

test("notFoundHandler responds with 404 and structured NOT_FOUND error", () => {
  const req = { originalUrl: "/non-existent" };
  const res = createMockRes();

  notFoundHandler(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error.status, 404);
  assert.equal(res.body.error.code, "NOT_FOUND");
});
