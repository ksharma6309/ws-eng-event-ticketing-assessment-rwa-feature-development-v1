/**
 * Test Setup and Utilities for Booking/Waitlist Tests
 *
 * This file provides test infrastructure including:
 * - Database setup/teardown
 * - Test data seeding
 * - Authentication helpers
 * - Request utilities
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export const prisma = new PrismaClient();

// Test user data
export interface TestUsers {
  alice: { id: string; email: string; token: string };
  bob: { id: string; email: string; token: string };
  carol: { id: string; email: string; token: string };
  organizer1: { id: string; email: string; token: string };
}

export interface TestEvents {
  soldOutEvent: { id: string; name: string };
  availableEvent: { id: string; name: string };
}

export interface TestBookings {
  aliceConfirmed: string;
  bobConfirmed: string;
  carolWaitlisted: string;
  cancelledBooking: string;
}

let testUsers: TestUsers | null = null;
let testEvents: TestEvents | null = null;
let testBookings: TestBookings | null = null;

/**
 * Initialize test database with seed data
 */
export async function setupTestDatabase(): Promise<{
  users: TestUsers;
  events: TestEvents;
  bookings: TestBookings;
}> {
  // Clean existing test data
  await prisma.booking.deleteMany({});
  await prisma.seatTier.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.user.deleteMany({});

  // Create test users
  const alicePassword = await bcrypt.hash("test123", 12);
  const bobPassword = await bcrypt.hash("test123", 12);
  const carolPassword = await bcrypt.hash("test123", 12);
  const orgPassword = await bcrypt.hash("test123", 12);

  const alice = await prisma.user.create({
    data: {
      email: "alice@test.com",
      password: alicePassword,
      name: "Alice Test",
      role: "ATTENDEE",
      isVerified: true,
    },
  });

  const bob = await prisma.user.create({
    data: {
      email: "bob@test.com",
      password: bobPassword,
      name: "Bob Test",
      role: "ATTENDEE",
      isVerified: true,
    },
  });

  const carol = await prisma.user.create({
    data: {
      email: "carol@test.com",
      password: carolPassword,
      name: "Carol Test",
      role: "ATTENDEE",
      isVerified: true,
    },
  });

  const organizer1 = await prisma.user.create({
    data: {
      email: "organizer@test.com",
      password: orgPassword,
      name: "Test Organizer",
      role: "ORGANIZER",
      isVerified: true,
    },
  });

  // Create test events
  const soldOutEvent = await prisma.event.create({
    data: {
      name: "Sold Out Test Event",
      description: "Test event that is sold out",
      date: new Date("2026-12-01"),
      time: "18:00",
      venue: "Test Venue",
      price: 100,
      capacity: 2,
      soldCount: 2,
      status: "PUBLISHED",
      organizerId: organizer1.id,
    },
  });

  const availableEvent = await prisma.event.create({
    data: {
      name: "Available Test Event",
      description: "Test event with available tickets",
      date: new Date("2026-12-15"),
      time: "19:00",
      venue: "Test Venue 2",
      price: 50,
      capacity: 100,
      soldCount: 0,
      status: "PUBLISHED",
      organizerId: organizer1.id,
    },
  });

  // Create test bookings
  const aliceBooking = await prisma.booking.create({
    data: {
      ticketCode: `test-${Date.now()}-alice`,
      qrCodeData: `qr-${Date.now()}-alice`,
      status: "CONFIRMED",
      pricePaid: 100,
      userId: alice.id,
      eventId: soldOutEvent.id,
    },
  });

  const bobBooking = await prisma.booking.create({
    data: {
      ticketCode: `test-${Date.now()}-bob`,
      qrCodeData: `qr-${Date.now()}-bob`,
      status: "CONFIRMED",
      pricePaid: 100,
      userId: bob.id,
      eventId: soldOutEvent.id,
    },
  });

  const carolWaitlist = await prisma.booking.create({
    data: {
      ticketCode: `test-${Date.now()}-carol-wait`,
      qrCodeData: `qr-${Date.now()}-carol-wait`,
      status: "WAITLISTED",
      pricePaid: 0,
      userId: carol.id,
      eventId: soldOutEvent.id,
    },
  });

  const cancelledBooking = await prisma.booking.create({
    data: {
      ticketCode: `test-${Date.now()}-cancelled`,
      qrCodeData: `qr-${Date.now()}-cancelled`,
      status: "CANCELLED",
      pricePaid: 50,
      refundAmount: 25,
      cancelledAt: new Date(),
      userId: alice.id,
      eventId: availableEvent.id,
    },
  });

  testUsers = {
    alice: { id: alice.id, email: alice.email, token: `token-${alice.id}` },
    bob: { id: bob.id, email: bob.email, token: `token-${bob.id}` },
    carol: { id: carol.id, email: carol.email, token: `token-${carol.id}` },
    organizer1: { id: organizer1.id, email: organizer1.email, token: `token-${organizer1.id}` },
  };

  testEvents = {
    soldOutEvent: { id: soldOutEvent.id, name: soldOutEvent.name },
    availableEvent: { id: availableEvent.id, name: availableEvent.name },
  };

  testBookings = {
    aliceConfirmed: aliceBooking.id,
    bobConfirmed: bobBooking.id,
    carolWaitlisted: carolWaitlist.id,
    cancelledBooking: cancelledBooking.id,
  };

  return {
    users: testUsers,
    events: testEvents,
    bookings: testBookings,
  };
}

/**
 * Clean up test database
 */
export async function teardownTestDatabase(): Promise<void> {
  await prisma.booking.deleteMany({});
  await prisma.seatTier.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.user.deleteMany({});
}

/**
 * Get test fixtures
 */
export function getTestFixtures() {
  if (!testUsers || !testEvents || !testBookings) {
    throw new Error("Test database not initialized. Call setupTestDatabase() first.");
  }
  return {
    users: testUsers,
    events: testEvents,
    bookings: testBookings,
  };
}
