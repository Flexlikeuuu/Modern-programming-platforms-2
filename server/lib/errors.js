export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export const httpErrorBody = (status, code, message, details) => ({
  error: {
    status,
    code,
    message,
    ...(details !== undefined ? { details } : {}),
  },
});

export const errorHandler = (logger) => (err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    logger.warn({ err_code: err.code, status: err.status, path: req.originalUrl, method: req.method, requestId: req.id }, err.message);
    return res.status(err.status).json(httpErrorBody(err.status, err.code, err.message, err.details));
  }

  if (err.name === "MulterError") {
    const isSize = err.code === "LIMIT_FILE_SIZE";
    const status = isSize ? 413 : 400;
    const msg = isSize ? "Файл слишком большой (макс. 5 МБ)" : "Ошибка загрузки файла";
    logger.warn({ err, path: req.originalUrl }, msg);
    return res.status(status).json(httpErrorBody(status, "UPLOAD_ERROR", msg));
  }

  if (err.status && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json(httpErrorBody(err.status, err.code || "REQUEST_ERROR", err.message || "Ошибка запроса"));
  }

  logger.error({ err, path: req.originalUrl, method: req.method, requestId: req.id }, "unhandled_error");
  return res.status(500).json(httpErrorBody(500, "INTERNAL_ERROR", "Внутренняя ошибка сервера"));
};

export const notFoundHandler = (req, res) =>
  res.status(404).json(httpErrorBody(404, "NOT_FOUND", "Маршрут не найден"));

