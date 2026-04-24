"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Booking } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { bookingsAPI } from "@/lib/api";
import { formatDate, formatTime, formatCurrency } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Alert } from "@/components/ui/Alert";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";

export default function TicketPage() {
  const params = useParams();
  const router = useRouter();
  const { user, token, isLoading: authLoading } = useAuth();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Transfer state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [transferSuccess, setTransferSuccess] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user || !token) {
      router.push(`/login?callbackUrl=/tickets/${params.id}`);
      return;
    }

    Promise.all([bookingsAPI.get(token, params.id as string), bookingsAPI.getQR(token, params.id as string)])
      .then(([bookingRes, qrRes]) => {
        setBooking(bookingRes.data);
        setQrCode(qrRes.data.qrCode);
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [user, token, authLoading, router, params.id]);

  const handleTransfer = async () => {
    if (!token || !recipientEmail.trim()) return;
    setIsTransferring(true);
    setTransferError("");
    setTransferSuccess("");

    try {
      await bookingsAPI.transfer(token, params.id as string, recipientEmail.trim());
      setTransferSuccess("Ticket transferred successfully!");
      setShowTransferModal(false);
      setRecipientEmail("");

      // Redirect to bookings page after a short delay
      setTimeout(() => {
        router.push("/bookings");
      }, 2000);
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Failed to transfer ticket");
    } finally {
      setIsTransferring(false);
    }
  };

  const closeTransferModal = () => {
    setShowTransferModal(false);
    setRecipientEmail("");
    setTransferError("");
    setTransferSuccess("");
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !booking) {
    return <div className="container py-8 text-center text-red-600">{error || "Ticket not found"}</div>;
  }

  if (booking.status !== "CONFIRMED") {
    return (
      <div className="container py-8">
        <Alert variant="warning">This ticket is no longer valid. Status: {booking.status}</Alert>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="max-w-md mx-auto">
        <Card>
          <CardContent className="text-center space-y-6 py-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{booking.event?.name}</h1>
              {booking.event?.artistInfo && <p className="text-gray-600">{booking.event.artistInfo}</p>}
            </div>

            {qrCode && (
              <div className="flex justify-center">
                <img src={qrCode} alt="Ticket QR Code" className="w-64 h-64" />
              </div>
            )}

            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">Date</span>
                <span className="font-medium">{booking.event && formatDate(booking.event.date)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">Time</span>
                <span className="font-medium">{booking.event && formatTime(booking.event.time)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">Venue</span>
                <span className="font-medium">{booking.event?.venue}</span>
              </div>
              {booking.seatTier && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-500">Tier</span>
                  <span className="font-medium">{booking.seatTier.name}</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">Price Paid</span>
                <span className="font-medium">{formatCurrency(booking.pricePaid)}</span>
              </div>
              {booking.discountAmount > 0 && (
                <div className="flex justify-between py-2 border-b text-green-600">
                  <span>Discount</span>
                  <span>-{formatCurrency(booking.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between py-2">
                <span className="text-gray-500">Ticket Code</span>
                <span className="font-mono font-medium">{booking.ticketCode.slice(0, 8).toUpperCase()}</span>
              </div>
            </div>

            <div className="pt-4 space-y-3">
              <Button className="w-full" onClick={() => qrCode && window.open(qrCode, "_blank")}>
                Download QR Code
              </Button>
              <Button variant="secondary" className="w-full" onClick={() => setShowTransferModal(true)}>
                Transfer Ticket
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => router.push("/bookings")}>
                Back to Bookings
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transfer Modal */}
      <Modal isOpen={showTransferModal} onClose={closeTransferModal} title="Transfer Ticket">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Transfer this ticket to another registered user. The recipient must have an account on the platform.
          </p>

          {transferError && <Alert variant="error">{transferError}</Alert>}
          {transferSuccess && <Alert variant="success">{transferSuccess}</Alert>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Email</label>
            <Input
              type="email"
              placeholder="Enter recipient's email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              disabled={isTransferring}
            />
          </div>

          <div className="flex space-x-3">
            <Button variant="secondary" className="flex-1" onClick={closeTransferModal} disabled={isTransferring}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleTransfer}
              isLoading={isTransferring}
              disabled={!recipientEmail.trim()}
            >
              Confirm Transfer
            </Button>
          </div>

          <p className="text-xs text-gray-500 mt-2">Note: Transfer is immediate and cannot be undone.</p>
        </div>
      </Modal>
    </div>
  );
}
