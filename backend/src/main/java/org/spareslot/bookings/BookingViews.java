package org.spareslot.bookings;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.spareslot.auth.Actor;
import org.spareslot.common.ApiException;
import org.spareslot.common.Labels;
import org.spareslot.deposits.DepositService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.*;

/**
 * Read models for bookings. allowedActions is computed here from booking_transitions and the actor, so the
 * frontend never reimplements the state machine (CLAUDE.md rule 6). blockedActions says, in plain words, why an
 * action the actor could otherwise take is not possible yet.
 */
@Service
public class BookingViews {

    private final JdbcClient jdbc;
    private final BookingRepository bookings;
    private final TransitionRules rules;
    private final WaitlistQueries waitlist;
    private final DepositService deposits;
    private final ObjectMapper json;

    public BookingViews(JdbcClient jdbc, BookingRepository bookings, TransitionRules rules, WaitlistQueries waitlist,
                        DepositService deposits, ObjectMapper json) {
        this.jdbc = jdbc;
        this.bookings = bookings;
        this.rules = rules;
        this.waitlist = waitlist;
        this.deposits = deposits;
        this.json = json;
    }

    public record Queue(int position, int size, double yourHoursLast30Days, String explanation) {}

    public record Condition(String phase, String rating, String notes, UUID recordedBy, String recordedByName,
                            OffsetDateTime recordedAt) {}

    public record Incident(UUID id, String kind, String description, String status, UUID raisedBy, String raisedByName,
                           OffsetDateTime raisedAt, String resolvedByName, OffsetDateTime resolvedAt, String resolution) {}

    public record Extension(UUID id, OffsetDateTime requestedEndAt, String reason, String status, String decisionReason,
                            String decidedByName, OffsetDateTime decidedAt, OffsetDateTime createdAt) {}

    public record Summary(UUID id, UUID resourceId, String resourceName, String resourceCategory, UUID orgId,
                          String orgName, UUID requesterId, String requesterName, OffsetDateTime startAt,
                          OffsetDateTime endAt, double hours, String purpose, String status, String decisionReason,
                          OffsetDateTime decidedAt, int depositMinor, String depositStatus, boolean overdue,
                          Queue queue, List<String> allowedActions, Map<String, String> blockedActions,
                          OffsetDateTime createdAt) {}

    public record Detail(Summary booking, String myRole, String resourceLocation, String resourceConditions,
                         String requesterBorrowerType, String requesterAffiliation, String teamName,
                         String decidedByName, OffsetDateTime checkedInAt, OffsetDateTime returnedAt,
                         OffsetDateTime closedAt, List<Condition> conditions, List<Incident> incidents,
                         List<Extension> extensions) {}

    public record Event(long id, OffsetDateTime at, UUID actorId, String actorName, String actorRole, String action,
                        String entityType, UUID entityId, String fromStatus, String toStatus, String reason,
                        JsonNode details) {}

    // ------------------------------------------------------------------ queries

    public Detail detail(Actor actor, UUID id) {
        var b = bookings.visible(actor, id);
        record Extra(String location, String conditions, String borrowerType, String affiliation, String teamName,
                     String decidedByName) {}
        var x = jdbc.sql("""
                SELECT r.location, r.conditions, u.borrower_type, u.affiliation, t.name AS team_name, d.full_name AS decided_by_name
                FROM bookings b JOIN resources r ON r.id = b.resource_id JOIN users u ON u.id = b.requester_id
                LEFT JOIN teams t ON t.id = b.team_id LEFT JOIN users d ON d.id = b.decided_by
                WHERE b.id = :id
                """).param("id", id).query(Extra.class).single();
        var conditions = jdbc.sql("""
                SELECT c.phase, c.rating, c.notes, c.recorded_by, u.full_name AS recorded_by_name, c.recorded_at
                FROM condition_records c JOIN users u ON u.id = c.recorded_by WHERE c.booking_id = :id ORDER BY c.recorded_at
                """).param("id", id).query(Condition.class).list();
        String role = BookingRepository.transitionRole(actor, b);
        return new Detail(summary(actor, b), role == null ? (actor.isAdmin() ? "admin" : null) : role, x.location(),
                x.conditions(), x.borrowerType(), x.affiliation(), x.teamName(),
                b.decidedBy() == null && b.decidedAt() != null ? "SpareSlot (automatic)" : x.decidedByName(),
                b.checkedInAt(), b.returnedAt(), b.closedAt(), conditions, incidents(id), extensions(id));
    }

