package org.spareslot.dashboard;

import org.spareslot.auth.Actor;
import org.spareslot.bookings.BookingViews;
import org.spareslot.common.Labels;
import org.spareslot.deposits.DepositService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;

/** One call per dashboard, so each screen loads with a single request. */
@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final JdbcClient jdbc;
    private final BookingViews views;
    private final DepositService deposits;

    public DashboardController(JdbcClient jdbc, BookingViews views, DepositService deposits) {
        this.jdbc = jdbc;
        this.views = views;
        this.deposits = deposits;
    }

    public record CredentialStatus(String kind, String label, String status, OffsetDateTime expiresAt, String reviewReason) {}

    public record Missing(String kind, String label, long resourcesNeedingIt) {}

    public record Borrower(List<CredentialStatus> credentials, List<Missing> missingCredentials,
                           List<BookingViews.Summary> upcoming, List<BookingViews.Summary> active,
                           List<BookingViews.Summary> openRequests, List<BookingViews.Summary> depositsToPay,
                           List<BookingViews.Summary> recent, long openRequestCount, int openRequestLimit,
                           double hoursLast30Days, long unreadNotifications) {}

    @GetMapping("/borrower")
    @PreAuthorize("hasRole('USER')")
    public Borrower borrower(Actor actor) {
        record Cred(String kind, String status, OffsetDateTime expiresAt, String reviewReason) {}
        var creds = jdbc.sql("""
                SELECT DISTINCT ON (kind) kind,
                       CASE WHEN status = 'verified' AND expires_at IS NOT NULL AND expires_at <= now() THEN 'expired' ELSE status END AS status,
                       expires_at, review_reason
                FROM credentials WHERE user_id = :u
                ORDER BY kind, CASE status WHEN 'verified' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, created_at DESC
                """).param("u", actor.userId()).query(Cred.class).list().stream()
                .map(c -> new CredentialStatus(c.kind(), Labels.credential(c.kind()), c.status(), c.expiresAt(), c.reviewReason()))
                .toList();
        var missing = jdbc.sql("""
                SELECT rr.credential_kind AS kind, count(*) AS n
                FROM resource_requirements rr JOIN resources r ON r.id = rr.resource_id JOIN organisations o ON o.id = r.org_id
                WHERE r.active AND o.verified AND NOT EXISTS (
                    SELECT 1 FROM credentials c WHERE c.user_id = :u AND c.kind = rr.credential_kind
                      AND c.status = 'verified' AND (c.expires_at IS NULL OR c.expires_at > now()))
                GROUP BY rr.credential_kind ORDER BY count(*) DESC
                """).param("u", actor.userId())
                .query((rs, i) -> new Missing(rs.getString(1), Labels.credential(rs.getString(1)), rs.getLong(2))).list();
        var mine = views.list(actor, new BookingViews.ListFilter(true, null, null, null, null));
        var upcoming = mine.stream().filter(b -> "approved".equals(b.status())).sorted(java.util.Comparator.comparing(BookingViews.Summary::startAt)).toList();
        var active = mine.stream().filter(b -> "checked_in".equals(b.status())).toList();
        var open = mine.stream().filter(b -> List.of("requested", "waitlisted").contains(b.status())).toList();
        var toPay = mine.stream().filter(b -> b.allowedActions().contains("pay_deposit")).toList();
        var recent = mine.stream().filter(b -> List.of("returned", "closed", "rejected", "cancelled").contains(b.status()))
                .limit(10).toList();
        long unread = jdbc.sql("SELECT count(*) FROM notifications WHERE user_id = :u AND read_at IS NULL")
                .param("u", actor.userId()).query(Long.class).single();
        double recentHours = jdbc.sql("""
                SELECT coalesce((SELECT hours::float8 FROM v_recent_usage_30d
                                 WHERE subject_id = (SELECT coalesce(team_id, id) FROM users WHERE id = :u)), 0)
                """).param("u", actor.userId()).query(Double.class).single();
        return new Borrower(creds, missing, upcoming, active, open, toPay, recent, open.size(), 5, recentHours, unread);
    }

    public record Counts(int requestsToDecide, long verificationsToReview, int checkInsDue, int overdue,
                         int depositsToResolve, long openIncidents, long extensionRequests) {}

    public record Staff(Counts counts, List<BookingViews.Summary> requestsToDecide, List<BookingViews.Summary> checkInsDue,
                        List<BookingViews.Summary> active, List<BookingViews.Summary> overdue,
                        List<DepositService.ToResolve> depositsToResolve, String orgName, Boolean orgVerified) {}

    @GetMapping("/staff")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    public Staff staff(Actor actor) {
        var all = views.list(actor, new BookingViews.ListFilter(false, "requested,waitlisted,approved,checked_in", null, null, null));
        var toDecide = all.stream().filter(b -> List.of("requested", "waitlisted").contains(b.status()))
                .sorted(java.util.Comparator.comparing(BookingViews.Summary::createdAt)).toList();
        var dueCutoff = OffsetDateTime.now().plusHours(24);
        var checkIns = all.stream().filter(b -> "approved".equals(b.status()) && b.startAt().isBefore(dueCutoff))
                .sorted(java.util.Comparator.comparing(BookingViews.Summary::startAt)).toList();
        var active = all.stream().filter(b -> "checked_in".equals(b.status()) && !b.overdue()).toList();
        var overdue = all.stream().filter(BookingViews.Summary::overdue).toList();
        var toResolve = deposits.toResolve(actor);
        long verifications = jdbc.sql("SELECT count(*) FROM credentials WHERE status = 'pending' AND (org_id IS NULL OR org_id = :o)")
                .param("o", actor.orgId()).query(Long.class).single();
        long incidents = jdbc.sql("""
                SELECT count(*) FROM incidents i JOIN resources r ON r.id = i.resource_id WHERE r.org_id = :o AND i.status <> 'resolved'
                """).param("o", actor.orgId()).query(Long.class).single();
        long extensions = jdbc.sql("""
                SELECT count(*) FROM booking_extensions e JOIN bookings b ON b.id = e.booking_id JOIN resources r ON r.id = b.resource_id
                WHERE r.org_id = :o AND e.status = 'requested'
                """).param("o", actor.orgId()).query(Long.class).single();
        record Org(String name, Boolean verified) {}
        var org = jdbc.sql("SELECT name, verified FROM organisations WHERE id = :o").param("o", actor.orgId()).query(Org.class).single();
        return new Staff(new Counts(toDecide.size(), verifications, checkIns.size(), overdue.size(), toResolve.size(),
                incidents, extensions), toDecide, checkIns, active, overdue, toResolve, org.name(), org.verified());
    }

    public record Admin(long organisationsAwaiting, long users, long suspendedUsers, long bookings, long auditEvents) {}

    @GetMapping("/admin")
    @PreAuthorize("hasRole('ADMIN')")
    public Admin admin() {
        return jdbc.sql("""
                SELECT (SELECT count(*) FROM organisations WHERE NOT verified) AS organisations_awaiting,
                       (SELECT count(*) FROM users WHERE id <> '00000000-0000-0000-0000-000000000000') AS users,
                       (SELECT count(*) FROM users WHERE status = 'suspended' AND id <> '00000000-0000-0000-0000-000000000000') AS suspended_users,
                       (SELECT count(*) FROM bookings) AS bookings,
                       (SELECT count(*) FROM audit_events) AS audit_events
                """).query(Admin.class).single();
    }
}
