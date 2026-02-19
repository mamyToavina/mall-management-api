# Auth API

Base path: `/api/auth`

## POST `/login`

Authenticate user and return access token.

Request body:
```json
{
  "email": "admin@mall.com",
  "password": "Admin@12345"
}
```

Response:
```json
{
  "accessToken": "jwt-token",
  "user": { "id": "...", "role": "ADMIN" }
}
```

## POST `/refresh`

Refresh access token from `refreshToken` cookie.

Response:
```json
{ "accessToken": "new-jwt-token" }
```

## POST `/logout`

Requires `Authorization` bearer token.

Response:
```json
{ "message": "Deconnecte" }
```

## POST `/complete-boutique-profile`

Complete boutique activation profile.

Accepted inputs:
- `userId + token`
- or `activationLink` directly

Required:
- `password`
- `pseudo`
- `boutiqueName`

Example:
```json
{
  "activationLink": "http://localhost:4200/activate-account?token=...&id=...",
  "password": "Boutique@12345",
  "pseudo": "boutique_test_1",
  "firstName": "Jean",
  "lastName": "Boutique",
  "gender": "Male",
  "boutiqueName": "Boutique Jean",
  "onlineSalesEnabled": true,
  "logo": "https://example.com/logo.png"
}
```
