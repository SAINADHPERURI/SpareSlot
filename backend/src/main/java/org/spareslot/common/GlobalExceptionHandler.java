package org.spareslot.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

import java.sql.SQLException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ErrorBody> api(ApiException e) {
        return ResponseEntity.status(e.status()).body(new ErrorBody(e.code(), e.getMessage(), e.rule(), e.details()));
    }

    @ExceptionHandler({AccessDeniedException.class, AuthorizationDeniedException.class})
    ResponseEntity<ErrorBody> denied(Exception e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(new ErrorBody("forbidden", "Your role cannot do this.", null));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ErrorBody> invalid(MethodArgumentNotValidException e) {
        var first = e.getBindingResult().getFieldErrors().stream().findFirst();
        String message = first.map(f -> labelOf(f.getField()) + " " + f.getDefaultMessage())
                .orElse("The request is not valid.");
        return ResponseEntity.badRequest().body(new ErrorBody("invalid_request", message, null));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class, MissingServletRequestPartException.class})
    ResponseEntity<ErrorBody> unreadable(Exception e) {
        return ResponseEntity.badRequest()
                .body(new ErrorBody("invalid_request", "The request is missing a field or has a field in the wrong format.", null));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<ErrorBody> tooLarge(MaxUploadSizeExceededException e) {
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                .body(new ErrorBody("photo_too_large", "Photos can be at most 5 MB. Choose a smaller photo.", "photo_size"));
    }

    /**
     * The database is the last line of defence. Its messages are for logs, not for users (SPEC 4b rule 5),
     * so the service checks every rule first; reaching this handler means a race or a missed pre-check.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ErrorBody> integrity(DataIntegrityViolationException e) {
        String state = sqlState(e);
        log.warn("database refused a change (SQLSTATE {}): {}", state, e.getMostSpecificCause().getMessage());
        if ("23P01".equals(state)) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(new ErrorBody("slot_taken",
                    "Another booking already holds this time. Choose a different window.", "no_overlap"));
        }
        if ("23505".equals(state)) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorBody("duplicate",
                    "This has already been recorded.", null));
        }
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(new ErrorBody("rule_violation",
                "This action breaks a booking rule, so nothing was changed. Refresh the page and try again.", "database"));
    }

    private static String sqlState(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof SQLException s && s.getSQLState() != null) return s.getSQLState();
        }
        return null;
    }

    private static String labelOf(String field) {
        return field.replaceAll("([A-Z])", " $1").toLowerCase().trim();
    }
}