    public List<Incident> incidents(UUID bookingId) {
        return jdbc.sql("""
                SELECT i.id, i.kind, i.description, i.status, i.raised_by,
                       CASE WHEN i.raised_by = '00000000-0000-0000-0000-000000000000' THEN 'SpareSlot (automatic)' ELSE u.full_name END AS raised_by_name,
                       i.raised_at, rv.full_name AS resolved_by_name, i.resolved_at, i.resolution
                FROM incidents i JOIN users u ON u.id = i.raised_by LEFT JOIN users rv ON rv.id = i.resolved_by
                WHERE i.booking_id = :id ORDER BY i.raised_at
                """).param("id", bookingId).query(Incident.class).list();
    }

    public List<Extension> extensions(UUID bookingId) {
        return jdbc.sql("""
                SELECT e.id, e.requested_end_at, e.reason, e.status, e.decision_reason, u.full_name AS decided_by_name,
                       e.decided_at, e.created_at
                FROM booking_extensions e LEFT JOIN users u ON u.id = e.decided_by
                WHERE e.booking_id = :id ORDER BY e.created_at
                """).param("id", bookingId).query(Extension.class).list();
    }

    public record ListFilter(boolean mine, String status, UUID resourceId, UUID orgId, Boolean overdue) {}

    public List<Summary> list(Actor actor, ListFilter f) {
        var sql = new StringBuilder(BookingRepository.SELECT).append(" WHERE true");
        var params = new HashMap<String, Object>();
        if (f.mine() || actor.isUser()) {
            sql.append(" AND b.requester_id = :me");
            params.put("me", actor.userId());
        } else if (actor.isStaff()) {
            if (f.orgId() != null && !f.orgId().equals(actor.orgId())) throw ApiException.notFound("Organisation");
            sql.append(" AND r.org_id = :org");
            params.put("org", actor.orgId());
        } else if (f.orgId() != null) {                     // admin
            sql.append(" AND r.org_id = :org");
            params.put("org", f.orgId());
        }
        if (f.status() != null && !f.status().isBlank()) {
            sql.append(" AND b.status IN (:statuses)");
            params.put("statuses", Arrays.asList(f.status().split(",")));
        }
        if (f.resourceId() != null) {
            sql.append(" AND b.resource_id = :resourceId");
            params.put("resourceId", f.resourceId());
        }
        if (Boolean.TRUE.equals(f.overdue())) sql.append(" AND b.status = 'checked_in' AND b.end_at < now()");
        sql.append(" ORDER BY b.start_at DESC LIMIT 300");
        var rows = jdbc.sql(sql.toString()).params(params).query(BookingRow.class).list();
        return rows.stream().map(b -> summary(actor, b)).toList();
    }

    public List<Event> events(Actor actor, UUID bookingId) {
        bookings.visible(actor, bookingId);
        return jdbc.sql("""
                SELECT e.id, e.at, e.actor_id,
                       CASE WHEN e.actor_id IS NULL THEN 'SpareSlot (automatic)' ELSE u.full_name END AS actor_name,
                       e.actor_role, e.action, e.entity_type, e.entity_id, e.from_status, e.to_status, e.reason,
                       e.details::text AS details
                FROM audit_events e LEFT JOIN users u ON u.id = e.actor_id
                WHERE (e.entity_type = 'booking' AND e.entity_id = :b)
                   OR (e.entity_type = 'incident' AND e.entity_id IN (SELECT id FROM incidents WHERE booking_id = :b))
                   OR (e.entity_type = 'extension' AND e.entity_id IN (SELECT id FROM booking_extensions WHERE booking_id = :b))
                ORDER BY e.at, e.id
                """).param("b", bookingId).query(this::mapEvent).list();
    }

    public Event mapEvent(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        JsonNode details;
        try {
            details = json.readTree(rs.getString("details"));
        } catch (Exception e) {
            details = json.createObjectNode();
        }
        return new Event(rs.getLong("id"), rs.getObject("at", OffsetDateTime.class),
                rs.getObject("actor_id", UUID.class), rs.getString("actor_name"), rs.getString("actor_role"),
                rs.getString("action"), rs.getString("entity_type"), rs.getObject("entity_id", UUID.class),
                rs.getString("from_status"), rs.getString("to_status"), rs.getString("reason"), details);
    }

