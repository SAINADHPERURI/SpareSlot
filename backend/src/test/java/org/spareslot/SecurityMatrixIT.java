package org.spareslot;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.HttpMethod;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.HttpMethod.*;

/**
 * Table-driven security tests (SPEC section 5): one row per protected endpoint. For every row, an anonymous
 * caller gets 401, the wrong role gets 403, and staff of another organisation (or another borrower) get 404.
 * None of the refused calls may change anything.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SecurityMatrixIT extends ApiTestBase {

    /** wrongRole / outsider name a fixture: user, otherUser, owner, manager, otherOwner, otherManager, admin. */
    record Row(String name, HttpMethod method, String path, Object body, String wrongRole, String outsider) {
        @Override public String toString() { return name; }
    }

    Org org, otherOrg;
    Who ann, raj, admin;
    UUID resourceId, bookingId, credentialId, incidentId, extensionId;
    Map<String, Who> people;

    @BeforeAll
    void fixtures() throws Exception {
        org = org(true);
        otherOrg = org(true);
        ann = borrower();
        raj = borrower();
        admin = admin();
        people = Map.of("user", ann, "otherUser", raj, "owner", org.owner(), "manager", org.manager(),
                "otherOwner", otherOrg.owner(), "otherManager", otherOrg.manager(), "admin", admin);
        resourceId = resource(org, 10000, 4, 40);
        bookingId = requestId(ann, resourceId, window(4, 10, 2));
        decide(org.manager(), bookingId, "approve", "OK");
        credentialId = UUID.fromString(post("/api/credentials", ann,
                Map.of("kind", "student_id", "evidence", "Card", "orgId", org.id())).get("id").asText());
        incidentId = UUID.fromString(post("/api/incidents", ann,
                Map.of("bookingId", bookingId, "kind", "conflict", "description", "Room double used")).get("id").asText());
        extensionId = UUID.fromString(post("/api/bookings/" + bookingId + "/extensions", ann,
                Map.of("requestedEndAt", window(4, 13, 0)[0].toString(), "reason", "Need one more hour")).get("id").asText());
    }

    Stream<Row> rows() {
        var reason = Map.of("reason", "Because");
        var condition = Map.of("rating", "good", "notes", "");
        var resourceBody = Map.of("name", "Edited", "category", "equipment", "maxBookingHours", 2, "weeklyHourCap", 4,
                "depositMinor", 0, "active", true, "requirements", List.of());
        return Stream.of(
                new Row("create resource", POST, "/api/resources", resourceBody, "manager", null),
                new Row("edit resource", PUT, "/api/resources/{resource}", resourceBody, "manager", "otherOwner"),
                new Row("org resources", GET, "/api/org/resources", null, "user", null),
                new Row("remove listing photo", DELETE, "/api/resources/{resource}/photos/{random}", null, "manager", "otherOwner"),
                new Row("file credential", POST, "/api/credentials", Map.of("kind", "other", "evidence", "x"), "manager", null),
                new Row("my credentials", GET, "/api/credentials/mine", null, "owner", null),
                new Row("review queue", GET, "/api/credentials", null, "user", null),
                new Row("review credential", POST, "/api/credentials/{credential}/review",
                        Map.of("decision", "verified", "reason", "ok"), "user", "otherManager"),
                new Row("request booking", POST, "/api/bookings", Map.of("resourceId", UUID.randomUUID(),
                        "startAt", window(9, 9, 1)[0].toString(), "endAt", window(9, 9, 1)[1].toString(), "purpose", "x"), "manager", null),
                new Row("booking detail", GET, "/api/bookings/{booking}", null, null, "otherManager"),
                new Row("booking detail (other borrower)", GET, "/api/bookings/{booking}", null, null, "otherUser"),
                new Row("booking events", GET, "/api/bookings/{booking}/events", null, null, "otherManager"),
                new Row("bookings of another org", GET, "/api/bookings?orgId={otherOrg}", null, null, "manager"),
                new Row("decide", POST, "/api/bookings/{booking}/decision", Map.of("action", "reject", "reason", "x"), "user", "otherManager"),
                new Row("cancel", POST, "/api/bookings/{booking}/cancel", reason, "admin", "otherManager"),
                new Row("cancel (other borrower)", POST, "/api/bookings/{booking}/cancel", reason, null, "otherUser"),
                new Row("check in", POST, "/api/bookings/{booking}/check-in", condition, "user", "otherManager"),
                new Row("return", POST, "/api/bookings/{booking}/return", condition, "user", "otherOwner"),
                new Row("close", POST, "/api/bookings/{booking}/close", null, "user", "otherManager"),
                new Row("deposit", GET, "/api/bookings/{booking}/deposit", null, null, "otherManager"),
                new Row("pay deposit", POST, "/api/bookings/{booking}/deposit/pay", null, "manager", "otherUser"),
                new Row("waive deposit", POST, "/api/bookings/{booking}/deposit/waive", reason, "user", "otherManager"),
                new Row("refund deposit", POST, "/api/bookings/{booking}/deposit/refund", reason, "user", "otherOwner"),
                new Row("forfeit deposit", POST, "/api/bookings/{booking}/deposit/forfeit", reason, "user", "otherManager"),
                new Row("deposits to resolve", GET, "/api/deposits/to-resolve", null, "user", null),
                new Row("booking photos", GET, "/api/bookings/{booking}/photos", null, null, "otherManager"),
                new Row("photo content", GET, "/api/photos/{random}/content", null, null, "otherManager"),
                new Row("request extension", POST, "/api/bookings/{booking}/extensions",
                        Map.of("requestedEndAt", window(4, 13, 0)[0].toString(), "reason", "x"), "manager", "otherUser"),
                new Row("extension queue", GET, "/api/extensions", null, "user", null),
                new Row("decide extension", POST, "/api/extensions/{extension}/decision",
                        Map.of("action", "reject", "reason", "x"), "user", "otherManager"),
                new Row("raise incident", POST, "/api/incidents",
                        Map.of("bookingId", "{booking}", "kind", "damage", "description", "x"), "admin", "otherManager"),
                new Row("list incidents", GET, "/api/incidents", null, "admin", null),
                new Row("review incident", POST, "/api/incidents/{incident}/review", null, "user", "otherManager"),
                new Row("resolve incident", POST, "/api/incidents/{incident}/resolve", Map.of("resolution", "x"), "user", "otherOwner"),
                new Row("borrower dashboard", GET, "/api/dashboard/borrower", null, "manager", null),
                new Row("staff dashboard", GET, "/api/dashboard/staff", null, "user", null),
                new Row("admin dashboard", GET, "/api/dashboard/admin", null, "owner", null),
                new Row("admin organisations", GET, "/api/admin/organisations", null, "manager", null),
                new Row("verify organisation", POST, "/api/admin/organisations/{otherOrg}/verify", reason, "owner", null),
                new Row("admin users", GET, "/api/admin/users", null, "user", null),
                new Row("suspend user", POST, "/api/admin/users/{raj}/suspend", reason, "manager", null),
                new Row("audit log", GET, "/api/admin/audit", null, "owner", null),
                new Row("me", GET, "/api/me", null, null, null),
                new Row("notifications", GET, "/api/notifications", null, null, null));
    }

    private String fill(String s) {
        return s.replace("{resource}", resourceId.toString()).replace("{booking}", bookingId.toString())
                .replace("{credential}", credentialId.toString()).replace("{incident}", incidentId.toString())
                .replace("{extension}", extensionId.toString()).replace("{otherOrg}", otherOrg.id().toString())
                .replace("{raj}", raj.id().toString()).replace("{random}", UUID.randomUUID().toString());
    }

    private Object fillBody(Object body) {
        if (body instanceof Map<?, ?> m) {
            var copy = new java.util.LinkedHashMap<String, Object>();
            m.forEach((k, v) -> copy.put((String) k, v instanceof String s ? fill(s) : v));
            return copy;
        }
        return body;
    }

    private String snapshot() {
        return jdbc.sql("""
                SELECT (SELECT status || deposit_status FROM bookings WHERE id = :b)
                    || (SELECT count(*) FROM audit_events) || (SELECT count(*) FROM deposit_transactions)
                    || (SELECT status FROM credentials WHERE id = :c) || (SELECT status FROM incidents WHERE id = :i)
                    || (SELECT status FROM booking_extensions WHERE id = :e) || (SELECT name FROM resources WHERE id = :r)
                """).param("b", bookingId).param("c", credentialId).param("i", incidentId).param("e", extensionId)
                .param("r", resourceId).query(String.class).single();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("rows")
    void anonymousWrongRoleAndOutsidersAreRefused(Row row) throws Exception {
        String path = fill(row.path());
        Object body = fillBody(row.body());
        String before = snapshot();

        assertThat(call(row.method(), path, null, body).getResponse().getStatus()).as("anonymous").isEqualTo(401);
        if (row.wrongRole() != null) {
            var res = call(row.method(), path, people.get(row.wrongRole()), body).getResponse();
            assertThat(res.getStatus()).as("wrong role %s: %s", row.wrongRole(), res.getContentAsString()).isEqualTo(403);
        }
        if (row.outsider() != null) {
            var res = call(row.method(), path, people.get(row.outsider()), body).getResponse();
            assertThat(res.getStatus()).as("outsider %s: %s", row.outsider(), res.getContentAsString()).isEqualTo(404);
        }
        assertThat(snapshot()).as("refused calls change nothing").isEqualTo(before);
    }

    @ParameterizedTest(name = "suspended user cannot use {0}")
    @MethodSource("rows")
    void aSuspendedUserIsRefusedEverywhere(Row row) throws Exception {
        if (row.method() != GET || row.path().contains("{")) return;
        var gone = borrower();
        jdbc.sql("UPDATE users SET status = 'suspended' WHERE id = :u").param("u", gone.id()).update();
        int status = call(row.method(), fill(row.path()), gone, null).getResponse().getStatus();
        assertThat(status).isIn(401, 403);
    }
}
