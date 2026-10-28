package org.spareslot;

import org.junit.jupiter.api.Test;
import org.spareslot.common.AuditService;
import org.spareslot.jobs.OverdueJob;
import org.spareslot.notifications.NotificationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class AuthAndJobsIT extends ApiTestBase {

    @Autowired PasswordEncoder passwords;
    @Autowired JwtDecoder decoder;
    @Autowired AuditService audit;
    @Autowired NotificationService notifications;
    @Autowired TransactionTemplate tx;

    @Test
    void registerLoginAndTheTokenCarriesIdRoleAndOrg() throws Exception {
        String email = "new-" + unique() + "@test.example";
        var reg = post("/api/auth/register", null, Map.of("email", email, "password", "long enough pw",
                "fullName", "New Person", "borrowerType", "creator", "role", "admin"));
        assertThat(reg.get("role").asText()).isEqualTo("user");          // the role in the body is ignored
        expect(409, HttpMethod.POST, "/api/auth/register", null, Map.of("email", email, "password", "long enough pw", "fullName", "Again"));
        expect(401, HttpMethod.POST, "/api/auth/login", null, Map.of("email", email, "password", "wrong password"));
        var login = post("/api/auth/login", null, Map.of("email", email.toUpperCase(), "password", "long enough pw"));
        var claims = decoder.decode(login.get("token").asText());
        assertThat(claims.getSubject()).isEqualTo(reg.get("userId").asText());
        assertThat(claims.getClaimAsString("role")).isEqualTo("user");
        assertThat(claims.getClaimAsString("org")).isNull();

        var org = org(true);
        String staffEmail = "mgr-" + unique() + "@test.example";
        jdbc.sql("INSERT INTO users (email, password_hash, full_name, role, org_id) VALUES (:e, :p, 'Mgr', 'manager', :o)")
                .param("e", staffEmail).param("p", passwords.encode("staff password")).param("o", org.id()).update();
        var staff = decoder.decode(post("/api/auth/login", null, Map.of("email", staffEmail, "password", "staff password")).get("token").asText());
        assertThat(staff.getClaimAsString("org")).isEqualTo(org.id().toString());
        assertThat(staff.getClaimAsString("role")).isEqualTo("manager");
    }

    @Test
    void aSuspendedUserCannotSignInAndAnAdminDecidesWithAReason() throws Exception {
        String email = "susp-" + unique() + "@test.example";
        var reg = post("/api/auth/register", null, Map.of("email", email, "password", "long enough pw", "fullName", "Soon Suspended"));
        var admin = admin();
        UUID id = UUID.fromString(reg.get("userId").asText());
        expect(400, HttpMethod.POST, "/api/admin/users/" + id + "/suspend", admin, Map.of("reason", ""));
        post("/api/admin/users/" + id + "/suspend", admin, Map.of("reason", "Repeated no-shows"));
        var refused = expect(403, HttpMethod.POST, "/api/auth/login", null, Map.of("email", email, "password", "long enough pw"));
        assertThat(refused.get("code").asText()).isEqualTo("account_suspended");
        // an old token stops working at once
        var oldToken = new Who(id, "user", null, reg.get("token").asText());
        expect(401, HttpMethod.GET, "/api/me", oldToken, null);
        post("/api/admin/users/" + id + "/reinstate", admin, Map.of("reason", "Spoke to them"));
        post("/api/auth/login", null, Map.of("email", email, "password", "long enough pw"));
        assertThat(auditCount(id, "user.suspended")).isEqualTo(1);
    }

    @Test
    void aNewOrganisationIsHiddenUntilAnAdminVerifiesIt() throws Exception {
        var reg = post("/api/auth/register-organisation", null, Map.of("organisationName", "Test Studio " + unique(),
                "kind", "studio", "email", "studio-" + unique() + "@test.example", "password", "owner password", "fullName", "Studio Owner"));
        var owner = new Who(UUID.fromString(reg.get("userId").asText()), "owner", UUID.fromString(reg.get("orgId").asText()),
                reg.get("token").asText());
        var created = post("/api/resources", owner, Map.of("name", "Podcast booth", "category", "space", "maxBookingHours", 2,
                "weeklyHourCap", 4, "depositMinor", 0, "active", true, "requirements", java.util.List.of()));
        String rid = created.get("id").asText();
        expect(404, HttpMethod.GET, "/api/resources/" + rid, null, null);
        assertThat(get("/api/resources/" + rid, owner).at("/resource/name").asText()).isEqualTo("Podcast booth");
        post("/api/admin/organisations/" + owner.orgId() + "/verify", admin(), Map.of("reason", "Checked registration papers"));
        assertThat(get("/api/resources/" + rid, null).at("/resource/orgVerified").asBoolean()).isTrue();
    }

    @Test
    void listingEditsAreAuditedFieldByField() throws Exception {
        var org = org(true);
        UUID kit = resource(org, 0);
        var body = new java.util.HashMap<String, Object>(Map.of("name", "Renamed kit", "category", "equipment",
                "maxBookingHours", 4, "weeklyHourCap", 8, "depositMinor", 20000, "active", true,
                "requirements", java.util.List.of("safety_induction")));
        body.put("conditions", "Handle with care");
        ok(HttpMethod.PUT, "/api/resources/" + kit, org.owner(), body);
        var event = jdbc.sql("SELECT reason, details::text FROM audit_events WHERE entity_id = :r AND action = 'resource.updated'")
                .param("r", kit).query((rs, i) -> rs.getString(1) + "|" + rs.getString(2)).single();
        assertThat(event).startsWith("Changed: name, depositMinor, requirements|");
        assertThat(event).contains("\"to\": \"20000\"").contains("safety_induction");
        expect(403, HttpMethod.PUT, "/api/resources/" + kit, org.manager(), body);
    }

    @Test
    void demoSignInWorksOnlyForTheDemoDomain() throws Exception {
        String demoEmail = "judge-" + unique() + "@demo.spareslot.example";
        jdbc.sql("INSERT INTO users (email, password_hash, full_name) VALUES (:e, 'x', 'Demo Person')").param("e", demoEmail).update();
        var token = post("/api/auth/demo-login", null, Map.of("email", demoEmail));
        assertThat(token.get("role").asText()).isEqualTo("user");
        var other = borrower();
        String otherEmail = jdbc.sql("SELECT email FROM users WHERE id = :u").param("u", other.id()).query(String.class).single();
        expect(404, HttpMethod.POST, "/api/auth/demo-login", null, Map.of("email", otherEmail));
        assertThat(get("/api/auth/demo-accounts", null).toString()).contains(demoEmail).doesNotContain(otherEmail);
    }

    @Test
    void extensionsRespectConflictsAndNeedAReason() throws Exception {
        var org = org(true);
        UUID kit = resource(org, 0, 4, 40);
        var ann = borrower();
        var raj = borrower();
        UUID mine = requestId(ann, kit, window(5, 9, 2));
        UUID next = requestId(raj, kit, window(5, 12, 1));
        decide(org.manager(), mine, "approve", "OK");
        decide(org.manager(), next, "approve", "OK too");
        var clash = expect(422, HttpMethod.POST, "/api/bookings/" + mine + "/extensions", ann,
                Map.of("requestedEndAt", window(5, 13, 0)[0].toString(), "reason", "Longer session"));
        assertThat(clash.get("rule").asText()).isEqualTo("no_overlap");
        var ext = post("/api/bookings/" + mine + "/extensions", ann,
                Map.of("requestedEndAt", window(5, 12, 0)[0].toString(), "reason", "Need one more hour"));
        assertThat(actions(get("/api/bookings/" + mine, ann))).doesNotContain("request_extension");
        String decision = "/api/extensions/" + ext.get("id").asText() + "/decision";
        expect(422, HttpMethod.POST, decision, org.manager(), Map.of("action", "approve", "reason", " "));
        post(decision, org.manager(), Map.of("action", "approve", "reason", "Room is free"));
        var end = jdbc.sql("SELECT end_at FROM bookings WHERE id = :b").param("b", mine).query(OffsetDateTime.class).single();
        assertThat(end.toInstant()).isEqualTo(window(5, 12, 0)[0].toInstant());
        var timeline = get("/api/bookings/" + mine + "/events", ann).toString();
        assertThat(timeline).contains("extension.requested", "extension.approved", "Room is free");
    }

    @Test
    void theOverdueJobRaisesOneDelayIncidentAndNotifiesBothParties() throws Exception {
        var org = org(true);
        UUID kit = resource(org, 0);
        var ann = borrower();
        UUID id = requestId(ann, kit, window(2, 10, 1));
        decide(org.manager(), id, "approve", "OK");
        post("/api/bookings/" + id + "/check-in", org.manager(), Map.of("rating", "good", "notes", ""));
        // move the booking into the past (extensions and fixtures may change end_at; status is untouched)
        jdbc.sql("UPDATE bookings SET start_at = now() - interval '3 hours', end_at = now() - interval '1 hour' WHERE id = :b")
                .param("b", id).update();
        assertThat(get("/api/bookings/" + id, ann).at("/booking/overdue").asBoolean()).isTrue();

        var job = new OverdueJob(jdbc, audit, notifications, tx);
        job.raiseOverdue();
        job.raiseOverdue();
        long delays = jdbc.sql("SELECT count(*) FROM incidents WHERE booking_id = :b AND kind = 'delay'").param("b", id)
                .query(Long.class).single();
        assertThat(delays).isEqualTo(1);
        var raised = jdbc.sql("SELECT actor_role FROM audit_events WHERE action = 'incident.raised' AND details->>'bookingId' = :b")
                .param("b", id.toString()).query(String.class).single();
        assertThat(raised).isEqualTo("system");
        long toBorrower = jdbc.sql("SELECT count(*) FROM notifications WHERE user_id = :u AND entity_id = :b AND message LIKE 'Overdue:%'")
                .param("u", ann.id()).param("b", id).query(Long.class).single();
        long toStaff = jdbc.sql("SELECT count(*) FROM notifications WHERE user_id = :u AND entity_id = :b AND message LIKE 'Overdue:%'")
                .param("u", org.manager().id()).param("b", id).query(Long.class).single();
        assertThat(toBorrower).isEqualTo(1);
        assertThat(toStaff).isEqualTo(1);
    }
}
