import assert from "node:assert/strict";
import { test } from "node:test";
import { userCreationError } from "./userCreationError";

test("surfaces production password validation rather than the generic error", () => {
  const error = Object.assign(new Error("Unprocessable Entity"), {
    clerkError: true, status: 422,
    errors: [{ message: "Too short", longMessage: "Passwords must be 15 characters or more." }],
  });
  assert.deepEqual(userCreationError(error), {
    status: 422, error: "Passwords must be 15 characters or more.",
  });
});

test("retains duplicate-account and other field validation messages", () => {
  assert.deepEqual(userCreationError({
    clerkError: true, status: 409, errors: [{ message: "That email address is taken." }],
  }), { status: 409, error: "That email address is taken." });
});

test("does not expose unexpected internal errors", () => {
  const result = userCreationError(new Error("Internal configuration details"));
  assert.equal(result.status, 503);
  assert.equal(result.error.includes("Internal"), false);
});

test("handles rate limiting and missing validation details", () => {
  assert.equal(userCreationError({ clerkError: true, status: 429 }).status, 429);
  const result = userCreationError({ clerkError: true, status: 422 });
  assert.equal(result.status, 422);
  assert.match(result.error, /email address and password/);
});
