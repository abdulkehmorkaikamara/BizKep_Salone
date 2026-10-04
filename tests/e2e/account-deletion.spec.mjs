// People can delete their own account. Staff are erased but their records stay
// with the business; an Owner erases the whole business.
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { trackErrors, openAs, apiAs } from "./helpers.mjs";
import { ACCOUNT_PASSWORD } from "./fixtures.mjs";

trackErrors(test);

const deleteAs = (role, body) => apiAs(role, "/api/account/delete", body);
const state = async role => (await apiAs(role, "/api/state")).data.state;

test("refuses to delete an account without the right password", async () => {
  const result = await deleteAs("leaver", { password: "not the password" });
  expect(result.status).toBe(403);
  expect(result.data.error).toBe("That password is not correct.");
  expect((await apiAs("leaver", "/api/session")).status).toBe(200);
});

test("a staff member must close their shift first", async () => {
  const result = await deleteAs("shiftHolder", { password: ACCOUNT_PASSWORD });
  expect(result.status).toBe(409);
  expect(result.data.error).toContain("Close your shift");
  expect((await apiAs("shiftHolder", "/api/session")).status).toBe(200);
});

test("a staff member deletes their account and their sales stay with the business", async ({ page }) => {
  const saleId = randomUUID();
  const sale = await apiAs("leaver", "/api/action", { action: "create_sale", payload: { saleId, items: [{ productId: "p1", qty: 1 }], discount: 0, payments: { cash: 20, orange: 0, afrimoney: 0 } } });
  expect(sale.status).toBe(200);

  await openAs(page, "leaver");
  await page.locator("#staffDeleteAccountButton").click();
  await expect(page.locator("#modal")).toContainText("Former staff member");
  await page.locator('#deleteAccountForm [name="password"]').fill(ACCOUNT_PASSWORD);
  await page.locator("#deleteAccountForm").getByRole("button", { name: "Delete my account" }).click();
  await expect(page.locator("#authContent")).toContainText("Your account has been deleted.");

  // Signed out, and the account is gone from the Owner's staff list.
  expect((await apiAs("leaver", "/api/session")).status).toBe(401);
  const owner = await state("owner");
  expect(owner.users.some(user => user.id === "u-leaver")).toBe(false);
  expect(JSON.stringify(owner.users)).not.toContain("sorie");
  // The sale still counts, attributed to a former staff member.
  const kept = owner.sales.find(item => item.id === saleId);
  expect(kept.total).toBe(20);
  expect(kept.user).toBe("Former staff member");
});

test("an Owner must type the business name to delete it", async () => {
  const result = await deleteAs("closer", { password: ACCOUNT_PASSWORD, businessName: "Some Other Shop" });
  expect(result.status).toBe(400);
  expect((await apiAs("closer", "/api/session")).status).toBe(200);
});

test("an Owner deletes their account and the whole business is erased", async ({ page }) => {
  // Give the business one of everything so every table has rows to erase.
  const act = (action, payload, role = "closer") => apiAs(role, "/api/action", { action, payload });
  expect((await act("open_shift", { openingFloat: 0 }, "closerStaff")).status).toBe(200);
  expect((await act("create_sale", { saleId: randomUUID(), items: [{ productId: "p-b2", qty: 2 }], discount: 0, payments: { cash: 16, orange: 0, afrimoney: 0 } }, "closerStaff")).status).toBe(200);
  expect((await act("create_expense", { category: "Transport", description: "Delivery", method: "cash", amount: 5, date: new Date().toISOString().slice(0, 10) })).status).toBe(200);
  expect((await act("create_debt", { customer: "Kadie", phone: "", balance: 30, due: new Date().toISOString().slice(0, 10), notes: "" })).status).toBe(200);

  await openAs(page, "closer");
  await page.locator("#settingsButton").click();
  await page.locator("#deleteAccountButton").click();
  await page.locator('#deleteAccountForm [name="businessName"]').fill("closing shop");
  await page.locator('#deleteAccountForm [name="password"]').fill(ACCOUNT_PASSWORD);
  await page.locator("#deleteAccountForm").getByRole("button", { name: "Delete everything" }).click();
  await expect(page.locator("#authContent")).toContainText("Your account has been deleted.");

  // Everyone in that business is signed out; the other business is untouched.
  expect((await apiAs("closer", "/api/session")).status).toBe(401);
  expect((await apiAs("closerStaff", "/api/session")).status).toBe(401);
  expect((await state("owner")).business.name).toBe("Test Pharmacy");
});
