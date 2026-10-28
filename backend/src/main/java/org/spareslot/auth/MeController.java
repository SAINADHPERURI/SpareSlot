package org.spareslot.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.spareslot.common.ApiException;
import org.spareslot.common.AuditService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** The signed-in person's profile, team and weekly usage. */
@RestController
@RequestMapping("/api/me")
public class MeController {

    private final JdbcClient jdbc;
    private final AuditService audit;

    public MeController(JdbcClient jdbc, AuditService audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    public record Team(UUID id, String name, List<String> members) {}

    public record WeeklyUsage(UUID resourceId, String resourceName, double hours, int weeklyHourCap) {}

    public record Credential(UUID id, String kind, String status, String reviewReason, OffsetDateTime expiresAt,
                             boolean expired, OffsetDateTime createdAt) {}

    public record Profile(UUID id, String email, String fullName, String role, String borrowerType, String affiliation,
                          UUID orgId, String orgName, Boolean orgVerified, String status, Team team,
                          List<Credential> credentials, List<WeeklyUsage> weeklyUsage, double hoursLast30Days,
                          OffsetDateTime createdAt) {}

    record UserRow(UUID id, String email, String fullName, String role, String borrowerType, String affiliation,
                   UUID orgId, String orgName, Boolean orgVerified, String status, UUID teamId, String teamName,
                   OffsetDateTime createdAt) {}

    @GetMapping
    public Profile me(Actor actor) {
        if (actor == null) throw ApiException.notFound("Profile");
        var u = jdbc.sql("""
                SELECT u.id, u.email, u.full_name, u.role, u.borrower_type, u.affiliation, u.org_id,
                       o.name AS org_name, o.verified AS org_verified, u.status, u.team_id, t.name AS team_name,
                       u.created_at
                FROM users u LEFT JOIN organisations o ON o.id = u.org_id LEFT JOIN teams t ON t.id = u.team_id
                WHERE u.id = :id
                """).param("id", actor.userId()).query(UserRow.class).single();
        Team team = null;
        if (u.teamId() != null) {
            var members = jdbc.sql("SELECT full_name FROM users WHERE team_id = :t ORDER BY full_name")
                    .param("t", u.teamId()).query(String.class).list();
            team = new Team(u.teamId(), u.teamName(), members);
        }
        var creds = jdbc.sql("""
                SELECT id, kind, status, review_reason, expires_at,
                       (expires_at IS NOT NULL AND expires_at <= now()) AS expired, created_at
                FROM credentials WHERE user_id = :u ORDER BY created_at DESC
                """).param("u", actor.userId()).query(Credential.class).list();
        var usage = jdbc.sql("""
                SELECT w.resource_id, r.name AS resource_name, w.hours::float8 AS hours, r.weekly_hour_cap
                FROM v_weekly_usage w JOIN resources r ON r.id = w.resource_id
                WHERE w.subject_id = :s AND w.week_start = date_trunc('week', now() AT TIME ZONE 'UTC')
                ORDER BY r.name
                """).param("s", u.teamId() != null ? u.teamId() : u.id()).query(WeeklyUsage.class).list();
        double recent = jdbc.sql("SELECT coalesce((SELECT hours::float8 FROM v_recent_usage_30d WHERE subject_id = :s), 0)")
                .param("s", u.teamId() != null ? u.teamId() : u.id()).query(Double.class).single();
        return new Profile(u.id(), u.email(), u.fullName(), u.role(), u.borrowerType(), u.affiliation(), u.orgId(),
                u.orgName(), u.orgVerified(), u.status(), team, creds, usage, recent, u.createdAt());
    }

    public record UpdateProfile(@NotBlank @Size(max = 120) String fullName,
                                @Pattern(regexp = "student|researcher|creator|startup_team") String borrowerType,
                                @Size(max = 200) String affiliation) {}

    @PutMapping
    @Transactional
    public Profile update(Actor actor, @Valid @RequestBody UpdateProfile body) {
        String type = actor.isUser() ? body.borrowerType() : null;
        jdbc.sql("UPDATE users SET full_name = :n, borrower_type = :t, affiliation = :a WHERE id = :id")
                .param("n", body.fullName().trim()).param("t", type)
                .param("a", body.affiliation() == null ? "" : body.affiliation().trim()).param("id", actor.userId())
                .update();
        audit.record(actor, "user.profile_updated", "user", actor.userId(), null);
        return me(actor);
    }

    public record CreateTeam(@NotBlank @Size(max = 120) String name) {}

    public record JoinTeam(UUID teamId) {}

    /** A startup team shares one quota. Creating a team makes the user its first member. */
    @PostMapping("/team")
    @PreAuthorize("hasRole('USER')")
    @Transactional
    public Profile createTeam(Actor actor, @Valid @RequestBody CreateTeam body) {
        UUID teamId = jdbc.sql("INSERT INTO teams (name) VALUES (:n) RETURNING id").param("n", body.name().trim())
                .query(UUID.class).single();
        jdbc.sql("UPDATE users SET team_id = :t WHERE id = :u").param("t", teamId).param("u", actor.userId()).update();
        audit.record(actor, "team.created", "team", teamId, null, null, null, Map.of("name", body.name().trim()));
        return me(actor);
    }

    /** Joins a team by its id (the team code shown to existing members). */
    @PostMapping("/team/join")
    @PreAuthorize("hasRole('USER')")
    @Transactional
    public Profile joinTeam(Actor actor, @RequestBody JoinTeam body) {
        if (body.teamId() == null) throw ApiException.badRequest("invalid_request", "Enter the team code.");
        boolean exists = jdbc.sql("SELECT count(*) FROM teams WHERE id = :t").param("t", body.teamId())
                .query(Long.class).single() > 0;
        if (!exists) throw ApiException.notFound("Team");
        jdbc.sql("UPDATE users SET team_id = :t WHERE id = :u").param("t", body.teamId()).param("u", actor.userId()).update();
        audit.record(actor, "team.joined", "team", body.teamId(), null);
        return me(actor);
    }

    @PostMapping("/team/leave")
    @PreAuthorize("hasRole('USER')")
    @Transactional
    public Profile leaveTeam(Actor actor) {
        UUID teamId = jdbc.sql("SELECT team_id FROM users WHERE id = :u").param("u", actor.userId())
                .query(UUID.class).optional().orElse(null);
        if (teamId != null) {
            jdbc.sql("UPDATE users SET team_id = NULL WHERE id = :u").param("u", actor.userId()).update();
            audit.record(actor, "team.left", "team", teamId, null);
        }
        return me(actor);
    }
}
