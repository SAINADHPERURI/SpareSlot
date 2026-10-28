-- V2: photos from both sides. Owned by the contract session.
--
--   resource_photos : the owner's pictures of a resource, shown on the listing. The owner may remove them.
--   booking_photos  : condition evidence for one booking, added by the borrower or by staff.
--                     Immutable once written, and only while the booking is approved, checked in or returned,
--                     so nobody can add or remove evidence after the fact.
--
-- Image bytes live in photo_blobs (PostgreSQL bytea) so that they survive redeploys on hosts with
-- ephemeral disks, and so that list queries never touch the bytes. Validation of the real image type,
-- resizing and removal of EXIF data (GPS location) happen in the application before insert.

CREATE TABLE photo_blobs (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
    size_bytes   integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),   -- 5 MB
    content      bytea NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    CHECK (octet_length(content) = size_bytes)
);

CREATE FUNCTION photo_blobs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'photo_blobs rows never change; insert a new one' USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER photo_blobs_no_update BEFORE UPDATE ON photo_blobs
    FOR EACH ROW EXECUTE FUNCTION photo_blobs_immutable();

CREATE TABLE resource_photos (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id uuid NOT NULL REFERENCES resources (id) ON DELETE CASCADE,
    blob_id     uuid NOT NULL REFERENCES photo_blobs (id) ON DELETE CASCADE,
    caption     text NOT NULL DEFAULT '',
    position    integer NOT NULL DEFAULT 0,
    uploaded_by uuid NOT NULL REFERENCES users (id),
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX resource_photos_resource_idx ON resource_photos (resource_id, position);

CREATE TABLE booking_photos (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id  uuid NOT NULL REFERENCES bookings (id),
    phase       text NOT NULL CHECK (phase IN ('check_in', 'return', 'incident')),
    side        text NOT NULL CHECK (side IN ('borrower', 'staff')),   -- who took it
    blob_id     uuid NOT NULL REFERENCES photo_blobs (id),
    caption     text NOT NULL DEFAULT '',
    uploaded_by uuid NOT NULL REFERENCES users (id),
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX booking_photos_booking_idx ON booking_photos (booking_id, phase, created_at);

CREATE FUNCTION booking_photos_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM bookings b
                   WHERE b.id = NEW.booking_id AND b.status IN ('approved', 'checked_in', 'returned')) THEN
        RAISE EXCEPTION 'photos can only be added while a booking is approved, checked in or returned'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER booking_photos_insert_guard_trg BEFORE INSERT ON booking_photos
    FOR EACH ROW EXECUTE FUNCTION booking_photos_insert_guard();

CREATE FUNCTION booking_photos_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'booking_photos is append-only' USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER booking_photos_no_change BEFORE UPDATE OR DELETE ON booking_photos
    FOR EACH ROW EXECUTE FUNCTION booking_photos_immutable();

-- The single path column on a condition record is replaced by booking_photos.
ALTER TABLE condition_records DROP COLUMN photo_path;
