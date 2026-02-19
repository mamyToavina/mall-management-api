# Credit API

Base path: `/api/credit`

## POST `/generate`

Generate credit codes.

Body:
```json
{
  "adminId": "65f...",
  "value": 20000,
  "quantity": 10
}
```

Allowed values:
- `20000`
- `100000`
- `400000`

## PATCH `/print/:id`

Mark credit as printed.

## POST `/use`

Use credit code for authenticated user.

Body:
```json
{
  "code": "ABCD-EFGH-IJKL"
}
```

## GET `/`

List all credits.

Note:
- Review auth guards for production hardening.
