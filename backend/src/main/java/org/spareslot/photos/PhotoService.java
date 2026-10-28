package org.spareslot.photos;

import org.spareslot.auth.Actor;
import org.spareslot.bookings.BookingRepository;
import org.spareslot.common.ApiException;
import org.spareslot.common.AuditService;
import org.spareslot.resources.ResourceService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;

/**
 * Listing photos (the owner's, public) and condition photos (evidence for one booking, from both sides,
 * never edited or deleted, visible only to the requester and the organisation's staff).
 */
@Service
public class PhotoService {

    static final int MAX_PER_SIDE_PER_PHASE = 6;
    static final int MAX_LISTING_PHOTOS = 8;

    private final JdbcClient jdbc;
    private final ImageSanitizer sanitizer;
    private final BookingRepository bookings;
    private final ResourceService resources;
    private final AuditService audit;

    public PhotoService(JdbcClient jdbc, ImageSanitizer sanitizer, BookingRepository bookings,
                        ResourceService resources, AuditService audit) {
        this.jdbc = jdbc;
        this.sanitizer = sanitizer;
        this.bookings = bookings;
        this.resources = resources;
        this.audit = audit;
    }

    public record BookingPhoto(UUID id, String phase, String side, String caption, UUID uploadedBy,
                               String uploadedByName, OffsetDateTime createdAt) {}

    public record Content(String contentType, byte[] bytes) {}

    // ------------------------------------------------------------------ condition photos

    @Transactional
    public BookingPhoto addBookingPhoto(Actor actor, UUID bookingId, byte[] file, String phase, String caption) {
        var b = bookings.lock(bookingId);
        bookings.checkVisible(actor, b);
        String side;
        if (actor.isUser() && b.requesterId().equals(actor.userId())) side = "borrower";
        else if (actor.isStaffOf(b.orgId())) side = "staff";
        else throw ApiException.forbidden("Only the borrower and this organisation's staff add condition photos.");

        if (!List.of("check_in", "return", "incident").contains(phase)) {
            throw ApiException.badRequest("invalid_request", "The phase must be check_in, return or incident.");
        }
        if (!List.of("approved", "checked_in", "returned").contains(b.status())) {
            throw ApiException.rule("photo_booking_state", "photo_window",
                    "Photos can be added only while a booking is approved, checked in or returned. This one is "
                            + b.status().replace('_', ' ') + ", so its evidence is final.");
        }
        long count = jdbc.sql("SELECT count(*) FROM booking_photos WHERE booking_id = :b AND side = :s AND phase = :p")
                .param("b", b.id()).param("s", side).param("p", phase).query(Long.class).single();
        if (count >= MAX_PER_SIDE_PER_PHASE) {
            throw ApiException.rule("photo_limit", "photo_limit",
                    "You have already added " + MAX_PER_SIDE_PER_PHASE + " photos for this step. That is the limit per side.");
        }
        var clean = sanitizer.sanitize(file);
        UUID blobId = insertBlob(clean);
        String cap = caption == null ? "" : caption.trim();
        UUID photoId = jdbc.sql("""
                INSERT INTO booking_photos (booking_id, phase, side, blob_id, caption, uploaded_by)
                VALUES (:b, :p, :s, :blob, :c, :u) RETURNING id
                """).param("b", b.id()).param("p", phase).param("s", side).param("blob", blobId).param("c", cap)
                .param("u", actor.userId()).query(UUID.class).single();
        var details = new LinkedHashMap<String, Object>();
        details.put("photoId", photoId.toString());
        details.put("phase", phase);
        details.put("side", side);
        audit.record(actor, "photo.added", "booking", b.id(), null, null, cap.isEmpty() ? null : cap, details);
        return bookingPhotos(actor, bookingId).stream().filter(p -> p.id().equals(photoId)).findFirst().orElseThrow();
    }

    public List<BookingPhoto> bookingPhotos(Actor actor, UUID bookingId) {
        bookings.visible(actor, bookingId);
        return jdbc.sql("""
                SELECT p.id, p.phase, p.side, p.caption, p.uploaded_by, u.full_name AS uploaded_by_name, p.created_at
                FROM booking_photos p JOIN users u ON u.id = p.uploaded_by
                WHERE p.booking_id = :b ORDER BY p.phase, p.side, p.created_at
                """).param("b", bookingId).query(BookingPhoto.class).list();
    }

