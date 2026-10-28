package org.spareslot.credentials;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * SPEC section 4, check 3: a user must hold a verified, unexpired credential of every kind the resource requires.
 */
@Service
public class EligibilityService {

    private final JdbcClient jdbc;

    public EligibilityService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Set<String> verifiedKinds(UUID userId) {
        if (userId == null) return Set.of();
        return new LinkedHashSet<>(jdbc.sql("""
                SELECT DISTINCT kind FROM credentials
                WHERE user_id = :u AND status = 'verified' AND (expires_at IS NULL OR expires_at > now())
                """).param("u", userId).query(String.class).list());
    }

    public List<String> requirements(UUID resourceId) {
        return jdbc.sql("SELECT credential_kind FROM resource_requirements WHERE resource_id = :r ORDER BY credential_kind")
                .param("r", resourceId).query(String.class).list();
    }

    /** Requirements per resource for a batch of resources (for list pages). */
    public Map<UUID, List<String>> requirements(List<UUID> resourceIds) {
        if (resourceIds.isEmpty()) return Map.of();
        record Row(UUID resourceId, String credentialKind) {}
        return jdbc.sql("""
                SELECT resource_id, credential_kind FROM resource_requirements
                WHERE resource_id IN (:ids) ORDER BY credential_kind
                """).param("ids", resourceIds).query(Row.class).list().stream()
                .collect(Collectors.groupingBy(Row::resourceId,
                        Collectors.mapping(Row::credentialKind, Collectors.toList())));
    }

    public List<String> missing(List<String> required, Set<String> held) {
        var missing = new ArrayList<String>();
        for (String kind : required) if (!held.contains(kind)) missing.add(kind);
        return missing;
    }
}
