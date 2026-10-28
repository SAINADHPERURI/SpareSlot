package org.spareslot.resources;

import org.spareslot.auth.Actor;
import org.spareslot.common.ApiException;
import org.spareslot.common.AuditService;
import org.spareslot.credentials.EligibilityService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.*;

@Service
public class ResourceService {

    private final JdbcClient jdbc;
    private final EligibilityService eligibility;
    private final AuditService audit;

    public ResourceService(JdbcClient jdbc, EligibilityService eligibility, AuditService audit) {
        this.jdbc = jdbc;
        this.eligibility = eligibility;
        this.audit = audit;
    }

    /** A resource row joined with its organisation. */
    public record ResourceRow(UUID id, UUID orgId, String orgName, String orgKind, boolean orgVerified, String name,
                              String category, String description, String location, String conditions,
                              int maxBookingHours, int weeklyHourCap, int depositMinor, boolean active,
                              OffsetDateTime createdAt, UUID coverPhotoId) {}

    /**
     * What a borrower must understand before requesting. eligible and missingCredentials are null for an
     * anonymous visitor, and for staff and admins, who do not borrow.
     */
    public record ResourceCard(UUID id, UUID orgId, String orgName, String orgKind, boolean orgVerified, String name,
                               String category, String description, String location, String conditions,
                               int maxBookingHours, int weeklyHourCap, int depositMinor, boolean active,
                               List<String> requirements, UUID coverPhotoId, Boolean eligible,
                               List<String> missingCredentials) {}

    public record BookedWindow(OffsetDateTime startAt, OffsetDateTime endAt, String status) {}

    public record PhotoMeta(UUID id, String caption, int position, OffsetDateTime createdAt) {}

    public record ResourceDetail(ResourceCard resource, List<PhotoMeta> photos, List<BookedWindow> bookedWindows,
                                 Double myHoursThisWeek, boolean canEdit) {}

    public record Page<T>(List<T> items, int page, int size, long total) {}

    private static final String SELECT = """
            SELECT r.id, r.org_id, o.name AS org_name, o.kind AS org_kind, o.verified AS org_verified, r.name,
                   r.category, r.description, r.location, r.conditions, r.max_booking_hours, r.weekly_hour_cap,
                   r.deposit_minor, r.active, r.created_at,
                   (SELECT p.id FROM resource_photos p WHERE p.resource_id = r.id
                    ORDER BY p.position, p.created_at LIMIT 1) AS cover_photo_id
            FROM resources r JOIN organisations o ON o.id = r.org_id
            """;

    public Page<ResourceCard> search(Actor actor, String q, String category, UUID orgId, boolean eligibleOnly,
                                     int page, int size) {
        var sql = new StringBuilder(SELECT).append(" WHERE r.active AND o.verified");
        var params = new HashMap<String, Object>();
        if (q != null && !q.isBlank()) {
            sql.append(" AND (r.name ILIKE :q OR r.description ILIKE :q OR r.location ILIKE :q OR o.name ILIKE :q OR r.conditions ILIKE :q)");
            params.put("q", "%" + q.trim().replace("%", "\\%").replace("_", "\\_") + "%");
        }
        if (category != null && !category.isBlank()) {
            sql.append(" AND r.category = :category");
            params.put("category", category);
        }
        if (orgId != null) {
            sql.append(" AND r.org_id = :orgId");
            params.put("orgId", orgId);
        }
        sql.append(" ORDER BY r.name");
        var rows = jdbc.sql(sql.toString()).params(params).query(ResourceRow.class).list();
        var cards = toCards(actor, rows);
        if (eligibleOnly) cards = cards.stream().filter(c -> Boolean.TRUE.equals(c.eligible())).toList();
        int from = Math.min(page * size, cards.size());
        int to = Math.min(from + size, cards.size());
        return new Page<>(cards.subList(from, to), page, size, cards.size());
    }

