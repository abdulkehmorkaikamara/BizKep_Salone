import { expect } from "@playwright/test";
import { BASE_URL, SESSIONS } from "./fixtures.mjs";

// Fails a test on any uncaught page error or red error toast, unless the test
// lists the toast text it expects in `page.expectedErrorToasts`.
export function trackErrors(test) {
  test.beforeEach(async ({ page }) => {
    page.errors = [];
    page.expectedErrorToasts = [];
    page.on("pageerror", error => page.errors.push(`Page error: ${error.message}`));
    // Keep tests off the internet: Turnstile is only used on the login screens,
    // which these tests skip, and a slow Google Fonts request can stall page loads.
    await page.route("https://challenges.cloudflare.com/**", route => route.abort());
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
    await page.addInitScript(() => {
      window.__errorToasts = [];
      new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) {
          if (node.classList?.contains("toast") && node.classList.contains("error")) window.__errorToasts.push(node.textContent.trim());
        }
      }).observe(document, { childList: true, subtree: true });
    });
  });

  test.afterEach(async ({ page }) => {
    const errorToasts = await page.evaluate(() => window.__errorToasts || []).catch(() => []);
    const unexpected = errorToasts.filter(text => !page.expectedErrorToasts.some(expected => text.includes(expected)));
    expect([...page.errors, ...unexpected.map(text => `Error toast: ${text}`)]).toEqual([]);
  });
}

export async function openAs(page, sessionKey) {
  await page.context().addCookies([{
    name: "bizkep_session", value: SESSIONS[sessionKey].token,
    domain: "localhost", path: "/", httpOnly: true, secure: true, sameSite: "Strict"
  }]);
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/authenticated/);
}

// Calls the API directly as a role, outside the browser page under test.
export async function apiAs(sessionKey, path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Origin: BASE_URL, Cookie: `bizkep_session=${SESSIONS[sessionKey].token}` },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, data: await response.json() };
}
