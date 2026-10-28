package org.spareslot.config;

import org.spareslot.auth.Actor;
import org.spareslot.common.ApiException;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import java.util.UUID;

/**
 * Lets a controller take an {@link Actor} parameter. The actor is built from the JWT claims (sub, role, org)
 * and nothing else. On public endpoints an anonymous caller gets null.
 * A user suspended after their token was issued is refused here, so suspension takes effect at once.
 */
@Component
public class ActorArgumentResolver implements HandlerMethodArgumentResolver {

    private final JdbcClient jdbc;

    public ActorArgumentResolver(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.getParameterType().equals(Actor.class);
    }

    @Override
    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mav, NativeWebRequest request,
                                  WebDataBinderFactory binderFactory) {
        if (!(SecurityContextHolder.getContext().getAuthentication() instanceof JwtAuthenticationToken token)) {
            return null;
        }
        var jwt = token.getToken();
        UUID userId = UUID.fromString(jwt.getSubject());
        String org = jwt.getClaimAsString("org");
        String status = jdbc.sql("SELECT status FROM users WHERE id = :id").param("id", userId)
                .query(String.class).optional().orElse("missing");
        if (!"active".equals(status)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "account_suspended",
                    "This account is suspended or no longer exists. Contact the platform admin.", null);
        }
        return new Actor(userId, jwt.getClaimAsString("role"), org == null ? null : UUID.fromString(org));
    }
}
