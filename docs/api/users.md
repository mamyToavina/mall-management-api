# Users API

Base path: `/api/users`

## POST `/registerUser`

Create user with optional avatar upload.

Body type:
- `multipart/form-data`

Fields:
- `pseudo` (required)
- `email` (required)
- `password` (required)
- `firstName`
- `lastName`
- `gender`
- `avatar` (file, optional)

## GET `/`

List users with pagination and filters.

Query params:
- `page`
- `limit`
- `search`
- `status`

## GET `/:id`

Get user by id.

## PATCH `/:id/block`

Set status to `BLOCKED`.

## PATCH `/:id/unblock`

Set status to `ACTIVE`.

Note:
- Current route file has commented-out auth guards. Protect before production.
