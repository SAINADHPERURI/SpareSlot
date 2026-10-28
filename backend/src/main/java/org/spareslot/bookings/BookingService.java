package org.spareslot.bookings;

import org.spareslot.auth.Actor;
import org.spareslot.common.ApiException;
import org.spareslot.common.AuditService;
import org.spareslot.common.Labels;
import org.spareslot.credentials.EligibilityService;
import org.spareslot.deposits.DepositService;
import org.spareslot.notifications.NotificationService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The booking journey. {@link #transition} is the only code path that changes bookings.status (CLAUDE.md rule 1).
 */
@Service
public class BookingService {

    static final int MAX_OPEN_REQUESTS = 5;

    private final JdbcClient jdbc;
    private final BookingRepository bookings;
    private final TransitionRules rules;
    private final EligibilityService eligibility;
    private final AuditService audit;
    private final NotificationService notifications;
    private final DepositService deposits;
    private final WaitlistQueries waitlist;

    public BookingService(JdbcClient jdbc, BookingRepository bookings, TransitionRules rules,
                          EligibilityService eligibility, AuditService audit, NotificationService notifications,
                          DepositService deposits, WaitlistQueries waitlist) {
        this.jdbc = jdbc;
        this.bookings = bookings;
        this.rules = rules;
        this.eligibility = eligibility;
        this.audit = audit;
        this.notifications = notifications;
        this.deposits = deposits;
        this.waitlist = waitlist;
    }

    // ------------------------------------------------------------------ requesting (SPEC section 4)

    public record RequestForm(UUID resourceId, OffsetDateTime startAt, OffsetDateTime endAt, String purpose) {}

    record ResourceFacts(UUID id, String name, UUID orgId, boolean active, boolean orgVerified, int maxBookingHours,
                         int weeklyHourCap) {}

    /**
     * Checks the rules in SPEC order and stops at the first failure (422, no booking created). If a live booking
     * overlaps, the system waitlists the new request with its queue position as the reason.
     */
    @Transactional
    public UUID request(Actor actor, RequestForm f) {
        var r = jdbc.sql("""
                SELECT r.id, r.name, r.org_id, r.active, o.verified AS org_verified, r.max_booking_hours, r.weekly_hour_cap
                FROM resources r JOIN organisations o ON o.id = r.org_id WHERE r.id = :id
                """).param("id", f.resourceId()).query(ResourceFacts.class).optional()
                .orElseThrow(() -> ApiException.notFound("Resource"));

        // 1. the resource is active and its organisation is verified
        if (!r.active() || !r.orgVerified()) {
            if (!r.orgVerified() && r.active()) throw ApiException.notFound("Resource");
            throw ApiException.rule("resource_unavailable", "resource_active",
                    r.name() + " is not taking requests right now. Choose another resource, or check back later.");
        }

        // 2. the window is in the future and no longer than the maximum
        if (f.startAt() == null || f.endAt() == null || !f.endAt().isAfter(f.startAt())) {
            throw ApiException.rule("window_invalid", "window",
                    "The end time must be after the start time. Fix the times and try again.");
        }
        if (!f.startAt().isAfter(OffsetDateTime.now())) {
            throw ApiException.rule("window_in_past", "window_future",
                    "The start time has already passed. Choose a time in the future.");
        }
        double hours = java.time.Duration.between(f.startAt(), f.endAt()).toMinutes() / 60.0;
        if (hours > r.maxBookingHours()) {
            throw ApiException.rule("window_too_long", "max_booking_hours",
                    r.name() + " can be booked for at most " + r.maxBookingHours() + " hours at a time. Your window is "
                            + Labels.hours(hours) + " hours. Shorten it, or make separate requests.");
        }

        // 3. eligibility: a verified, unexpired credential of every required kind
        var missing = eligibility.missing(eligibility.requirements(r.id()), eligibility.verifiedKinds(actor.userId()));
        if (!missing.isEmpty()) {
            var names = String.join(", ", missing.stream().map(Labels::credential).toList());
            throw ApiException.rule("missing_credential", "eligibility",
                    r.name() + " needs a verified " + names + ". You do not have "
                            + (missing.size() == 1 ? "it" : "them") + " yet. Request verification on your profile, then try again.",
                    Map.of("missing", missing));
        }

        // 4. at most 5 open requests
        long open = jdbc.sql("SELECT count(*) FROM bookings WHERE requester_id = :u AND status IN ('requested', 'waitlisted')")
                .param("u", actor.userId()).query(Long.class).single();
        if (open >= MAX_OPEN_REQUESTS) {
            throw ApiException.rule("too_many_open_requests", "open_requests",
                    "You already have " + open + " open requests (requested or waitlisted); the limit is " + MAX_OPEN_REQUESTS
                            + ". Cancel one you no longer need, or wait for a decision, then try again.");
        }

        // 5. weekly quota, per user or per team
        UUID teamId = jdbc.sql("SELECT team_id FROM users WHERE id = :u").param("u", actor.userId())
                .query(UUID.class).optional().orElse(null);
        UUID subject = teamId != null ? teamId : actor.userId();
        double used = bookings.weeklyHours(r.id(), subject, f.startAt());
        if (used + hours > r.weeklyHourCap() + 1e-9) {
            String who = teamId != null ? "Your team has" : "You have";
            throw ApiException.rule("weekly_quota", "weekly_quota",
                    who + " already booked " + Labels.hours(used) + " of the " + r.weeklyHourCap() + " hours allowed per week on "
                            + r.name() + ". This request needs " + Labels.hours(hours) + " more. Choose a shorter window or another week.");
        }

        UUID id = jdbc.sql("""
                INSERT INTO bookings (resource_id, requester_id, team_id, start_at, end_at, purpose)
                VALUES (:r, :u, :t, :s, :e, :p) RETURNING id
                """)
                .param("r", r.id()).param("u", actor.userId()).param("t", teamId).param("s", f.startAt())
                .param("e", f.endAt()).param("p", f.purpose().trim())
                .query(UUID.class).single();
        audit.record(actor, "booking.requested", "booking", id, null, "requested", null,
                Map.of("resourceId", r.id().toString(), "startAt", f.startAt().toString(), "endAt", f.endAt().toString(),
                        "purpose", f.purpose().trim()));
        notifications.notifyStaff(r.orgId(), "New request for " + r.name() + " on " + Labels.when(f.startAt()), "booking", id);

        // 6. a live booking overlaps: the system waitlists it, with the queue position as the reason
        if (bookings.liveOverlap(r.id(), f.startAt(), f.endAt(), null)) {
            var b = bookings.find(id);
            int position = waitlist.positionIfWaitlisted(b);
            transition(id, "waitlisted", "Slot taken; you joined the waitlist at number " + position, Actor.SYSTEM);
        }
        return id;
    }

    // ------------------------------------------------------------------ the one status writer (SPEC section 3)

    /**
     * Moves a booking along one edge of booking_transitions. In one transaction: lock the row, check the actor's
     * role and organisation, require a new reason where the edge needs one, apply the change, write one audit
     * event and notify the other party. The actor comes from the token (or is the system), never a request body.
     *
     * @param reason the decision reason; for edges that need none (check-in, return, close) it is only recorded
     *               in the audit event
     */
    @Transactional
    public BookingRow transition(UUID bookingId, String target, String reason, Actor actor) {
        var b = bookings.lock(bookingId);
        String role = BookingRepository.transitionRole(actor, b);
        if (role == null) {
            bookings.checkVisible(actor, b);               // 404 for anyone unrelated
            throw ApiException.forbidden("Your role cannot change this booking.");
        }
        var rule = rules.find(b.status(), target).orElseThrow(() -> ApiException.rule("illegal_transition", "state_machine",
                "This booking is " + b.status().replace('_', ' ') + ", so it cannot be moved to "
                        + target.replace('_', ' ') + ". Refresh the page to see what can be done now."));
        if (!rule.allowedRoles().contains(role)) {
            throw ApiException.forbidden("Only " + String.join(" or ", rule.allowedRoles()) + " can "
                    + TransitionRules.actionFor(target).replace('_', ' ') + " this booking.");
        }
        String why = reason == null ? null : reason.trim();
        if (rule.requiresReason()) {
            if (Labels.blank(why)) {
                throw ApiException.rule("reason_required", "reason_required",
                        "Write a reason. The other person will read it, and it goes into the audit log.");
            }
            if (why.equals(b.decisionReason())) {
                throw ApiException.rule("reason_not_new", "reason_required",
                        "Write a new reason; it must differ from the reason given for the previous decision.");
            }
        }

        boolean snapshotDeposit = "approved".equals(target) && "none".equals(b.depositStatus()) && b.resourceDepositMinor() > 0;
        jdbc.sql("""
                UPDATE bookings SET status = :to,
                       decision_reason = CASE WHEN :needsReason THEN :reason ELSE decision_reason END,
                       decided_by      = CASE WHEN :needsReason THEN CAST(:by AS uuid) ELSE decided_by END,
                       checked_in_at   = CASE WHEN :to = 'checked_in' THEN now() ELSE checked_in_at END,
                       returned_at     = CASE WHEN :to = 'returned' THEN now() ELSE returned_at END,
                       closed_at       = CASE WHEN :to = 'closed' THEN now() ELSE closed_at END,
                       deposit_minor   = CASE WHEN :snapshot THEN :deposit ELSE deposit_minor END,
                       deposit_status  = CASE WHEN :snapshot THEN 'pending' ELSE deposit_status END
                WHERE id = :id
                """)
                .param("to", target).param("needsReason", rule.requiresReason()).param("reason", why)
                .param("by", actor.userId() == null ? null : actor.userId().toString())
                .param("snapshot", snapshotDeposit).param("deposit", b.resourceDepositMinor()).param("id", b.id())
                .update();

        var details = new LinkedHashMap<String, Object>();
        details.put("resourceId", b.resourceId().toString());
        if (snapshotDeposit) details.put("depositMinor", b.resourceDepositMinor());
        audit.record(actor, "booking." + target, "booking", b.id(), b.status(), target, why, details);
        notifyParties(b, target, why, role, snapshotDeposit);
        return bookings.find(b.id());
    }

    private void notifyParties(BookingRow b, String target, String why, String role, boolean depositPending) {
        String what = b.resourceName() + " on " + Labels.when(b.startAt());
        if ("requester".equals(role)) {
            notifications.notifyStaff(b.orgId(), b.requesterName() + " cancelled their booking of " + what + ": " + why,
                    "booking", b.id());
            return;
        }
        String message = switch (target) {
            case "approved" -> ("system".equals(role) ? "Promoted from the waitlist and approved: " : "Approved: ") + what + ". " + why
                    + (depositPending ? " Pay the " + Labels.rupees(b.resourceDepositMinor()) + " deposit before pickup." : "");
            case "rejected" -> "Not approved: " + what + ". Reason: " + why;
            case "waitlisted" -> "Waitlisted: " + what + ". " + why;
            case "cancelled" -> ("system".equals(role) ? "Request closed: " + what + ". " : "Cancelled by staff: " + what + ". Reason: ") + why;
            case "checked_in" -> "Checked out to you: " + b.resourceName() + ". Return it by " + Labels.when(b.endAt()) + ".";
            case "returned" -> "Return recorded for " + b.resourceName() + ". Thank you.";
            case "closed" -> "Booking closed: " + what + ".";
            default -> "Your booking of " + what + " is now " + target + ".";
        };
        notifications.notifyUser(b.requesterId(), message, "booking", b.id());
        if ("system".equals(role) && "approved".equals(target)) {
            notifications.notifyStaff(b.orgId(), "The system promoted " + b.requesterName() + "'s waitlisted request for "
                    + what + " after a cancellation. Check it; you may cancel it with a reason.", "booking", b.id());
        }
    }

    // ------------------------------------------------------------------ people's decisions

    @Transactional
    public BookingRow decide(Actor actor, UUID id, String action, String reason) {
        String target = switch (action) {
            case "approve" -> "approved";
            case "reject" -> "rejected";
            case "waitlist" -> "waitlisted";
            default -> throw ApiException.badRequest("invalid_action", "The action must be approve, reject or waitlist.");
        };
        var b = bookings.visible(actor, id);
        if (!actor.isStaffOf(b.orgId())) throw ApiException.forbidden("Only staff of this organisation decide requests.");
        if ("approved".equals(target)) {
            if (bookings.liveOverlap(b.resourceId(), b.startAt(), b.endAt(), b.id())) {
                throw ApiException.rule("slot_taken", "no_overlap",
                        "This window overlaps a booking that is already approved. Waitlist this request, or reject it with a reason.");
            }
            if (!b.startAt().isAfter(OffsetDateTime.now())) {
                throw ApiException.rule("window_in_past", "window_future",
                        "The requested start time has already passed, so it cannot be approved. Reject it with a reason.");
            }
        }
        var updated = transition(id, target, reason, actor);
        if ("approved".equals(target)) waitlistCompeting(updated);
        return updated;
    }

    /**
     * The requester cancels their own request or booking; staff cancel an approved booking. A paid deposit is
     * refunded automatically (never taken), and the freed slot is offered to the waitlist.
     */
    @Transactional
    public BookingRow cancel(Actor actor, UUID id, String reason) {
        var before = bookings.visible(actor, id);
        var updated = transition(id, "cancelled", reason, actor);
        if ("approved".equals(before.status())) {
            deposits.refundOnCancellation(id, updated.decisionReason());
            promoteFromWaitlist(before);
        }
        return updated;
    }

    public record ConditionForm(String rating, String notes) {}

    /** Pickup: staff record the condition first; the deposit must be paid, waived or none. */
    @Transactional
    public BookingRow checkIn(Actor actor, UUID id, ConditionForm c) {
        var b = staffBooking(actor, id);
        if (!"approved".equals(b.status())) {
            throw ApiException.rule("illegal_transition", "state_machine",
                    "Only an approved booking can be checked in. This one is " + b.status().replace('_', ' ') + ".");
        }
        if ("pending".equals(b.depositStatus())) {
            throw ApiException.rule("deposit_unpaid", "deposit_before_pickup",
                    "Pay the deposit before pickup. The borrower has not paid the " + Labels.rupees(b.depositMinor())
                            + " deposit yet: they can pay it on the booking page, or staff can waive it with a reason.");
        }
        insertCondition(actor, b, "check_in", c);
        return transition(id, "checked_in", conditionReason("pickup", c), actor);
    }

    @Transactional
    public BookingRow returnItem(Actor actor, UUID id, ConditionForm c) {
        var b = staffBooking(actor, id);
        if (!"checked_in".equals(b.status())) {
            throw ApiException.rule("illegal_transition", "state_machine",
                    "Only a checked-in booking can be returned. This one is " + b.status().replace('_', ' ') + ".");
        }
        insertCondition(actor, b, "return", c);
        return transition(id, "returned", conditionReason("return", c), actor);
    }

    @Transactional
    public BookingRow close(Actor actor, UUID id, String note) {
        var b = staffBooking(actor, id);
        if ("paid".equals(b.depositStatus()) || "pending".equals(b.depositStatus())) {
            throw ApiException.rule("deposit_unsettled", "deposit_before_close",
                    "The deposit is still " + b.depositStatus() + ". Refund or forfeit it first; a booking cannot close while money is held.");
        }
        return transition(id, "closed", Labels.blank(note) ? null : note, actor);
    }

    private BookingRow staffBooking(Actor actor, UUID id) {
        var b = bookings.visible(actor, id);
        if (!actor.isStaffOf(b.orgId())) throw ApiException.forbidden("Only staff of this organisation record pickup and return.");
        return b;
    }

    private void insertCondition(Actor actor, BookingRow b, String phase, ConditionForm c) {
        if (c == null || c.rating() == null || !List.of("good", "minor_wear", "damaged").contains(c.rating())) {
            throw ApiException.badRequest("invalid_request", "Choose a condition rating: good, minor wear or damaged.");
        }
        if ("damaged".equals(c.rating()) && Labels.blank(c.notes())) {
            throw ApiException.rule("notes_required", "condition_notes",
                    "Describe the damage in the notes. A damaged rating always needs a description.");
        }
        jdbc.sql("""
                INSERT INTO condition_records (booking_id, phase, rating, notes, recorded_by) VALUES (:b, :p, :r, :n, :u)
                """).param("b", b.id()).param("p", phase).param("r", c.rating())
                .param("n", c.notes() == null ? "" : c.notes().trim()).param("u", actor.userId()).update();
    }

    private static String conditionReason(String when, ConditionForm c) {
        String rating = switch (c.rating()) {
            case "minor_wear" -> "minor wear";
            default -> c.rating();
        };
        return "Condition at " + when + ": " + rating + (Labels.blank(c.notes()) ? "" : ". " + c.notes().trim());
    }

    // ------------------------------------------------------------------ the system's two powers: waitlist and promote

    /** After an approval, other open requests for the same window are waitlisted by the system, with a reason. */
    private void waitlistCompeting(BookingRow approved) {
        var competing = jdbc.sql("""
                SELECT id FROM bookings WHERE resource_id = :r AND status = 'requested' AND id <> :id
                  AND tstzrange(start_at, end_at) && tstzrange(:s, :e)
                ORDER BY created_at
                """).param("r", approved.resourceId()).param("id", approved.id())
                .param("s", approved.startAt()).param("e", approved.endAt()).query(UUID.class).list();
        for (UUID otherId : competing) {
            int position = waitlist.positionIfWaitlisted(bookings.find(otherId));
            transition(otherId, "waitlisted",
                    "Slot taken by an approved booking; you joined the waitlist at number " + position, Actor.SYSTEM);
        }
    }

    /**
     * When an approved booking is cancelled, the first waitlisted request that fits the freed window (in queue
     * order) is approved by the system, with the ranking as the reason. Staff are notified and may cancel it.
     */
    private void promoteFromWaitlist(BookingRow freed) {
        for (var candidate : waitlist.candidates(freed.resourceId(), freed.startAt(), freed.endAt())) {
            if (!candidate.startAt().isAfter(OffsetDateTime.now())) continue;
            if (bookings.liveOverlap(candidate.resourceId(), candidate.startAt(), candidate.endAt(), candidate.id())) continue;
            String reason = "Promoted from the waitlist after a cancellation freed the slot. Ranked first in the queue: "
                    + Labels.hours(candidate.recentHours()) + " h used in the last 30 days, requested "
                    + Labels.when(candidate.createdAt()) + ".";
            var promoted = transition(candidate.id(), "approved", reason, Actor.SYSTEM);
            waitlistCompeting(promoted);
            return;
        }
    }
}
