// Sales recorded without internet are saved on the device and synced once the
// connection returns, exactly once, even when they take stock below zero.
import { test, expect } from "@playwright/test";
import { trackErrors, openAs, apiAs } from "./helpers.mjs";

trackErrors(test);

const productStock = async id => (await apiAs("owner", "/api/state")).data.state.products.find(product => product.id === id).stock;
const salesWithId = async id => (await apiAs("owner", "/api/state")).data.state.sales.filter(sale => sale.id === id);
const pendingSaleIds = page => page.evaluate(() => JSON.parse(localStorage.getItem("bizkep-pending-sales-v1") || "[]").map(sale => sale.id));

async function sellOffline(page, productId, quantity = 1) {
  await page.locator('.nav-item[data-view="sales"]').click();
  for (let i = 0; i < quantity; i++) await page.locator(`[data-add-product="${productId}"]`).click();
  await page.locator("#checkoutButton").click();
  await page.locator("#confirmSale").click();
  await expect(page.locator("#modal")).toContainText("Sale saved on this phone");
  await page.locator("#modal").getByRole("button", { name: "Done" }).click();
  const [saleId] = (await pendingSaleIds(page)).slice(-1);
  return saleId;
}

test("an offline sale syncs exactly once when the internet returns", async ({ page, context }) => {
  await openAs(page, "attendant");
  const stockBefore = await productStock("p1");
  await context.setOffline(true);
  await expect(page.locator("#connectionPill")).toContainText("Offline");

  const saleId = await sellOffline(page, "p1");
  await expect(page.locator("#syncTitle")).toHaveText("1 sale waiting to sync");
  expect(await salesWithId(saleId)).toHaveLength(0);

  await context.setOffline(false);
  await expect(page.locator(".toast:not(.error)", { hasText: "1 offline sale synced" })).toBeVisible();
  await expect(page.locator("#syncTitle")).not.toContainText("waiting");
  expect(await pendingSaleIds(page)).toEqual([]);

  const recorded = await salesWithId(saleId);
  expect(recorded).toHaveLength(1);
  expect(recorded[0].soldOffline).toBe(true);
  expect(await productStock("p1")).toBe(stockBefore - 1);

  // Re-sending the same sale (e.g. a retry after a dropped response) is ignored.
  const resend = await apiAs("attendant", "/api/action", { action: "create_sale", payload: { saleId, offline: true, soldAt: new Date().toISOString(), items: [{ productId: "p1", qty: 1 }], discount: 0, payments: { cash: 20, orange: 0, afrimoney: 0 } } });
  expect(resend.status).toBe(200);
  expect(await salesWithId(saleId)).toHaveLength(1);
  expect(await productStock("p1")).toBe(stockBefore - 1);
});

test("an offline sale can take stock below zero", async ({ page, context }) => {
  await openAs(page, "manager");
  expect(await productStock("p2")).toBe(1);
  await context.setOffline(true);
  await sellOffline(page, "p2", 3);
  await context.setOffline(false);
  await expect(page.locator(".toast:not(.error)", { hasText: "1 offline sale synced" })).toBeVisible();
  expect(await productStock("p2")).toBe(-2);
  // Back online, the normal stock limit applies again.
  await expect(page.locator('[data-add-product="p2"]')).toBeDisabled();
  const online = await apiAs("manager", "/api/action", { action: "create_sale", payload: { items: [{ productId: "p2", qty: 1 }], discount: 0, payments: { cash: 10, orange: 0, afrimoney: 0 } } });
  expect(online.status).toBe(400);
});

test("a rejected offline sale is flagged and can be discarded", async ({ page, context }) => {
  await openAs(page, "attendant");
  await context.setOffline(true);
  await sellOffline(page, "p3");
  // The owner changes the price while this phone is offline, so the amount paid no longer matches.
  const priceChange = await apiAs("owner", "/api/action", { action: "update_product", payload: { id: "p3", name: "Bandage", category: "First aid", sku: "MED-003", productType: "retail", reorder: 5, cost: 2, price: 6, expiry: "2030-01-01" } });
  expect(priceChange.status).toBe(200);
  await context.setOffline(false);

  await expect(page.locator("#syncTitle")).toHaveText("1 sale could not sync");
  await page.locator("#syncCard").click();
  await expect(page.locator("#modal")).toContainText("Bandage");
  page.once("dialog", dialog => dialog.accept());
  await page.locator("[data-discard-sale]").click();
  await expect(page.locator(".toast:not(.error)", { hasText: "Offline sale discarded" })).toBeVisible();
  await expect(page.locator("#syncTitle")).toHaveText("Securely connected");
  expect(await productStock("p3")).toBe(50);
});

test("signing out is refused while offline", async ({ page, context }) => {
  page.expectedErrorToasts = ["Connect to the internet to sign out securely."];
  await openAs(page, "attendant");
  await context.setOffline(true);
  await page.locator("#staffLogoutButton").click();
  await expect(page.locator(".toast.error", { hasText: "Connect to the internet" })).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/authenticated/);
});

test.describe("with the app installed", () => {
  test.use({ serviceWorkers: "allow" });

  test("opens without internet and records a sale", async ({ page, context }) => {
    await openAs(page, "manager");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("body")).toHaveClass(/authenticated/);
    await expect(page.locator("#connectionPill")).toContainText("Offline");
    const saleId = await sellOffline(page, "p1");
    await context.setOffline(false);
    await expect(page.locator(".toast:not(.error)", { hasText: "1 offline sale synced" })).toBeVisible();
    expect(await salesWithId(saleId)).toHaveLength(1);
  });
});
