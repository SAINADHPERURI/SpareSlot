package org.spareslot;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** SPEC section 4: the checks in order, eligibility, open requests, quota, waitlist and promotion. */
class RequestRulesIT extends ApiTestBase {

    private JsonNodeAssert refused(com.fasterxml.jackson.databind.JsonNode body) {
        return new JsonNodeAssert(body);
    }

    record JsonNodeAssert(com.fasterxml.jackson.databind.JsonNode body) {
        void hasRule(String code, String rule) {
            assertThat(body.get("code").asText()).isEqualTo(code);
            assertThat(body.get("rule").asText()).isEqualTo(rule);
            assertThat(body.get("message").asText()).isNotBlank();
        }
    }

    private com.fasterxml.jackson.databind.JsonNode attempt(Who user, UUID resource, OffsetDateTime start, OffsetDateTime end)
            throws Exception {
        return expect(422, HttpMethod.POST, "/api/bookings", user,
                Map.of("resourceId", resource, "startAt", start.toString(), "endAt", end.toString(), "purpose", "Test"));
    }

    private long bookingsOf(Who user) {
        return jdbc.sql("SELECT count(*) FROM bookings WHERE requester_id = :u").param("u", user.id()).query(Long.class).single();
    }

    @Test
    void anInactiveResourceIsRefusedFirst() throws Exception {
        var org = org(true);
        UUID kit = resource(org, 0, "student_id");
        jdbc.sql("UPDATE resources SET active = false WHERE id = :r").param("r", kit).update();
        var ann = borrower();
        var w = window(2, 10, 1);
        // inactive wins even though the user is also missing the credential
        refused(attempt(ann, kit, w[0], w[1])).hasRule("resource_unavailable", "resource_active");
        assertThat(bookingsOf(ann)).isZero();
    }

    @Test
    void theWindowMustBeInTheFutureAndNotTooLong() throws Exception {
        var org = org(true);
        UUID kit = resource(org, 0, 3, 8);
        var ann = borrower();
        var past = OffsetDateTime.now().minusHours(2);
        refused(attempt(ann, kit, past, past.plusHours(1))).hasRule("window_in_past", "window_future");
        var w = window(2, 9, 4);
        var body = attempt(ann, kit, w[0], w[1]);
        refused(body).hasRule("window_too_long", "max_booking_hours");
        assertThat(body.get("message").asText()).contains("at most 3 hours");
        assertThat(bookingsOf(ann)).isZero();
    }

    @Test
    void aMissingCredentialIsNamedAndAVerifiedOneLetsTheRequestThrough() throws Exception {
        var org = org(true);
        UUID kit = resource(org, 0, "safety_induction", "student_id");
        var ann = borrower();
        var w = window(2, 10, 1);
        var body = attempt(ann, kit, w[0], w[1]);
        refused(body).hasRule("missing_credential", "eligibility");
        assertThat(body.get("message").asText()).contains("Safety induction").contains("Student ID");
        assertThat(body.at("/details/missing").toString()).contains("safety_induction", "student_id");

        // an expired credential does not count
        verifiedCredential(ann, "student_id", OffsetDateTime.now().minusDays(1), org.manager());
        verifiedCredential(ann, "safety_induction", null, org.manager());
        var still = attempt(ann, kit, w[0], w[1]);
        assertThat(still.at("/details/missing").toString()).contains("student_id").doesNotContain("safety_induction");

        // file a request, the manager verifies it, then the request goes through
        var filed = post("/api/credentials", ann, Map.of("kind", "student_id", "evidence", "Student card no. TEST-1"));
        var review = post("/api/credentials/" + filed.get("id").asText() + "/review", org.manager(),
                Map.of("decision", "verified", "reason", "Card checked in person"));
        assertThat(review.get("status").asText()).isEqualTo("verified");
        assertThat(review.get("reviewReason").asText()).isEqualTo("Card checked in person");
        assertThat(auditCount(UUID.fromString(filed.get("id").asText()), "credential.verified")).isEqualTo(1);
        assertThat(request(ann, kit, w).at("/booking/status").asText()).isEqualTo("requested");

        // the eligible-for-me filter now includes the resource
        var list = get("/api/resources?eligible=true&orgId=" + org.id(), ann);
        assertThat(list.get("items").toString()).contains(kit.toString());
    }

