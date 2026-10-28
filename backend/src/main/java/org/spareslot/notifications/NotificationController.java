package org.spareslot.notifications;

import org.spareslot.auth.Actor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final JdbcClient jdbc;

    public NotificationController(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public record Notification(long id, String message, String entityType, UUID entityId, OffsetDateTime readAt,
                               OffsetDateTime createdAt) {}

    public record Inbox(long unread, List<Notification> items) {}

    @GetMapping
    public Inbox inbox(Actor actor) {
        long unread = jdbc.sql("SELECT count(*) FROM notifications WHERE user_id = :u AND read_at IS NULL")
                .param("u", actor.userId()).query(Long.class).single();
        var items = jdbc.sql("""
                SELECT id, message, entity_type, entity_id, read_at, created_at FROM notifications
                WHERE user_id = :u ORDER BY created_at DESC, id DESC LIMIT 50
                """).param("u", actor.userId()).query(Notification.class).list();
        return new Inbox(unread, items);
    }

    /** Marks one of the caller's own notifications read. Someone else's id simply matches nothing. */
    @PostMapping("/{id}/read")
    public Inbox read(Actor actor, @PathVariable long id) {
        jdbc.sql("UPDATE notifications SET read_at = now() WHERE id = :id AND user_id = :u AND read_at IS NULL")
                .param("id", id).param("u", actor.userId()).update();
        return inbox(actor);
    }

    @PostMapping("/read-all")
    public Inbox readAll(Actor actor) {
        jdbc.sql("UPDATE notifications SET read_at = now() WHERE user_id = :u AND read_at IS NULL")
                .param("u", actor.userId()).update();
        return inbox(actor);
    }
}
