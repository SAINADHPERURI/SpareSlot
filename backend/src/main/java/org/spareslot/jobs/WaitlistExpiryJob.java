package org.spareslot.jobs;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.spareslot.auth.Actor;
import org.spareslot.bookings.BookingService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Closes waitlisted requests that can no longer be served (V11): still waitlisted 24 hours after joining the
 * waitlist, or past their start time. Each goes through {@link BookingService#transition} with a reason, so it
 * is audited and the borrower is told they can request again.
 */
@Component
@ConditionalOnProperty(name = "spareslot.jobs-enabled", havingValue = "true", matchIfMissing = true)
public class WaitlistExpiryJob {

    private static final Logger log = LoggerFactory.getLogger(WaitlistExpiryJob.class);

    static final String EXPIRED_24H = "Still on the waitlist after 24 hours, so this request was closed. "
            + "You can make a new request at any time.";
    static final String EXPIRED_START = "The requested start time passed while this request was on the waitlist, "
            + "so it was closed. You can make a new request at any time.";

    private final JdbcClient jdbc;
    private final BookingService bookings;

    public WaitlistExpiryJob(JdbcClient jdbc, BookingService bookings) {
        this.jdbc = jdbc;
        this.bookings = bookings;
    }

    record Expired(UUID id, boolean started) {}

    @Scheduled(fixedDelayString = "PT1M", initialDelayString = "PT30S")
    public void run() {
        try {
            expire();
        } catch (RuntimeException e) {
            log.warn("waitlist expiry failed; it will run again in a minute", e);
        }
    }

    public int expire() {
        var due = jdbc.sql("""
                SELECT id, start_at <= now() AS started FROM bookings
                WHERE status = 'waitlisted'
                  AND (start_at <= now() OR coalesce(decided_at, created_at) <= now() - interval '24 hours')
                ORDER BY created_at
                """).query(Expired.class).list();
        int closed = 0;
        for (var b : due) {
            try {
                bookings.transition(b.id(), "cancelled", b.started() ? EXPIRED_START : EXPIRED_24H, Actor.SYSTEM);
                closed++;
            } catch (RuntimeException e) {
                // promoted or cancelled by someone in the meantime: nothing to do
                log.info("waitlisted booking {} was not expired: {}", b.id(), e.getMessage());
            }
        }
        return closed;
    }
}
