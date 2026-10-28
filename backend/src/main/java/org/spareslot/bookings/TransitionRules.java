package org.spareslot.bookings;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.sql.Array;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * The state machine, read from booking_transitions (the same table the database guard enforces), so the
 * application, the allowedActions and the database can never disagree.
 */
@Component
public class TransitionRules {

    public record Rule(String from, String to, List<String> allowedRoles, boolean requiresReason) {}

    private final JdbcClient jdbc;
    private volatile Map<String, Rule> rules;

    public TransitionRules(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Rule> find(String from, String to) {
        return Optional.ofNullable(all().get(from + ">" + to));
    }

    public List<Rule> from(String status) {
        return all().values().stream().filter(r -> r.from().equals(status)).toList();
    }

    private Map<String, Rule> all() {
        if (rules == null) {
            rules = jdbc.sql("SELECT from_status, to_status, allowed_roles, requires_reason FROM booking_transitions")
                    .query((rs, i) -> new Rule(rs.getString(1), rs.getString(2), roles(rs.getArray(3)), rs.getBoolean(4)))
                    .list().stream().collect(Collectors.toUnmodifiableMap(r -> r.from() + ">" + r.to(), r -> r));
        }
        return rules;
    }

    private static List<String> roles(Array array) throws SQLException {
        return Arrays.asList((String[]) array.getArray());
    }

    /** The action name the UI shows for a move to this status. */
    public static String actionFor(String toStatus) {
        return switch (toStatus) {
            case "approved" -> "approve";
            case "rejected" -> "reject";
            case "waitlisted" -> "waitlist";
            case "cancelled" -> "cancel";
            case "checked_in" -> "check_in";
            case "returned" -> "return";
            case "closed" -> "close";
            default -> toStatus;
        };
    }
}
