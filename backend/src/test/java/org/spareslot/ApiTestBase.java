package org.spareslot;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.spareslot.auth.JwtService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;


/**
 * Integration tests drive the real HTTP API against PostgreSQL. Each test builds its own fictional
 * organisation, people and resources with unique names, so tests never depend on each other's data.
 */
@AutoConfigureMockMvc
public abstract class ApiTestBase extends PostgresTestBase {

    @Autowired protected MockMvc mvc;
    @Autowired protected JdbcClient jdbc;
    @Autowired protected JwtService jwt;
    @Autowired protected ObjectMapper json;

    /** A person and a token for them. */
    public record Who(UUID id, String role, UUID orgId, String token) {}

    public record Org(UUID id, Who owner, Who manager) {}

    protected static String unique() {
        return UUID.randomUUID().toString().substring(0, 8);
    }

    // ------------------------------------------------------------------ fixtures (direct SQL; fictional data)

    protected Org org(boolean verified) {
        String n = unique();
        UUID id = jdbc.sql("""
                INSERT INTO organisations (name, kind, location, verified, verified_at)
                VALUES (:n, 'makerspace', 'Test Street 1', :v, CASE WHEN :v THEN now() END) RETURNING id
                """).param("n", "Test Org " + n).param("v", verified).query(UUID.class).single();
        return new Org(id, staff(id, "owner"), staff(id, "manager"));
    }

    protected Who staff(UUID orgId, String role) {
        UUID id = jdbc.sql("""
                INSERT INTO users (email, password_hash, full_name, role, org_id) VALUES (:e, 'x', :n, :r, :o) RETURNING id
                """).param("e", role + "-" + unique() + "@test.example").param("n", "Test " + role)
                .param("r", role).param("o", orgId).query(UUID.class).single();
        return new Who(id, role, orgId, jwt.issue(id, role, orgId));
    }

    protected Who borrower() {
        return borrower(null);
    }

    protected Who borrower(UUID teamId) {
        UUID id = jdbc.sql("""
                INSERT INTO users (email, password_hash, full_name, role, borrower_type, team_id)
                VALUES (:e, 'x', :n, 'user', 'student', :t) RETURNING id
                """).param("e", "user-" + unique() + "@test.example").param("n", "Test Borrower " + unique())
                .param("t", teamId).query(UUID.class).single();
        return new Who(id, "user", null, jwt.issue(id, "user", null));
    }

    protected Who admin() {
        UUID id = jdbc.sql("""
                INSERT INTO users (email, password_hash, full_name, role) VALUES (:e, 'x', 'Test Admin', 'admin') RETURNING id
                """).param("e", "admin-" + unique() + "@test.example").query(UUID.class).single();
        return new Who(id, "admin", null, jwt.issue(id, "admin", null));
    }

    protected UUID team() {
        return jdbc.sql("INSERT INTO teams (name) VALUES (:n) RETURNING id").param("n", "Team " + unique())
                .query(UUID.class).single();
    }

    protected UUID resource(Org org, int depositMinor, String... requirements) {
        return resource(org, depositMinor, 4, 8, requirements);
    }

    protected UUID resource(Org org, int depositMinor, int maxHours, int weeklyCap, String... requirements) {
        UUID id = jdbc.sql("""
                INSERT INTO resources (org_id, name, category, max_booking_hours, weekly_hour_cap, deposit_minor, conditions)
                VALUES (:o, :n, 'equipment', :max, :cap, :d, 'Handle with care') RETURNING id
                """).param("o", org.id()).param("n", "Test Kit " + unique()).param("max", maxHours)
                .param("cap", weeklyCap).param("d", depositMinor).query(UUID.class).single();
        for (String kind : requirements) {
            jdbc.sql("INSERT INTO resource_requirements (resource_id, credential_kind) VALUES (:r, :k)")
                    .param("r", id).param("k", kind).update();
        }
        return id;
    }

    protected void verifiedCredential(Who user, String kind, OffsetDateTime expiresAt, Who reviewer) {
        jdbc.sql("""
                INSERT INTO credentials (user_id, kind, evidence, status, reviewed_by, reviewed_at, review_reason, expires_at)
                VALUES (:u, :k, 'test evidence', 'verified', :r, now(), 'Checked', :x)
                """).param("u", user.id()).param("k", kind).param("r", reviewer.id()).param("x", expiresAt).update();
    }

