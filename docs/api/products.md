# Products API

Base path: `/api/products`

All routes require:
- Bearer token
- role `BOUTIQUE`

## GET `/`

List boutique products with filters:
- `page`, `limit`
- `status`
- `category`
- `search`
- `lowStock=true|false`

## GET `/:id`

Get product by id (only own boutique).

## POST `/`

Create product with image upload.

Body type:
- `multipart/form-data`

Important fields:
- `name`, `sku`, `price`
- `stockQuantity`, `trackStock`
- `image` (file, required)

## PATCH `/:id`

Update product metadata.

Note:
- `stockQuantity` cannot be updated here.
- Use stock endpoint.

## PATCH `/:id/stock`

Adjust stock with operation:
- `INCREMENT`
- `DECREMENT`
- `SET`

## GET `/:id/stock-movements`

Paginated stock history for product.

## Promotion endpoints

### PATCH `/:id/promotion`

Set promotion period and percentage.

Example:
```json
{
  "percentage": 20,
  "startsAt": "2026-03-01T00:00:00.000Z",
  "durationDays": 7
}
```

### DELETE `/:id/promotion`

Clear promotion.

### Pricing behavior

Returned product includes:
- `isPromotionActive`
- `promotionPrice`
- `currentSellingPrice`

Priority:
1. active promotion price
2. `salePrice`
3. base `price`
