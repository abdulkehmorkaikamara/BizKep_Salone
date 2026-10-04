// Clicks through the main buttons and forms for each role against a real local
// Worker + D1 database (see serve.mjs). Any red error toast or uncaught page error
// fails the test, which is what would have caught the "Debt not found." bug.
import { test, expect } from "@playwright/test";
import { trackErrors, openAs } from "./helpers.mjs";

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
