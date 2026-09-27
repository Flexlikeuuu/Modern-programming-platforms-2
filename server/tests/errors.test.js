import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpError, httpErrorBody } from "../lib/errors.js";
import { canAccess, ROLES } from "../lib/roles.js";

test("HttpError stores HTTP semantics", () => {
  const err = new HttpError(401, "UNAUTHORIZED", "Нужен токен");
  assert.equal(err.status, 401);
  assert.equal(err.code, "UNAUTHORIZED");
});

test("httpErrorBody matches RFC-style JSON error", () => {
  const body = httpErrorBody(404, "NOT_FOUND", "Не найдено");
  assert.deepEqual(body, {
    error: { status: 404, code: "NOT_FOUND", message: "Не найдено" },
  });
});

test("guest cannot access manager routes", () => {
  assert.equal(canAccess(ROLES.GUEST, [ROLES.MANAGER, ROLES.ADMIN]), false);
  assert.equal(canAccess(ROLES.ADMIN, [ROLES.MANAGER, ROLES.ADMIN]), true);
});
