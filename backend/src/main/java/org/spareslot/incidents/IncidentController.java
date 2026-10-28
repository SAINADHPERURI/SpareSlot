package org.spareslot.incidents;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.spareslot.auth.Actor;
import org.spareslot.bookings.BookingRepository;
import org.spareslot.common.ApiException;
import org.spareslot.common.AuditService;
import org.spareslot.common.Labels;
import org.spareslot.notifications.NotificationService;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Incidents: damage, delay, conflict, pre-existing damage and dispute. The borrower or staff raise them; staff
 * move them through open, under review and resolved with a written resolution. An open damage or dispute
 * incident holds the deposit decision until it is resolved.
 */
@RestController
@RequestMapping("/api/incidents")
public class IncidentController {

    private final JdbcClient jdbc;
    private final BookingRepository bookings;
    private final AuditService audit;
    private final NotificationService notifications;

    public IncidentController(JdbcClient jdbc, BookingRepository bookings, AuditService audit,
                              NotificationService notifications) {
        this.jdbc = jdbc;
        this.bookings = bookings;
        this.audit = audit;
        this.notifications = notifications;
    }

    public record RaiseRequest(@NotNull UUID bookingId,
                               @NotBlank @Pattern(regexp = "damage|delay|conflict|pre_existing_damage|dispute") String kind,
                               @NotBlank @Size(max = 2000) String description) {}

    public record ResolveRequest(@NotBlank @Size(max = 2000) String resolution) {}

    public record Note(@Size(max = 2000) String note) {}

    public record Incident(UUID id, UUID bookingId, UUID resourceId, String resourceName, String requesterName,
                           String kind, String description, String status, String raisedByName,
                           OffsetDateTime raisedAt, String resolvedByName, OffsetDateTime resolvedAt,
                           String resolution) {}

    private static final String SELECT = """
            SELECT i.id, i.booking_id, i.resource_id, r.name AS resource_name, req.full_name AS requester_name,
                   i.kind, i.description, i.status,
                   CASE WHEN i.raised_by = '00000000-0000-0000-0000-000000000000' THEN 'SpareSlot (automatic)' ELSE rb.full_name END AS raised_by_name,
                   i.raised_at, rv.full_name AS resolved_by_name, i.resolved_at, i.resolution
            FROM incidents i
            JOIN resources r ON r.id = i.resource_id
            JOIN bookings b ON b.id = i.booking_id
            JOIN users req ON req.id = b.requester_id
            JOIN users rb ON rb.id = i.raised_by
            LEFT JOIN users rv ON rv.id = i.resolved_by
            """;

