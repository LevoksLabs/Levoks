import { test, expect } from "@playwright/test";

test("configured Google login starts OAuth with account selection and callback", async ({ request }) => {
  const providers = await request.get("/api/auth/providers").then((response) => response.json());
  test.skip(!providers.google, "Google credentials are not configured in this environment.");
  const { csrfToken } = await request.get("/api/auth/csrf").then((response) => response.json());
  const response = await request.post("/api/auth/signin/google", {
    form: { csrfToken, callbackUrl: "/", json: "true" },
  });
  expect(response.ok()).toBe(true);
  const { url } = await response.json();
  const authorization = new URL(url);
  expect(authorization.hostname).toBe("accounts.google.com");
  expect(authorization.searchParams.get("client_id")).toMatch(/\.apps\.googleusercontent\.com$/);
  expect(authorization.searchParams.get("prompt")).toBe("select_account");
  expect(authorization.searchParams.get("redirect_uri")).toBe(providers.google.callbackUrl);
  expect(authorization.searchParams.get("state")).toBeTruthy();
  expect(authorization.searchParams.get("code_challenge")).toBeTruthy();
});
