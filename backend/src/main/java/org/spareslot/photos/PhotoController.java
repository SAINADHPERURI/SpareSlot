package org.spareslot.photos;

import org.spareslot.auth.Actor;
import org.spareslot.resources.ResourceService;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

@RestController
public class PhotoController {

    private final PhotoService photos;

    public PhotoController(PhotoService photos) {
        this.photos = photos;
    }

    @PostMapping(path = "/api/bookings/{id}/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyRole('USER','OWNER','MANAGER')")
    @ResponseStatus(HttpStatus.CREATED)
    public PhotoService.BookingPhoto addBookingPhoto(Actor actor, @PathVariable UUID id,
                                                     @RequestParam("file") MultipartFile file,
                                                     @RequestParam("phase") String phase,
                                                     @RequestParam(value = "caption", required = false) String caption) throws IOException {
        return photos.addBookingPhoto(actor, id, file.getBytes(), phase, caption);
    }

    @GetMapping("/api/bookings/{id}/photos")
    public List<PhotoService.BookingPhoto> bookingPhotos(Actor actor, @PathVariable UUID id) {
        return photos.bookingPhotos(actor, id);
    }

    /** Condition photo bytes: private, never cached by shared caches, never sniffed. */
    @GetMapping("/api/photos/{id}/content")
    public ResponseEntity<byte[]> bookingPhotoContent(Actor actor, @PathVariable UUID id) {
        var c = photos.bookingPhotoContent(actor, id);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(c.contentType()))
                .cacheControl(CacheControl.noStore().cachePrivate())
                .header("X-Content-Type-Options", "nosniff")
                .body(c.bytes());
    }

    @PostMapping(path = "/api/resources/{id}/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('OWNER')")
    @ResponseStatus(HttpStatus.CREATED)
    public ResourceService.PhotoMeta addListingPhoto(Actor actor, @PathVariable UUID id,
                                                     @RequestParam("file") MultipartFile file,
                                                     @RequestParam(value = "caption", required = false) String caption) throws IOException {
        return photos.addListingPhoto(actor, id, file.getBytes(), caption);
    }

    @DeleteMapping("/api/resources/{id}/photos/{photoId}")
    @PreAuthorize("hasRole('OWNER')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeListingPhoto(Actor actor, @PathVariable UUID id, @PathVariable UUID photoId) {
        photos.removeListingPhoto(actor, id, photoId);
    }

    @GetMapping("/api/resources/{id}/photos")
    public List<ResourceService.PhotoMeta> listingPhotos(Actor actor, @PathVariable UUID id) {
        return photos.listingPhotos(actor, id);
    }

    @GetMapping("/api/resource-photos/{id}/content")
    public ResponseEntity<byte[]> listingPhotoContent(@PathVariable UUID id) {
        var c = photos.listingPhotoContent(id);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(c.contentType()))
                .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePublic())
                .header("X-Content-Type-Options", "nosniff")
                .body(c.bytes());
    }
}
