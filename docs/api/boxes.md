# Boxes API

Base path: `/api/boxes`

## GET `/`

Paginated list with filters:
- `page`, `limit`
- `floor`
- `minSurface`, `maxSurface`
- `minRent`, `maxRent`
- `status` (`libre | occupied`)

## GET `/statistics`

Returns:
- total
- free
- occupied

## GET `/:id/full-details`

Returns box with:
- boutique
- owner (without password)
- active contract (if exists)

## POST `/`

Create box.

Example:
```json
{
  "number": "BX-2026-001",
  "floor": 2,
  "surface": 30,
  "monthlyRent": 450000,
  "electricityMeterNumber": "235e964284E"
}
```

## PUT `/:id`

Update box.

## DELETE `/:id`

Delete box.
