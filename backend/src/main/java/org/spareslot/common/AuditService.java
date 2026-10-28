package org.spareslot.common;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.spareslot.auth.Actor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

/**
 * Writes audit_events. Insert only: the table is append-only and the database refuses updates and deletes
 * (CLAUDE.md rule 7). Always called inside the caller's transaction so the event and the change commit together.
 */
@Service
public class AuditService {

    private final JdbcClient jdbc;
    private final ObjectMapper json;

    public AuditService(JdbcClient jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void record(Actor actor, String action, String entityType, UUID entityId,
                       String fromStatus, String toStatus, String reason, Map<String, ?> details) {
        jdbc.sql("""
                INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id,
                                          from_status, to_status, reason, details)
                VALUES (:actorId, :role, :action, :entityType, :entityId, :from, :to, :reason, CAST(:details AS jsonb))
                """)
                .param("actorId", actor.userId())
                .param("role", actor.role())
                .param("action", action)
                .param("entityType", entityType)
                .param("entityId", entityId)
                .param("from", fromStatus)
                .param("to", toStatus)
                .param("reason", reason)
                .param("details", toJson(details))
                .update();
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void record(Actor actor, String action, String entityType, UUID entityId, String reason) {
        record(actor, action, entityType, entityId, null, null, reason, Map.of());
    }

    private String toJson(Map<String, ?> details) {
        try {
            return json.writeValueAsString(details == null ? Map.of() : details);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
