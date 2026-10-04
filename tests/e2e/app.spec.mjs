// Clicks through the main buttons and forms for each role against a real local
// Worker + D1 database (see serve.mjs). Any red error toast or uncaught page error
// fails the test, which is what would have caught the "Debt not found." bug.
import { test, expect } from "@playwright/test";
import { trackErrors, openAs, apiAs } from "./helpers.mjs";

trackErrors(test);

const nav = (page, view) => page.locator(`.nav-item[data-view="${view}"]`);
const modal = page => page.locator("#modal");
const successToast = (page, text) => expect(page.locator(".toast:not(.error)", { hasText: text })).toBeVisible();

async function submitModal(page, buttonName) {
  await modal(page).getByRole("button", { name: buttonName }).click();
}

async function addDebt(page, customer) {
  await nav(page, "debts").click();
  await page.locator("#addDebtButton").click();
  await expect(page.locator("#modalTitle")).toHaveText("Add customer debt");
  const form = page.locator("#debtForm");
  await form.locator('[name="customer"]').fill(customer);
  await form.locator('[name="phone"]').fill("+232 76 555 444");
  await expect(form.locator('[name="balance"]')).toBeEnabled();
  await form.locator('[name="balance"]').fill("250");
  await submitModal(page, "Add debt");
  await successToast(page, "Customer debt added");
  await expect(page.locator("#debtGrid")).toContainText(customer);
}

async function makeCashSale(page) {
  await nav(page, "sales").click();
  await page.locator('[data-add-product="p1"]').click();
  await page.locator("#checkoutButton").click();
  await modal(page).locator("#confirmSale").click();
  await expect(page.locator("#modalTitle")).toHaveText("Payment received");
  await modal(page).getByRole("button", { name: "Done" }).click();
}

async function requestAdjustment(page) {
  await nav(page, "inventory").click();
  await page.locator('[data-adjust-product="p1"]').click();
  const form = page.locator("#adjustmentForm");
  await form.locator('[name="quantityDelta"]').fill("10");
  await form.locator('[name="notes"]').fill("New delivery from supplier");
  await submitModal(page, "Submit for approval");
  await successToast(page, "Stock adjustment sent to the owner");
}

