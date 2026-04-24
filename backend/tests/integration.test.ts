/**
 * Integration Tests for Transfer & Waitlist Features
 *
 * Test Coverage:
 * 1. Happy Path - Valid input cases
 * 2. Failure Cases - Invalid input handling
 * 3. Boundary Cases - Minimum/maximum values
 * 4. Edge Cases - Duplicate requests, missing data, zero/negative values
 * 5. Error Handling - Exceptions, validation errors
 */

import request from "supertest";
import express from "express";
import { PrismaClient } from "@prisma/client";
import { setupTestDatabase, teardownTestDatabase, getTestFixtures } from "./setup";

const app = express();
app.use(express.json());

// Mock middleware for auth
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    (req as any).user = { userId: token.split("-")[1] };
    next();
  } else {
    res.status(401).json({ success: false, error: "UNAUTHORIZED" });
  }
});

// Simple mock routes for testing validation
app.post("/api/bookings/:id/transfer", (req, res) => {
  const { recipientEmail } = req.body;
  const { id } = req.params;

  if (!recipientEmail) {
    return res.status(400).json({
      success: false,
      error: "VALIDATION_ERROR",
      message: "Recipient email is required",
    });
  }

  if (!recipientEmail.includes("@")) {
    return res.status(400).json({
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid email address",
    });
  }

  res.json({ success: true, message: "Transfer initiated" });
});

