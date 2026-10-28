package org.spareslot.resources;

import org.spareslot.auth.Actor;
import org.spareslot.common.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Public organisation profiles: kind, location, the verified badge and their resources. */
@RestController
@RequestMapping("/api/organisations")
public class OrganisationController {

    private final JdbcClient jdbc;
    private final ResourceService resources;

    public OrganisationController(JdbcClient jdbc, ResourceService resources) {
        this.jdbc = jdbc;
        this.resources = resources;
    }

    public record Organisation(UUID id, String name, String kind, String description, String location,
                               boolean verified, OffsetDateTime verifiedAt, long resourceCount) {}

    public record OrganisationProfile(Organisation organisation, List<ResourceService.ResourceCard> resources) {}

    private static final String SELECT = """
            SELECT o.id, o.name, o.kind, o.description, o.location, o.verified, o.verified_at,
                   (SELECT count(*) FROM resources r WHERE r.org_id = o.id AND r.active) AS resource_count
            FROM organisations o
            """;

    @GetMapping
    public List<Organisation> list() {
        return jdbc.sql(SELECT + " WHERE o.verified ORDER BY o.name").query(Organisation.class).list();
    }

    @GetMapping("/{id}")
    public OrganisationProfile profile(Actor actor, @PathVariable UUID id) {
        var org = jdbc.sql(SELECT + " WHERE o.id = :id").param("id", id).query(Organisation.class).optional()
                .orElseThrow(() -> ApiException.notFound("Organisation"));
        boolean own = actor != null && id.equals(actor.orgId());
        if (!org.verified() && !own && (actor == null || !actor.isAdmin())) throw ApiException.notFound("Organisation");
        var list = own ? resources.ofMyOrganisation(actor)
                : resources.search(actor, null, null, id, false, 0, 100).items();
        return new OrganisationProfile(org, list);
    }
}
