# Billing API

Base path: `/api/billing`

## Admin: upload electricity invoices

### POST `/admin/electricity-invoices/upload`

Auth:
- Bearer token
- role `ADMIN`

Body type:
- `multipart/form-data`

Fields:
- `month` (1..12)
- `year`
- `invoices` (multiple PDF files)

Behavior:
- Parse meter number from PDF text:
  - after `N° Compteur électricité :`
- Parse net amount from:
  - `NET A PAYER ...`
- Match parsed meter with `boxes.electricityMeterNumber`
- Upsert monthly invoice per boutique/meter

Response:
```json
{
  "month": 2,
  "year": 2026,
  "uploaded": 1,
  "failed": 0,
  "successes": [],
  "errors": []
}
```

## Boutique: monthly summary

### GET `/boutique/summary?month=2&year=2026`

Auth:
- Bearer token
- role `BOUTIQUE`

Returns:
- contract info
- contract remaining duration (`years`, `months`, `days`, `totalDays`)
- dues:
  - `rentAmount`
  - `electricityAmount`
  - `commissionsAmount`
  - `totalDue`
- invoice list for selected period

## Boutique: invoice list

### GET `/boutique/invoices?month=2&year=2026`

Returns monthly invoices for authenticated boutique.

## Boutique: invoice detail

### GET `/boutique/invoices/:id`