    /** Every resource of the actor's organisation, including inactive ones. */
    public List<ResourceCard> ofMyOrganisation(Actor actor) {
        var rows = jdbc.sql(SELECT + " WHERE r.org_id = :org ORDER BY r.name").param("org", actor.orgId())
                .query(ResourceRow.class).list();
        return toCards(actor, rows);
    }

    public ResourceDetail detail(Actor actor, UUID id) {
        var row = visibleRow(actor, id);
        var card = toCards(actor, List.of(row)).getFirst();
        var photos = jdbc.sql("""
                SELECT id, caption, position, created_at FROM resource_photos WHERE resource_id = :r ORDER BY position, created_at
                """).param("r", id).query(PhotoMeta.class).list();
        var windows = jdbc.sql("""
                SELECT start_at, end_at, status FROM bookings
                WHERE resource_id = :r AND status IN ('approved', 'checked_in') AND end_at > now()
                ORDER BY start_at LIMIT 50
                """).param("r", id).query(BookedWindow.class).list();
        Double myHours = null;
        if (actor != null && actor.isUser()) {
            myHours = jdbc.sql("""
                    SELECT coalesce(sum(w.hours), 0)::float8 FROM v_weekly_usage w
                    WHERE w.resource_id = :r AND w.subject_id = (SELECT coalesce(team_id, id) FROM users WHERE id = :u)
                      AND w.week_start = date_trunc('week', now() AT TIME ZONE 'UTC')
                    """).param("r", id).param("u", actor.userId()).query(Double.class).single();
        }
        boolean canEdit = actor != null && "owner".equals(actor.role()) && row.orgId().equals(actor.orgId());
        return new ResourceDetail(card, photos, windows, myHours, canEdit);
    }

    /** Public if active and the organisation is verified; otherwise only its own staff see it (404 for others). */
    public ResourceRow visibleRow(Actor actor, UUID id) {
        var row = jdbc.sql(SELECT + " WHERE r.id = :id").param("id", id).query(ResourceRow.class).optional()
                .orElseThrow(() -> ApiException.notFound("Resource"));
        boolean publicVisible = row.active() && row.orgVerified();
        if (!publicVisible && (actor == null || !(actor.isStaffOf(row.orgId()) || actor.isAdmin()))) {
            throw ApiException.notFound("Resource");
        }
        return row;
    }

    private List<ResourceCard> toCards(Actor actor, List<ResourceRow> rows) {
        var reqs = eligibility.requirements(rows.stream().map(ResourceRow::id).toList());
        boolean borrower = actor != null && actor.isUser();
        Set<String> held = borrower ? eligibility.verifiedKinds(actor.userId()) : Set.of();
        var cards = new ArrayList<ResourceCard>(rows.size());
        for (var r : rows) {
            var required = reqs.getOrDefault(r.id(), List.of());
            List<String> missing = borrower ? eligibility.missing(required, held) : null;
            cards.add(new ResourceCard(r.id(), r.orgId(), r.orgName(), r.orgKind(), r.orgVerified(), r.name(),
                    r.category(), r.description(), r.location(), r.conditions(), r.maxBookingHours(),
                    r.weeklyHourCap(), r.depositMinor(), r.active(), required, r.coverPhotoId(),
                    borrower ? missing.isEmpty() : null, missing));
        }
        return cards;
    }

    // ------------------------------------------------------------------ owner writes

    public record ResourceForm(String name, String category, String description, String location, String conditions,
                               int maxBookingHours, int weeklyHourCap, int depositMinor, boolean active,
                               List<String> requirements) {}

