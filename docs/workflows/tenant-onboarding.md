# Workflow: Tenant Onboarding

## Goal

Create a boutique tenant account, then let boutique owner complete activation profile.

## Steps

1. Admin login:
- `POST /api/auth/login`

2. Create box:
- `POST /api/boxes`

3. Create tenant:
- `POST /api/admin/create-tenant`
- receives `userId` and activation link/token (depending on environment)

4. Boutique completes profile:
- `POST /api/auth/complete-boutique-profile`
- account status switches to `ACTIVE`

5. Boutique login:
- `POST /api/auth/login`

## Validation checklist

- `User.role === BOUTIQUE`
- `User.isAccountCompleted === true`
- `User.status === ACTIVE`
- `Boutique.owner` linked to user
- Box occupied (`box.boutique` not null)