    @Test
    void aReviewNeedsAReasonAndAnotherOrganisationsRequestIsHidden() throws Exception {
        var org = org(true);
        var other = org(true);
        var ann = borrower();
        var filed = post("/api/credentials", ann, Map.of("kind", "creator_portfolio", "evidence", "Portfolio link", "orgId", org.id()));
        String path = "/api/credentials/" + filed.get("id").asText() + "/review";
        expect(400, HttpMethod.POST, path, org.manager(), Map.of("decision", "rejected", "reason", ""));
        expect(404, HttpMethod.POST, path, other.manager(), Map.of("decision", "verified", "reason", "ok"));
        var rejected = post(path, org.owner(), Map.of("decision", "rejected", "reason", "Link does not open; send another"));
        assertThat(rejected.get("status").asText()).isEqualTo("rejected");
        var mine = get("/api/credentials/mine", ann);
        assertThat(mine.get(0).get("reviewReason").asText()).isEqualTo("Link does not open; send another");
    }

    @Test
    void atMostFiveOpenRequests() throws Exception {
        var org = org(true);
        UUID kit = resource(org, 0, 1, 40);
        var ann = borrower();
        for (int i = 0; i < 5; i++) requestId(ann, kit, window(2 + i, 10, 1));
        var w = window(9, 10, 1);
        refused(attempt(ann, kit, w[0], w[1])).hasRule("too_many_open_requests", "open_requests");
        assertThat(bookingsOf(ann)).isEqualTo(5);
    }

    @Test
    void theWeeklyQuotaIsSharedByATeam() throws Exception {
        var org = org(true);
        UUID kit = resource(org, 0, 4, 5);
        UUID team = team();
        var a = borrower(team);
        var b = borrower(team);
        // find a Monday at least a week ahead so both windows fall in one week
        var monday = OffsetDateTime.now(java.time.ZoneOffset.UTC).truncatedTo(java.time.temporal.ChronoUnit.DAYS).plusDays(8);
        while (monday.getDayOfWeek() != java.time.DayOfWeek.MONDAY) monday = monday.plusDays(1);
        var first = new OffsetDateTime[]{monday.plusHours(9), monday.plusHours(13)};
        UUID id = requestId(a, kit, first);
        decide(org.manager(), id, "approve", "OK");
        var second = new OffsetDateTime[]{monday.plusDays(1).plusHours(9), monday.plusDays(1).plusHours(11)};
        var body = attempt(b, kit, second[0], second[1]);
        refused(body).hasRule("weekly_quota", "weekly_quota");
        assertThat(body.get("message").asText()).startsWith("Your team has already booked 4");
        // one hour still fits
        var oneHour = new OffsetDateTime[]{second[0], second[0].plusHours(1)};
        assertThat(request(b, kit, oneHour).at("/booking/status").asText()).isEqualTo("requested");
    }

