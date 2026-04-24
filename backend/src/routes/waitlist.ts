import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { generateTicketCode, generateQRData } from "../lib/qr.js";
import { incrementCapacity } from "../lib/capacity.js";
import { z } from "zod";

const router = Router();

// Validation schema for joining waitlist
const joinWaitlistSchema = z.object({
  eventId: z.string().min(1, "Event ID is required"),
});

// POST /api/waitlist/join - Join waitlist for an event
router.post("/join", authenticate, async (req, res) => {
  try {
    const result = joinWaitlistSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: result.error.errors[0].message,
      });
    }

    const { eventId } = result.data;

    const waitlistEntry = await prisma.$transaction(async (tx) => {
      // 1. Check if event exists and is published
      const event = await tx.event.findUnique({
        where: { id: eventId },
      });

      if (!event) {
        throw new Error("NOT_FOUND:Event not found");
      }

      if (event.status !== "PUBLISHED") {
        throw new Error("INVALID_EVENT:Event is not accepting waitlist");
      }

      // 2. Check if user already has a confirmed booking for this event
      const existingBooking = await tx.booking.findFirst({
        where: {
          userId: req.user!.userId,
          eventId,
          status: "CONFIRMED",
        },
      });

      if (existingBooking) {
        throw new Error("DUPLICATE:You already have a ticket for this event");
      }

      // 3. Check if user is already on the waitlist for this event
      const existingWaitlist = await tx.booking.findFirst({
        where: {
          userId: req.user!.userId,
          eventId,
          status: "WAITLISTED",
        },
      });

      if (existingWaitlist) {
        throw new Error("DUPLICATE:You are already on the waitlist for this event");
      }

      // 4. Create waitlist entry
      const ticketCode = generateTicketCode();
      const qrCodeData = generateQRData(ticketCode);

      const entry = await tx.booking.create({
        data: {
          ticketCode,
          qrCodeData,
          userId: req.user!.userId,
          eventId,
          status: "WAITLISTED",
          pricePaid: 0,
          discountAmount: 0,
        },
      });

      // 5. Calculate position in waitlist
      const waitlistEntries = await tx.booking.findMany({
        where: {
          eventId,
          status: "WAITLISTED",
        },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });

      const position = waitlistEntries.findIndex((e) => e.id === entry.id) + 1;

      return { ...entry, waitlistPosition: position };
    });

    res.status(201).json({
      success: true,
      data: {
        booking: waitlistEntry,
        position: waitlistEntry.waitlistPosition,
      },
      message: "Added to waitlist successfully",
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Error joining waitlist:", err);

    if (err.message?.startsWith("NOT_FOUND:")) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: err.message.split(":")[1],
      });
    }

    if (err.message?.startsWith("INVALID_EVENT:")) {
      return res.status(400).json({
        success: false,
        error: "INVALID_EVENT",
        message: err.message.split(":")[1],
      });
    }

    if (err.message?.startsWith("DUPLICATE:")) {
      return res.status(409).json({
        success: false,
        error: "DUPLICATE",
        message: err.message.split(":")[1],
      });
    }

    res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "Failed to join waitlist",
    });
  }
});

// GET /api/waitlist/position/:eventId - Get user's waitlist position
router.get("/position/:eventId", authenticate, async (req, res) => {
  try {
    const eventId = req.params.eventId as string;

    // Find user's waitlist entry
    const waitlistEntry = await prisma.booking.findFirst({
      where: {
        userId: req.user!.userId,
        eventId,
        status: "WAITLISTED",
      },
    });

    if (!waitlistEntry) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "You are not on the waitlist for this event",
      });
    }

    // Calculate position
    const count = await prisma.booking.count({
      where: {
        eventId,
        status: "WAITLISTED",
        createdAt: { lt: waitlistEntry.createdAt },
      },
    });

    const position = count + 1;

    // Get total waitlist count
    const totalWaitlist = await prisma.booking.count({
      where: {
        eventId,
        status: "WAITLISTED",
      },
    });

    res.json({
      success: true,
      data: {
        position,
        totalWaitlist,
        bookingId: waitlistEntry.id,
        createdAt: waitlistEntry.createdAt,
      },
    });
  } catch (error) {
    console.error("Error fetching waitlist position:", error);
    res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "Failed to fetch waitlist position",
    });
  }
});

