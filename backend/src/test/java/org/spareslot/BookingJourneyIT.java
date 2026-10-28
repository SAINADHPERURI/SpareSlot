package org.spareslot;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

import java.util.ArrayList;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** The ten-step journey through the API: request, approve, pay, check in, return, refund, close, timeline. */
class BookingJourneyIT extends ApiTestBase {

    @Test
    void fullJourneyWithDepositIsAuditedStepByStep() throws Exception {
        var org = org(true);
        UUID kit = resource(org, 50000, "student_id");
        var ann = borrower();
        verifiedCredential(ann, "student_id", null, org.manager());

        var created = request(ann, kit, window(3, 10, 2));
        UUID id = UUID.fromString(created.at("/booking/id").asText());
        assertThat(created.at("/booking/status").asText()).isEqualTo("requested");
        assertThat(actions(created)).contains("cancel").doesNotContain("approve");

        // the manager sees approve, reject and waitlist; approval fixes the deposit as pending
        var staffView = get("/api/bookings/" + id, org.manager());
        assertThat(actions(staffView)).contains("approve", "reject", "waitlist").doesNotContain("cancel");
        var approved = decide(org.manager(), id, "approve", "Meets the conditions of use");
        assertThat(approved.at("/booking/status").asText()).isEqualTo("approved");
        assertThat(approved.at("/booking/depositStatus").asText()).isEqualTo("pending");
        assertThat(approved.at("/booking/depositMinor").asInt()).isEqualTo(50000);

        // pickup is blocked until the deposit is paid, with the rule in plain words
        var blocked = expect(422, HttpMethod.POST, "/api/bookings/" + id + "/check-in", org.manager(),
                Map.of("rating", "good", "notes", ""));
        assertThat(blocked.get("rule").asText()).isEqualTo("deposit_before_pickup");
        assertThat(blocked.get("message").asText()).startsWith("Pay the deposit before pickup");
        assertThat(get("/api/bookings/" + id, org.manager()).at("/booking/blockedActions/check_in").asText())
                .contains("deposit");

        assertThat(actions(get("/api/bookings/" + id, ann))).contains("pay_deposit");
        var paid = post("/api/bookings/" + id + "/deposit/pay", ann, null);
        assertThat(paid.get("status").asText()).isEqualTo("paid");
        assertThat(paid.get("demoNotice").asText()).isEqualTo("Demo payment: no real money moves");
        assertThat(paid.at("/ledger/0/providerRef").asText()).startsWith("DEMO-PAY-");

        var checkedIn = post("/api/bookings/" + id + "/check-in", org.manager(), Map.of("rating", "good", "notes", "All parts present"));
        assertThat(checkedIn.at("/booking/status").asText()).isEqualTo("checked_in");
        var returned = post("/api/bookings/" + id + "/return", org.manager(), Map.of("rating", "good", "notes", ""));
        assertThat(returned.at("/booking/status").asText()).isEqualTo("returned");

        // cannot close while money is held
        expect(422, HttpMethod.POST, "/api/bookings/" + id + "/close", org.manager(), null);
        var deposit = get("/api/bookings/" + id + "/deposit", org.manager());
        assertThat(deposit.get("recommendedAction").asText()).isEqualTo("refund");
        assertThat(deposit.get("originalCondition").asBoolean()).isTrue();
        assertThat(actions(get("/api/bookings/" + id, org.manager()))).contains("refund_deposit");

        var refunded = post("/api/bookings/" + id + "/deposit/refund", org.manager(), Map.of("reason", "Returned in original condition"));
        assertThat(refunded.get("status").asText()).isEqualTo("refunded");
        var closed = post("/api/bookings/" + id + "/close", org.manager(), null);
        assertThat(closed.at("/booking/status").asText()).isEqualTo("closed");

        // the borrower reads the full history: who, what, when and why
        var events = get("/api/bookings/" + id + "/events", ann);
        var actionsSeen = new ArrayList<String>();
        events.forEach(e -> actionsSeen.add(e.get("action").asText()));
        assertThat(actionsSeen).containsExactly("booking.requested", "booking.approved", "deposit.charged",
                "booking.checked_in", "booking.returned", "deposit.refunded", "booking.closed");
        var approval = events.get(1);
        assertThat(approval.get("actorId").asText()).isEqualTo(org.manager().id().toString());
        assertThat(approval.get("actorRole").asText()).isEqualTo("manager");
        assertThat(approval.get("reason").asText()).isEqualTo("Meets the conditions of use");
        assertThat(approval.get("fromStatus").asText()).isEqualTo("requested");

        // every transition notified the borrower
        long notes = jdbc.sql("SELECT count(*) FROM notifications WHERE user_id = :u AND entity_id = :b")
                .param("u", ann.id()).param("b", id).query(Long.class).single();
        assertThat(notes).isGreaterThanOrEqualTo(5);
    }

