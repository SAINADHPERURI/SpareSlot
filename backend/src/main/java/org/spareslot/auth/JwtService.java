package org.spareslot.auth;

import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/** HS256, 8 hours, no refresh. Claims: sub (user id), role, org (absent for users and admins). */
@Service
public class JwtService {

    static final Duration LIFETIME = Duration.ofHours(8);

    private final JwtEncoder encoder;

    public JwtService(JwtEncoder encoder) {
        this.encoder = encoder;
    }

    public String issue(UUID userId, String role, UUID orgId) {
        Instant now = Instant.now();
        var claims = JwtClaimsSet.builder()
                .issuer("spareslot")
                .subject(userId.toString())
                .issuedAt(now)
                .expiresAt(now.plus(LIFETIME))
                .claim("role", role);
        if (orgId != null) claims.claim("org", orgId.toString());
        var header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims.build())).getTokenValue();
    }
}
