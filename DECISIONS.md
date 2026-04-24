# Engineering Decisions

Document your implementation approach, key decisions, and any questions or assumptions here. This is your primary planning artifact — write it before you start coding.

Keep it concise (~500 words). We care about the reasoning behind your choices, not the length.

---

## Problem Understanding

I'm building two features:

**Story 1: Ticket Transfer** — Allow attendees to transfer their confirmed tickets to other registered users by entering the recipient's email. The transfer is immediate with no approval workflow.

**Story 2: Event Waitlist** — Allow attendees to join a waitlist for sold-out events. When a ticket becomes available (via cancellation), the next person on the waitlist should automatically receive a ticket.

**Key Challenges:**

- The waitlist already has a partial implementation using `WAITLISTED` booking status in the schema and seed data
- The existing `transferBooking` function in `lib/transfer.ts` uses a cancel+create pattern which generates new ticket codes — I need to decide if this is appropriate for attendee-initiated transfers
- Automatic promotion from waitlist needs to happen atomically during cancellation to prevent race conditions
- The waitlist needs position tracking and FIFO ordering

## Approach

### Story 1: Ticket Transfer

**Data Model:** No schema changes needed. The existing `Booking` model with `userId` field is sufficient.

**Implementation Strategy:**

- Add a new endpoint `POST /api/bookings/:id/transfer` in `bookings.ts`
- Reuse the existing `transferBooking` function from `lib/transfer.ts` which handles the cancel+create pattern
- The cancel+create approach is appropriate here because:
  - It maintains an audit trail (original booking marked CANCELLED)
  - New ticket credentials are issued to the recipient
  - It's consistent with the existing organizer reassignment flow
- Add validation schema `transferBookingSchema` (already exists in `validations.ts` for organizer reassignment)

**API Design:**

- `POST /api/bookings/:id/transfer` — Transfer ticket to another user
  - Input: `{ recipientEmail: string }`
  - Returns: New booking details for the recipient

### Story 2: Event Waitlist

**Data Model:** Leverage existing `WAITLISTED` status in `Booking` model. Add `waitlistPosition` tracking via `createdAt` timestamp ordering.

**Implementation Strategy:**

- Complete the stub in `waitlist.ts` with full CRUD operations
- Use the existing `Booking` model with `status: "WAITLISTED"` for waitlist entries
- Waitlist position determined by `createdAt` ordering (FIFO)
- Automatic promotion integrated into the cancellation flow in `bookings.ts`

**API Design:**

- `POST /api/waitlist/join` — Join waitlist for an event
- `GET /api/waitlist/position/:eventId` — Get user's waitlist position
- `DELETE /api/waitlist/leave/:eventId` — Leave waitlist
- `GET /api/waitlist/my-waitlists` — List user's waitlist entries

**Automatic Promotion Logic:**

- When a booking is cancelled, check if event has waitlisted users
- If yes, promote the first waitlisted user (oldest `createdAt`)
- Promotion creates a confirmed booking with auto-generated ticket
- All operations happen atomically within the cancellation transaction

## Risks & Assumptions

**Risks:**

1. **Race conditions:** Multiple cancellations or concurrent waitlist joins could cause issues — mitigated by using Prisma transactions
2. **Promoted user no longer wants ticket:** The auto-promotion assumes the user still wants the ticket. Alternative: send notification with time-limited acceptance window (out of scope)
3. **Event capacity changes:** If organizer reduces capacity, waitlist could be affected

**Assumptions:**

1. Recipient must have a registered account (per requirements)
2. Transfer is immediate and irreversible
3. Auto-promotion happens instantly on cancellation
4. Promoted user gets the same tier as the cancelled booking (if tiered event)
5. Waitlist entries don't count toward event capacity

**Questions for Product:**

1. Should there be a cooldown period before a transferred ticket can be transferred again?
2. Should users be notified via email about auto-promotion? (Assumed: in-app notification only)

## Implementation Sequence

1. **Backend - Story 1 (Transfer):**
   - Add `POST /api/bookings/:id/transfer` endpoint
   - Integrate with existing `transferBooking` utility
   - Add ownership validation

2. **Backend - Story 2 (Waitlist):**
   - Implement waitlist endpoints in `waitlist.ts`
   - Modify cancellation flow in `bookings.ts` to trigger auto-promotion
   - Add helper function for waitlist promotion

3. **Frontend - Story 1 (Transfer):**
   - Add transfer button and modal to ticket detail page
   - Add transfer API call to `api.ts`
   - Handle success/error states

4. **Frontend - Story 2 (Waitlist):**
   - Add "Join Waitlist" button on sold-out event pages
   - Show waitlist position indicator
   - Add leave waitlist functionality
   - Update bookings page to show waitlist entries

5. **Testing & Validation:**
   - Manual testing of all acceptance criteria
   - Capture screenshots for submission
