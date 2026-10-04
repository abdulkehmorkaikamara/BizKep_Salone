// Staff ask for a sale to be voided; the Owner approves or rejects. An approved
// void removes the sale from totals and returns its items to stock.
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { trackErrors, openAs, apiAs } from "./helpers.mjs";

trackErrors(test);

const state = async () => (await apiAs("owner", "/api/state")).data.state;
const stockOf = async id => (await state()).products.find(product => product.id === id).stock;

async function recordSale(role, qty = 2) {
  const saleId = randomUUID();
  const result = await apiAs(role, "/api/action", { action: "create_sale", payload: { saleId, items: [{ productId: "p1", qty }], discount: 0, payments: { cash: 20 * qty, orange: 0, afrimoney: 0 } } });
  expect(result.status).toBe(200);
  return saleId;
}
const label = saleId => `Sale ${saleId.slice(-5).toUpperCase()}`;

async function openSale(page, saleId) {
  await page.locator("#salesHistoryButton").click();
  await page.locator("#modal .activity-item", { hasText: label(saleId) }).click();
  await expect(page.locator("#modalTitle")).toHaveText(label(saleId));
}

test("staff request a void and the owner approves it", async ({ page }) => {
  const stockBefore = await stockOf("p1");
  const saleId = await recordSale("attendant");
  expect(await stockOf("p1")).toBe(stockBefore - 2);

  await openAs(page, "attendant");
  await openSale(page, saleId);
  await page.locator('#voidSaleForm [name="reason"]').fill("Customer returned the goods");
  await page.locator("#voidSaleForm").getByRole("button", { name: "Request void" }).click();
  await expect(page.locator(".toast:not(.error)", { hasText: "Void request sent to the owner" })).toBeVisible();
  await openSale(page, saleId);
  await expect(page.locator("#modal")).toContainText("Waiting for the owner to decide.");

  // Only the Owner can decide.
  const pending = (await state()).voidRequests.find(item => item.saleId === saleId);
  const managerTry = await apiAs("manager", "/api/action", { action: "review_sale_void", payload: { id: pending.id, decision: "approved" } });
  expect(managerTry.status).toBe(403);

  // Sign the same browser in as the Owner.
  await openAs(page, "owner");
  await page.locator("#settingsButton").click();
  const row = page.locator("#voidList .approval-item", { hasText: label(saleId) });
  await expect(row).toContainText("Customer returned the goods");
  page.once("dialog", dialog => dialog.accept());
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(page.locator(".toast:not(.error)", { hasText: "Sale voided and items returned to stock" })).toBeVisible();

  const after = await state();
  expect(after.sales.some(sale => sale.id === saleId)).toBe(false);
  expect(after.products.find(product => product.id === "p1").stock).toBe(stockBefore);
  expect(after.audits.some(audit => audit.action === "void" && audit.entityType === "sale")).toBe(true);
});

test("the owner can void a sale directly", async ({ page }) => {
  const stockBefore = await stockOf("p1");
  const saleId = await recordSale("manager", 3);
  await openAs(page, "owner");
  await openSale(page, saleId);
  await page.locator('#voidSaleForm [name="reason"]').fill("Rang up the wrong item");
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#voidSaleForm").getByRole("button", { name: "Void sale" }).click();
  await expect(page.locator(".toast:not(.error)", { hasText: "Sale voided and items returned to stock" })).toBeVisible();
  expect((await state()).sales.some(sale => sale.id === saleId)).toBe(false);
  expect(await stockOf("p1")).toBe(stockBefore);

  // A voided sale cannot be voided again.
  const again = await apiAs("owner", "/api/action", { action: "request_sale_void", payload: { saleId, reason: "Second attempt" } });
  expect(again.status).toBe(400);
  expect(await stockOf("p1")).toBe(stockBefore);
});

test("a rejected request leaves the sale in place and can be asked again", async ({ page }) => {
  const saleId = await recordSale("attendant", 1);
  const request = await apiAs("attendant", "/api/action", { action: "request_sale_void", payload: { saleId, reason: "Wrong price charged" } });
  expect(request.status).toBe(200);
  const duplicate = await apiAs("manager", "/api/action", { action: "request_sale_void", payload: { saleId, reason: "Asking twice" } });
  expect(duplicate.status).toBe(400);

  await openAs(page, "owner");
  await openSale(page, saleId);
  await expect(page.locator("#modal")).toContainText("Void requested by Isata Attendant");
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#modal").getByRole("button", { name: "Reject" }).click();
  await expect(page.locator(".toast:not(.error)", { hasText: "Void request rejected" })).toBeVisible();

  const after = await state();
  expect(after.sales.some(sale => sale.id === saleId)).toBe(true);
  expect(after.voidRequests.find(item => item.saleId === saleId).status).toBe("rejected");
  const retry = await apiAs("attendant", "/api/action", { action: "request_sale_void", payload: { saleId, reason: "Customer came back with receipt" } });
  expect(retry.status).toBe(200);
});
