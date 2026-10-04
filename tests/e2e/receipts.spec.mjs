// After a sale, the receipt can be sent to the customer through a WhatsApp link.
import { test, expect } from "@playwright/test";
import { trackErrors, openAs } from "./helpers.mjs";

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
