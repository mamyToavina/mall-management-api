# Admin API

Base path: `/api/admin`

All routes require:
- Bearer token
- role `ADMIN`

## POST `/create-tenant`

Create boutique tenant with:
- blocked boutique user
- boutique entity
- contract
- activation token/email

Request body:
```json
{
  "firstName": "Jean",
  "lastName": "Boutique",
  "email": "jean.boutique@test.com",
  "boxId": "65f...",
  "contractData": {
    "startDate": "2026-02-19",
    "endDate": "2027-02-19",
    "durationMonths": 12,
    "monthlyRent": 450000,
    "details": "Contrat test"
  }
}
```

Response (201):
```json
{
  "message": "Utilisateur cree et email envoye",
  "userId": "65f...",
  "activationLink": "http://localhost:4200/activate-account?token=...&id=..."
}
```

Notes:
- Flow is transactional in service layer.
- If email sending fails, database writes are rolled back.