// DELETE /api/waitlist/leave/:eventId - Leave waitlist
router.delete("/leave/:eventId", authenticate, async (req, res) => {
  try {
    const eventId = req.params.eventId as string;

    const result = await prisma.$transaction(async (tx) => {
      // Find user's waitlist entry
      const waitlistEntry = await tx.booking.findFirst({
        where: {
          userId: req.user!.userId,
          eventId,
          status: "WAITLISTED",
        },
      });

      if (!waitlistEntry) {
        throw new Error("NOT_FOUND:You are not on the waitlist for this event");
      }

      // Delete the waitlist entry
      await tx.booking.delete({
        where: { id: waitlistEntry.id },
      });

      return { deletedId: waitlistEntry.id };
    });

    res.json({
      success: true,
      message: "Removed from waitlist successfully",
      data: result,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Error leaving waitlist:", err);

    if (err.message?.startsWith("NOT_FOUND:")) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: err.message.split(":")[1],
      });
    }

    res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "Failed to leave waitlist",
    });
  }
});

// GET /api/waitlist/my-waitlists - List user's waitlist entries
router.get("/my-waitlists", authenticate, async (req, res) => {
  try {
    const waitlistEntries = await prisma.booking.findMany({
      where: {
        userId: req.user!.userId,
        status: "WAITLISTED",
      },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            date: true,
            time: true,
            venue: true,
            imageUrl: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Calculate positions for each
    const entriesWithPosition = await Promise.all(
      waitlistEntries.map(async (entry) => {
        const count = await prisma.booking.count({
          where: {
            eventId: entry.eventId,
            status: "WAITLISTED",
            createdAt: { lt: entry.createdAt },
          },
        });

        return {
          ...entry,
          waitlistPosition: count + 1,
        };
      }),
    );

    res.json({
      success: true,
      data: entriesWithPosition,
    });
  } catch (error) {
    console.error("Error fetching waitlists:", error);
    res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "Failed to fetch waitlists",
    });
  }
});

/**
 * Promote the first person on the waitlist to a confirmed booking.
 * Called automatically when a booking is cancelled.
 *
 * @param tx - Prisma transaction client
 * @param eventId - ID of the event
 * @param seatTierId - Optional tier ID from the cancelled booking
 * @returns The newly promoted booking, or null if no waitlist entries
 */
export async function promoteFromWaitlist(tx: any, eventId: string, seatTierId?: string | null) {
  // Find the first waitlisted user (oldest createdAt)
  const waitlistEntry = await tx.booking.findFirst({
    where: {
      eventId,
      status: "WAITLISTED",
    },
    orderBy: { createdAt: "asc" },
    include: {
      user: true,
      event: true,
    },
  });

  if (!waitlistEntry) {
    return null; // No one on waitlist
  }

  // Optimistic locking: Verify the entry is still WAITLISTED before promoting
  // This prevents double-promotion in concurrent cancellation scenarios
  const stillWaitlisted = await tx.booking.findUnique({
    where: { id: waitlistEntry.id, status: "WAITLISTED" },
  });

  if (!stillWaitlisted) {
    return null; // Already promoted by another concurrent transaction
  }

  // Determine ticket price
  let ticketPrice = waitlistEntry.event.price;
  let finalTierId: string | null = seatTierId || null;

  if (seatTierId) {
    const tier = await tx.seatTier.findUnique({
      where: { id: seatTierId },
    });
    if (tier) {
      ticketPrice = tier.price;
    }
  }

  // Generate new ticket credentials
  const ticketCode = generateTicketCode();
  const qrCodeData = generateQRData(ticketCode);

  // Update the waitlist entry to CONFIRMED
  const promotedBooking = await tx.booking.update({
    where: { id: waitlistEntry.id },
    data: {
      status: "CONFIRMED",
      pricePaid: ticketPrice,
      seatTierId: finalTierId,
      ticketCode,
      qrCodeData,
    },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          date: true,
          time: true,
          venue: true,
        },
      },
      seatTier: {
        select: {
          id: true,
          name: true,
          price: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  // Increment capacity
  await incrementCapacity(tx, eventId, finalTierId);

  return promotedBooking;
}

export default router;
