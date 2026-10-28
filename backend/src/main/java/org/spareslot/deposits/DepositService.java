package org.spareslot.deposits;

import org.spareslot.auth.Actor;
import org.spareslot.bookings.BookingRepository;
import org.spareslot.bookings.BookingRow;
import org.spareslot.common.ApiException;
import org.spareslot.common.AuditService;
import org.spareslot.common.Labels;
import org.spareslot.notifications.NotificationService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * SPEC section 4b. The only code that writes deposit_transactions. It never writes bookings.deposit_status:
 * the ledger trigger does that. Every action checks the actor, inserts one ledger row, writes one audit event
 * and one notification, in one transaction. A person decides every refund after a return and every forfeit.
 */
@Service
public class DepositService {

    public static final String DEMO_NOTICE = "Demo payment: no real money moves";

    private final JdbcClient jdbc;
    private final BookingRepository bookings;
    private final PaymentProvider payments;
    private final AuditService audit;
    private final NotificationService notifications;

    public DepositService(JdbcClient jdbc, BookingRepository bookings, PaymentProvider payments, AuditService audit,
                          NotificationService notifications) {
        this.jdbc = jdbc;
        this.bookings = bookings;
        this.payments = payments;
        this.audit = audit;
        this.notifications = notifications;
    }

    // ------------------------------------------------------------------ actions

    /** The borrower pays after approval and before pickup, through the payment provider. */
    @Transactional
    public void pay(Actor actor, UUID bookingId) {
        var b = bookings.lock(bookingId);
        bookings.checkVisible(actor, b);
        if (!b.requesterId().equals(actor.userId())) throw ApiException.forbidden("Only the borrower pays the deposit.");
        requireStatus(b, "pending", "approved", "There is no deposit to pay on this booking right now.");
        var result = payments.charge(b.id(), b.depositMinor(), "INR");
        insertLedger(b, "charge", result.provider(), result.reference(), actor.userId(), null);
        audit.record(actor, "deposit.charged", "booking", b.id(), "pending", "paid", null, details(b, result));
        notifications.notifyStaff(b.orgId(), b.requesterName() + " paid the " + Labels.rupees(b.depositMinor())
                + " deposit for " + b.resourceName() + " (" + DEMO_NOTICE.toLowerCase() + ").", "booking", b.id());
    }

    @Transactional
    public void waive(Actor actor, UUID bookingId, String reason) {
        var b = staffLock(actor, bookingId);
        String why = requireReason(reason);
        requireStatus(b, "pending", "approved", "Only a deposit that is still waiting for payment, on an approved booking, can be waived.");
        insertLedger(b, "waive", "manual", null, actor.userId(), why);
        audit.record(actor, "deposit.waived", "booking", b.id(), "pending", "waived", why, details(b, null));
        notifications.notifyUser(b.requesterId(), "The " + Labels.rupees(b.depositMinor()) + " deposit for "
                + b.resourceName() + " was waived: " + why, "booking", b.id());
    }

    /** A person decides a refund after a return. Allowed only if the item was never taken or came back as it left. */
    @Transactional
    public void refund(Actor actor, UUID bookingId, String reason) {
        var b = staffLock(actor, bookingId);
        String why = requireReason(reason);
        requirePaid(b);
        requireNoOpenIncident(b);
        boolean neverTaken = "cancelled".equals(b.status()) && b.checkedInAt() == null;
        boolean returnedOriginal = "returned".equals(b.status()) && originalCondition(b.id());
        if (!neverTaken && !returnedOriginal) {
            if ("returned".equals(b.status())) {
                throw ApiException.rule("not_original_condition", "deposit_refund",
                        "The item came back in a worse condition than it left, so the deposit cannot be refunded. "
                                + "Raise a damage incident and resolve it; then decide whether to forfeit the deposit.");
            }
            throw ApiException.rule("refund_not_allowed", "deposit_refund",
                    "A deposit is refunded only when the booking was cancelled before pickup or the item has been returned.");
        }
        var result = payments.refund(b.id(), b.depositMinor(), "INR", chargeReference(b.id()));
        insertLedger(b, "refund", result.provider(), result.reference(), actor.userId(), why);
        audit.record(actor, "deposit.refunded", "booking", b.id(), "paid", "refunded", why, details(b, result));
        notifications.notifyUser(b.requesterId(), "Your " + Labels.rupees(b.depositMinor()) + " deposit for "
                + b.resourceName() + " was refunded: " + why, "booking", b.id());
    }