    /** Booking photo bytes, after the same visibility check as the booking itself. */
    public Content bookingPhotoContent(Actor actor, UUID photoId) {
        UUID bookingId = jdbc.sql("SELECT booking_id FROM booking_photos WHERE id = :id").param("id", photoId)
                .query(UUID.class).optional().orElseThrow(() -> ApiException.notFound("Photo"));
        try {
            bookings.visible(actor, bookingId);
        } catch (ApiException e) {
            throw ApiException.notFound("Photo");
        }
        return jdbc.sql("""
                SELECT b.content_type, b.content FROM booking_photos p JOIN photo_blobs b ON b.id = p.blob_id WHERE p.id = :id
                """).param("id", photoId).query((rs, i) -> new Content(rs.getString(1), rs.getBytes(2))).single();
    }

    // ------------------------------------------------------------------ listing photos

    @Transactional
    public ResourceService.PhotoMeta addListingPhoto(Actor actor, UUID resourceId, byte[] file, String caption) {
        var r = resources.visibleRow(actor, resourceId);
        if (!r.orgId().equals(actor.orgId())) throw ApiException.notFound("Resource");
        long count = jdbc.sql("SELECT count(*) FROM resource_photos WHERE resource_id = :r").param("r", resourceId)
                .query(Long.class).single();
        if (count >= MAX_LISTING_PHOTOS) {
            throw ApiException.rule("photo_limit", "photo_limit",
                    "A listing can have at most " + MAX_LISTING_PHOTOS + " photos. Remove one before adding another.");
        }
        var clean = sanitizer.sanitize(file);
        UUID blobId = insertBlob(clean);
        String cap = caption == null ? "" : caption.trim();
        UUID id = jdbc.sql("""
                INSERT INTO resource_photos (resource_id, blob_id, caption, position, uploaded_by)
                VALUES (:r, :b, :c, :pos, :u) RETURNING id
                """).param("r", resourceId).param("b", blobId).param("c", cap).param("pos", (int) count)
                .param("u", actor.userId()).query(UUID.class).single();
        audit.record(actor, "photo.added", "resource", resourceId, null, null, cap.isEmpty() ? null : cap,
                java.util.Map.of("photoId", id.toString()));
        return jdbc.sql("SELECT id, caption, position, created_at FROM resource_photos WHERE id = :id").param("id", id)
                .query(ResourceService.PhotoMeta.class).single();
    }

    @Transactional
    public void removeListingPhoto(Actor actor, UUID resourceId, UUID photoId) {
        var r = resources.visibleRow(actor, resourceId);
        if (!r.orgId().equals(actor.orgId())) throw ApiException.notFound("Resource");
        UUID blobId = jdbc.sql("SELECT blob_id FROM resource_photos WHERE id = :id AND resource_id = :r")
                .param("id", photoId).param("r", resourceId).query(UUID.class).optional()
                .orElseThrow(() -> ApiException.notFound("Photo"));
        // deleting the blob removes the listing photo row with it (ON DELETE CASCADE)
        jdbc.sql("DELETE FROM photo_blobs WHERE id = :b").param("b", blobId).update();
        audit.record(actor, "photo.removed", "resource", resourceId, null, null, null,
                java.util.Map.of("photoId", photoId.toString()));
    }

    public List<ResourceService.PhotoMeta> listingPhotos(Actor actor, UUID resourceId) {
        resources.visibleRow(actor, resourceId);
        return jdbc.sql("SELECT id, caption, position, created_at FROM resource_photos WHERE resource_id = :r ORDER BY position, created_at")
                .param("r", resourceId).query(ResourceService.PhotoMeta.class).list();
    }

    public Content listingPhotoContent(UUID photoId) {
        return jdbc.sql("""
                SELECT b.content_type, b.content FROM resource_photos p JOIN photo_blobs b ON b.id = p.blob_id WHERE p.id = :id
                """).param("id", photoId).query((rs, i) -> new Content(rs.getString(1), rs.getBytes(2))).optional()
                .orElseThrow(() -> ApiException.notFound("Photo"));
    }

    private UUID insertBlob(ImageSanitizer.Clean clean) {
        return jdbc.sql("INSERT INTO photo_blobs (content_type, size_bytes, content) VALUES (:t, :s, :c) RETURNING id")
                .param("t", clean.contentType()).param("s", clean.bytes().length).param("c", clean.bytes())
                .query(UUID.class).single();
    }
}
