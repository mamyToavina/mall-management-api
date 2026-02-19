# Workflow: Billing and Electricity Invoices

## Goal

Let boutique see monthly dues and contract remaining time.
Electricity amount stays `0` until admin uploads monthly PDF invoices.

## Steps

1. Boutique checks summary (before upload):
- `GET /api/billing/boutique/summary?month=<m>&year=<y>`
- expected `dues.electricityAmount = 0`

2. Admin uploads invoices:
- `POST /api/billing/admin/electricity-invoices/upload`
- `form-data`: `month`, `year`, multiple `invoices` PDF files

3. Server parsing:
- extract meter number from PDF
- extract net amount from PDF
- map meter -> box -> boutique
- save/upsert invoice row

4. Boutique checks summary again:
- `dues.electricityAmount > 0`
- `dues.totalDue = rent + electricity + commissions`

5. Boutique checks invoice list/detail:
- `GET /api/billing/boutique/invoices`
- `GET /api/billing/boutique/invoices/:id`

## Current formula

- `rentAmount` = active contract monthly rent
- `electricityAmount` = sum of parsed net amounts for month/year
- `commissionsAmount` = currently default `0`
- `totalDue` = `rentAmount + electricityAmount + commissionsAmount`
