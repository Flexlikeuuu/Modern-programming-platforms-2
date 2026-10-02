import { test } from "node:test";
import assert from "node:assert/strict";
import pino from "pino";

test("Structured logger emits valid JSON with service name and ISO timestamp", () => {
  let capturedLog = null;
  const destination = {
    write(str) {
      capturedLog = JSON.parse(str);
    },
  };

  const testLogger = pino(
    {
      base: { service: "hotel-booking-server" },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );

  testLogger.info({ event: "auth.login", userId: 123 }, "User logged in");

  assert.ok(capturedLog);
  assert.equal(capturedLog.service, "hotel-booking-server");
  assert.equal(capturedLog.event, "auth.login");
  assert.equal(capturedLog.userId, 123);
  assert.equal(capturedLog.msg, "User logged in");
  assert.ok(typeof capturedLog.time === "string");
  // Check ISO timestamp format YYYY-MM-DDTHH:mm:ss.sssZ
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(capturedLog.time));
});

test("Structured logger redacts passwords and secret tokens", () => {
  let capturedLog = null;
  const destination = {
    write(str) {
      capturedLog = JSON.parse(str);
    },
  };

  const testLogger = pino(
    {
      redact: {
        paths: ["password", "newPassword", "token", "resetToken", "req.headers.authorization"],
        censor: "[REDACTED]",
      },
    },
    destination,
  );

  testLogger.info(
    {
      event: "auth.attempt",
      password: "SecretPassword123",
      resetToken: "abcd1234efgh5678",
      req: { headers: { authorization: "Bearer secret-token" } },
    },
    "Authentication attempt",
  );

  assert.ok(capturedLog);
  assert.equal(capturedLog.password, "[REDACTED]");
  assert.equal(capturedLog.resetToken, "[REDACTED]");
  assert.equal(capturedLog.req.headers.authorization, "[REDACTED]");
});
