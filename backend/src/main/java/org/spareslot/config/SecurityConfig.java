package org.spareslot.config;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;

/** SPEC section 5: stateless JWT (HS256), coarse roles with @PreAuthorize, organisation scoping in services. */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain api(HttpSecurity http, JsonAuthErrors errors) throws Exception {
        return http
                .csrf(csrf -> csrf.disable())                                     // stateless, bearer tokens
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .cors(Customizer.withDefaults())
                .authorizeHttpRequests(a -> a
                        .requestMatchers("/api/auth/**", "/actuator/health", "/api/docs/**", "/v3/api-docs/**",
                                "/swagger-ui/**").permitAll()
                        // browsing is public; writes need a token
                        .requestMatchers(HttpMethod.GET, "/api/resources/**", "/api/resource-photos/**",
                                "/api/organisations/**").permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(o -> o
                        .jwt(j -> j.jwtAuthenticationConverter(roleConverter()))
                        .authenticationEntryPoint(errors))
                .exceptionHandling(e -> e.authenticationEntryPoint(errors).accessDeniedHandler(errors))
                .build();
    }

    /** role claim "manager" becomes authority ROLE_MANAGER */
    private JwtAuthenticationConverter roleConverter() {
        var c = new JwtAuthenticationConverter();
        c.setJwtGrantedAuthoritiesConverter(jwt ->
                List.of(new SimpleGrantedAuthority("ROLE_" + jwt.getClaimAsString("role").toUpperCase())));
        return c;
    }

    /**
     * The signing key comes from JWT_SECRET. Only for a local demo (ALLOW_GENERATED_JWT_SECRET=true) may a missing
     * secret be replaced by a random one; tokens then stop working when the backend restarts.
     */
    @Bean
    SecretKey jwtKey(@Value("${spareslot.jwt-secret}") String secret,
                     @Value("${spareslot.allow-generated-jwt-secret}") boolean allowGenerated) {
        if ((secret == null || secret.isBlank()) && allowGenerated) {
            org.slf4j.LoggerFactory.getLogger(SecurityConfig.class)
                    .warn("JWT_SECRET is not set; using a random secret for this run only (local demo mode).");
            byte[] random = new byte[48];
            new java.security.SecureRandom().nextBytes(random);
            return new SecretKeySpec(random, "HmacSHA256");
        }
        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException("Set the JWT_SECRET environment variable to at least 32 characters.");
        }
        return new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    }

    @Bean
    JwtDecoder jwtDecoder(SecretKey key) {
        return NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
    }

    @Bean
    JwtEncoder jwtEncoder(SecretKey key) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(key));
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /** CORS allows only the frontend origin(s), from configuration. */
    @Bean
    CorsConfigurationSource corsConfigurationSource(@Value("${spareslot.cors-origins}") String origins) {
        var config = new CorsConfiguration();
        config.setAllowedOrigins(Arrays.stream(origins.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        config.setMaxAge(3600L);
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }
}
