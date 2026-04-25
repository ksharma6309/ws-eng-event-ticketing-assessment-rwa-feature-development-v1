# Engineering Decisions

## Problem Understanding

Two features were implemented:

**Story 1: Ticket Transfer** — Attendees can transfer confirmed tickets to other registered users by email. Immediate, no approval workflow.

**Story 2: Event Waitlist** — Attendees can join a waitlist for sold-out events. When a cancellation occurs, the next person in the queue is automatically promoted to a confirmed booking.

---

## Story 1: Ticket Transfer

### Data Model

No schema changes. The existing `Booking` model with `userId` is sufficient — a transfer is just an ownership change.

### Implementation

**Backend — `POST /api/bookings/:id/transfer`** (`backend/src/routes/bookings.ts`)

- Validates the caller owns the booking and it is `CONFIRMED`
- Looks up recipient by email (normalized: trimmed + lowercased)
- Rejects if recipient already has a confirmed booking for the same event
- Delegates to `transferBooking()` in `lib/transfer.ts` which uses a **cancel+create pattern**: original booking is marked `CANCELLED`, a new booking with fresh ticket code and QR data is created for the recipient
- Entire operation runs inside a Prisma transaction to prevent partial state

**Why cancel+create instead of a simple userId update?**

- Maintains a full audit trail — the original booking record is preserved as `CANCELLED`
- New ticket credentials (code + QR) are issued to the recipient, preventing the sender from using a screenshot of the old QR
- Consistent with the existing organizer reassignment flow

**Frontend — Ticket detail page** (`frontend/src/app/tickets/[id]/page.tsx`)

- Transfer button opens a modal with an email input
- Validates email format client-side before submitting
- On success, redirects away (ticket no longer belongs to the user)
- Error states handled inline in the modal

**API shape:**

```
POST /api/bookings/:id/transfer
Body: { recipientEmail: string }
Response: { success: true, data: Booking }
```

---

## Story 2: Event Waitlist

### Data Model

No schema changes. The existing `Booking.status` field already supports `"WAITLISTED"`. Waitlist position is derived from `createdAt` ordering (FIFO) — no separate position column needed, which avoids re-numbering on leave.

### Implementation

**Backend — `backend/src/routes/waitlist.ts`**

| Endpoint                              | Description                                                        |
| ------------------------------------- | ------------------------------------------------------------------ |
| `POST /api/waitlist/join`             | Join waitlist — validates event is published AND actually sold out |
| `GET /api/waitlist/position/:eventId` | Returns user's current position and total queue size               |
| `DELETE /api/waitlist/leave/:eventId` | Removes the user's waitlist entry                                  |
| `GET /api/waitlist/my-waitlists`      | Lists all waitlist entries for the user with positions             |

Key decisions:

- **Sold-out enforcement on join**: The join endpoint checks `event.soldCount >= event.capacity` (and all tiers if tiered) before allowing a join. Returns `NOT_SOLD_OUT` error if tickets are still available.
- **Position via count query**: Position = count of WAITLISTED entries for the same event with an earlier `createdAt`. Avoids storing/maintaining a position field.
- **Waitlist entries don't increment `soldCount`**: They are zero-cost placeholders until promoted.

**Auto-promotion — `promoteFromWaitlist(tx, eventId, seatTierId)`** (exported from `waitlist.ts`)

Called inside the cancellation transaction in `bookings.ts` after `decrementCapacity`. Steps:

1. Find the oldest `WAITLISTED` booking for the event
2. Re-verify it is still `WAITLISTED` (optimistic lock via `findFirst` — guards against concurrent promotions)
3. Update status to `CONFIRMED`, assign ticket price from the freed tier (or event base price), generate new `ticketCode` + `qrCodeData`
4. Call `incrementCapacity()` to keep `soldCount` accurate

All steps run inside the same transaction as the cancellation — atomic by design.

**`decrementCapacity` bug fix** (`backend/src/lib/capacity.ts`)

The original implementation only decremented `soldCount` when `seatTierId` was set, meaning tier-less event cancellations never freed capacity. Fixed to always decrement event-level count, and additionally decrement tier-level count when applicable.

**Frontend**

- **Event page** (`frontend/src/app/events/[id]/page.tsx`): Shows "Join Waitlist" / "Leave Waitlist" toggle when event is sold out. On load, checks `GET /api/waitlist/position/:eventId` to pre-populate state if user is already on the waitlist. Position refreshes every 30 seconds.
- **Home page** (`frontend/src/app/page.tsx`): Sold-out cards previously had a full-screen black overlay blocking all clicks and a disabled button. Fixed — overlay replaced with a small corner badge, button changed to "Join Waitlist" and navigates to the event page.
- **Bookings page** (`frontend/src/app/bookings/page.tsx`): WAITLISTED entries show position badge and a "Leave Waitlist" button with optimistic removal from the list on success.

---

## Risks & Assumptions

| #   | Item                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Race conditions** — mitigated by wrapping promotion inside the cancellation transaction and using an optimistic `findFirst` re-check before promoting |
| 2   | **Promoted user no longer wants the ticket** — auto-promotion is immediate; a notification + acceptance window is out of scope                          |
| 3   | **Tier-agnostic waitlist** — waitlist entries are not tied to a specific tier; on promotion they inherit the tier of the cancelled booking              |
| 4   | **Recipient must be registered** — transfer to unregistered emails is not supported                                                                     |
| 5   | **Transfer is irreversible** — no undo; original booking is permanently `CANCELLED`                                                                     |
