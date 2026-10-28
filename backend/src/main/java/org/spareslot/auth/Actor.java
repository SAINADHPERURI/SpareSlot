package org.spareslot.auth;

import java.util.UUID;

/**
 * Who is acting. Built only from the verified JWT (or {@link #SYSTEM} for the scheduler and the
 * auto-waitlist), never from a request body (CLAUDE.md rule 3).
 *
 * @param role users.role: user, owner, manager, admin, or "system"
 */
public record Actor(UUID userId, String role, UUID orgId) {

    /** The fixed system account from V10, used where the schema needs a user id for an automatic action. */
    public static final UUID SYSTEM_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000000");

    public static final Actor SYSTEM = new Actor(null, "system", null);

    public boolean isSystem() { return "system".equals(role); }
    public boolean isStaff() { return "owner".equals(role) || "manager".equals(role); }
    public boolean isAdmin() { return "admin".equals(role); }
    public boolean isUser() { return "user".equals(role); }

    public boolean isStaffOf(UUID resourceOrgId) {
        return isStaff() && orgId != null && orgId.equals(resourceOrgId);
    }

    /** The id to store in a NOT NULL user column for this actor. */
    public UUID userIdOrSystem() { return userId != null ? userId : SYSTEM_USER_ID; }
}
