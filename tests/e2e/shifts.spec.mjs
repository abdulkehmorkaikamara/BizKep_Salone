// Each person opens a shift with a cash float and closes it with a blind count.
// Expected amounts come from their own sales, debt payments and cash expenses.
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { trackErrors, openAs, apiAs } from "./helpers.mjs";

trackErrors(test);

const action = async (role, name, payload) => {
  const result = await apiAs(role, "/api/action", { action: name, payload });
  expect(result.status, `${name}: ${JSON.stringify(result.data)}`).toBe(200);
  return result.data.state;
};
const sale = (role, qty, payments) => action(role, "create_sale", { saleId: randomUUID(), items: [{ productId: "p1", qty }], discount: 0, payments });

test("a manager's cash-up compares the count with their own records", async ({ page }) => {
  await openAs(page, "manager");
  await page.locator('.nav-item[data-view="sales"]').click();
  await expect(page.locator("#shiftStatus")).toHaveText("No shift open");
  await page.locator("#shiftButton").click();
  await page.locator('#openShiftForm [name="float"]').fill("100");
  await page.locator("#openShiftForm").getByRole("button", { name: "Open shift" }).click();
  await expect(page.locator(".toast:not(.error)", { hasText: "Shift opened" })).toBeVisible();
  await expect(page.locator("#shiftStatus")).toContainText("Shift open since");

  // Records made during the shift.
  await sale("manager", 1, { cash: 20, orange: 0, afrimoney: 0 });
  await sale("manager", 2, { cash: 0, orange: 40, afrimoney: 0 });
  const withDebt = await action("manager", "create_debt", { customer: "Shift Debtor", phone: "+232 76 000 999", balance: 100, due: "2030-01-01", notes: "" });
  await action("manager", "record_debt_payment", { id: withDebt.debts.find(debt => debt.customer === "Shift Debtor").id, amount: 30, method: "Cash" });
  await action("manager", "create_expense", { date: new Date().toISOString().slice(0, 10), category: "Transport", description: "Delivery", method: "Cash", amount: 15 });
  // A voided sale and someone else's sale do not count.
  const voided = await action("manager", "create_sale", { saleId: randomUUID(), items: [{ productId: "p1", qty: 1 }], discount: 0, payments: { cash: 20, orange: 0, afrimoney: 0 } });
  await action("owner", "request_sale_void", { saleId: voided.sales[0].id, reason: "Test void during shift" });
  await sale("attendant", 1, { cash: 20, orange: 0, afrimoney: 0 });

  await page.reload();
  await page.locator('.nav-item[data-view="sales"]').click();
  await page.locator("#shiftButton").click();
  await expect(page.locator("#modal")).not.toContainText("Expected");
  await page.locator('#closeShiftForm [name="cash"]').fill("130");
  await page.locator('#closeShiftForm [name="orange"]').fill("40");
  await page.locator('#closeShiftForm [name="notes"]').fill("Gave change from my pocket");
  await page.locator("#closeShiftForm").getByRole("button", { name: "Close shift" }).click();

  const rows = page.locator("#modal .shift-row");
  await expect(rows.filter({ hasText: "Cash" }).first()).toContainText("NLE 135.00");
  await expect(rows.filter({ hasText: "Cash" }).first()).toContainText("Short NLE 5.00");
  await expect(rows.filter({ hasText: "Orange Money" })).toContainText("Balanced");
  await expect(rows.filter({ hasText: "Total" })).toContainText("Short NLE 5.00");
  await page.locator("#modal").getByRole("button", { name: "Done" }).click();
  await expect(page.locator("#shiftStatus")).toHaveText("No shift open");

  // Staff only receive their own shifts.
  const managerShifts = (await apiAs("manager", "/api/state")).data.state.shifts;
  expect(managerShifts.every(shift => shift.userId === "u-manager")).toBe(true);
});

test("the owner sees every shift and its difference", async ({ page }) => {
  await openAs(page, "owner");
  await page.locator("#settingsButton").click();
  const row = page.locator("#shiftList .approval-item", { hasText: "Musa Manager" }).first();
  await expect(row).toContainText("Short NLE 5.00");
  await row.click();
  await expect(page.locator("#modal")).toContainText("Gave change from my pocket");
  await expect(page.locator("#modal .shift-row", { hasText: "Total" })).toContainText("Short NLE 5.00");
});

test("a second shift cannot be opened while one is open", async () => {
  await action("attendant", "open_shift", { openingFloat: 50 });
  const again = await apiAs("attendant", "/api/action", { action: "open_shift", payload: { openingFloat: 50 } });
  expect(again.status).toBe(400);
  await action("attendant", "close_shift", { countedCash: 50, countedOrange: 0, countedAfrimoney: 0, notes: "" });
  const closeAgain = await apiAs("attendant", "/api/action", { action: "close_shift", payload: { countedCash: 50, countedOrange: 0, countedAfrimoney: 0 } });
  expect(closeAgain.status).toBe(400);
});

test("a shift can't close while sales on this phone are waiting to sync", async ({ page, context }) => {
  await openAs(page, "attendant");
  await page.locator('.nav-item[data-view="sales"]').click();
  await page.locator("#shiftButton").click();
  await page.locator("#openShiftForm").getByRole("button", { name: "Open shift" }).click();
  await expect(page.locator("#shiftStatus")).toContainText("Shift open since");

  await context.setOffline(true);
  await page.locator('[data-add-product="p1"]').click();
  await page.locator("#checkoutButton").click();
  await page.locator("#confirmSale").click();
  await page.locator("#modal").getByRole("button", { name: "Done" }).click();
  await page.locator("#shiftButton").click();
  await expect(page.locator("#modal")).toContainText("1 sale on this phone hasn't synced yet");
  await page.locator("#modal").getByRole("button", { name: "OK" }).click();

  await context.setOffline(false);
  await expect(page.locator(".toast:not(.error)", { hasText: "1 offline sale synced" })).toBeVisible();
  await page.locator("#shiftButton").click();
  await page.locator('#closeShiftForm [name="cash"]').fill("20");
  await page.locator("#closeShiftForm").getByRole("button", { name: "Close shift" }).click();
  await expect(page.locator("#modal .shift-row", { hasText: "Total" })).toContainText("Balanced");
});
