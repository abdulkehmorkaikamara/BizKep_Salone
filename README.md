# BizKep

An offline-first business management MVP for small shops and pharmacies in Sierra Leone.

## Included

- Daily dashboard with sales, expenses, estimated profit, debts, alerts, and payment reconciliation
- Point of sale with discounts and cash, Orange Money, Afrimoney, or split payments
- Inventory with stock deductions, reorder levels, costs, prices, and expiry alerts
- Expense tracking by category and payment method
- Customer debt balances, due dates, partial payments, and contact shortcuts
- 7/30/90-day reports, best-selling products, and CSV export
- Local data backup and offline PWA caching
- Responsive phone, tablet, and desktop layouts

## Run locally

No dependencies or build step are required:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

Data is stored in the browser on the current device. The settings page can download a JSON backup or restore the included demo dataset.
