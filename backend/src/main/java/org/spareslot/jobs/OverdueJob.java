package org.spareslot.jobs;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.spareslot.auth.Actor;
import org.spareslot.common.AuditService;
import org.spareslot.common.Labels;
import org.spareslot.notifications.NotificationService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * SPEC section 4: every minute, raise one delay incident per overdue booking (checked in and past its end) and
 * notify both parties; remind the borrower one hour before the end. The system raises incidents; it never
 * decides them.
 */
@Component
@ConditionalOnProperty(name = "spareslot.jobs-enabled", havingValue = "true", matchIfMissing = true)
public class OverdueJob {

    private static final Logger log = LoggerFactory.getLogger(OverdueJob.class);
    static final String REMINDER_PREFIX = "Reminder: ";

    private final JdbcClient jdbc;
    private final AuditService audit;
    private final NotificationService notifications;
    private final TransactionTemplate tx;

    public OverdueJob(JdbcClient jdbc, AuditService audit, NotificationService notifications, TransactionTemplate tx) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.notifications = notifications;
        this.tx = tx;
    }

    record Due(UUID id, UUID resourceId, String resourceName, UUID orgId, UUID requesterId, String requesterName,
               OffsetDateTime endAt) {}

    @Scheduled(fixedDelayString = "PT1M", initialDelayString = "PT20S")
    public void run() {
        try {
            raiseOverdue();
            remind();
        } catch (RuntimeException e) {
            log.warn("overdue job failed; it will run again in a minute", e);
        }
    }

    public int raiseOverdue() {
        var overdue = jdbc.sql("""
                SELECT b.id, b.resource_id, r.name AS resource_name, r.org_id, b.requester_id, u.full_name AS requester_name, b.end_at
                FROM bookings b JOIN resources r ON r.id = b.resource_id JOIN users u ON u.id = b.requester_id
                WHERE b.status = 'checked_in' AND b.end_at < now()
                  AND NOT EXISTS (SELECT 1 FROM incidents i WHERE i.booking_id = b.id AND i.kind = 'delay' AND i.status <> 'resolved')
                """).query(Due.class).list();
        for (var b : overdue) {
            tx.executeWithoutResult(s -> {
                String description = "Not returned by the end time (" + Labels.when(b.endAt()) + "). Raised automatically.";
                UUID id = jdbc.sql("""
                        INSERT INTO incidents (booking_id, resource_id, kind, description, raised_by)
                        SELECT :b, :r, 'delay', :d, :sys
                        WHERE NOT EXISTS (SELECT 1 FROM incidents WHERE booking_id = :b AND kind = 'delay' AND status <> 'resolved')
                        RETURNING id
                        """).param("b", b.id()).param("r", b.resourceId()).param("d", description)
                        .param("sys", Actor.SYSTEM_USER_ID).query(UUID.class).optional().orElse(null);
                if (id == null) return;
                audit.record(Actor.SYSTEM, "incident.raised", "incident", id, null, "open", description,
                        Map.of("bookingId", b.id().toString(), "kind", "delay"));
                notifications.notifyUser(b.requesterId(), "Overdue: " + b.resourceName() + " was due back at "
                        + Labels.when(b.endAt()) + ". Please return it now.", "booking", b.id());
                notifications.notifyStaff(b.orgId(), "Overdue: " + b.requesterName() + " has not returned "
                        + b.resourceName() + " (due " + Labels.when(b.endAt()) + "). A delay incident was raised.", "booking", b.id());
            });
        }
        return overdue.size();
    }

    public int remind() {
        var soon = jdbc.sql("""
                SELECT b.id, b.resource_id, r.name AS resource_name, r.org_id, b.requester_id, u.full_name AS requester_name, b.end_at
                FROM bookings b JOIN resources r ON r.id = b.resource_id JOIN users u ON u.id = b.requester_id
                WHERE b.status = 'checked_in' AND b.end_at > now() AND b.end_at <= now() + interval '1 hour'
                  AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.entity_id = b.id AND n.user_id = b.requester_id
                                  AND n.message LIKE 'Reminder: %')
                """).query(Due.class).list();
        for (var b : soon) {
            tx.executeWithoutResult(s -> notifications.notifyUser(b.requesterId(), REMINDER_PREFIX + "return "
                    + b.resourceName() + " by " + Labels.when(b.endAt()) + ".", "booking", b.id()));
        }
        return soon.size();
    }
}
