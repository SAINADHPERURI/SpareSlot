package org.spareslot;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** SPEC section 4b: refund only in original condition, forfeit only after a resolved damage incident. */
class DepositRulesIT extends ApiTestBase {

    record Running(Org org, Who ann, UUID id) {}

    /** An approved, paid, checked-in booking (check-in condition as given). */
    private Running checkedIn(String checkInRating) throws Exception {
        var org = org(true);
        UUID kit = resource(org, 50000);
        var ann = borrower();
        UUID id = requestId(ann, kit, window(3, 9, 2));
        decide(org.manager(), id, "approve", "OK");
        post("/api/bookings/" + id + "/deposit/pay", ann, null);
        post("/api/bookings/" + id + "/check-in", org.manager(), Map.of("rating", checkInRating, "notes", "Recorded at pickup"));
        return new Running(org, ann, id);
    }

    @Test
    void aDamagedReturnCannotBeRefundedAndForfeitWaitsForAResolvedDamageIncident() throws Exception {
        var r = checkedIn("good");
        String base = "/api/bookings/" + r.id();
        expect(422, HttpMethod.POST, base + "/return", r.org().manager(), Map.of("rating", "damaged", "notes", ""));
        post(base + "/return", r.org().manager(), Map.of("rating", "damaged", "notes", "Lens cracked"));

        var refund = expect(422, HttpMethod.POST, base + "/deposit/refund", r.org().manager(), Map.of("reason", "Be kind"));
        assertThat(refund.get("code").asText()).isEqualTo("not_original_condition");
        var forfeit = expect(422, HttpMethod.POST, base + "/deposit/forfeit", r.org().manager(), Map.of("reason", "Lens cracked"));
        assertThat(forfeit.get("code").asText()).isEqualTo("no_resolved_damage");
        assertThat(get(base + "/deposit", r.org().manager()).get("recommendedAction").asText()).isEqualTo("review");

        var incident = post("/api/incidents", r.org().manager(),
                Map.of("bookingId", r.id(), "kind", "damage", "description", "Lens cracked on return"));
        String incidentId = incident.get("id").asText();
        var whileOpen = expect(422, HttpMethod.POST, base + "/deposit/forfeit", r.org().manager(), Map.of("reason", "Lens cracked"));
        assertThat(whileOpen.get("code").asText()).isEqualTo("incident_open");
        assertThat(get(base, r.org().manager()).at("/booking/blockedActions/forfeit_deposit").asText()).contains("still open");

        post("/api/incidents/" + incidentId + "/review", r.org().manager(), Map.of("note", "Comparing photos"));
        expect(400, HttpMethod.POST, "/api/incidents/" + incidentId + "/resolve", r.org().manager(), Map.of("resolution", ""));
        post("/api/incidents/" + incidentId + "/resolve", r.org().manager(), Map.of("resolution", "Damage happened during the booking"));

        assertThat(actions(get(base, r.org().manager()))).contains("forfeit_deposit").doesNotContain("refund_deposit");
        var forfeited = post(base + "/deposit/forfeit", r.org().manager(), Map.of("reason", "Lens cracked during use; see incident"));
        assertThat(forfeited.get("status").asText()).isEqualTo("forfeited");
        post(base + "/close", r.org().manager(), null);
        assertThat(status(r.id())).isEqualTo("closed");
        assertThat(auditCount(r.id(), "deposit.forfeited")).isEqualTo(1);
        assertThat(auditCount(UUID.fromString(incidentId), "incident.resolved")).isEqualTo(1);
    }

    @Test
    void anOpenDisputeHoldsTheRefundUntilItIsResolved() throws Exception {
        var r = checkedIn("minor_wear");
        String base = "/api/bookings/" + r.id();
        post(base + "/return", r.org().manager(), Map.of("rating", "minor_wear", "notes", "Same scuffs"));
        var dispute = post("/api/incidents", r.ann(),
                Map.of("bookingId", r.id(), "kind", "dispute", "description", "The scuffs were there at pickup"));
        var held = expect(422, HttpMethod.POST, base + "/deposit/refund", r.org().manager(), Map.of("reason", "Same condition"));
        assertThat(held.get("code").asText()).isEqualTo("incident_open");
        post("/api/incidents/" + dispute.get("id").asText() + "/resolve", r.org().manager(),
                Map.of("resolution", "Scuffs were recorded at check-in"));
        post(base + "/deposit/refund", r.org().manager(), Map.of("reason", "Same condition as at check-in"));
        assertThat(depositStatus(r.id())).isEqualTo("refunded");
    }

    @Test
    void onlyTheBorrowerPaysAndOnlyStaffDecide() throws Exception {
        var org = org(true);
        UUID kit = resource(org, 10000);
        var ann = borrower();
        var raj = borrower();
        UUID id = requestId(ann, kit, window(3, 15, 1));
        decide(org.manager(), id, "approve", "OK");
        expect(404, HttpMethod.POST, "/api/bookings/" + id + "/deposit/pay", raj, null);
        expect(403, HttpMethod.POST, "/api/bookings/" + id + "/deposit/pay", org.manager(), null);
        expect(403, HttpMethod.POST, "/api/bookings/" + id + "/deposit/waive", ann, Map.of("reason", "please"));
        expect(404, HttpMethod.POST, "/api/bookings/" + id + "/deposit/waive", org(true).manager(), Map.of("reason", "x"));
        assertThat(depositStatus(id)).isEqualTo("pending");
        long ledger = jdbc.sql("SELECT count(*) FROM deposit_transactions WHERE booking_id = :b").param("b", id)
                .query(Long.class).single();
        assertThat(ledger).isZero();
    }

    @Test
    void theToResolveListShowsHeldDepositsWithAdvice() throws Exception {
        var r = checkedIn("good");
        post("/api/bookings/" + r.id() + "/return", r.org().manager(), Map.of("rating", "good", "notes", ""));
        var list = get("/api/deposits/to-resolve", r.org().owner());
        assertThat(list).hasSize(1);
        assertThat(list.get(0).get("recommendedAction").asText()).isEqualTo("refund");
        assertThat(list.get(0).get("returnRating").asText()).isEqualTo("good");
        assertThat(get("/api/deposits/to-resolve", org(true).owner())).isEmpty();
    }
}
