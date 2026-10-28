package org.spareslot.extensions;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.spareslot.auth.Actor;
import org.spareslot.bookings.BookingRepository;
import org.spareslot.bookings.BookingRow;
import org.spareslot.common.ApiException;
import org.spareslot.common.AuditService;
import org.spareslot.common.Labels;
import org.spareslot.notifications.NotificationService;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Extensions: the borrower asks for a later end time with a reason; staff approve or reject with a reason.
 * Approval moves bookings.end_at (never the status) and respects conflicts, the maximum length and the weekly quota.
 */
@RestController
public class ExtensionController {

    private final JdbcClient jdbc;
    private final BookingRepository bookings;
    private final AuditService audit;
    private final NotificationService notifications;

    public ExtensionController(JdbcClient jdbc, BookingRepository bookings, AuditService audit,
                               NotificationService notifications) {
        this.jdbc = jdbc;
        this.bookings = bookings;
        this.audit = audit;
        this.notifications = notifications;
    }

    public record ExtensionRequest(@NotNull OffsetDateTime requestedEndAt, @NotBlank @Size(max = 1000) String reason) {}

    public record Decision(@NotBlank @Pattern(regexp = "approve|reject") String action, @Size(max = 1000) String reason) {}

    public record Extension(UUID id, UUID bookingId, String resourceName, String requesterName,
                            OffsetDateTime currentEndAt, OffsetDateTime requestedEndAt, String reason, String status,
                            String decisionReason, String decidedByName, OffsetDateTime decidedAt,
                            OffsetDateTime createdAt) {}

    private static final String SELECT = """
            SELECT e.id, e.booking_id, r.name AS resource_name, u.full_name AS requester_name, b.end_at AS current_end_at,
                   e.requested_end_at, e.reason, e.status, e.decision_reason, d.full_name AS decided_by_name,
                   e.decided_at, e.created_at
            FROM booking_extensions e
            JOIN bookings b ON b.id = e.booking_id
            JOIN resources r ON r.id = b.resource_id
            JOIN users u ON u.id = b.requester_id
            LEFT JOIN users d ON d.id = e.decided_by
            """;

    @PostMapping("/api/bookings/{id}/extensions")
    @PreAuthorize("hasRole('USER')")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public Extension request(Actor actor, @PathVariable UUID id, @Valid @RequestBody ExtensionRequest body) {
        var b = bookings.lock(id);
        bookings.checkVisible(actor, b);
        if (!b.requesterId().equals(actor.userId())) throw ApiException.forbidden("Only the borrower asks for more time.");
        if (!List.of("approved", "checked_in").contains(b.status())) {
            throw ApiException.rule("extension_booking_state", "extension_window",
                    "More time can be requested only for an approved or checked-in booking.");
        }
        boolean pending = jdbc.sql("SELECT count(*) FROM booking_extensions WHERE booking_id = :b AND status = 'requested'")
                .param("b", id).query(Long.class).single() > 0;
        if (pending) {
            throw ApiException.rule("extension_pending", "one_extension_at_a_time",
                    "An extension request for this booking is already waiting for a decision.");
        }
        checkFits(b, body.requestedEndAt());
        UUID extId = jdbc.sql("""
                INSERT INTO booking_extensions (booking_id, requested_end_at, reason) VALUES (:b, :e, :r) RETURNING id
                """).param("b", id).param("e", body.requestedEndAt()).param("r", body.reason().trim())
                .query(UUID.class).single();
        audit.record(actor, "extension.requested", "extension", extId, null, "requested", body.reason().trim(),
                Map.of("bookingId", id.toString(), "fromEndAt", b.endAt().toString(),
                        "requestedEndAt", body.requestedEndAt().toString()));
        notifications.notifyStaff(b.orgId(), b.requesterName() + " asked to keep " + b.resourceName() + " until "
                + Labels.when(body.requestedEndAt()) + ": " + body.reason().trim(), "booking", id);
        return get(extId);
    }

    @GetMapping("/api/extensions")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    public List<Extension> queue(Actor actor, @RequestParam(defaultValue = "requested") String status) {
        return jdbc.sql(SELECT + " WHERE r.org_id = :org AND e.status = :s ORDER BY e.created_at")
                .param("org", actor.orgId()).param("s", status).query(Extension.class).list();
    }

