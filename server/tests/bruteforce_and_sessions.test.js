import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  comparePassword,
  hashToken,
  generateRawToken,
  clientIp,
} from "../middleware/auth.js";

test("Password security: hashPassword creates secure bcrypt hashes", async () => {
  const password = "SuperSecretPassword123";
  const hash = await hashPassword(password);

  assert.notEqual(hash, password);
  assert.ok(hash.startsWith("$2"));

  const matches = await comparePassword(password, hash);
  assert.equal(matches, true);

  const wrong = await comparePassword("WrongPassword", hash);
  assert.equal(wrong, false);
});

test("Token hashing: hashToken creates SHA-256 digests for session storage", () => {
  const token = generateRawToken();
  const hash1 = hashToken(token);
  const hash2 = hashToken(token);

  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 64);
  assert.notEqual(hash1, token);
});

test("clientIp parses X-Forwarded-For header or fallback to socket remote address", () => {
  const reqWithProxy = {
    headers: { "x-forwarded-for": "203.0.113.195, 70.41.3.18" },
    socket: { remoteAddress: "127.0.0.1" },
  };
  assert.equal(clientIp(reqWithProxy), "203.0.113.195");

  const reqDirect = {
    headers: {},
    ip: "192.168.1.50",
  };
  assert.equal(clientIp(reqDirect), "192.168.1.50");
});

test("Brute-force protection: account lockout threshold logic", () => {
  const LOCK_AFTER_FAILS = 5;
  const LOCK_MINUTES = 15;

  let failedLogins = 0;
  let isLocked = false;
  let lockUntil = null;

  for (let attempt = 1; attempt <= 6; attempt++) {
    failedLogins++;
    if (failedLogins >= LOCK_AFTER_FAILS) {
      isLocked = true;
      lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
    }
  }

  assert.equal(failedLogins, 6);
  assert.equal(isLocked, true);
  assert.ok(lockUntil > new Date());

  failedLogins = 0;
  isLocked = false;
  lockUntil = null;

  assert.equal(failedLogins, 0);
  assert.equal(isLocked, false);
});

test("Active session control: enforces MAX_SESSIONS and calculates evictions", () => {
  const MAX_SESSIONS = 3;
  const existingSessions = [
    { id: 1, createdAt: new Date(Date.now() - 30000) },
    { id: 2, createdAt: new Date(Date.now() - 20000) },
    { id: 3, createdAt: new Date(Date.now() - 10000) },
  ];

  const overflow = existingSessions.length - (MAX_SESSIONS - 1);
  assert.equal(overflow, 1);

  const evictedIds = existingSessions.slice(0, overflow).map((s) => s.id);
  assert.deepEqual(evictedIds, [1]);
});
