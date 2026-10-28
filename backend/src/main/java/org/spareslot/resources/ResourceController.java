package org.spareslot.resources;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.spareslot.auth.Actor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
public class ResourceController {

    private final ResourceService resources;

    public ResourceController(ResourceService resources) {
        this.resources = resources;
    }

    public record ResourceRequest(
            @NotBlank @Size(max = 160) String name,
            @NotBlank @Pattern(regexp = "equipment|space") String category,
            @Size(max = 4000) String description,
            @Size(max = 300) String location,
            @Size(max = 4000) String conditions,
            @Min(1) @Max(168) int maxBookingHours,
            @Min(1) @Max(168) int weeklyHourCap,
            @Min(0) @Max(10_000_000) int depositMinor,
            boolean active,
            List<@Pattern(regexp = "student_id|research_affiliation|creator_portfolio|team_registration|safety_induction|other") String> requirements) {

        ResourceService.ResourceForm toForm() {
            return new ResourceService.ResourceForm(name, category, description, location, conditions,
                    maxBookingHours, weeklyHourCap, depositMinor, active, requirements);
        }
    }

    public record Created(UUID id) {}

    @GetMapping("/api/resources")
    public ResourceService.Page<ResourceService.ResourceCard> search(
            Actor actor,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) UUID orgId,
            @RequestParam(defaultValue = "false") boolean eligible,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "24") int size) {
        return resources.search(actor, q, category, orgId, eligible, Math.max(page, 0), Math.clamp(size, 1, 100));
    }

    @GetMapping("/api/resources/{id}")
    public ResourceService.ResourceDetail detail(Actor actor, @PathVariable UUID id) {
        return resources.detail(actor, id);
    }

    @PostMapping("/api/resources")
    @PreAuthorize("hasRole('OWNER')")
    @ResponseStatus(HttpStatus.CREATED)
    public Created create(Actor actor, @Valid @RequestBody ResourceRequest body) {
        return new Created(resources.create(actor, body.toForm()));
    }

    @PutMapping("/api/resources/{id}")
    @PreAuthorize("hasRole('OWNER')")
    public ResourceService.ResourceDetail update(Actor actor, @PathVariable UUID id, @Valid @RequestBody ResourceRequest body) {
        resources.update(actor, id, body.toForm());
        return resources.detail(actor, id);
    }

    /** The staff view: every resource of their own organisation, including inactive ones. */
    @GetMapping("/api/org/resources")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    public List<ResourceService.ResourceCard> mine(Actor actor) {
        return resources.ofMyOrganisation(actor);
    }
}
