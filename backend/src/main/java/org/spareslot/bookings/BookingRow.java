package org.spareslot.bookings;

import java.time.OffsetDateTime;
import java.util.UUID;

/** A booking with the resource and organisation facts every rule needs. */
public record BookingRow(UUID id, UUID resourceId, String resourceName, String resourceCategory, UUID orgId,
                         String orgName, int resourceDepositMinor,
                         int maxBookingHours, int weeklyHourCap, UUID requesterId, String requesterName,
                         UUID teamId, OffsetDateTime startAt, OffsetDateTime endAt, String purpose, String status,
                         String decisionReason, UUID decidedBy, OffsetDateTime decidedAt, int depositMinor,
                         String depositStatus, OffsetDateTime checkedInAt, OffsetDateTime returnedAt,
                         OffsetDateTime closedAt, OffsetDateTime createdAt, OffsetDateTime updatedAt) {

    public boolean isOverdue() {
        return "checked_in".equals(status) && endAt.isBefore(OffsetDateTime.now());
    }

    public double hours() {
        return java.time.Duration.between(startAt, endAt).toMinutes() / 60.0;
    }
}
