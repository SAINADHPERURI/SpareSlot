package org.spareslot.common;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Map;

/** Plain-words names used in messages, notifications and audit reasons. */
public final class Labels {

    private Labels() {}

    /** Demo display zone for messages. The API itself always uses ISO-8601 instants. */
    public static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");

    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("EEE d MMM, HH:mm", Locale.ENGLISH);

    private static final Map<String, String> CREDENTIALS = Map.of(
            "student_id", "Student ID",
            "research_affiliation", "Research affiliation",
            "creator_portfolio", "Creator portfolio",
            "team_registration", "Team registration",
            "safety_induction", "Safety induction",
            "other", "Other credential");

    public static String credential(String kind) {
        return CREDENTIALS.getOrDefault(kind, kind);
    }

    public static String when(OffsetDateTime t) {
        return t == null ? "" : WHEN.format(t.atZoneSameInstant(ZONE));
    }

    public static String rupees(int minor) {
        return minor % 100 == 0 ? "₹" + (minor / 100) : String.format(Locale.ENGLISH, "₹%.2f", minor / 100.0);
    }

    public static String hours(double h) {
        return h == Math.rint(h) ? String.valueOf((long) h) : String.format(Locale.ENGLISH, "%.1f", h);
    }

    public static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
