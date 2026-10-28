package org.spareslot.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.spareslot.common.ApiException;
import org.spareslot.common.AuditService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final JdbcClient jdbc;
    private final PasswordEncoder passwords;
    private final JwtService jwt;
    private final AuditService audit;
    private final boolean demoLoginEnabled;
    private final String demoDomain;

    public AuthController(JdbcClient jdbc, PasswordEncoder passwords, JwtService jwt, AuditService audit,
                          @Value("${spareslot.demo-login-enabled}") boolean demoLoginEnabled,
                          @Value("${spareslot.demo-email-domain}") String demoDomain) {
        this.jdbc = jdbc;
        this.passwords = passwords;
        this.jwt = jwt;
        this.audit = audit;
        this.demoLoginEnabled = demoLoginEnabled;
        this.demoDomain = demoDomain;
    }

    public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}

    public record RegisterRequest(
            @NotBlank @Email String email,
            @NotBlank @Size(min = 8, max = 100) String password,
            @NotBlank @Size(max = 120) String fullName,
            @Pattern(regexp = "student|researcher|creator|startup_team") String borrowerType,
            @Size(max = 200) String affiliation) {}

    public record RegisterOrganisationRequest(
            @NotBlank @Size(max = 160) String organisationName,
            @NotBlank @Pattern(regexp = "college_lab|makerspace|studio|other") String kind,
            @Size(max = 200) String location,
            @Size(max = 2000) String description,
            @NotBlank @Email String email,
            @NotBlank @Size(min = 8, max = 100) String password,
            @NotBlank @Size(max = 120) String fullName) {}

    public record TokenResponse(String token, UUID userId, String role, UUID orgId, String fullName) {}

    public record DemoAccount(String email, String fullName, String role, String borrowerType, String orgName) {}

    record LoginRow(UUID id, String passwordHash, String role, UUID orgId, String status, String fullName) {}

    @PostMapping("/login")
    public TokenResponse login(@Valid @RequestBody LoginRequest body) {
        var row = findLogin(body.email());
        if (row == null || !passwords.matches(body.password(), row.passwordHash())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "bad_credentials", "The email or password is not right.", null);
        }
        return tokenFor(row);
    }

    /** Registers a borrower. The role is always 'user'; staff accounts are never self-registered. */
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public TokenResponse register(@Valid @RequestBody RegisterRequest body) {
        String email = body.email().trim().toLowerCase(Locale.ROOT);
        ensureEmailFree(email);
        UUID id = jdbc.sql("""
                INSERT INTO users (email, password_hash, full_name, role, borrower_type, affiliation)
                VALUES (:e, :p, :n, 'user', :t, :a) RETURNING id
                """)
                .param("e", email).param("p", passwords.encode(body.password())).param("n", body.fullName().trim())
                .param("t", body.borrowerType()).param("a", body.affiliation() == null ? "" : body.affiliation().trim())
                .query(UUID.class).single();
        var actor = new Actor(id, "user", null);
        audit.record(actor, "user.registered", "user", id, null);
        return new TokenResponse(jwt.issue(id, "user", null), id, "user", null, body.fullName().trim());
    }

    /**
     * An organisation signs up with its first owner. The organisation starts unverified: its resources are
     * hidden from borrowers until an admin verifies it.
     */
    @PostMapping("/register-organisation")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public TokenResponse registerOrganisation(@Valid @RequestBody RegisterOrganisationRequest body) {
        String email = body.email().trim().toLowerCase(Locale.ROOT);
        ensureEmailFree(email);
        boolean nameTaken = jdbc.sql("SELECT count(*) FROM organisations WHERE lower(name) = lower(:n)")
                .param("n", body.organisationName().trim()).query(Long.class).single() > 0;
        if (nameTaken) {
            throw ApiException.conflict("organisation_exists", "An organisation with this name is already registered.");
        }
        UUID orgId = jdbc.sql("""
                INSERT INTO organisations (name, kind, location, description) VALUES (:n, :k, :l, :d) RETURNING id
                """)
                .param("n", body.organisationName().trim()).param("k", body.kind())
                .param("l", body.location() == null ? "" : body.location().trim())
                .param("d", body.description() == null ? "" : body.description().trim())
                .query(UUID.class).single();
        UUID userId = jdbc.sql("""
                INSERT INTO users (email, password_hash, full_name, role, org_id) VALUES (:e, :p, :n, 'owner', :o) RETURNING id
                """)
                .param("e", email).param("p", passwords.encode(body.password())).param("n", body.fullName().trim())
                .param("o", orgId).query(UUID.class).single();
        var actor = new Actor(userId, "owner", orgId);
        audit.record(actor, "organisation.registered", "organisation", orgId, "Awaiting verification by an admin");
        return new TokenResponse(jwt.issue(userId, "owner", orgId), userId, "owner", orgId, body.fullName().trim());
    }

    /** The accounts shown on the demo sign-in panel. Empty unless DEMO_LOGIN_ENABLED=true. */
    @GetMapping("/demo-accounts")
    public List<DemoAccount> demoAccounts() {
        if (!demoLoginEnabled) return List.of();
        return jdbc.sql("""
                SELECT u.email, u.full_name, u.role, u.borrower_type, o.name AS org_name
                FROM users u LEFT JOIN organisations o ON o.id = u.org_id
                WHERE u.email LIKE :domain AND u.status = 'active'
                ORDER BY CASE u.role WHEN 'user' THEN 0 WHEN 'manager' THEN 1 WHEN 'owner' THEN 2 ELSE 3 END, u.email
                """)
                .param("domain", "%" + demoDomain)
                .query(DemoAccount.class).list();
    }

    public record DemoLoginRequest(@NotBlank @Email String email) {}

    /**
     * Signs in as a seeded, fictional demo account without a password, so a judge can try every role.
     * Off unless DEMO_LOGIN_ENABLED=true, and limited to the demo email domain.
     */
    @PostMapping("/demo-login")
    public TokenResponse demoLogin(@Valid @RequestBody DemoLoginRequest body) {
        String email = body.email().trim().toLowerCase(Locale.ROOT);
        if (!demoLoginEnabled || !email.endsWith(demoDomain)) {
            throw ApiException.notFound("Demo sign-in");
        }
        var row = findLogin(email);
        if (row == null) throw ApiException.notFound("Demo account");
        return tokenFor(row);
    }

    private TokenResponse tokenFor(LoginRow row) {
        if (!"active".equals(row.status())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "account_suspended",
                    "This account is suspended. Contact the platform admin to have it reinstated.", null);
        }
        return new TokenResponse(jwt.issue(row.id(), row.role(), row.orgId()), row.id(), row.role(), row.orgId(), row.fullName());
    }

    private LoginRow findLogin(String email) {
        return jdbc.sql("SELECT id, password_hash, role, org_id, status, full_name FROM users WHERE email = :e")
                .param("e", email.trim().toLowerCase(Locale.ROOT))
                .query(LoginRow.class).optional().orElse(null);
    }

    private void ensureEmailFree(String email) {
        boolean taken = jdbc.sql("SELECT count(*) FROM users WHERE email = :e").param("e", email)
                .query(Long.class).single() > 0;
        if (taken) throw ApiException.conflict("email_taken", "An account with this email already exists. Sign in instead.");
    }
}
