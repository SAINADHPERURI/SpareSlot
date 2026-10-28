package org.spareslot.common;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.Map;

/** {code, message, rule}. details is optional, e.g. the missing credential kinds for an eligibility failure. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ErrorBody(String code, String message, String rule, Map<String, Object> details) {

    public ErrorBody(String code, String message, String rule) {
        this(code, message, rule, null);
    }
}