    /** All or nothing, only after a damage incident on this booking is resolved. */
    @Transactional
    public void forfeit(Actor actor, UUID bookingId, String reason) {
        var b = staffLock(actor, bookingId);
        String why = requireReason(reason);
        requirePaid(b);
        if (!"returned".equals(b.status())) {
            throw ApiException.rule("forfeit_not_allowed", "deposit_forfeit",
                    "A deposit can be forfeited only after the item has been returned.");
        }
        requireNoOpenIncident(b);
        boolean resolvedDamage = jdbc.sql("""
                SELECT count(*) FROM incidents WHERE booking_id = :b AND kind = 'damage' AND status = 'resolved'
                """).param("b", b.id()).query(Long.class).single() > 0;
        if (!resolvedDamage) {
            throw ApiException.rule("no_resolved_damage", "deposit_forfeit",
                    "A deposit can be forfeited only after a damage incident on this booking has been reviewed and resolved. Raise one first.");
        }
        insertLedger(b, "forfeit", "manual", null, actor.userId(), why);
        audit.record(actor, "deposit.forfeited", "booking", b.id(), "paid", "forfeited", why, details(b, null));
        notifications.notifyUser(b.requesterId(), "Your " + Labels.rupees(b.depositMinor()) + " deposit for "
                + b.resourceName() + " was kept by the owner: " + why
                + " If you disagree, raise a dispute on the booking page.", "booking", b.id());
    }

    /**
     * The one automatic refund: an approved booking with a paid deposit was cancelled before pickup. Runs inside
     * the cancellation's transaction, with the cancellation reason.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void refundOnCancellation(UUID bookingId, String cancellationReason) {
        var b = bookings.lock(bookingId);
        if (!"paid".equals(b.depositStatus()) || !"cancelled".equals(b.status()) || b.checkedInAt() != null) return;
        String why = "Cancelled before pickup: " + cancellationReason;
        var result = payments.refund(b.id(), b.depositMinor(), "INR", chargeReference(b.id()));
        insertLedger(b, "refund", result.provider(), result.reference(), Actor.SYSTEM_USER_ID, why);
        audit.record(Actor.SYSTEM, "deposit.refunded", "booking", b.id(), "paid", "refunded", why, details(b, result));
        notifications.notifyUser(b.requesterId(), "Your " + Labels.rupees(b.depositMinor()) + " deposit for "
                + b.resourceName() + " was refunded automatically because the booking was cancelled before pickup.",
                "booking", b.id());
    }

    // ------------------------------------------------------------------ reads

    public record LedgerEntry(UUID id, String kind, int amountMinor, String currency, String provider,
                              String providerRef, UUID actorId, String actorName, String reason,
                              OffsetDateTime createdAt) {}

    public record Condition(String phase, String rating, String notes, String recordedByName, OffsetDateTime recordedAt) {}

    public record DepositView(UUID bookingId, int amountMinor, String currency, String status, String bookingStatus,
                              List<LedgerEntry> ledger, Condition checkIn, Condition returned,
                              Boolean originalCondition, int openIncidents, String recommendedAction,
                              String demoNotice) {}

    public DepositView view(Actor actor, UUID bookingId) {
        var b = bookings.visible(actor, bookingId);
        var ledger = jdbc.sql("""
                SELECT t.id, t.kind, t.amount_minor, t.currency, t.provider, t.provider_ref, t.actor_id,
                       CASE WHEN t.actor_id = '00000000-0000-0000-0000-000000000000' THEN 'SpareSlot (automatic)'
                            ELSE u.full_name END AS actor_name,
                       t.reason, t.created_at
                FROM deposit_transactions t JOIN users u ON u.id = t.actor_id
                WHERE t.booking_id = :b ORDER BY t.created_at
                """).param("b", bookingId).query(LedgerEntry.class).list();
        var conditions = conditions(bookingId);
        Boolean original = "returned".equals(b.status()) || "closed".equals(b.status()) ? originalCondition(bookingId) : null;
        int open = openIncidents(bookingId);
        String recommended = jdbc.sql("SELECT recommended_action FROM v_deposits_to_resolve WHERE booking_id = :b")
                .param("b", bookingId).query(String.class).optional().orElse(null);
        return new DepositView(b.id(), b.depositMinor(), "INR", b.depositStatus(), b.status(), ledger,
                conditions.get("check_in"), conditions.get("return"), original, open, recommended, DEMO_NOTICE);
    }

    public record ToResolve(UUID bookingId, UUID resourceId, String resourceName, UUID requesterId,
                            String requesterName, String bookingStatus, int depositMinor, String recommendedAction,
                            String checkInRating, String returnRating, int openIncidents, OffsetDateTime endAt) {}

    /** The staff to-do list. recommendedAction is advice only; a person decides. */
    public List<ToResolve> toResolve(Actor actor) {
        return jdbc.sql("""
                SELECT v.booking_id, v.resource_id, r.name AS resource_name, v.requester_id, u.full_name AS requester_name,
                       v.booking_status, v.deposit_minor, v.recommended_action,
                       (SELECT rating FROM condition_records c WHERE c.booking_id = v.booking_id AND c.phase = 'check_in') AS check_in_rating,
                       (SELECT rating FROM condition_records c WHERE c.booking_id = v.booking_id AND c.phase = 'return') AS return_rating,
                       (SELECT count(*) FROM incidents i WHERE i.booking_id = v.booking_id AND i.status <> 'resolved')::int AS open_incidents,
                       b.end_at
                FROM v_deposits_to_resolve v
                JOIN resources r ON r.id = v.resource_id
                JOIN users u ON u.id = v.requester_id
                JOIN bookings b ON b.id = v.booking_id
                WHERE v.org_id = :org
                ORDER BY b.end_at
                """).param("org", actor.orgId()).query(ToResolve.class).list();
    }

