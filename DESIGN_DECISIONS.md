# Design Decisions & Corrections

## Issues Addressed from Review

### 1. Booking Approval Workflow (Clarified)
- New booking → PENDING (employee cannot travel yet)
- Admin approves → APPROVED (facility team receives this in export)
- Only APPROVED bookings go to facility team Excel export
- If admin never reviews: booking stays PENDING, not included in export
- Auto-expiry: bookings still PENDING after their pickup time are marked EXPIRED by system

### 2. Change Request Timing Rule (Corrected)
- Original (contradictory): "within 24 hrs before pickup"
- Corrected: "User can request changes UP TO 24 hours before pickup time"
- After the 24-hour cutoff, booking is locked (no changes allowed)
- Example: Booking tomorrow 10 AM → must submit change request by today 10 AM

### 3. Audit Trail (Added)
- New table: `audit_logs`
- Tracks: booking creation, status changes, approvals, rejections, change requests
- Fields: id, entity_type, entity_id, action, actor_id, old_value, new_value, timestamp

### 4. Race Conditions (Addressed)
- Prisma transactions for approval/rejection workflows
- Optimistic locking via `version` field on bookings
- Change request creation checks booking version before writing

### 5. Session Management (Per Your Requirement)
- Sessions are permanent until Super Admin revokes them
- No auto-expiry on sessions
- Super Admin can revoke any session via admin panel

### 6. Unified User Model (Corrected)
- Single `users` table for all employees (including admins)
- Separate `user_roles` table for role assignments
- One employee can have multiple roles (USER + DEPARTMENT_ADMIN)
- No duplication of employee records

### 7. Department Admin Relationship (Corrected)
- Many-to-many via `department_admins` table
- Multiple admins per department supported

### 8. Booking Status Separation (Corrected)
- Booking statuses: PENDING, APPROVED, COMPLETED, CANCELLED, EXPIRED
- Change request statuses: PENDING, APPROVED, REJECTED
- No overlap or confusion between the two lifecycles

### 9. Notification Strategy (MVP)
- MVP: In-app notifications only (notification bell icon)
- Future: Email/Teams integration
- Notification table stores messages for each user

### 10. Excel Export Versioning (Added)
- Each export gets: timestamp, generated_by, filters_used
- Export history tracked in `export_logs` table

### 11. API Convention (Standardized)
- All routes use `/api/v1/` prefix consistently
- No mixing of versioned and non-versioned

### 12. Middleware Clarification
- Single `middleware.ts` at app root (Next.js standard)
- Utility modules in `lib/` for reusable auth/validation logic

### 13. Fetch over Axios
- Using native `fetch` for server components
- Lightweight wrapper for client-side requests (no Axios)

### 14. Database Constraints (Added)
- UNIQUE constraint: (user_id, booking_date, pickup_time) prevents duplicates
- CHECK constraint: booking_date >= CURRENT_DATE prevents past bookings
- Validation: pickup_time != drop_time
- Validation: no overlapping time slots for same user/date

### 15. Docker for Development (Added)
- docker-compose.yml with PostgreSQL for local development
