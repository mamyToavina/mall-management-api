# Setup

## Prerequisites

- Node.js 18+
- npm
- MongoDB connection string

## Environment variables

Configure `.env` with at least:

```env
MONGO_URI=...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
CLIENT_URL=http://localhost:4200
```

For tenant email activation:

```env
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=...
MAIL_PASS=...
MAIL_FROM="Mall Management <no-reply@mall.com>"
MAIL_SECURE=false
MAIL_TLS_REJECT_UNAUTHORIZED=false
```

## Install and run

```bash
npm install
npm run docs:generate
npm start
```

API base URL:
- `http://localhost:7878/api`

Static uploaded files:
- `http://localhost:7878/uploads/...`