    @PostMapping("/api/extensions/{id}/decision")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    @Transactional
    public Extension decide(Actor actor, @PathVariable UUID id, @Valid @RequestBody Decision body) {
        record Row(UUID bookingId, OffsetDateTime requestedEndAt, String status) {}
        var ext = jdbc.sql("SELECT booking_id, requested_end_at, status FROM booking_extensions WHERE id = :id FOR UPDATE")
                .param("id", id).query(Row.class).optional().orElseThrow(() -> ApiException.notFound("Extension request"));
        var b = bookings.lock(ext.bookingId());
        if (!actor.isStaffOf(b.orgId())) throw ApiException.notFound("Extension request");
        if (!"requested".equals(ext.status())) {
            throw ApiException.rule("extension_decided", "review_once", "This extension request was already " + ext.status() + ".");
        }
        if (Labels.blank(body.reason())) {
            throw ApiException.rule("reason_required", "reason_required",
                    "Write a reason. The borrower will read it, and it goes into the audit log.");
        }
        String reason = body.reason().trim();
        String target = "approve".equals(body.action()) ? "approved" : "rejected";
        if ("approved".equals(target)) {
            if (!List.of("approved", "checked_in").contains(b.status())) {
                throw ApiException.rule("extension_booking_state", "extension_window",
                        "The booking is no longer approved or checked in, so it cannot be extended. Reject the request with a reason.");
            }
            checkFits(b, ext.requestedEndAt());
            jdbc.sql("UPDATE bookings SET end_at = :e WHERE id = :b").param("e", ext.requestedEndAt()).param("b", b.id()).update();
        }
        jdbc.sql("""
                UPDATE booking_extensions SET status = :s, decision_reason = :r, decided_by = :u, decided_at = now() WHERE id = :id
                """).param("s", target).param("r", reason).param("u", actor.userId()).param("id", id).update();
        audit.record(actor, "extension." + target, "extension", id, "requested", target, reason,
                Map.of("bookingId", b.id().toString(), "fromEndAt", b.endAt().toString(),
                        "requestedEndAt", ext.requestedEndAt().toString()));
        notifications.notifyUser(b.requesterId(), ("approved".equals(target)
                ? "More time approved: keep " + b.resourceName() + " until " + Labels.when(ext.requestedEndAt()) + ". "
                : "More time not approved for " + b.resourceName() + ". ") + "Reason: " + reason, "booking", b.id());
        return get(id);
    }

    /** The new end must be later, within the maximum length, free of other live bookings and within the quota. */
    private void checkFits(BookingRow b, OffsetDateTime newEnd) {
        if (!newEnd.isAfter(b.endAt())) {
            throw ApiException.rule("extension_not_later", "extension_window",
                    "The new end time must be later than the current one (" + Labels.when(b.endAt()) + ").");
        }
        double totalHours = Duration.between(b.startAt(), newEnd).toMinutes() / 60.0;
        if (totalHours > b.maxBookingHours()) {
            throw ApiException.rule("window_too_long", "max_booking_hours",
                    b.resourceName() + " can be booked for at most " + b.maxBookingHours() + " hours at a time; the extended "
                            + "booking would be " + Labels.hours(totalHours) + " hours. Choose an earlier end time.");
        }
        if (bookings.liveOverlap(b.resourceId(), b.startAt(), newEnd, b.id())) {
            throw ApiException.rule("slot_taken", "no_overlap",
                    "Someone else has this resource booked straight after you, so it cannot be extended to that time. Choose an earlier end time.");
        }
        UUID subject = b.teamId() != null ? b.teamId() : b.requesterId();
        double used = bookings.weeklyHours(b.resourceId(), subject, b.startAt());
        double extra = Duration.between(b.endAt(), newEnd).toMinutes() / 60.0;
        if (used + extra > b.weeklyHourCap() + 1e-9) {
            throw ApiException.rule("weekly_quota", "weekly_quota",
                    "The extra " + Labels.hours(extra) + " hours would go over the weekly cap of " + b.weeklyHourCap()
                            + " hours on " + b.resourceName() + " (" + Labels.hours(used) + " already used). Choose an earlier end time.");
        }
    }

    private Extension get(UUID id) {
        return jdbc.sql(SELECT + " WHERE e.id = :id").param("id", id).query(Extension.class).single();
    }
}
