package org.spareslot.bookings;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Waitlist order (SPEC section 4): fewest hours used in the last 30 days first (per quota subject: the team,
 * or the user), then the earliest request. A queue is the waitlisted requests on the same resource whose
 * windows overlap.
 */
@Component
public class WaitlistQueries {

    public static final String ORDER_EXPLANATION =
            "The queue is ordered by hours used in the last 30 days (fewest first), then by when the request was made "
                    + "(earliest first). If an approved booking in this slot is cancelled, the first request in the queue "
                    + "that fits is approved automatically and staff are told. A request still on the waitlist after "
                    + "24 hours, or once its start time has passed, is closed automatically, and you can request again.";

    private final JdbcClient jdbc;

    public WaitlistQueries(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public record Position(int position, int size, double yourHoursLast30Days) {}

    /** The position this booking holds, or would hold if it were waitlisted now. */
    public int positionIfWaitlisted(BookingRow b) {
        return position(b).position();
    }

    public Position position(BookingRow b) {
        return jdbc.sql("""
                WITH me AS (
                    SELECT coalesce(u.hours, 0) AS hours, CAST(:created AS timestamptz) AS created_at
                    FROM (SELECT 1) one LEFT JOIN v_recent_usage_30d u ON u.subject_id = :subject
                ),
                others AS (
                    SELECT coalesce(u.hours, 0) AS hours, w.created_at
                    FROM bookings w LEFT JOIN v_recent_usage_30d u ON u.subject_id = coalesce(w.team_id, w.requester_id)
                    WHERE w.resource_id = :r AND w.status = 'waitlisted' AND w.id <> :id
                      AND tstzrange(w.start_at, w.end_at) && tstzrange(:s, :e)
                )
                SELECT 1 + (SELECT count(*) FROM others o, me
                            WHERE (o.hours, o.created_at) < (me.hours, me.created_at))::int AS position,
                       1 + (SELECT count(*) FROM others)::int AS size,
                       (SELECT hours::float8 FROM me) AS your_hours_last30_days
                """)
                .param("created", b.createdAt()).param("subject", b.teamId() != null ? b.teamId() : b.requesterId())
                .param("r", b.resourceId()).param("id", b.id()).param("s", b.startAt()).param("e", b.endAt())
                .query(Position.class).single();
    }

    public record Candidate(UUID id, UUID resourceId, OffsetDateTime startAt, OffsetDateTime endAt,
                            OffsetDateTime createdAt, double recentHours) {}

    /** Waitlisted requests overlapping a freed window, in queue order. */
    public List<Candidate> candidates(UUID resourceId, OffsetDateTime start, OffsetDateTime end) {
        return jdbc.sql("""
                SELECT w.id, w.resource_id, w.start_at, w.end_at, w.created_at, coalesce(u.hours, 0)::float8 AS recent_hours
                FROM bookings w LEFT JOIN v_recent_usage_30d u ON u.subject_id = coalesce(w.team_id, w.requester_id)
                WHERE w.resource_id = :r AND w.status = 'waitlisted' AND tstzrange(w.start_at, w.end_at) && tstzrange(:s, :e)
                ORDER BY coalesce(u.hours, 0), w.created_at
                """).param("r", resourceId).param("s", start).param("e", end).query(Candidate.class).list();
    }
}
