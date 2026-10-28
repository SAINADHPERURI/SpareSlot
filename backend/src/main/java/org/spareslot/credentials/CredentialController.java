package org.spareslot.credentials;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.spareslot.auth.Actor;
import org.spareslot.common.ApiException;
import org.spareslot.common.AuditService;
import org.spareslot.common.Labels;
import org.spareslot.notifications.NotificationService;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Verification requests. A user files one; a manager or owner verifies or rejects it with a reason the user can
 * read. Evidence is visible only to the user who filed it and to reviewers.
 */
@RestController
@RequestMapping("/api/credentials")
public class CredentialController {

    private final JdbcClient jdbc;
    private final AuditService audit;
    private final NotificationService notifications;

    public CredentialController(JdbcClient jdbc, AuditService audit, NotificationService notifications) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.notifications = notifications;
    }

    static final String KINDS = "student_id|research_affiliation|creator_portfolio|team_registration|safety_induction|other";

    public record FileRequest(@NotBlank @Pattern(regexp = KINDS) String kind,
                              @NotBlank @Size(max = 2000) String evidence,
                              OffsetDateTime expiresAt,
                              UUID orgId) {}

    public record ReviewRequest(@NotBlank @Pattern(regexp = "verified|rejected") String decision,
                                @NotBlank @Size(max = 1000) String reason,
                                OffsetDateTime expiresAt) {}

    public record Credential(UUID id, UUID userId, String userName, String borrowerType, String affiliation,
                             UUID orgId, String orgName, String kind, String evidence, String status,
                             String reviewedByName, OffsetDateTime reviewedAt, String reviewReason,
                             OffsetDateTime expiresAt, boolean expired, OffsetDateTime createdAt) {}

    private static final String SELECT = """
            SELECT c.id, c.user_id, u.full_name AS user_name, u.borrower_type, u.affiliation, c.org_id,
                   o.name AS org_name, c.kind, c.evidence, c.status, rv.full_name AS reviewed_by_name,
                   c.reviewed_at, c.review_reason, c.expires_at,
                   (c.expires_at IS NOT NULL AND c.expires_at <= now()) AS expired, c.created_at
            FROM credentials c
            JOIN users u ON u.id = c.user_id
            LEFT JOIN organisations o ON o.id = c.org_id
            LEFT JOIN users rv ON rv.id = c.reviewed_by
            """;

    @PostMapping
    @PreAuthorize("hasRole('USER')")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public Credential file(Actor actor, @Valid @RequestBody FileRequest body) {
        if (body.expiresAt() != null && body.expiresAt().isBefore(OffsetDateTime.now())) {
            throw ApiException.rule("expiry_in_past", "credential_expiry",
                    "The expiry date has already passed. Enter a future date, or leave it empty if the credential does not expire.");
        }
        boolean alreadyPending = jdbc.sql("""
                SELECT count(*) FROM credentials WHERE user_id = :u AND kind = :k AND status = 'pending'
                """).param("u", actor.userId()).param("k", body.kind()).query(Long.class).single() > 0;
        if (alreadyPending) {
            throw ApiException.rule("already_pending", "one_pending_per_kind",
                    "You already have a " + Labels.credential(body.kind()) + " request waiting for review. A reviewer will decide it soon.");
        }
        if (body.orgId() != null) {
            boolean verifiedOrg = jdbc.sql("SELECT count(*) FROM organisations WHERE id = :o AND verified")
                    .param("o", body.orgId()).query(Long.class).single() > 0;
            if (!verifiedOrg) throw ApiException.notFound("Organisation");
        }
        UUID id = jdbc.sql("""
                INSERT INTO credentials (user_id, org_id, kind, evidence, expires_at)
                VALUES (:u, :o, :k, :e, :x) RETURNING id
                """)
                .param("u", actor.userId()).param("o", body.orgId()).param("k", body.kind())
                .param("e", body.evidence().trim()).param("x", body.expiresAt())
                .query(UUID.class).single();
        audit.record(actor, "credential.requested", "credential", id, null, "pending", null,
                Map.of("kind", body.kind()));
        if (body.orgId() != null) {
            notifications.notifyStaff(body.orgId(), "New verification request: " + Labels.credential(body.kind()),
                    "credential", id);
        }
        return get(id);
    }

    @GetMapping("/mine")
    @PreAuthorize("hasRole('USER')")
    public List<Credential> mine(Actor actor) {
        return jdbc.sql(SELECT + " WHERE c.user_id = :u ORDER BY c.created_at DESC").param("u", actor.userId())
                .query(Credential.class).list();
    }

    /** The review queue: requests addressed to the reviewer's organisation or to any reviewer. */
    @GetMapping
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    public List<Credential> queue(Actor actor, @RequestParam(defaultValue = "pending") String status) {
        return jdbc.sql(SELECT + """
                 WHERE c.status = :s AND (c.org_id IS NULL OR c.org_id = :org)
                 ORDER BY c.created_at
                """).param("s", status).param("org", actor.orgId()).query(Credential.class).list();
    }

    @PostMapping("/{id}/review")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    @Transactional
    public Credential review(Actor actor, @PathVariable UUID id, @Valid @RequestBody ReviewRequest body) {
        record Row(UUID userId, UUID orgId, String kind, String status) {}
        var row = jdbc.sql("SELECT user_id, org_id, kind, status FROM credentials WHERE id = :id FOR UPDATE")
                .param("id", id).query(Row.class).optional()
                .orElseThrow(() -> ApiException.notFound("Verification request"));
        if (row.orgId() != null && !row.orgId().equals(actor.orgId())) throw ApiException.notFound("Verification request");
        if (!"pending".equals(row.status())) {
            throw ApiException.rule("already_reviewed", "review_once",
                    "This request was already " + row.status() + ". The user can file a new request if something changed.");
        }
        jdbc.sql("""
                UPDATE credentials SET status = :s, reviewed_by = :by, reviewed_at = now(), review_reason = :reason,
                       expires_at = coalesce(:x, expires_at)
                WHERE id = :id
                """)
                .param("s", body.decision()).param("by", actor.userId()).param("reason", body.reason().trim())
                .param("x", body.expiresAt()).param("id", id).update();
        audit.record(actor, "credential." + body.decision(), "credential", id, "pending", body.decision(),
                body.reason().trim(), Map.of("kind", row.kind(), "userId", row.userId().toString()));
        String verb = "verified".equals(body.decision()) ? "was verified" : "was not accepted";
        notifications.notifyUser(row.userId(), "Your " + Labels.credential(row.kind()) + " " + verb + ": " + body.reason().trim(),
                "credential", id);
        return get(id);
    }

    private Credential get(UUID id) {
        return jdbc.sql(SELECT + " WHERE c.id = :id").param("id", id).query(Credential.class).single();
    }
}
