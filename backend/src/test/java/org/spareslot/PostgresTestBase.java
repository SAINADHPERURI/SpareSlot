package org.spareslot;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * One PostgreSQL 16 container for the whole test run, with the real migrations (V1, V2, V3 and the backend's
 * V10+). The demo seed (db/seed) is left out so tests start from known data.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public abstract class PostgresTestBase {

    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    static {
        POSTGRES.start();
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        r.add("spring.datasource.username", POSTGRES::getUsername);
        r.add("spring.datasource.password", POSTGRES::getPassword);
        r.add("spring.flyway.locations", () -> "classpath:db/migration");
        r.add("spareslot.jwt-secret", () -> "test-only-secret-that-is-at-least-32-bytes-long");
        r.add("spareslot.jobs-enabled", () -> "false");
        r.add("spareslot.demo-login-enabled", () -> "true");
    }
}