    public boolean originalCondition(UUID bookingId) {
        return Boolean.TRUE.equals(jdbc.sql("SELECT returned_in_original_condition(:b)").param("b", bookingId)
                .query(Boolean.class).single());
    }

    public int openDamageOrDispute(UUID bookingId) {
        return jdbc.sql("""
                SELECT count(*)::int FROM incidents WHERE booking_id = :b AND kind IN ('damage', 'dispute') AND status <> 'resolved'
                """).param("b", bookingId).query(Integer.class).single();
    }

    public boolean resolvedDamage(UUID bookingId) {
        return jdbc.sql("SELECT count(*) FROM incidents WHERE booking_id = :b AND kind = 'damage' AND status = 'resolved'")
                .param("b", bookingId).query(Long.class).single() > 0;
    }

    private int openIncidents(UUID bookingId) {
        return jdbc.sql("SELECT count(*)::int FROM incidents WHERE booking_id = :b AND status <> 'resolved'")
                .param("b", bookingId).query(Integer.class).single();
    }

    private Map<String, Condition> conditions(UUID bookingId) {
        record Row(String phase, String rating, String notes, String recordedByName, OffsetDateTime recordedAt) {}
        var map = new LinkedHashMap<String, Condition>();
        jdbc.sql("""
                SELECT c.phase, c.rating, c.notes, u.full_name AS recorded_by_name, c.recorded_at
                FROM condition_records c JOIN users u ON u.id = c.recorded_by WHERE c.booking_id = :b
                """).param("b", bookingId).query(Row.class).list()
                .forEach(r -> map.put(r.phase(), new Condition(r.phase(), r.rating(), r.notes(), r.recordedByName(), r.recordedAt())));
        return map;
    }

    // ------------------------------------------------------------------ helpers

    private BookingRow staffLock(Actor actor, UUID bookingId) {
        var b = bookings.lock(bookingId);
        bookings.checkVisible(actor, b);
        if (!actor.isStaffOf(b.orgId())) throw ApiException.forbidden("Only staff of this organisation decide deposits.");
        return b;
    }

    private void requireStatus(BookingRow b, String depositStatus, String bookingStatus, String message) {
        if (!depositStatus.equals(b.depositStatus()) || !bookingStatus.equals(b.status())) {
            throw ApiException.rule("deposit_not_" + depositStatus, "deposit_state", message);
        }
    }

    private void requirePaid(BookingRow b) {
        if (!"paid".equals(b.depositStatus())) {
            throw ApiException.rule("deposit_not_paid", "deposit_state",
                    "There is no paid deposit on this booking to settle (the deposit is " + b.depositStatus() + ").");
        }
    }

    private void requireNoOpenIncident(BookingRow b) {
        if (openDamageOrDispute(b.id()) > 0) {
            throw ApiException.rule("incident_open", "deposit_incident_open",
                    "A damage or dispute incident on this booking is still open. Nothing is refunded or forfeited "
                            + "until it is resolved. Resolve the incident first.");
        }
    }

    private static String requireReason(String reason) {
        if (Labels.blank(reason)) {
            throw ApiException.rule("reason_required", "reason_required",
                    "Write a reason. The borrower will read it, and it goes into the audit log.");
        }
        return reason.trim();
    }

    private void insertLedger(BookingRow b, String kind, String provider, String ref, UUID actorId, String reason) {
        jdbc.sql("""
                INSERT INTO deposit_transactions (booking_id, kind, amount_minor, provider, provider_ref, actor_id, reason)
                VALUES (:b, :k, :amount, :p, :ref, :actor, :reason)
                """)
                .param("b", b.id()).param("k", kind).param("amount", b.depositMinor()).param("p", provider)
                .param("ref", ref).param("actor", actorId).param("reason", reason)
                .update();
    }

    private String chargeReference(UUID bookingId) {
        return jdbc.sql("SELECT provider_ref FROM deposit_transactions WHERE booking_id = :b AND kind = 'charge' ORDER BY created_at DESC LIMIT 1")
                .param("b", bookingId).query(String.class).optional().orElse(null);
    }

    private static Map<String, Object> details(BookingRow b, PaymentProvider.Result result) {
        var m = new LinkedHashMap<String, Object>();
        m.put("amountMinor", b.depositMinor());
        m.put("currency", "INR");
        if (result != null) {
            m.put("provider", result.provider());
            m.put("providerRef", result.reference());
        }
        return m;
    }
}
