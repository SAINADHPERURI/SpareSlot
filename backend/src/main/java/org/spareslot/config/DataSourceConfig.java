package org.spareslot.config;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.net.URI;

/**
 * Accepts DATABASE_URL either as a JDBC URL or in the postgres://user:password@host:port/db form that most
 * hosts hand out. Only active when DATABASE_URL uses the postgres:// form.
 */
@Configuration
@ConditionalOnExpression("'${spring.datasource.url:}'.startsWith('postgres')")
public class DataSourceConfig {

    @Bean
    HikariDataSource dataSource(DataSourceProperties props) {
        URI uri = URI.create(props.getUrl());
        var ds = new HikariDataSource();
        int port = uri.getPort() == -1 ? 5432 : uri.getPort();
        String query = uri.getQuery() == null ? "" : "?" + uri.getQuery();
        ds.setJdbcUrl("jdbc:postgresql://" + uri.getHost() + ":" + port + uri.getPath() + query);
        if (uri.getUserInfo() != null) {
            String[] parts = uri.getUserInfo().split(":", 2);
            ds.setUsername(java.net.URLDecoder.decode(parts[0], java.nio.charset.StandardCharsets.UTF_8));
            if (parts.length > 1) {
                ds.setPassword(java.net.URLDecoder.decode(parts[1], java.nio.charset.StandardCharsets.UTF_8));
            }
        } else {
            ds.setUsername(props.getUsername());
            ds.setPassword(props.getPassword());
        }
        ds.setMaximumPoolSize(8);
        return ds;
    }
}
