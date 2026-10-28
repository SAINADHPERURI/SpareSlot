package org.spareslot;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.sql.DriverManager;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The demo seed (db/seed/V90) goes through every V1-V3 trigger on a fresh database, and covers what the demo
 * promises: a booking in every status, a deposit in every state, an overdue booking and a damage incident.
 */
class DemoSeedIT extends PostgresTestBase {

    @Test
    void theSeedAppliesAndCoversEveryStatus() throws Exception {
        try (var c = DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
             var st = c.createStatement()) {
            st.execute("DROP DATABASE IF EXISTS seedcheck");
            st.execute("CREATE DATABASE seedcheck");
        }
        String url = POSTGRES.getJdbcUrl().replaceFirst("/[^/?]+(\\?|$)", "/seedcheck$1");
        var ds = new DriverManagerDataSource(url, POSTGRES.getUsername(), POSTGRES.getPassword());
        Flyway.configure().dataSource(ds).locations("classpath:db/migration", "classpath:db/seed").load().migrate();
        var jdbc = JdbcClient.create(ds);

        var statuses = jdbc.sql("SELECT DISTINCT status FROM bookings").query(String.class).set();
        assertThat(statuses).containsExactlyInAnyOrder("requested", "approved", "rejected", "waitlisted", "checked_in",
                "returned", "closed", "cancelled");
        var deposits = jdbc.sql("SELECT DISTINCT deposit_status FROM bookings").query(String.class).set();
        assertThat(deposits).containsExactlyInAnyOrder("none", "pending", "paid", "refunded", "forfeited", "waived");

        long overdue = jdbc.sql("SELECT count(*) FROM bookings WHERE status = 'checked_in' AND end_at < now()").query(Long.class).single();
        assertThat(overdue).isEqualTo(1);
        long damage = jdbc.sql("SELECT count(*) FROM incidents WHERE kind = 'damage'").query(Long.class).single();
        assertThat(damage).isGreaterThanOrEqualTo(1);
        var sides = jdbc.sql("SELECT DISTINCT side FROM booking_photos").query(String.class).set();
        assertThat(sides).containsExactlyInAnyOrder("borrower", "staff");
        assertThat(jdbc.sql("SELECT count(*) FROM resource_photos").query(Long.class).single()).isEqualTo(3);

        // every booking has a timeline that starts with its request
        long withoutTimeline = jdbc.sql("""
                SELECT count(*) FROM bookings b WHERE NOT EXISTS (
                    SELECT 1 FROM audit_events e WHERE e.entity_id = b.id AND e.action = 'booking.requested')
                """).query(Long.class).single();
        assertThat(withoutTimeline).isZero();

        // the demo password matches every demo account, and all emails are fictional (.example)
        var hashes = jdbc.sql("SELECT DISTINCT password_hash FROM users WHERE email LIKE '%@demo.spareslot.example'")
                .query(String.class).list();
        assertThat(hashes).hasSize(1);
        assertThat(new BCryptPasswordEncoder().matches("SpareSlot-demo-2026", hashes.getFirst())).isTrue();
        List<String> emails = jdbc.sql("SELECT email FROM users").query(String.class).list();
        assertThat(emails).allMatch(e -> e.endsWith(".example") || e.endsWith(".invalid"));

        // and the schema rules still hold on top of the seed
        assertThat(jdbc.sql("SELECT count(*) FROM organisations WHERE NOT verified").query(Long.class).single()).isEqualTo(1);
    }
}