    // ------------------------------------------------------------------ the summary and its actions

    Summary summary(Actor actor, BookingRow b) {
        Queue queue = null;
        if ("waitlisted".equals(b.status())) {
            var p = waitlist.position(b);
            queue = new Queue(p.position(), p.size(), p.yourHoursLast30Days(), WaitlistQueries.ORDER_EXPLANATION);
        }
        var blocked = new LinkedHashMap<String, String>();
        var allowed = allowedActions(actor, b, blocked);
        return new Summary(b.id(), b.resourceId(), b.resourceName(), b.resourceCategory(), b.orgId(), b.orgName(), b.requesterId(),
                b.requesterName(), b.startAt(), b.endAt(), b.hours(), b.purpose(), b.status(), b.decisionReason(),
                b.decidedAt(), b.depositMinor(), b.depositStatus(), b.isOverdue(), queue, allowed, blocked, b.createdAt());
    }

    List<String> allowedActions(Actor actor, BookingRow b, Map<String, String> blocked) {
        var actions = new ArrayList<String>();
        String role = BookingRepository.transitionRole(actor, b);
        if (role == null) return actions;
        boolean staff = "owner".equals(role) || "manager".equals(role);
        boolean requester = "requester".equals(role);

        for (var rule : rules.from(b.status())) {
            if (!rule.allowedRoles().contains(role)) continue;
            String action = TransitionRules.actionFor(rule.to());
            String why = switch (action) {
                case "approve" -> bookings.liveOverlap(b.resourceId(), b.startAt(), b.endAt(), b.id())
                        ? "This window overlaps a booking that is already approved. Waitlist it, or reject it with a reason."
                        : !b.startAt().isAfter(OffsetDateTime.now())
                        ? "The requested start time has passed, so it cannot be approved. Reject it with a reason." : null;
                case "check_in" -> "pending".equals(b.depositStatus())
                        ? "Pay the deposit before pickup: the " + Labels.rupees(b.depositMinor())
                        + " deposit is not paid yet. The borrower pays it on this page, or staff can waive it with a reason." : null;
                case "close" -> ("paid".equals(b.depositStatus()) || "pending".equals(b.depositStatus()))
                        ? "The deposit is still " + b.depositStatus() + ". Refund or forfeit it before closing." : null;
                default -> null;
            };
            if (why == null) actions.add(action);
            else blocked.put(action, why);
        }

        if ("approved".equals(b.status()) && "pending".equals(b.depositStatus())) {
            if (requester) actions.add("pay_deposit");
            if (staff) actions.add("waive_deposit");
        }
        if (staff && "paid".equals(b.depositStatus()) && List.of("cancelled", "returned").contains(b.status())) {
            if (deposits.openDamageOrDispute(b.id()) > 0) {
                String why = "A damage or dispute incident on this booking is still open. Nothing is refunded or "
                        + "forfeited until it is resolved.";
                blocked.put("refund_deposit", why);
                if ("returned".equals(b.status())) blocked.put("forfeit_deposit", why);
            } else if ("cancelled".equals(b.status())) {
                if (b.checkedInAt() == null) actions.add("refund_deposit");
            } else {
                if (deposits.originalCondition(b.id())) actions.add("refund_deposit");
                else blocked.put("refund_deposit", "The item came back in a worse condition than it left, so the "
                        + "deposit cannot be refunded. A forfeit needs a resolved damage incident.");
                if (deposits.resolvedDamage(b.id())) actions.add("forfeit_deposit");
                else blocked.put("forfeit_deposit", "A deposit can be forfeited only after a damage incident on this "
                        + "booking has been resolved.");
            }
        }
        if ((requester || staff) && List.of("approved", "checked_in", "returned").contains(b.status())) {
            actions.add("add_photo");
        }
        if (requester && List.of("approved", "checked_in").contains(b.status())) {
            boolean pending = jdbc.sql("SELECT count(*) FROM booking_extensions WHERE booking_id = :b AND status = 'requested'")
                    .param("b", b.id()).query(Long.class).single() > 0;
            if (pending) blocked.put("request_extension", "An extension request is already waiting for a decision.");
            else actions.add("request_extension");
        }
        if ((requester || staff) && List.of("approved", "checked_in", "returned", "closed").contains(b.status())) {
            actions.add("raise_incident");
        }
        return actions;
    }
}