    @Test
    void aDecisionNeedsAReasonAndTheActorComesFromTheToken() throws Exception {
        var org = org(true);
        UUID kit = resource(org, 0);
        var ann = borrower();
        UUID id = requestId(ann, kit, window(2, 9, 1));

        var noReason = expect(422, HttpMethod.POST, "/api/bookings/" + id + "/decision", org.owner(),
                Map.of("action", "reject", "reason", "   "));
        assertThat(noReason.get("code").asText()).isEqualTo("reason_required");
        assertThat(status(id)).isEqualTo("requested");

        // a forged actor in the body is ignored: the audit row names the token's owner
        post("/api/bookings/" + id + "/decision", org.owner(),
                Map.of("action", "reject", "reason", "Outside opening hours", "actorId", ann.id().toString()));
        var actor = jdbc.sql("SELECT actor_id FROM audit_events WHERE entity_id = :b AND action = 'booking.rejected'")
                .param("b", id).query(UUID.class).single();
        assertThat(actor).isEqualTo(org.owner().id());
        assertThat(get("/api/bookings/" + id, ann).at("/booking/decisionReason").asText()).isEqualTo("Outside opening hours");
    }

    @Test
    void cancellingBeforePickupRefundsAPaidDepositAutomatically() throws Exception {
        var org = org(true);
        UUID kit = resource(org, 25000);
        var ann = borrower();
        UUID id = requestId(ann, kit, window(4, 10, 2));
        decide(org.manager(), id, "approve", "Fine");
        post("/api/bookings/" + id + "/deposit/pay", ann, null);

        post("/api/bookings/" + id + "/cancel", ann, Map.of("reason", "Plans changed"));
        assertThat(status(id)).isEqualTo("cancelled");
        assertThat(depositStatus(id)).isEqualTo("refunded");
        var refund = jdbc.sql("SELECT actor_role, reason FROM audit_events WHERE entity_id = :b AND action = 'deposit.refunded'")
                .param("b", id).query((rs, i) -> rs.getString(1) + "|" + rs.getString(2)).single();
        assertThat(refund).isEqualTo("system|Cancelled before pickup: Plans changed");
    }

    @Test
    void staffWaiveADepositWithAReasonAndPickupIsThenAllowed() throws Exception {
        var org = org(true);
        UUID kit = resource(org, 25000);
        var ann = borrower();
        UUID id = requestId(ann, kit, window(4, 14, 2));
        decide(org.owner(), id, "approve", "Fine");
        expect(422, HttpMethod.POST, "/api/bookings/" + id + "/deposit/waive", org.owner(), Map.of("reason", ""));
        post("/api/bookings/" + id + "/deposit/waive", org.owner(), Map.of("reason", "Partner college member"));
        assertThat(depositStatus(id)).isEqualTo("waived");
        post("/api/bookings/" + id + "/check-in", org.owner(), Map.of("rating", "minor_wear", "notes", "Light scuffs"));
        assertThat(status(id)).isEqualTo("checked_in");
    }
}
