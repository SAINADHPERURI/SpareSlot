package org.spareslot.bookings;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.spareslot.auth.Actor;
import org.spareslot.deposits.DepositService;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestController
public class BookingController {

    private final BookingService service;
    private final BookingViews views;
    private final DepositService deposits;

    public BookingController(BookingService service, BookingViews views, DepositService deposits) {
        this.service = service;
        this.views = views;
        this.deposits = deposits;
    }

    public record CreateBooking(@NotNull UUID resourceId, @NotNull OffsetDateTime startAt, @NotNull OffsetDateTime endAt,
                                @NotBlank @Size(max = 1000) String purpose) {}

    public record Decision(@NotBlank @Pattern(regexp = "approve|reject|waitlist") String action,
                           @Size(max = 1000) String reason) {}

    public record Reason(@Size(max = 1000) String reason) {}

    public record ConditionRequest(@NotBlank @Pattern(regexp = "good|minor_wear|damaged") String rating,
                                   @Size(max = 2000) String notes) {}

    @PostMapping("/api/bookings")
    @PreAuthorize("hasRole('USER')")
    @ResponseStatus(HttpStatus.CREATED)
    public BookingViews.Detail create(Actor actor, @Valid @RequestBody CreateBooking body) {
        UUID id = service.request(actor, new BookingService.RequestForm(body.resourceId(), body.startAt(), body.endAt(), body.purpose()));
        return views.detail(actor, id);
    }

    @GetMapping("/api/bookings")
    public List<BookingViews.Summary> list(Actor actor,
                                           @RequestParam(defaultValue = "false") boolean mine,
                                           @RequestParam(required = false) String status,
                                           @RequestParam(required = false) UUID resourceId,
                                           @RequestParam(required = false) UUID orgId,
                                           @RequestParam(required = false) Boolean overdue) {
        return views.list(actor, new BookingViews.ListFilter(mine, status, resourceId, orgId, overdue));
    }

    @GetMapping("/api/bookings/{id}")
    public BookingViews.Detail detail(Actor actor, @PathVariable UUID id) {
        return views.detail(actor, id);
    }

    @GetMapping("/api/bookings/{id}/events")
    public List<BookingViews.Event> events(Actor actor, @PathVariable UUID id) {
        return views.events(actor, id);
    }

    @PostMapping("/api/bookings/{id}/decision")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    public BookingViews.Detail decide(Actor actor, @PathVariable UUID id, @Valid @RequestBody Decision body) {
        service.decide(actor, id, body.action(), body.reason());
        return views.detail(actor, id);
    }

    @PostMapping("/api/bookings/{id}/cancel")
    @PreAuthorize("hasAnyRole('USER','OWNER','MANAGER')")
    public BookingViews.Detail cancel(Actor actor, @PathVariable UUID id, @Valid @RequestBody Reason body) {
        service.cancel(actor, id, body.reason());
        return views.detail(actor, id);
    }

    @PostMapping("/api/bookings/{id}/check-in")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    public BookingViews.Detail checkIn(Actor actor, @PathVariable UUID id, @Valid @RequestBody ConditionRequest body) {
        service.checkIn(actor, id, new BookingService.ConditionForm(body.rating(), body.notes()));
        return views.detail(actor, id);
    }

    @PostMapping("/api/bookings/{id}/return")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    public BookingViews.Detail returnItem(Actor actor, @PathVariable UUID id, @Valid @RequestBody ConditionRequest body) {
        service.returnItem(actor, id, new BookingService.ConditionForm(body.rating(), body.notes()));
        return views.detail(actor, id);
    }

    @PostMapping("/api/bookings/{id}/close")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    public BookingViews.Detail close(Actor actor, @PathVariable UUID id, @RequestBody(required = false) Reason body) {
        service.close(actor, id, body == null ? null : body.reason());
        return views.detail(actor, id);
    }

    // ------------------------------------------------------------------ deposit (SPEC section 4b)

    @GetMapping("/api/bookings/{id}/deposit")
    public DepositService.DepositView deposit(Actor actor, @PathVariable UUID id) {
        return deposits.view(actor, id);
    }

    @PostMapping("/api/bookings/{id}/deposit/pay")
    @PreAuthorize("hasRole('USER')")
    public DepositService.DepositView pay(Actor actor, @PathVariable UUID id) {
        deposits.pay(actor, id);
        return deposits.view(actor, id);
    }

    @PostMapping("/api/bookings/{id}/deposit/waive")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    public DepositService.DepositView waive(Actor actor, @PathVariable UUID id, @Valid @RequestBody Reason body) {
        deposits.waive(actor, id, body.reason());
        return deposits.view(actor, id);
    }

    @PostMapping("/api/bookings/{id}/deposit/refund")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    public DepositService.DepositView refund(Actor actor, @PathVariable UUID id, @Valid @RequestBody Reason body) {
        deposits.refund(actor, id, body.reason());
        return deposits.view(actor, id);
    }

    @PostMapping("/api/bookings/{id}/deposit/forfeit")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    public DepositService.DepositView forfeit(Actor actor, @PathVariable UUID id, @Valid @RequestBody Reason body) {
        deposits.forfeit(actor, id, body.reason());
        return deposits.view(actor, id);
    }

    @GetMapping("/api/deposits/to-resolve")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    public List<DepositService.ToResolve> toResolve(Actor actor) {
        return deposits.toResolve(actor);
    }
}
