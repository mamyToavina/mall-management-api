# Data Models

Main collections currently used by the API.

## User

File: `src/modules/users/user.model.js`

Key fields:
- `pseudo` (required)
- `email` (unique)
- `password` (hashed in pre-save)
- `role`: `USER | ADMIN | BOUTIQUE`
- `status`: `ACTIVE | BLOCKED | DELETED`
- `isAccountCompleted`
- `activationTokenHash`, `activationTokenExpires`
- `refreshTokenHash`
- `boutique` (ObjectId ref Boutique)

## Boutique

File: `src/modules/boutique/boutique.model.js`

Key fields:
- `name`
- `owner` (User ref)
- `logo`
- `onlineSalesEnabled`
- `status`: `ACTIVE | SUSPENDED`

## Box

File: `src/modules/boxes/box.model.js`

Key fields:
- `number` (unique)
- `floor`
- `surface`
- `monthlyRent`
- `electricityMeterNumber`
- `boutique` (nullable ref Boutique)

## Contract

File: `src/modules/contracts/contract.model.js`

Key fields:
- `boutique` (ref)
- `startDate`
- `endDate`
- `durationMonths`
- `monthlyRent`
- `status`: `ACTIVE | TERMINATED | EXPIRED`

Validation:
- `endDate` must be greater than `startDate`.

## Product

File: `src/modules/products/product.model.js`

Key fields:
- `boutique` (ref)
- `name`, `sku` (unique per boutique)
- `images` (required array)
- `price`, `salePrice`, `costPrice`
- `trackStock`, `stockQuantity`
- `status`, `isPublished`
- `promotion`:
  - `enabled`
  - `percentage`
  - `startsAt`
  - `durationDays`
  - `endsAt`

Virtual fields:
- `isPromotionActive`
- `promotionPrice`
- `currentSellingPrice`

## StockMovement

File: `src/modules/products/stock-movement.model.js`

Tracks stock operations with previous/new quantities and audit metadata.

## ElectricityInvoice

File: `src/modules/billing/electricity-invoice.model.js`

Key fields:
- `boutique`, `box`
- `month`, `year`
- `meterNumber`
- `netAmount`
- `commissionAmount`
- `sourceFilePath`, `sourceFileName`
- `uploadedBy`

Unique index:
- `(boutique, meterNumber, month, year)`
