package org.spareslot.notifications;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/** In-app notification rows, polled by the UI every 30 seconds. No email, no websockets (SPEC 8). */
@Service
public class NotificationService {

    private final JdbcClient jdbc;

    public NotificationService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void notifyUser(UUID userId, String message, String entityType, UUID entityId) {
        jdbc.sql("INSERT INTO notifications (user_id, message, entity_type, entity_id) VALUES (:u, :m, :t, :e)")
                .param("u", userId).param("m", message).param("t", entityType).param("e", entityId)
                .update();
    }

    /** Every active owner and manager of an organisation. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void notifyStaff(UUID orgId, String message, String entityType, UUID entityId) {
        jdbc.sql("""
                INSERT INTO notifications (user_id, message, entity_type, entity_id)
                SELECT id, :m, :t, :e FROM users
                WHERE org_id = :org AND role IN ('owner', 'manager') AND status = 'active'
                """)
                .param("org", orgId).param("m", message).param("t", entityType).param("e", entityId)
                .update();
    }
}