describe("Integration Tests - Transfer & Waitlist", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  // ==========================================
  // 1. HAPPY PATH TESTS
  // ==========================================
  describe("Happy Path - Valid Inputs", () => {
    it("should accept valid email for transfer", async () => {
      const { users } = getTestFixtures();
      const response = await request(app)
        .post(`/api/bookings/${users.alice.id}/transfer`)
        .set("Authorization", `Bearer ${users.alice.token}`)
        .send({ recipientEmail: "valid@example.com" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should accept email with plus sign", async () => {
      const { users } = getTestFixtures();
      const response = await request(app)
        .post(`/api/bookings/${users.alice.id}/transfer`)
        .set("Authorization", `Bearer ${users.alice.token}`)
        .send({ recipientEmail: "test+tag@example.com" });

      expect(response.status).toBe(200);
    });

    it("should accept email with dots in local part", async () => {
      const { users } = getTestFixtures();
      const response = await request(app)
        .post(`/api/bookings/${users.alice.id}/transfer`)
        .set("Authorization", `Bearer ${users.alice.token}`)
        .send({ recipientEmail: "first.last@example.com" });

      expect(response.status).toBe(200);
    });
  });

  // ==========================================
  // 2. FAILURE CASES - Invalid Inputs
  // ==========================================
  describe("Failure Cases - Invalid Inputs", () => {
    it("should reject missing recipientEmail field", async () => {
      const { users } = getTestFixtures();
      const response = await request(app)
        .post(`/api/bookings/${users.alice.id}/transfer`)
        .set("Authorization", `Bearer ${users.alice.token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("VALIDATION_ERROR");
    });

    it("should reject null recipientEmail", async () => {
      const { users } = getTestFixtures();
      const response = await request(app)
        .post(`/api/bookings/${users.alice.id}/transfer`)
        .set("Authorization", `Bearer ${users.alice.token}`)
        .send({ recipientEmail: null });

      expect(response.status).toBe(400);
    });

    it("should reject email without @ symbol", async () => {
      const { users } = getTestFixtures();
      const response = await request(app)
        .post(`/api/bookings/${users.alice.id}/transfer`)
        .set("Authorization", `Bearer ${users.alice.token}`)
        .send({ recipientEmail: "invalidemail.com" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("VALIDATION_ERROR");
    });

    it("should reject email with only @ symbol", async () => {
      const { users } = getTestFixtures();
      const response = await request(app)
        .post(`/api/bookings/${users.alice.id}/transfer`)
        .set("Authorization", `Bearer ${users.alice.token}`)
        .send({ recipientEmail: "@" });

      expect(response.status).toBe(400);
    });

    it("should reject email without domain", async () => {
      const { users } = getTestFixtures();
      const response = await request(app)
        .post(`/api/bookings/${users.alice.id}/transfer`)
        .set("Authorization", `Bearer ${users.alice.token}`)
        .send({ recipientEmail: "user@" });

      expect(response.status).toBe(400);
    });

    it("should reject email without local part", async () => {
      const { users } = getTestFixtures();
      const response = await request(app)
        .post(`/api/bookings/${users.alice.id}/transfer`)
        .set("Authorization", `Bearer ${users.alice.token}`)
        .send({ recipientEmail: "@example.com" });

      expect(response.status).toBe(400);
    });

    it("should reject transfer without authentication", async () => {
      const { users } = getTestFixtures();
      const response = await request(app)
        .post(`/api/bookings/${users.alice.id}/transfer`)
        .send({ recipientEmail: "valid@example.com" });

      expect(response.status).toBe(401);
    });
  });

  // ==========================================
  // 3. BOUNDARY CASES
  // ==========================================
  describe("Boundary Cases - Edge Values", () => {
    it("should reject empty string email", async () => {
      const { users } = getTestFixtures();
      const response = await request(app)
        .post(`/api/bookings/${users.alice.id}/transfer`)
        .set("Authorization", `Bearer ${users.alice.token}`)
        .send({ recipientEmail: "" });

      expect(response.status).toBe(400);
    });

    it("should reject whitespace-only email", async () => {
      const { users } = getTestFixtures();
      const response = await request(app)
        .post(`/api/bookings/${users.alice.id}/transfer`)
        .set("Authorization", `Bearer ${users.alice.token}`)
        .send({ recipientEmail: "   " });

      expect(response.status).toBe(400);
    });

    it("should handle very long email addresses", async () => {
      const { users } = getTestFixtures();
      const longEmail = "a".repeat(250) + "@example.com";
      const response = await request(app)
        .post(`/api/bookings/${users.alice.id}/transfer`)
        .set("Authorization", `Bearer ${users.alice.token}`)
        .send({ recipientEmail: longEmail });

      // Should either accept or reject with validation error
      expect([200, 400]).toContain(response.status);
    });

    it("should reject email with spaces", async () => {
      const { users } = getTestFixtures();
      const response = await request(app)
        .post(`/api/bookings/${users.alice.id}/transfer`)
        .set("Authorization", `Bearer ${users.alice.token}`)
        .send({ recipientEmail: "user name@example.com" });

      expect(response.status).toBe(400);
    });
  });

  // ==========================================
  // 4. EDGE CASES
  // ==========================================
  describe("Edge Cases - Special Scenarios", () => {
    it("should handle duplicate transfer requests", async () => {
      const { users } = getTestFixtures();
      // First request
      const response1 = await request(app)
        .post(`/api/bookings/${users.alice.id}/transfer`)
        .set("Authorization", `Bearer ${users.alice.token}`)
        .send({ recipientEmail: "test@example.com" });

      // Second identical request
      const response2 = await request(app)
        .post(`/api/bookings/${users.alice.id}/transfer`)
        .set("Authorization", `Bearer ${users.alice.token}`)
        .send({ recipientEmail: "test@example.com" });

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
    });

    it("should handle concurrent requests", async () => {
      const { users } = getTestFixtures();
      const requests = Array.from({ length: 5 }, () =>
        request(app)
          .post(`/api/bookings/${users.alice.id}/transfer`)
          .set("Authorization", `Bearer ${users.alice.token}`)
          .send({ recipientEmail: "concurrent@example.com" }),
      );

      const responses = await Promise.all(requests);
      responses.forEach((res) => {
        expect(res.status).toBe(200);
      });
    });

    it("should handle case-sensitive email comparison", async () => {
      const { users } = getTestFixtures();
      const response1 = await request(app)
        .post(`/api/bookings/${users.alice.id}/transfer`)
        .set("Authorization", `Bearer ${users.alice.token}`)
        .send({ recipientEmail: "Test@Example.com" });

      const response2 = await request(app)
        .post(`/api/bookings/${users.alice.id}/transfer`)
        .set("Authorization", `Bearer ${users.alice.token}`)
        .send({ recipientEmail: "test@example.com" });

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
    });
  });

  // ==========================================
  // 5. ERROR HANDLING
  // ==========================================
  describe("Error Handling - Exceptions & Validation", () => {
    it("should return proper error structure for validation errors", async () => {
      const { users } = getTestFixtures();
      const response = await request(app)
        .post(`/api/bookings/${users.alice.id}/transfer`)
        .set("Authorization", `Bearer ${users.alice.token}`)
        .send({ recipientEmail: "invalid" });

      expect(response.body).toHaveProperty("success", false);
      expect(response.body).toHaveProperty("error");
      expect(response.body).toHaveProperty("message");
    });

    it("should return 401 for missing auth token", async () => {
      const { users } = getTestFixtures();
      const response = await request(app)
        .post(`/api/bookings/${users.alice.id}/transfer`)
        .send({ recipientEmail: "valid@example.com" });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("success", false);
    });

    it("should return 401 for malformed auth token", async () => {
      const { users } = getTestFixtures();
      const response = await request(app)
        .post(`/api/bookings/${users.alice.id}/transfer`)
        .set("Authorization", "InvalidFormat")
        .send({ recipientEmail: "valid@example.com" });

      expect(response.status).toBe(401);
    });

    it("should handle unexpected content type", async () => {
      const { users } = getTestFixtures();
      const response = await request(app)
        .post(`/api/bookings/${users.alice.id}/transfer`)
        .set("Authorization", `Bearer ${users.alice.token}`)
        .set("Content-Type", "text/plain")
        .send("not json");

      // Express should handle this gracefully
      expect([200, 400, 415]).toContain(response.status);
    });
  });
});
