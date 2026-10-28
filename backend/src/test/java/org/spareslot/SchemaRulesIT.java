package org.spareslot;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;

import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.sql.SQLWarning;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Runs the contract's schema_rules_test.sql against the migrated database. The script rolls itself back and
 * raises if any check fails; every check reports PASS or FAIL as a NOTICE.
 */
class SchemaRulesIT extends PostgresTestBase {

    @Autowired
    DataSource dataSource;

    @Test
    void schemaRulesHold() throws Exception {
        String script = new ClassPathResource("schema_rules_test.sql").getContentAsString(StandardCharsets.UTF_8);
        List<String> notices = new ArrayList<>();
        try (var conn = dataSource.getConnection(); var st = conn.createStatement()) {
            conn.setAutoCommit(true);
            try {
                st.execute(script);
            } finally {
                for (SQLWarning w = st.getWarnings(); w != null; w = w.getNextWarning()) notices.add(w.getMessage());
                notices.forEach(System.out::println);
            }
        }
        assertThat(notices).noneMatch(n -> n.startsWith("FAIL"));
        assertThat(notices).anyMatch(n -> n.matches("\\d+ checks, 0 failed"));
    }
}