    /** A time window starting `daysAhead` days from now, on the hour, lasting `hours`. */
    protected static OffsetDateTime[] window(int daysAhead, int startHour, int hours) {
        var start = OffsetDateTime.now().truncatedTo(ChronoUnit.DAYS).plusDays(daysAhead).plusHours(startHour);
        return new OffsetDateTime[]{start, start.plusHours(hours)};
    }

    // ------------------------------------------------------------------ HTTP helpers

    protected MvcResult call(HttpMethod method, String path, Who who, Object body) throws Exception {
        MockHttpServletRequestBuilder req = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request(method, path).accept(MediaType.APPLICATION_JSON);
        if (who != null) req.header("Authorization", "Bearer " + who.token());
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        return mvc.perform(req).andReturn();
    }

    protected JsonNode ok(HttpMethod method, String path, Who who, Object body) throws Exception {
        var res = call(method, path, who, body);
        int status = res.getResponse().getStatus();
        if (status >= 300) {
            throw new AssertionError(method + " " + path + " returned " + status + ": " + res.getResponse().getContentAsString());
        }
        String text = res.getResponse().getContentAsString();
        return text.isEmpty() ? json.nullNode() : json.readTree(text);
    }

    protected JsonNode get(String path, Who who) throws Exception {
        return ok(HttpMethod.GET, path, who, null);
    }

    protected JsonNode post(String path, Who who, Object body) throws Exception {
        return ok(HttpMethod.POST, path, who, body);
    }

    /** Asserts the status and returns the JSON body. */
    protected JsonNode expect(int status, HttpMethod method, String path, Who who, Object body) throws Exception {
        var res = call(method, path, who, body);
        String text = res.getResponse().getContentAsString();
        if (res.getResponse().getStatus() != status) {
            throw new AssertionError(method + " " + path + " expected " + status + " but got "
                    + res.getResponse().getStatus() + ": " + text);
        }
        return text.isEmpty() ? json.nullNode() : json.readTree(text);
    }

    protected JsonNode upload(String path, Who who, byte[] bytes, Map<String, String> fields, int expectStatus) throws Exception {
        var req = multipart(path).file(new MockMultipartFile("file", "photo.jpg", "image/jpeg", bytes));
        fields.forEach(req::param);
        if (who != null) req.header("Authorization", "Bearer " + who.token());
        var res = mvc.perform(req).andReturn();
        String text = res.getResponse().getContentAsString();
        if (res.getResponse().getStatus() != expectStatus) {
            throw new AssertionError("upload " + path + " expected " + expectStatus + " but got "
                    + res.getResponse().getStatus() + ": " + text);
        }
        return text.isEmpty() ? json.nullNode() : json.readTree(text);
    }

    // ------------------------------------------------------------------ journey shortcuts

    protected JsonNode request(Who user, UUID resourceId, OffsetDateTime[] w) throws Exception {
        return post("/api/bookings", user, Map.of("resourceId", resourceId, "startAt", w[0].toString(),
                "endAt", w[1].toString(), "purpose", "Test purpose"));
    }

    protected UUID requestId(Who user, UUID resourceId, OffsetDateTime[] w) throws Exception {
        return UUID.fromString(request(user, resourceId, w).at("/booking/id").asText());
    }

    protected JsonNode decide(Who staff, UUID bookingId, String action, String reason) throws Exception {
        return post("/api/bookings/" + bookingId + "/decision", staff, Map.of("action", action, "reason", reason));
    }

    protected String status(UUID bookingId) {
        return jdbc.sql("SELECT status FROM bookings WHERE id = :id").param("id", bookingId).query(String.class).single();
    }

    protected String depositStatus(UUID bookingId) {
        return jdbc.sql("SELECT deposit_status FROM bookings WHERE id = :id").param("id", bookingId).query(String.class).single();
    }

    protected List<String> actions(JsonNode detail) {
        var list = new java.util.ArrayList<String>();
        detail.at("/booking/allowedActions").forEach(n -> list.add(n.asText()));
        return list;
    }

    protected long auditCount(UUID entityId, String action) {
        return jdbc.sql("SELECT count(*) FROM audit_events WHERE entity_id = :id AND action = :a")
                .param("id", entityId).param("a", action).query(Long.class).single();
    }
}