test.describe("Owner", () => {
  test.beforeEach(({ page }) => openAs(page, "owner"));

  test("sees every section and their name", async ({ page }) => {
    for (const view of ["dashboard", "sales", "inventory", "expenses", "debts", "reports"]) await expect(nav(page, view)).toBeVisible();
    await expect(page.locator("#settingsButton")).toContainText("Ama Owner");
    await expect(page.locator("#businessInitials")).toHaveText("TP");
    await expect(page.locator("#businessNameHeader")).toHaveText("Test Pharmacy");
    await expect(page.locator("#staffLogoutButton")).toBeHidden();
  });

  test("adds a product", async ({ page }) => {
    await nav(page, "inventory").click();
    await page.locator("#addProductButton").click();
    const form = page.locator("#productForm");
    await form.locator('[name="name"]').fill("Amoxicillin");
    await form.locator('[name="category"]').fill("Antibiotics");
    await form.locator('[name="stock"]').fill("40");
    await form.locator('[name="cost"]').fill("15");
    await form.locator('[name="price"]').fill("30");
    await submitModal(page, "Add product");
    await successToast(page, "Product added to inventory");
    await expect(page.locator("#inventoryTable")).toContainText("Amoxicillin");
  });

  test("records an expense", async ({ page }) => {
    await nav(page, "expenses").click();
    await page.locator("#addExpenseButton").click();
    const form = page.locator("#expenseForm");
    await form.locator('[name="amount"]').fill("75");
    await form.locator('[name="description"]').fill("Generator fuel");
    await submitModal(page, "Save expense");
    await successToast(page, "Expense recorded");
    await expect(page.locator("#expensesTable")).toContainText("Generator fuel");
  });

  test("adds a customer debt", ({ page }) => addDebt(page, "Owner Debt Customer"));

  test("edits a customer debt", async ({ page }) => {
    await nav(page, "debts").click();
    await page.locator('[data-edit-debt="d1"]').click();
    await expect(page.locator("#modalTitle")).toHaveText("Update customer debt");
    await page.locator('#debtForm [name="customer"]').fill("Fatmata Updated");
    await submitModal(page, "Save changes");
    await successToast(page, "Customer details updated");
    await expect(page.locator("#debtGrid")).toContainText("Fatmata Updated");
  });

  test("records a debt payment and shows the overdue bar", async ({ page }) => {
    await nav(page, "debts").click();
    await expect(page.locator("#overdueBar")).not.toHaveAttribute("style", /width: 0%/);
    await page.locator('[data-pay-debt="d1"]').click();
    await page.locator('#paymentForm [name="amount"]').fill("100");
    await submitModal(page, "Record payment");
    await successToast(page, "payment recorded");
  });

  test("makes a cash sale", ({ page }) => makeCashSale(page));

  test("approves a stock adjustment", async ({ page }) => {
    await requestAdjustment(page);
    await page.locator("#settingsButton").click();
    await page.locator("#approvalList [data-review]").first().click();
    await expect(page.locator(".toast:not(.error)").last()).toBeVisible();
  });

  test("adds a staff member", async ({ page }) => {
    await page.locator("#settingsButton").click();
    await page.locator("#addUserButton").click();
    const form = page.locator("#userForm");
    await form.locator('[name="name"]').fill("New Attendant");
    await form.locator('[name="username"]').fill("new.attendant");
    await form.locator('[name="password"]').fill("temporary-pass");
    await submitModal(page, "Add staff member");
    await successToast(page, "Staff account created");
    await expect(page.locator("#teamList")).toContainText("New Attendant");
  });

  test("resets a staff member's password and signs them out", async ({ page }) => {
    expect((await apiAs("resetStaff", "/api/session")).status).toBe(200);
    await page.locator("#settingsButton").click();
    await expect(page.locator('[data-reset-password="u-owner"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Reset password for Kadiatu Reset" }).click();
    await expect(page.locator("#modal")).toContainText("Their username is kadiatu");
    await page.locator('#resetPasswordForm [name="password"]').fill("new-temp-pass");
    await submitModal(page, "Reset password");
    await successToast(page, "Password reset. Give Kadiatu the new password.");
    expect((await apiAs("resetStaff", "/api/session")).status).toBe(401);
    const audits = (await apiAs("owner", "/api/state")).data.state.audits;
    expect(audits.some(audit => audit.action === "reset_password")).toBe(true);
  });

  test("shows disabled staff last, labelled, without actions", async ({ page }) => {
    await page.locator("#settingsButton").click();
    const former = page.locator(".team-member", { hasText: "Former Staff" });
    await expect(former).toContainText("Disabled · no access");
    await expect(former.locator("button, select")).toHaveCount(0);
    await expect(page.locator(".team-member").last()).toContainText("Former Staff");
  });

  test("saves the business profile", async ({ page }) => {
    await page.locator("#settingsButton").click();
    await page.locator('#businessForm [name="address"]').fill("Bo, Sierra Leone");
    await page.locator("#businessForm").getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator(".toast:not(.error)").last()).toBeVisible();
  });
});

test.describe("Manager", () => {
  test.beforeEach(({ page }) => openAs(page, "manager"));

  test("sees their name but cannot open settings", async ({ page }) => {
    await expect(page.locator("#settingsButton")).toContainText("Musa Manager");
    await expect(page.locator("#settingsButton")).toBeDisabled();
    await expect(page.locator("#staffLogoutButton")).toBeVisible();
  });

  test("adds a customer debt", ({ page }) => addDebt(page, "Manager Debt Customer"));

  test("cannot reset staff passwords", async () => {
    const result = await apiAs("manager", "/api/action", { action: "reset_user_password", payload: { id: "u-attendant", password: "manager-chosen" } });
    expect(result.status).toBe(403);
    expect((await apiAs("attendant", "/api/session")).status).toBe(200);
  });

  test("makes a cash sale", ({ page }) => makeCashSale(page));
});

test.describe("Attendant", () => {
  test.beforeEach(({ page }) => openAs(page, "attendant"));

  test("only sees the sections they are allowed", async ({ page }) => {
    for (const view of ["expenses", "debts", "reports"]) await expect(nav(page, view)).toBeHidden();
    await expect(page.locator("#settingsButton")).toContainText("Isata Attendant");
    await expect(page.locator("#settingsButton")).toBeDisabled();
    await nav(page, "inventory").click();
    await expect(page.locator("#addProductButton")).toBeHidden();
  });

  test("makes a cash sale", ({ page }) => makeCashSale(page));

  test("requests a stock adjustment", ({ page }) => requestAdjustment(page));
});

test.describe("Sign out", () => {
  test("owner signs out from settings", async ({ page }) => {
    await openAs(page, "ownerLogout");
    await page.locator("#settingsButton").click();
    await page.locator("#logoutButton").click();
    await expect(page.locator("#loginForm")).toBeVisible();
  });

  for (const role of ["manager", "attendant"]) {
    test(`${role} signs out from the sidebar`, async ({ page }) => {
      await openAs(page, `${role}Logout`);
      await page.locator("#staffLogoutButton").click();
      await expect(page.locator("#loginForm")).toBeVisible();
    });
  }
});

test("the service worker is stamped with the deploy version", async ({ request }) => {
  const response = await request.get("/sw.js", { headers: { "If-None-Match": "\"anything\"" } });
  expect(response.status()).toBe(200);
  const script = await response.text();
  expect(script).not.toContain("__DEPLOY_VERSION__");
  expect(script).toMatch(/const CACHE = "bizkep-[A-Za-z0-9-]+";/);
});
