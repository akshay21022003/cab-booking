# Cab Booking System - MVP

Corporate cab booking system for employees to request transportation with admin approval workflow.

## Quick Start

### Prerequisites
- Node.js 18+
- Docker (for PostgreSQL)

### 1. Start Database

```bash
docker-compose up -d
```

This starts PostgreSQL on port 5432 with:
- Database: `cab_booking`
- User: `cab_admin`
- Password: `cab_secret_2024`

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Database Schema

```bash
npx prisma generate
npx prisma db push
```

### 4. Seed Initial Data

```bash
npm run db:seed
```

### 5. Start Development Server

```bash
npm run dev
```

Open http://localhost:3000

## Login Credentials

| Role | Employee ID | Access |
|------|-------------|--------|
| Super Admin | SUPER001 | Full system access |
| Department Admin | ADMIN001 | IT department management |
| Employee | EMP001 | Book cabs |
| Employee | EMP002 | Book cabs |
| Employee | EMP003 | Book cabs |

No passwords needed - just enter the Employee ID.

## Architecture

- **Framework:** Next.js 15 (App Router)
- **Database:** PostgreSQL + Prisma ORM
- **State:** TanStack Query (server) + Zustand (client)
- **UI:** Tailwind CSS + Radix UI primitives
- **Auth:** Session-based (permanent until Super Admin revokes)

## Key Design Decisions

See `DESIGN_DECISIONS.md` for full rationale on:
- Unified user model (no separate admin table)
- Audit trail for all actions
- Optimistic locking for race condition prevention
- 24-hour cutoff rule (changes allowed UP TO 24 hours before pickup)
- Sessions persist until revoked (no auto-expiry)

## API Endpoints

All routes use `/api/v1/` prefix.

### Auth
- `POST /api/v1/auth/login` - Login with employee ID
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/me` - Get current user

### Bookings (Employee)
- `GET /api/v1/bookings` - My bookings
- `POST /api/v1/bookings` - Create booking
- `GET /api/v1/bookings/:id` - Booking details
- `POST /api/v1/bookings/:id/change-requests` - Request change

### Admin
- `GET /api/v1/admin/bookings` - All department bookings
- `PUT /api/v1/admin/bookings/:id/status` - Approve/cancel
- `GET /api/v1/admin/change-requests` - Pending changes
- `PUT /api/v1/admin/change-requests/:id/approve` - Approve change
- `PUT /api/v1/admin/change-requests/:id/reject` - Reject change
- `GET /api/v1/admin/users` - List users
- `POST /api/v1/admin/users` - Create user
- `GET /api/v1/admin/bookings/export` - Excel export

## Booking Workflow

1. Employee creates booking → Status: **PENDING**
2. Admin approves → Status: **APPROVED** (included in Excel export)
3. Employee requests change (up to 24h before pickup) → Change Request: PENDING
4. Admin approves/rejects change request
5. Facility team downloads approved bookings as Excel

Only **APPROVED** bookings are exported for facility team coordination.