    static String label(String kind) {
        return switch (kind) {
            case "pre_existing_damage" -> "pre-existing damage";
            default -> kind;
        };
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('USER','OWNER','MANAGER')")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public Incident raise(Actor actor, @Valid @RequestBody RaiseRequest body) {
        var b = bookings.lock(body.bookingId());
        bookings.checkVisible(actor, b);
        boolean requester = actor.isUser() && b.requesterId().equals(actor.userId());
        if (!requester && !actor.isStaffOf(b.orgId())) {
            throw ApiException.forbidden("Only the borrower and this organisation's staff raise incidents on a booking.");
        }
        if (!List.of("approved", "checked_in", "returned", "closed").contains(b.status())) {
            throw ApiException.rule("incident_booking_state", "incident_window",
                    "Incidents can be raised once a booking is approved. This one is " + b.status().replace('_', ' ') + ".");
        }
        UUID id = jdbc.sql("""
                INSERT INTO incidents (booking_id, resource_id, kind, description, raised_by)
                VALUES (:b, :r, :k, :d, :u) RETURNING id
                """).param("b", b.id()).param("r", b.resourceId()).param("k", body.kind())
                .param("d", body.description().trim()).param("u", actor.userId()).query(UUID.class).single();
        audit.record(actor, "incident.raised", "incident", id, null, "open", body.description().trim(),
                Map.of("bookingId", b.id().toString(), "kind", body.kind()));
        String what = label(body.kind()) + " incident on " + b.resourceName() + " (" + Labels.when(b.startAt()) + "): "
                + body.description().trim();
        if (requester) notifications.notifyStaff(b.orgId(), b.requesterName() + " raised a " + what, "booking", b.id());
        else notifications.notifyUser(b.requesterId(), "Staff raised a " + what, "booking", b.id());
        return get(id);
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('USER','OWNER','MANAGER')")
    public List<Incident> list(Actor actor, @RequestParam(required = false) String status) {
        String where = actor.isUser() ? " WHERE b.requester_id = :who" : " WHERE r.org_id = :who";
        String filter = "open".equals(status) ? " AND i.status <> 'resolved'"
                : (status != null && !status.isBlank() ? " AND i.status = :status" : "");
        return jdbc.sql(SELECT + where + filter + " ORDER BY i.raised_at DESC")
                .param("who", actor.isUser() ? actor.userId() : actor.orgId())
                .param("status", status == null ? "" : status)
                .query(Incident.class).list();
    }

    @PostMapping("/{id}/review")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    @Transactional
    public Incident review(Actor actor, @PathVariable UUID id, @RequestBody(required = false) Note body) {
        var row = staffIncident(actor, id);
        if (!"open".equals(row.status())) {
            throw ApiException.rule("incident_state", "incident_flow", "Only an open incident can be moved to under review.");
        }
        jdbc.sql("UPDATE incidents SET status = 'under_review' WHERE id = :id").param("id", id).update();
        String note = body == null || Labels.blank(body.note()) ? null : body.note().trim();
        audit.record(actor, "incident.under_review", "incident", id, "open", "under_review", note,
                Map.of("bookingId", row.bookingId().toString()));
        notifications.notifyUser(row.requesterId(), "Staff are reviewing the " + label(row.kind()) + " incident on "
                + row.resourceName() + ".", "booking", row.bookingId());
        return get(id);
    }

    @PostMapping("/{id}/resolve")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    @Transactional
    public Incident resolve(Actor actor, @PathVariable UUID id, @Valid @RequestBody ResolveRequest body) {
        var row = staffIncident(actor, id);
        if ("resolved".equals(row.status())) {
            throw ApiException.rule("incident_state", "incident_flow", "This incident is already resolved.");
        }
        jdbc.sql("""
                UPDATE incidents SET status = 'resolved', resolved_by = :u, resolved_at = now(), resolution = :r WHERE id = :id
                """).param("u", actor.userId()).param("r", body.resolution().trim()).param("id", id).update();
        audit.record(actor, "incident.resolved", "incident", id, row.status(), "resolved", body.resolution().trim(),
                Map.of("bookingId", row.bookingId().toString()));
        notifications.notifyUser(row.requesterId(), "The " + label(row.kind()) + " incident on " + row.resourceName()
                + " was resolved: " + body.resolution().trim(), "booking", row.bookingId());
        return get(id);
    }

    record Row(UUID bookingId, UUID orgId, UUID requesterId, String resourceName, String kind, String status) {}

    private Row staffIncident(Actor actor, UUID id) {
        var row = jdbc.sql("""
                SELECT i.booking_id, r.org_id, b.requester_id, r.name AS resource_name, i.kind, i.status
                FROM incidents i JOIN resources r ON r.id = i.resource_id JOIN bookings b ON b.id = i.booking_id
                WHERE i.id = :id FOR UPDATE OF i
                """).param("id", id).query(Row.class).optional().orElseThrow(() -> ApiException.notFound("Incident"));
        if (!actor.isStaffOf(row.orgId())) throw ApiException.notFound("Incident");
        return row;
    }

    private Incident get(UUID id) {
        return jdbc.sql(SELECT + " WHERE i.id = :id").param("id", id).query(Incident.class).single();
    }
}
