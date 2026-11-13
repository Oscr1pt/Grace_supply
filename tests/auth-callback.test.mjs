import assert from "node:assert/strict";
import test from "node:test";
import { readAuthCallback } from "../src/lib/authCallback.js";

test("classifies an authorization-code callback as PKCE without exposing its code", () => {
  assert.deepEqual(readAuthCallback("http://localhost:8080/login?code=single-use-code"), {
    present: true,
    flowType: "pkce",
    type: null,
    hasError: false,
    errorCode: null,
  });
});

test("classifies a token-fragment invitation as implicit", () => {
  assert.deepEqual(
    readAuthCallback("http://localhost:8080/#access_token=secret&refresh_token=secret&type=invite"),
    {
      present: true,
      flowType: "implicit",
      type: "invite",
      hasError: false,
      errorCode: null,
    },
  );
});

test("recognizes invalid, expired, or reused callback errors in either URL component", () => {
  assert.equal(
    readAuthCallback("http://localhost:8080/reset-password?error_code=otp_expired").hasError,
    true,
  );
  assert.equal(
    readAuthCallback("http://localhost:8080/#error=access_denied&error_description=link+used")
      .hasError,
    true,
  );
});

test("preserves the Auth error code needed to explain a revoked account without exposing tokens", () => {
  const callback = readAuthCallback(
    "https://gracesupply.net/reset-password?error=access_denied&error_code=user_banned&error_description=User+banned",
  );
  assert.equal(callback.hasError, true);
  assert.equal(callback.errorCode, "user_banned");
  assert.equal(JSON.stringify(callback).includes("token"), false);
});

test("ordinary app navigation is not treated as an Auth callback", () => {
  assert.deepEqual(readAuthCallback("http://localhost:8080/login"), {
    present: false,
    flowType: "pkce",
    type: null,
    hasError: false,
    errorCode: null,
  });
});
