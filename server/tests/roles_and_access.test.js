import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { ROLES, ROLE_RANK, canAccess } from "../lib/roles.js";
import {
  requireRoles,
  signAccessToken,
  hashToken,
  generateRawToken,
} from "../middleware/auth.js";
import { HttpError } from "../lib/errors.js";

test("Role model defines at least 3 distinct roles", () => {
  assert.equal(ROLES.GUEST, "guest");
  assert.equal(ROLES.MANAGER, "manager");
  assert.equal(ROLES.ADMIN, "admin");
  assert.ok(ROLE_RANK[ROLES.GUEST] < ROLE_RANK[ROLES.MANAGER]);
  assert.ok(ROLE_RANK[ROLES.MANAGER] < ROLE_RANK[ROLES.ADMIN]);
});

test("canAccess enforces role-based access rules", () => {
  const readRoles = [ROLES.GUEST, ROLES.MANAGER, ROLES.ADMIN];
  const manageRoles = [ROLES.MANAGER, ROLES.ADMIN];
  const adminOnly = [ROLES.ADMIN];

  assert.equal(canAccess(ROLES.GUEST, readRoles), true);
  assert.equal(canAccess(ROLES.GUEST, manageRoles), false);
  assert.equal(canAccess(ROLES.GUEST, adminOnly), false);

  assert.equal(canAccess(ROLES.MANAGER, readRoles), true);
  assert.equal(canAccess(ROLES.MANAGER, manageRoles), true);
  assert.equal(canAccess(ROLES.MANAGER, adminOnly), false);

  assert.equal(canAccess(ROLES.ADMIN, readRoles), true);
  assert.equal(canAccess(ROLES.ADMIN, manageRoles), true);
  assert.equal(canAccess(ROLES.ADMIN, adminOnly), true);
});

test("requireRoles middleware permits authorized role and passes to next()", () => {
  const middleware = requireRoles(ROLES.MANAGER, ROLES.ADMIN);
  const req = { user: { role: ROLES.MANAGER } };
  const res = {};
  let nextCalled = false;
  let nextErr = null;

  middleware(req, res, (err) => {
    nextCalled = true;
    nextErr = err;
  });

  assert.equal(nextCalled, true);
  assert.equal(nextErr, undefined);
});

test("requireRoles middleware denies unauthorized role with 403 Forbidden", () => {
  const middleware = requireRoles(ROLES.ADMIN);
  const req = { user: { role: ROLES.GUEST } };
  const res = {};
  let capturedErr = null;

  middleware(req, res, (err) => {
    capturedErr = err;
  });

  assert.ok(capturedErr instanceof HttpError);
  assert.equal(capturedErr.status, 403);
  assert.equal(capturedErr.code, "FORBIDDEN");
  assert.deepEqual(capturedErr.details, {
    required: [ROLES.ADMIN],
    actual: ROLES.GUEST,
  });
});

test("requireRoles middleware rejects unauthenticated request with 401 Unauthorized", () => {
  const middleware = requireRoles(ROLES.GUEST);
  const req = {};
  const res = {};
  let capturedErr = null;

  middleware(req, res, (err) => {
    capturedErr = err;
  });

  assert.ok(capturedErr instanceof HttpError);
  assert.equal(capturedErr.status, 401);
  assert.equal(capturedErr.code, "UNAUTHORIZED");
});

test("Temporary keys: signAccessToken creates valid expiring JWT token", () => {
  const payload = {
    sub: 42,
    role: ROLES.GUEST,
    sid: hashToken(generateRawToken()),
    email: "guest@hotel.local",
  };

  const token = signAccessToken(payload);
  assert.ok(typeof token === "string" && token.length > 20);

  const decoded = jwt.decode(token);
  assert.equal(decoded.sub, 42);
  assert.equal(decoded.role, ROLES.GUEST);
  assert.equal(decoded.email, "guest@hotel.local");
  assert.equal(decoded.sid, payload.sid);
  assert.ok(decoded.exp > decoded.iat);
});
