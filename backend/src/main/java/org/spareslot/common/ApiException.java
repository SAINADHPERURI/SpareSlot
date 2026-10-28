package org.spareslot.common;

import org.springframework.http.HttpStatus;

/**
 * An error the client can act on. Serialised as {code, message, rule}.
 * Rule failures use 422 and always say, in plain words, which rule blocked the action and what to do next.
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final String rule;

    public ApiException(HttpStatus status, String code, String message, String rule) {
        super(message);
        this.status = status;
        this.code = code;
        this.rule = rule;
    }

    /** 422: a rule blocked the action. Nothing was changed. */
    public static ApiException rule(String code, String rule, String message) {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, code, message, rule);
    }

    /** 404: missing, or belongs to another organisation (existence is not leaked). */
    public static ApiException notFound(String what) {
        return new ApiException(HttpStatus.NOT_FOUND, "not_found", what + " was not found.", null);
    }

    public static ApiException forbidden(String message) {
        return new ApiException(HttpStatus.FORBIDDEN, "forbidden", message, null);
    }

    public static ApiException badRequest(String code, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, message, null);
    }

    public static ApiException conflict(String code, String message) {
        return new ApiException(HttpStatus.CONFLICT, code, message, null);
    }

    public HttpStatus status() { return status; }
    public String code() { return code; }
    public String rule() { return rule; }
}