    @Test
    void anOverlappingRequestIsWaitlistedWithItsPositionAndPromotedWhenTheSlotFrees() throws Exception {
        var org = org(true);
        UUID kit = resource(org, 0, 4, 40);
        var holder = borrower();
        var w = window(5, 10, 2);
        UUID held = requestId(holder, kit, w);
        decide(org.manager(), held, "approve", "First come");

        // a heavy user asks first, a light user asks second; the light user ranks first
        var heavy = borrower();
        UUID past = requestId(heavy, kit, window(1, 6, 3));
        decide(org.manager(), past, "approve", "Past usage");
        var heavyReq = request(heavy, kit, w);
        assertThat(heavyReq.at("/booking/status").asText()).isEqualTo("waitlisted");
        assertThat(heavyReq.at("/booking/decisionReason").asText()).isEqualTo("Slot taken; you joined the waitlist at number 1");

        var light = borrower();
        var lightReq = request(light, kit, w);
        assertThat(lightReq.at("/booking/status").asText()).isEqualTo("waitlisted");
        assertThat(lightReq.at("/booking/decisionReason").asText()).isEqualTo("Slot taken; you joined the waitlist at number 1");
        UUID lightId = UUID.fromString(lightReq.at("/booking/id").asText());
        UUID heavyId = UUID.fromString(heavyReq.at("/booking/id").asText());
        assertThat(get("/api/bookings/" + heavyId, heavy).at("/booking/queue/position").asInt()).isEqualTo(2);
        var lightQueue = get("/api/bookings/" + lightId, light).at("/booking/queue");
        assertThat(lightQueue.get("position").asInt()).isEqualTo(1);
        assertThat(lightQueue.get("size").asInt()).isEqualTo(2);
        assertThat(lightQueue.get("explanation").asText()).contains("fewest first");
        var waitlistedBy = jdbc.sql("SELECT actor_role FROM audit_events WHERE entity_id = :b AND action = 'booking.waitlisted'")
                .param("b", lightId).query(String.class).single();
        assertThat(waitlistedBy).isEqualTo("system");

        // the holder cancels: the system promotes the first that fits, with the ranking as the reason
        post("/api/bookings/" + held + "/cancel", holder, Map.of("reason", "No longer needed"));
        assertThat(status(lightId)).isEqualTo("approved");
        assertThat(status(heavyId)).isEqualTo("waitlisted");
        var promoted = get("/api/bookings/" + lightId, light);
        assertThat(promoted.at("/booking/decisionReason").asText()).startsWith("Promoted from the waitlist").contains("0 h used");
        assertThat(promoted.get("decidedByName").asText()).isEqualTo("SpareSlot (automatic)");
        long staffNotes = jdbc.sql("""
                SELECT count(*) FROM notifications WHERE user_id = :m AND entity_id = :b AND message LIKE 'The system promoted%'
                """).param("m", org.manager().id()).param("b", lightId).query(Long.class).single();
        assertThat(staffNotes).isEqualTo(1);

        // the manager may cancel the promotion with a reason; the next in line is promoted
        post("/api/bookings/" + lightId + "/cancel", org.manager(), Map.of("reason", "Promotion clashes with maintenance"));
        assertThat(status(heavyId)).isEqualTo("approved");
    }

    @Test
    void approvingAnOverlappingRequestIsExplainedAndCompetitorsAreWaitlisted() throws Exception {
        var org = org(true);
        UUID kit = resource(org, 0);
        var a = borrower();
        var b = borrower();
        var w = window(6, 10, 2);
        UUID first = requestId(a, kit, w);
        UUID second = requestId(b, kit, w);
        assertThat(actions(get("/api/bookings/" + second, org.manager()))).contains("approve");
        decide(org.manager(), first, "approve", "Earlier request");
        // the competing open request is waitlisted by the system
        assertThat(status(second)).isEqualTo("waitlisted");
        var view = get("/api/bookings/" + second, org.manager());
        assertThat(actions(view)).doesNotContain("approve").contains("reject");
        assertThat(view.at("/booking/blockedActions/approve").asText()).contains("overlaps");
        var body = expect(422, HttpMethod.POST, "/api/bookings/" + second + "/decision", org.manager(),
                Map.of("action", "approve", "reason", "Try anyway"));
        assertThat(body.get("rule").asText()).isEqualTo("no_overlap");
    }

    @Test
    void onlyPeopleReject() throws Exception {
        var rejectedBySystem = jdbc.sql("""
                SELECT count(*) FROM audit_events WHERE action = 'booking.rejected' AND actor_role = 'system'
                """).query(Long.class).single();
        assertThat(rejectedBySystem).isZero();
    }
}
