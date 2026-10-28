package org.spareslot.bookings;

import org.spareslot.auth.Actor;
import org.spareslot.common.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Reads bookings and enforces who may see one. It never writes bookings.status: that is
 * {@link BookingService#transition} alone (CLAUDE.md rule 1).
 */
@Repository
public class BookingRepository {

    static final String SELECT = """
            SELECT b.id, b.resource_id, r.name AS resource_name, r.category AS resource_category, r.org_id,
                   o.name AS org_name, r.deposit_minor AS resource_deposit_minor,
                   r.max_booking_hours, r.weekly_hour_cap, b.requester_id, u.full_name AS requester_name, b.team_id,
                   b.start_at, b.end_at, b.purpose, b.status, b.decision_reason, b.decided_by, b.decided_at,
                   b.deposit_minor, b.deposit_status, b.checked_in_at, b.returned_at, b.closed_at, b.created_at,
                   b.updated_at
            FROM bookings b
            JOIN resources r ON r.id = b.resource_id
            JOIN organisations o ON o.id = r.org_id
            JOIN users u ON u.id = b.requester_id
            """;

    private final JdbcClient jdbc;

    public BookingRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public BookingRow find(UUID id) {
        return jdbc.sql(SELECT + " WHERE b.id = :id").param("id", id).query(BookingRow.class).optional()
                .orElseThrow(() -> ApiException.notFound("Booking"));
    }

    /** Loads the booking FOR UPDATE (SPEC section 3, step 1). */
    @Transactional(propagation = Propagation.MANDATORY)
    public BookingRow lock(UUID id) {
        return jdbc.sql(SELECT + " WHERE b.id = :id FOR UPDATE OF b").param("id", id).query(BookingRow.class)
                .optional().orElseThrow(() -> ApiException.notFound("Booking"));
    }

    /**
     * The visibility check used by every booking endpoint, photos and the deposit included: the requester,
     * staff of the resource's organisation, and admins (read-only) see it. Everyone else gets 404.
     */
    public BookingRow visible(Actor actor, UUID id) {
        return checkVisible(actor, find(id));
    }

    public BookingRow checkVisible(Actor actor, BookingRow b) {
        if (actor == null) throw ApiException.notFound("Booking");
        if (b.requesterId().equals(actor.userId()) || actor.isStaffOf(b.orgId()) || actor.isAdmin()) return b;
        throw ApiException.notFound("Booking");
    }

    /** The role this actor plays on this booking, in booking_transitions terms, or null if none. */
    public static String transitionRole(Actor actor, BookingRow b) {
        if (actor.isSystem()) return "system";
        if (actor.isUser() && b.requesterId().equals(actor.userId())) return "requester";
        if (actor.isStaffOf(b.orgId())) return actor.role();
        return null;
    }

    /** Is there an approved or checked-in booking (other than this one) overlapping the window? */
    public boolean liveOverlap(UUID resourceId, OffsetDateTime start, OffsetDateTime end, UUID exceptId) {
        return jdbc.sql("""
                SELECT count(*) FROM bookings
                WHERE resource_id = :r AND status IN ('approved', 'checked_in') AND id IS DISTINCT FROM :except
                  AND tstzrange(start_at, end_at) && tstzrange(:s, :e)
                """).param("r", resourceId).param("s", start).param("e", end).param("except", exceptId)
                .query(Long.class).single() > 0;
    }

    /** Hours committed by the quota subject on this resource in the week (Monday, UTC) that contains `at`. */
    public double weeklyHours(UUID resourceId, UUID subjectId, OffsetDateTime at) {
        return jdbc.sql("""
                SELECT coalesce(sum(hours), 0)::float8 FROM v_weekly_usage
                WHERE resource_id = :r AND subject_id = :s AND week_start = date_trunc('week', CAST(:at AS timestamptz) AT TIME ZONE 'UTC')
                """).param("r", resourceId).param("s", subjectId).param("at", at).query(Double.class).single();
    }

    public double recentHours(UUID subjectId) {
        return jdbc.sql("SELECT coalesce((SELECT hours::float8 FROM v_recent_usage_30d WHERE subject_id = :s), 0)")
                .param("s", subjectId).query(Double.class).single();
    }
}