    @Transactional
    public UUID create(Actor actor, ResourceForm f) {
        UUID id = jdbc.sql("""
                INSERT INTO resources (org_id, name, category, description, location, conditions,
                                       max_booking_hours, weekly_hour_cap, deposit_minor, active)
                VALUES (:org, :name, :category, :description, :location, :conditions, :max, :cap, :deposit, :active)
                RETURNING id
                """)
                .param("org", actor.orgId()).param("name", f.name().trim()).param("category", f.category())
                .param("description", nz(f.description())).param("location", nz(f.location()))
                .param("conditions", nz(f.conditions())).param("max", f.maxBookingHours())
                .param("cap", f.weeklyHourCap()).param("deposit", f.depositMinor()).param("active", f.active())
                .query(UUID.class).single();
        writeRequirements(id, f.requirements());
        audit.record(actor, "resource.created", "resource", id, null, null, null, snapshot(f));
        return id;
    }

    @Transactional
    public void update(Actor actor, UUID id, ResourceForm f) {
        var before = jdbc.sql("SELECT * FROM resources WHERE id = :id FOR UPDATE").param("id", id)
                .query().singleRow();
        if (!Objects.equals(before.get("org_id"), actor.orgId())) throw ApiException.notFound("Resource");
        var beforeReqs = eligibility.requirements(id);
        jdbc.sql("""
                UPDATE resources SET name = :name, category = :category, description = :description,
                       location = :location, conditions = :conditions, max_booking_hours = :max,
                       weekly_hour_cap = :cap, deposit_minor = :deposit, active = :active
                WHERE id = :id
                """)
                .param("id", id).param("name", f.name().trim()).param("category", f.category())
                .param("description", nz(f.description())).param("location", nz(f.location()))
                .param("conditions", nz(f.conditions())).param("max", f.maxBookingHours())
                .param("cap", f.weeklyHourCap()).param("deposit", f.depositMinor()).param("active", f.active())
                .update();
        writeRequirements(id, f.requirements());

        // the audit event lists exactly what changed, from and to
        var changes = new LinkedHashMap<String, Object>();
        var after = snapshot(f);
        Map<String, Object> old = new LinkedHashMap<>();
        old.put("name", before.get("name"));
        old.put("category", before.get("category"));
        old.put("description", before.get("description"));
        old.put("location", before.get("location"));
        old.put("conditions", before.get("conditions"));
        old.put("maxBookingHours", before.get("max_booking_hours"));
        old.put("weeklyHourCap", before.get("weekly_hour_cap"));
        old.put("depositMinor", before.get("deposit_minor"));
        old.put("active", before.get("active"));
        old.put("requirements", beforeReqs);
        for (var e : after.entrySet()) {
            if (!Objects.equals(String.valueOf(old.get(e.getKey())), String.valueOf(e.getValue()))) {
                changes.put(e.getKey(), Map.of("from", String.valueOf(old.get(e.getKey())), "to", String.valueOf(e.getValue())));
            }
        }
        if (!changes.isEmpty()) {
            audit.record(actor, "resource.updated", "resource", id, null, null,
                    "Changed: " + String.join(", ", changes.keySet()), changes);
        }
    }

    private void writeRequirements(UUID resourceId, List<String> kinds) {
        jdbc.sql("DELETE FROM resource_requirements WHERE resource_id = :r").param("r", resourceId).update();
        for (String kind : new TreeSet<>(kinds == null ? List.of() : kinds)) {
            jdbc.sql("INSERT INTO resource_requirements (resource_id, credential_kind) VALUES (:r, :k)")
                    .param("r", resourceId).param("k", kind).update();
        }
    }

    private static Map<String, Object> snapshot(ResourceForm f) {
        var m = new LinkedHashMap<String, Object>();
        m.put("name", f.name().trim());
        m.put("category", f.category());
        m.put("description", nz(f.description()));
        m.put("location", nz(f.location()));
        m.put("conditions", nz(f.conditions()));
        m.put("maxBookingHours", f.maxBookingHours());
        m.put("weeklyHourCap", f.weeklyHourCap());
        m.put("depositMinor", f.depositMinor());
        m.put("active", f.active());
        m.put("requirements", new ArrayList<>(new TreeSet<>(f.requirements() == null ? List.of() : f.requirements())));
        return m;
    }

    private static String nz(String s) {
        return s == null ? "" : s.trim();
    }
}
