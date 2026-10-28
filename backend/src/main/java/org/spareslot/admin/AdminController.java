package org.spareslot.admin;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.spareslot.auth.Actor;
import org.spareslot.bookings.BookingViews;
import org.spareslot.common.ApiException;
import org.spareslot.common.AuditService;
import org.spareslot.notifications.NotificationService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.UUID;

/** Platform admin: verifies organisations, suspends and reinstates users, reads the platform-wide audit log. */
@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    private final JdbcClient jdbc;
    private final AuditService audit;
    private final NotificationService notifications;
    private final BookingViews views;

    public AdminController(JdbcClient jdbc, AuditService audit, NotificationService notifications, BookingViews views) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.notifications = notifications;
        this.views = views;
    }

    public record Reason(@NotBlank @Size(max = 1000) String reason) {}

    public record Organisation(UUID id, String name, String kind, String description, String location,
                               boolean verified, String verifiedByName, OffsetDateTime verifiedAt, long staffCount,
                               long resourceCount, OffsetDateTime createdAt) {}

    public record User(UUID id, String email, String fullName, String role, String borrowerType, String affiliation,
                       String orgName, String status, OffsetDateTime createdAt) {}

    public record AuditPage(List<BookingViews.Event> items, int page, int size, long total) {}

    @GetMapping("/organisations")
    public List<Organisation> organisations(@RequestParam(required = false) Boolean verified) {
        return jdbc.sql("""
                SELECT o.id, o.name, o.kind, o.description, o.location, o.verified, v.full_name AS verified_by_name,
                       o.verified_at,
                       (SELECT count(*) FROM users u WHERE u.org_id = o.id) AS staff_count,
                       (SELECT count(*) FROM resources r WHERE r.org_id = o.id) AS resource_count, o.created_at
                FROM organisations o LEFT JOIN users v ON v.id = o.verified_by
                WHERE (CAST(:verified AS boolean) IS NULL OR o.verified = :verified)
                ORDER BY o.verified, o.created_at
                """).param("verified", verified).query(Organisation.class).list();
    }

    @PostMapping("/organisations/{id}/verify")
    @Transactional
    public Organisation verify(Actor actor, @PathVariable UUID id, @Valid @RequestBody Reason body) {
        int n = jdbc.sql("UPDATE organisations SET verified = true, verified_by = :u, verified_at = now() WHERE id = :id AND NOT verified")
                .param("u", actor.userId()).param("id", id).update();
        if (n == 0) {
            boolean exists = jdbc.sql("SELECT count(*) FROM organisations WHERE id = :id").param("id", id)
                    .query(Long.class).single() > 0;
            if (!exists) throw ApiException.notFound("Organisation");
            throw ApiException.rule("already_verified", "review_once", "This organisation is already verified.");
        }
        audit.record(actor, "organisation.verified", "organisation", id, "unverified", "verified", body.reason().trim(),
                java.util.Map.of());
        notifications.notifyStaff(id, "Your organisation was verified: its active resources are now visible to borrowers. "
                + body.reason().trim(), "organisation", id);
        return organisations(null).stream().filter(o -> o.id().equals(id)).findFirst().orElseThrow();
    }

    @GetMapping("/users")
    public List<User> users(@RequestParam(required = false) String q) {
        return jdbc.sql("""
                SELECT u.id, u.email, u.full_name, u.role, u.borrower_type, u.affiliation, o.name AS org_name, u.status, u.created_at
                FROM users u LEFT JOIN organisations o ON o.id = u.org_id
                WHERE u.id <> '00000000-0000-0000-0000-000000000000'
                  AND (:q = '' OR u.full_name ILIKE '%' || :q || '%' OR u.email ILIKE '%' || :q || '%')
                ORDER BY u.role, u.full_name
                """).param("q", q == null ? "" : q.trim()).query(User.class).list();
    }

    @PostMapping("/users/{id}/suspend")
    @Transactional
    public User suspend(Actor actor, @PathVariable UUID id, @Valid @RequestBody Reason body) {
        if (id.equals(actor.userId())) {
            throw ApiException.rule("suspend_self", "admin_self", "You cannot suspend your own account.");
        }
        return setStatus(actor, id, "active", "suspended", body.reason());
    }

    @PostMapping("/users/{id}/reinstate")
    @Transactional
    public User reinstate(Actor actor, @PathVariable UUID id, @Valid @RequestBody Reason body) {
        return setStatus(actor, id, "suspended", "active", body.reason());
    }

    private User setStatus(Actor actor, UUID id, String from, String to, String reason) {
        if (Actor.SYSTEM_USER_ID.equals(id)) throw ApiException.notFound("User");
        int n = jdbc.sql("UPDATE users SET status = :to WHERE id = :id AND status = :from")
                .param("to", to).param("id", id).param("from", from).update();
        if (n == 0) {
            boolean exists = jdbc.sql("SELECT count(*) FROM users WHERE id = :id").param("id", id).query(Long.class).single() > 0;
            if (!exists) throw ApiException.notFound("User");
            throw ApiException.rule("user_state", "user_status", "This account is already " + to + ".");
        }
        audit.record(actor, "user." + ("suspended".equals(to) ? "suspended" : "reinstated"), "user", id, from, to,
                reason.trim(), java.util.Map.of());
        return users(null).stream().filter(u -> u.id().equals(id)).findFirst().orElseThrow();
    }

    /** The platform-wide audit log, filterable and paged. */
    @GetMapping("/audit")
    public AuditPage audit(@RequestParam(required = false) String entityType,
                           @RequestParam(required = false) String action,
                           @RequestParam(required = false) String actorRole,
                           @RequestParam(required = false) UUID entityId,
                           @RequestParam(required = false) String q,
                           @RequestParam(defaultValue = "0") int page,
                           @RequestParam(defaultValue = "50") int size) {
        var where = new StringBuilder(" WHERE true");
        var params = new HashMap<String, Object>();
        if (entityType != null && !entityType.isBlank()) { where.append(" AND e.entity_type = :t"); params.put("t", entityType); }
        if (action != null && !action.isBlank()) { where.append(" AND e.action ILIKE :a"); params.put("a", action + "%"); }
        if (actorRole != null && !actorRole.isBlank()) { where.append(" AND e.actor_role = :r"); params.put("r", actorRole); }
        if (entityId != null) { where.append(" AND e.entity_id = :id"); params.put("id", entityId); }
        if (q != null && !q.isBlank()) {
            where.append(" AND (e.reason ILIKE :q OR u.full_name ILIKE :q OR e.action ILIKE :q)");
            params.put("q", "%" + q.trim() + "%");
        }
        int s = Math.clamp(size, 1, 200), p = Math.max(page, 0);
        long total = jdbc.sql("SELECT count(*) FROM audit_events e LEFT JOIN users u ON u.id = e.actor_id" + where)
                .params(params).query(Long.class).single();
        params.put("limit", s);
        params.put("offset", p * s);
        var items = jdbc.sql("""
                SELECT e.id, e.at, e.actor_id,
                       CASE WHEN e.actor_id IS NULL THEN 'SpareSlot (automatic)' ELSE u.full_name END AS actor_name,
                       e.actor_role, e.action, e.entity_type, e.entity_id, e.from_status, e.to_status, e.reason,
                       e.details::text AS details
                FROM audit_events e LEFT JOIN users u ON u.id = e.actor_id
                """ + where + " ORDER BY e.at DESC, e.id DESC LIMIT :limit OFFSET :offset")
                .params(params).query(views::mapEvent).list();
        return new AuditPage(items, p, s, total);
    }
}
