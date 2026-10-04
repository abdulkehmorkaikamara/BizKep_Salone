// On a shared phone, sales saved offline by one person wait until that person
// signs in again. Everyone else is told whose sales are waiting.
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { trackErrors, openAs, apiAs } from "./helpers.mjs";

trackErrors(test);

// Leaves one unsynced attendant sale in the phone's storage, as if Isata had
// sold offline and handed the phone over. Seeded once per browser tab.
async function leaveAttendantSale(page, { userId = "u-attendant", name = "Isata Attendant", cash = 20 } = {}) {
  const saleId = randomUUID();
  const soldAt = new Date().toISOString();
  const entry = {
    id: saleId, userId, soldAt, status: "pending",
    payload: { saleId, items: [{ productId: "p1", qty: 1 }], discount: 0, payments: { cash, orange: 0, afrimoney: 0 }, orderType: "counter", tableName: "", customerName: "", customerPhone: "", orderSource: "pos" },
    display: { id: saleId, date: soldAt.slice(0, 10), timestamp: Date.parse(soldAt), user: name, items: [{ productId: "p1", name: "Paracetamol", qty: 1, price: 20, cost: 0 }], subtotal: 20, discount: 0, total: 20, payments: { cash: 20, orange: 0, afrimoney: 0 }, pending: true }
  };
  await page.addInitScript(value => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("bizkep-pending-sales-v1", JSON.stringify([value]));
    sessionStorage.setItem("seeded", "1");
  }, entry);
  return saleId;
}

test("another signed-in user is told whose sales are waiting", async ({ page }) => {
  await leaveAttendantSale(page);
  await openAs(page, "manager");
  await expect(page.locator(".toast:not(.error)", { hasText: "1 sale by Isata Attendant waiting on this phone. Ask them to sign in here so it syncs." })).toBeVisible();
  await expect(page.locator("#syncOthers")).toHaveText("1 sale by Isata Attendant is waiting on this phone. They sync when Isata signs in here.");
  // The manager's own status is unaffected, and the sale is not sent as theirs.
  await expect(page.locator("#syncTitle")).toHaveText("Securely connected");
  await expect(page.locator("#syncOthersButton")).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("bizkep-pending-sales-v1")).length)).toBe(1);
});

test("the sign-in screen lists whose sales are waiting", async ({ page }) => {
  await leaveAttendantSale(page);
  await page.goto("/");
  await expect(page.locator("#loginForm")).toBeVisible();
  await expect(page.locator("#waitingSalesNotice")).toContainText("1 sale by Isata Attendant");
});

test("the waiting sales sync when their owner signs in", async ({ page }) => {
  const saleId = await leaveAttendantSale(page);
  await openAs(page, "attendant");
  await expect(page.locator(".toast:not(.error)", { hasText: "1 offline sale synced" })).toBeVisible();
  await expect(page.locator("#syncOthers")).toBeHidden();
  const sales = (await apiAs("owner", "/api/state")).data.state.sales;
  expect(sales.filter(sale => sale.id === saleId)).toHaveLength(1);
});

test("the owner can sync someone else's waiting sales as theirs", async ({ page }) => {
  const saleId = await leaveAttendantSale(page);
  await openAs(page, "owner");
  await page.locator("#syncOthersButton").click();
  await expect(page.locator("#modal")).toContainText("Isata Attendant");
  await page.locator("#modal").getByRole("button", { name: "Sync 1 sale for Isata" }).click();
  await expect(page.locator(".toast:not(.error)", { hasText: "1 sale synced for Isata Attendant" })).toBeVisible();
  await expect(page.locator("#syncOthers")).toBeHidden();
  const sale = (await apiAs("owner", "/api/state")).data.state.sales.find(item => item.id === saleId);
  expect(sale.user).toBe("Isata Attendant");
  expect(sale.soldOffline).toBe(true);
});

test("the owner can sync sales left by staff who have since been disabled", async ({ page }) => {
  const saleId = await leaveAttendantSale(page, { userId: "u-disabled", name: "Former Staff" });
  await openAs(page, "owner");
  await page.locator("#syncOthersButton").click();
  await page.locator("#modal").getByRole("button", { name: "Sync 1 sale for Former" }).click();
  await expect(page.locator(".toast:not(.error)", { hasText: "1 sale synced for Former Staff" })).toBeVisible();
  const sale = (await apiAs("owner", "/api/state")).data.state.sales.find(item => item.id === saleId);
  expect(sale.user).toBe("Former Staff");
});

test("a rejected sale can be discarded by the owner", async ({ page }) => {
  // The amount paid doesn't match the price, so the server refuses it.
  await leaveAttendantSale(page, { cash: 999 });
  await openAs(page, "owner");
  await page.locator("#syncOthersButton").click();
  await page.locator("#modal").getByRole("button", { name: "Sync 1 sale for Isata" }).click();
  await expect(page.locator("#modal")).toContainText("Could not sync: Payment amounts must equal the sale total.");
  page.once("dialog", dialog => dialog.accept());
  await page.locator("[data-discard-other]").click();
  await expect(page.locator(".toast:not(.error)", { hasText: "Offline sale discarded" })).toBeVisible();
  await expect(page.locator("#syncOthers")).toBeHidden();
});

test("only the owner can record a sale for someone else, and only an offline one", async () => {
  const payload = { items: [{ productId: "p1", qty: 1 }], discount: 0, payments: { cash: 20, orange: 0, afrimoney: 0 }, recordedBy: "u-attendant" };
  const fromManager = await apiAs("manager", "/api/action", { action: "create_sale", payload: { ...payload, saleId: randomUUID(), offline: true, soldAt: new Date().toISOString() } });
  expect(fromManager.status).toBe(403);
  const onlineSale = await apiAs("owner", "/api/action", { action: "create_sale", payload: { ...payload, saleId: randomUUID() } });
  expect(onlineSale.status).toBe(403);
  const unknownPerson = await apiAs("owner", "/api/action", { action: "create_sale", payload: { ...payload, saleId: randomUUID(), offline: true, soldAt: new Date().toISOString(), recordedBy: "u-nobody" } });
  expect(unknownPerson.status).toBe(404);
});
