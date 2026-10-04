// Receipts and debt reminders are sent to customers through WhatsApp links.
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { trackErrors, openAs, apiAs } from "./helpers.mjs";

trackErrors(test);

test.beforeEach(async ({ context }) => {
  // Never leave the test machine: answer wa.me links locally.
  await context.route("https://wa.me/**", route => route.fulfill({ body: "WhatsApp" }));
});

async function completeSale(page) {
  await page.locator('.nav-item[data-view="sales"]').click();
  await page.locator('[data-add-product="p1"]').click();
  await page.locator('[data-add-product="p1"]').click();
  await page.locator("#checkoutButton").click();
  await page.locator("#confirmSale").click();
  await expect(page.locator("#receiptWhatsAppForm")).toBeVisible();
}

async function sendReceipt(page, phone) {
  await page.locator('#receiptWhatsAppForm [name="phone"]').fill(phone);
  const [popup] = await Promise.all([
    page.context().waitForEvent("page"),
    page.locator("#receiptWhatsAppForm").getByRole("button", { name: "Send receipt on WhatsApp" }).click()
  ]);
  const url = new URL(popup.url());
  await popup.close();
  return { number: url.pathname.slice(1), text: url.searchParams.get("text") };
}

test("sends the receipt details to the customer's WhatsApp", async ({ page }) => {
  await openAs(page, "owner");
  await completeSale(page);
  const { number, text } = await sendReceipt(page, "076 123 456");
  expect(number).toBe("23276123456");
  expect(text).toContain("*Test Pharmacy*");
  // An earlier test may change the address, so only the phone is checked here.
  expect(text).toMatch(/^.+ · \+232 76 111 222$/m);
  expect(text).toMatch(/Receipt #[0-9A-F]{5} · /);
  expect(text).toContain("2 × Paracetamol — NLE 40.00");
  expect(text).toContain("*Total: NLE 40.00*");
  expect(text).toContain("Paid: Cash");
  expect(text).toContain("Served by Ama");
  expect(text).not.toContain("\n\n\n");
});

test("understands common Sierra Leone number formats", async ({ page }) => {
  await openAs(page, "manager");
  await completeSale(page);
  for (const [typed, expected] of [
    ["+232 76 123 456", "23276123456"],
    ["23276123456", "23276123456"],
    ["0023276123456", "23276123456"],
    ["76123456", "23276123456"],
    ["+44 7700 900123", "447700900123"],
    ["", ""]
  ]) {
    expect((await sendReceipt(page, typed)).number, `typed "${typed}"`).toBe(expected);
  }
});

test("rejects a number that is too short", async ({ page }) => {
  page.expectedErrorToasts = ["Enter a valid phone number"];
  await openAs(page, "attendant");
  await completeSale(page);
  let opened = false;
  page.context().on("page", () => { opened = true; });
  await page.locator('#receiptWhatsAppForm [name="phone"]').fill("12345");
  await page.locator("#receiptWhatsAppForm").getByRole("button", { name: "Send receipt on WhatsApp" }).click();
  await expect(page.locator(".toast.error", { hasText: "Enter a valid phone number" })).toBeVisible();
  expect(opened).toBe(false);
});

test("can send a receipt for a sale made offline", async ({ page, context }) => {
  await openAs(page, "attendant");
  await context.setOffline(true);
  await completeSale(page);
  await expect(page.locator("#modal")).toContainText("Sale saved on this phone");
  await context.setOffline(false);
  const { number, text } = await sendReceipt(page, "077 000 111");
  expect(number).toBe("23277000111");
  expect(text).toContain("*Total: NLE 40.00*");
});

async function remindAbout(page, customer) {
  await page.locator('.nav-item[data-view="debts"]').click();
  const card = page.locator(".debt-card", { hasText: customer });
  const [popup] = await Promise.all([
    page.context().waitForEvent("page"),
    card.getByRole("button", { name: "WhatsApp reminder" }).click()
  ]);
  const url = new URL(popup.url());
  await popup.close();
  return { number: url.pathname.slice(1), text: url.searchParams.get("text") };
}

async function createDebt(customer, phone, due) {
  const result = await apiAs("manager", "/api/action", { action: "create_debt", payload: { customer, phone, balance: 150, due, notes: "" } });
  expect(result.status).toBe(200);
}

test("sends a reminder for a debt that is coming due", async ({ page }) => {
  const due = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  await createDebt("Mohamed Upcoming", "076 222 333", due);
  await openAs(page, "manager");
  const { number, text } = await remindAbout(page, "Mohamed Upcoming");
  expect(number).toBe("23276222333");
  expect(text).toMatch(/^Hello Mohamed,/);
  expect(text).toContain("*Test Pharmacy*");
  expect(text).toContain("balance of *NLE 150.00* is due on");
  expect(text).toContain("+232 76 111 222");
});

test("words the reminder differently once a debt is overdue", async ({ page }) => {
  const due = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  await createDebt("Aminata Overdue", "+232 77 444 555", due);
  await openAs(page, "owner");
  const { number, text } = await remindAbout(page, "Aminata Overdue");
  expect(number).toBe("23277444555");
  expect(text).toContain("balance of *NLE 150.00* was due on");
  expect(text).toContain("Please pay as soon as you can.");
});

test("explains when a customer's number can't be used", async ({ page }) => {
  page.expectedErrorToasts = ["can't be used on WhatsApp"];
  await createDebt("Bad Number", "123", new Date().toISOString().slice(0, 10));
  await openAs(page, "owner");
  let opened = false;
  page.context().on("page", () => { opened = true; });
  await page.locator('.nav-item[data-view="debts"]').click();
  await page.locator(".debt-card", { hasText: "Bad Number" }).getByRole("button", { name: "WhatsApp reminder" }).click();
  await expect(page.locator(".toast.error", { hasText: "Bad Number's phone number can't be used on WhatsApp" })).toBeVisible();
  expect(opened).toBe(false);
});

// Reads a downloaded receipt PDF as text so its drawing commands can be checked.
async function downloadPdf(page, button, testInfo) {
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  const path = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(path);
  return { name: download.suggestedFilename(), pdf: (await readFile(path)).toString("latin1") };
}

function expectReceiptPdf(pdf) {
  expect(pdf.startsWith("%PDF-1.4")).toBe(true);
  expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  // The xref table must point at the right byte, or PDF readers refuse the file.
  const xref = Number(pdf.match(/startxref\n(\d+)/)[1]);
  expect(pdf.slice(xref, xref + 4)).toBe("xref");
  expect(pdf).toContain("0.04 0.3 0.23 rg"); // the logo's green square
  expect(pdf).toContain("(Test Pharmacy) Tj");
  expect(pdf).toContain("(Paracetamol) Tj");
  expect(pdf).toContain("(2 \xd7 NLE 20.00) Tj");
  expect(pdf).toContain("(Total) Tj");
  expect(pdf).toContain("(NLE 40.00) Tj");
  expect(pdf).toContain("(Paid by Cash) Tj");
}

test("downloads a PDF receipt with the BizKep logo after a sale", async ({ page }, testInfo) => {
  await openAs(page, "owner");
  await completeSale(page);
  const { name, pdf } = await downloadPdf(page, page.getByRole("button", { name: "Download PDF receipt" }), testInfo);
  expect(name).toMatch(/^receipt-[0-9A-F]{5}\.pdf$/);
  expectReceiptPdf(pdf);
  expect(pdf).toContain("(Ama) Tj");
});

test("downloads a PDF receipt for an earlier sale", async ({ page }, testInfo) => {
  const saleId = randomUUID();
  const result = await apiAs("attendant", "/api/action", { action: "create_sale", payload: { saleId, items: [{ productId: "p1", qty: 2 }], discount: 0, payments: { cash: 40, orange: 0, afrimoney: 0 } } });
  expect(result.status).toBe(200);
  await openAs(page, "owner");
  await page.locator("#salesHistoryButton").click();
  await page.locator("#modal .activity-item", { hasText: `Sale ${saleId.slice(-5).toUpperCase()}` }).click();
  const { name, pdf } = await downloadPdf(page, page.getByRole("button", { name: "Download PDF receipt" }), testInfo);
  expect(name).toBe(`receipt-${saleId.slice(-5).toUpperCase()}.pdf`);
  expectReceiptPdf(pdf);
  expect(pdf).toContain(`(Receipt #${saleId.slice(-5).toUpperCase()}) Tj`);
});
