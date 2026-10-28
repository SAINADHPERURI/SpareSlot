package org.spareslot;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** SPEC section 4a: real type from the bytes, 5 MB, EXIF removed, 6 per side per phase, private serving. */
class PhotoRulesIT extends ApiTestBase {

    static byte[] png(int w, int h) throws Exception {
        var img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(new Color(40, 120, 140));
        g.fillRect(0, 0, w, h);
        g.dispose();
        var out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    /** A JPEG with an APP1 EXIF segment that carries a fake GPS marker, inserted right after SOI. */
    static byte[] jpegWithExif() throws Exception {
        var img = new BufferedImage(2400, 1200, BufferedImage.TYPE_INT_RGB);
        var out = new ByteArrayOutputStream();
        ImageIO.write(img, "jpg", out);
        byte[] jpeg = out.toByteArray();
        byte[] payload = "Exif\0\0GPSLatitude=12.9716;GPSLongitude=77.5946 (fictional test marker)".getBytes(StandardCharsets.ISO_8859_1);
        int len = payload.length + 2;
        var withExif = new ByteArrayOutputStream();
        withExif.write(jpeg, 0, 2);                                   // SOI
        withExif.write(new byte[]{(byte) 0xFF, (byte) 0xE1, (byte) (len >> 8), (byte) len});
        withExif.write(payload);
        withExif.write(jpeg, 2, jpeg.length - 2);
        return withExif.toByteArray();
    }

    private org.springframework.mock.web.MockHttpServletResponse raw(String path, Who who) throws Exception {
        var req = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(path);
        if (who != null) req.header("Authorization", "Bearer " + who.token());
        return mvc.perform(req).andReturn().getResponse();
    }

    record Approved(Org org, Who ann, UUID id) {}

    private Approved approvedBooking() throws Exception {
        var org = org(true);
        UUID kit = resource(org, 0);
        var ann = borrower();
        UUID id = requestId(ann, kit, window(3, 11, 2));
        decide(org.manager(), id, "approve", "OK");
        return new Approved(org, ann, id);
    }

    @Test
    void exifIsRemovedTheImageIsResizedAndOnlyParticipantsCanSeeIt() throws Exception {
        var a = approvedBooking();
        byte[] original = jpegWithExif();
        assertThat(new String(original, StandardCharsets.ISO_8859_1)).contains("GPSLatitude");
        var photo = upload("/api/bookings/" + a.id() + "/photos", a.ann(), original,
                Map.of("phase", "check_in", "caption", "Scratch on the left edge"), 201);
        assertThat(photo.get("side").asText()).isEqualTo("borrower");

        var res = raw("/api/photos/" + photo.get("id").asText() + "/content", a.ann());
        assertThat(res.getStatus()).isEqualTo(200);
        assertThat(res.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(res.getHeader("Cache-Control")).contains("private");
        byte[] stored = res.getContentAsByteArray();
        assertThat(new String(stored, StandardCharsets.ISO_8859_1)).doesNotContain("GPSLatitude").doesNotContain("Exif");
        var decoded = ImageIO.read(new ByteArrayInputStream(stored));
        assertThat(Math.max(decoded.getWidth(), decoded.getHeight())).isEqualTo(1600);

        // staff of the organisation see it; another borrower and other staff get 404
        assertThat(raw("/api/photos/" + photo.get("id").asText() + "/content", a.org().manager()).getStatus()).isEqualTo(200);
        assertThat(raw("/api/photos/" + photo.get("id").asText() + "/content", borrower()).getStatus()).isEqualTo(404);
        assertThat(raw("/api/photos/" + photo.get("id").asText() + "/content", org(true).manager()).getStatus()).isEqualTo(404);
        assertThat(raw("/api/photos/" + photo.get("id").asText() + "/content", null).getStatus()).isEqualTo(401);

        // the upload is audited with the caption as the reason
        var reason = jdbc.sql("SELECT reason FROM audit_events WHERE entity_id = :b AND action = 'photo.added'")
                .param("b", a.id()).query(String.class).single();
        assertThat(reason).isEqualTo("Scratch on the left edge");
    }

    @Test
    void theTypeComesFromTheBytesNotTheName() throws Exception {
        var a = approvedBooking();
        byte[] gif = "GIF89a fake image body".getBytes(StandardCharsets.US_ASCII);
        var body = upload("/api/bookings/" + a.id() + "/photos", a.ann(), gif, Map.of("phase", "check_in"), 422);
        assertThat(body.get("code").asText()).isEqualTo("photo_type");
        byte[] html = "<html><script>alert(1)</script></html>".getBytes(StandardCharsets.US_ASCII);
        upload("/api/bookings/" + a.id() + "/photos", a.ann(), html, Map.of("phase", "check_in"), 422);
        // PNG magic bytes with garbage after them cannot be decoded
        byte[] broken = new byte[]{(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4};
        var unreadable = upload("/api/bookings/" + a.id() + "/photos", a.ann(), broken, Map.of("phase", "check_in"), 422);
        assertThat(unreadable.get("code").asText()).isEqualTo("photo_unreadable");
    }

    @Test
    void overFiveMegabytesIsRefused() throws Exception {
        var a = approvedBooking();
        byte[] big = new byte[5 * 1024 * 1024 + 10];
        big[0] = (byte) 0xFF; big[1] = (byte) 0xD8; big[2] = (byte) 0xFF;
        var body = upload("/api/bookings/" + a.id() + "/photos", a.ann(), big, Map.of("phase", "check_in"), 422);
        assertThat(body.get("code").asText()).isEqualTo("photo_too_large");
    }

    @Test
    void atMostSixPerSidePerPhaseAndNeverOnAClosedBooking() throws Exception {
        var a = approvedBooking();
        byte[] p = png(40, 30);
        for (int i = 0; i < 6; i++) upload("/api/bookings/" + a.id() + "/photos", a.ann(), p, Map.of("phase", "check_in"), 201);
        var seventh = upload("/api/bookings/" + a.id() + "/photos", a.ann(), p, Map.of("phase", "check_in"), 422);
        assertThat(seventh.get("code").asText()).isEqualTo("photo_limit");
        // the staff side has its own six
        var staff = upload("/api/bookings/" + a.id() + "/photos", a.org().manager(), p, Map.of("phase", "check_in"), 201);
        assertThat(staff.get("side").asText()).isEqualTo("staff");
        // other organisations' staff cannot add evidence
        upload("/api/bookings/" + a.id() + "/photos", org(true).manager(), p, Map.of("phase", "check_in"), 404);

        post("/api/bookings/" + a.id() + "/cancel", a.ann(), Map.of("reason", "Plans changed"));
        var closed = upload("/api/bookings/" + a.id() + "/photos", a.ann(), p, Map.of("phase", "return"), 422);
        assertThat(closed.get("code").asText()).isEqualTo("photo_booking_state");
        // and there is no way to delete evidence through the API
        expect(405, HttpMethod.DELETE, "/api/photos/" + staff.get("id").asText() + "/content", a.org().manager(), null);
        assertThat(get("/api/bookings/" + a.id() + "/photos", a.ann())).hasSize(7);
    }

    @Test
    void listingPhotosArePublicAndOnlyTheOwnerManagesThem() throws Exception {
        var org = org(true);
        UUID kit = resource(org, 0);
        var meta = upload("/api/resources/" + kit + "/photos", org.owner(), png(800, 600), Map.of("caption", "Front"), 201);
        upload("/api/resources/" + kit + "/photos", org.manager(), png(80, 60), Map.of(), 403);
        upload("/api/resources/" + kit + "/photos", org(true).owner(), png(80, 60), Map.of(), 404);
        var res = raw("/api/resource-photos/" + meta.get("id").asText() + "/content", null);
        assertThat(res.getStatus()).isEqualTo(200);
        assertThat(res.getContentType()).isEqualTo("image/png");
        assertThat(get("/api/resources/" + kit, null).get("photos")).hasSize(1);
        expect(204, HttpMethod.DELETE, "/api/resources/" + kit + "/photos/" + meta.get("id").asText(), org.owner(), null);
        assertThat(get("/api/resources/" + kit, null).get("photos")).isEmpty();
        assertThat(auditCount(kit, "photo.removed")).isEqualTo(1);
    }
}
