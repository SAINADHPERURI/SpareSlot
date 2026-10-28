package org.spareslot.photos;

import org.spareslot.common.ApiException;
import org.springframework.stereotype.Component;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

/**
 * SPEC section 4a, rules 1 and 2. The type is decided from the file's first bytes, never from its name or the
 * client's Content-Type. The image is decoded and drawn onto a fresh canvas (longest edge at most 1600 px) and
 * encoded again, so no metadata from the original survives: EXIF, including the GPS location, is gone.
 */
@Component
public class ImageSanitizer {

    public static final int MAX_BYTES = 5 * 1024 * 1024;
    static final int MAX_EDGE = 1600;
    /** Refuse images that would need a huge amount of memory to decode (decompression bombs). */
    static final long MAX_PIXELS = 50_000_000L;

    public record Clean(String contentType, byte[] bytes) {}

    public Clean sanitize(byte[] input) {
        if (input == null || input.length == 0) {
            throw ApiException.rule("photo_empty", "photo_type", "The file is empty. Choose a JPEG, PNG or WebP photo.");
        }
        if (input.length > MAX_BYTES) {
            throw ApiException.rule("photo_too_large", "photo_size", "Photos can be at most 5 MB. Choose a smaller photo.");
        }
        String type = sniff(input);
        if (type == null) {
            throw ApiException.rule("photo_type", "photo_type",
                    "Only JPEG, PNG and WebP photos are accepted. This file is not one of them, whatever its name says.");
        }
        BufferedImage image = decode(input);
        BufferedImage scaled = scale(image, "image/png".equals(type));
        byte[] out = "image/png".equals(type) ? writePng(scaled) : writeJpeg(scaled);
        if (out.length > MAX_BYTES) {
            throw ApiException.rule("photo_too_large", "photo_size", "Photos can be at most 5 MB. Choose a smaller photo.");
        }
        return new Clean("image/png".equals(type) ? "image/png" : "image/jpeg", out);
    }

    /** JPEG, PNG or WebP from the magic bytes, or null. */
    static String sniff(byte[] b) {
        if (b.length >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) return "image/jpeg";
        if (b.length >= 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G'
                && b[4] == 0x0D && b[5] == 0x0A && b[6] == 0x1A && b[7] == 0x0A) return "image/png";
        if (b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') return "image/webp";
        return null;
    }

    private static BufferedImage decode(byte[] input) {
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(input))) {
            var readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) throw unreadable();
            ImageReader reader = readers.next();
            try {
                reader.setInput(in, true, true);           // ignore metadata entirely
                long pixels = (long) reader.getWidth(0) * reader.getHeight(0);
                if (pixels > MAX_PIXELS) {
                    throw ApiException.rule("photo_too_large", "photo_size",
                            "This photo has too many pixels to process. Resize it below 50 megapixels and try again.");
                }
                BufferedImage image = reader.read(0);
                if (image == null) throw unreadable();
                return image;
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException e) {
            if (e instanceof ApiException api) throw api;
            throw unreadable();
        }
    }

    private static ApiException unreadable() {
        return ApiException.rule("photo_unreadable", "photo_type",
                "This photo could not be read. It may be damaged. Try another JPEG, PNG or WebP photo.");
    }

    private static BufferedImage scale(BufferedImage src, boolean keepAlpha) {
        int w = src.getWidth(), h = src.getHeight();
        double factor = Math.min(1.0, (double) MAX_EDGE / Math.max(w, h));
        int nw = Math.max(1, (int) Math.round(w * factor)), nh = Math.max(1, (int) Math.round(h * factor));
        var out = new BufferedImage(nw, nh, keepAlpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        try {
            if (!keepAlpha) {
                g.setColor(Color.WHITE);
                g.fillRect(0, 0, nw, nh);
            }
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.drawImage(src, 0, 0, nw, nh, null);
        } finally {
            g.dispose();
        }
        return out;
    }

    private static byte[] writeJpeg(BufferedImage img) {
        var writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        var bytes = new ByteArrayOutputStream();
        try (var out = new MemoryCacheImageOutputStream(bytes)) {
            writer.setOutput(out);
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(0.85f);
            writer.write(null, new IIOImage(img, null, null), param);   // no metadata is written
        } catch (IOException e) {
            throw new IllegalStateException(e);
        } finally {
            writer.dispose();
        }
        return bytes.toByteArray();
    }

    private static byte[] writePng(BufferedImage img) {
        var bytes = new ByteArrayOutputStream();
        try {
            ImageIO.write(img, "png", bytes);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        return bytes.toByteArray();
    }
}
