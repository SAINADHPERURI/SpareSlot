-- Run against a database that already has V1 applied:
--   psql -v ON_ERROR_STOP=1 -f schema_rules_test.sql
-- Every check prints PASS or raises. Everything runs inside one transaction and is rolled back.
BEGIN;

CREATE TEMP TABLE results (name text, ok boolean);

-- run a statement that must fail with the given SQLSTATE
CREATE FUNCTION pg_temp.must_fail(test_name text, stmt text, expected_state text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE rc bigint;
BEGIN
    BEGIN
        EXECUTE stmt;
        GET DIAGNOSTICS rc = ROW_COUNT;
        INSERT INTO results VALUES (test_name, false);
        IF stmt ~* '^\s*(update|delete)' AND rc = 0 THEN
            RAISE NOTICE 'FAIL  % (matched no rows, so it proved nothing)', test_name;
        ELSE
            RAISE NOTICE 'FAIL  % (statement succeeded)', test_name;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE = expected_state THEN
            INSERT INTO results VALUES (test_name, true);
            RAISE NOTICE 'PASS  % [refused: %]', test_name, left(SQLERRM, 110);
        ELSE
            INSERT INTO results VALUES (test_name, false);
            RAISE NOTICE 'FAIL  % (got % %)', test_name, SQLSTATE, SQLERRM;
        END IF;
    END;
END $$;

CREATE FUNCTION pg_temp.must_pass(test_name text, stmt text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE rc bigint;
BEGIN
    BEGIN
        EXECUTE stmt;
        GET DIAGNOSTICS rc = ROW_COUNT;
        IF stmt ~* '^\s*(update|delete)' AND rc = 0 THEN
            INSERT INTO results VALUES (test_name, false);
            RAISE NOTICE 'FAIL  % (matched no rows, so it proved nothing)', test_name;
        ELSE
            INSERT INTO results VALUES (test_name, true);
            RAISE NOTICE 'PASS  %', test_name;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO results VALUES (test_name, false);
        RAISE NOTICE 'FAIL  % (got % %)', test_name, SQLSTATE, SQLERRM;
    END;
END $$;

-- fixtures
INSERT INTO organisations (id, name, kind, verified, verified_at)
VALUES ('00000000-0000-0000-0000-0000000000a1', 'Test Makerspace', 'makerspace', true, now());
INSERT INTO users (id, email, password_hash, full_name, role, org_id) VALUES
 ('00000000-0000-0000-0000-0000000000b1', 'owner@test.example', 'x', 'Test Owner', 'owner', '00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-0000000000b2', 'ann@test.example', 'x', 'Ann', 'user', NULL),
 ('00000000-0000-0000-0000-0000000000b3', 'raj@test.example', 'x', 'Raj', 'user', NULL);
INSERT INTO resources (id, org_id, name, category)
VALUES ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'Laser cutter', 'equipment');

INSERT INTO bookings (id, resource_id, requester_id, start_at, end_at, purpose, status, decision_reason, decided_by) VALUES
 ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b2',
  '2026-11-02 10:00+00', '2026-11-02 12:00+00', 'prototype', 'approved', 'Meets conditions',
  '00000000-0000-0000-0000-0000000000b1');

-- 1. users: roles tie to organisations
SELECT pg_temp.must_fail('owner without an organisation is refused',
  $$INSERT INTO users (email, password_hash, full_name, role) VALUES ('o2@test.example','x','O2','owner')$$, '23514');
SELECT pg_temp.must_fail('plain user attached to an organisation is refused',
  $$INSERT INTO users (email, password_hash, full_name, role, org_id) VALUES ('u2@test.example','x','U2','user','00000000-0000-0000-0000-0000000000a1')$$, '23514');
SELECT pg_temp.must_fail('upper-case email is refused',
  $$INSERT INTO users (email, password_hash, full_name) VALUES ('Bad@Test.example','x','Bad')$$, '23514');

-- 2. no double booking
SELECT pg_temp.must_fail('overlapping approved booking is refused',
  $$INSERT INTO bookings (resource_id, requester_id, start_at, end_at, purpose, status, decision_reason)
    VALUES ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b3','2026-11-02 11:00+00','2026-11-02 13:00+00','x','approved','ok')$$, '23P01');
SELECT pg_temp.must_pass('back-to-back approved booking is allowed',
  $$INSERT INTO bookings (resource_id, requester_id, start_at, end_at, purpose, status, decision_reason)
    VALUES ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b3','2026-11-02 12:00+00','2026-11-02 14:00+00','x','approved','ok')$$);
SELECT pg_temp.must_pass('overlapping waitlisted booking is allowed',
  $$INSERT INTO bookings (resource_id, requester_id, start_at, end_at, purpose, status, decision_reason)
    VALUES ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b3','2026-11-02 11:00+00','2026-11-02 13:00+00','x','waitlisted','Slot taken; you are first in line')$$);
SELECT pg_temp.must_fail('end before start is refused',
  $$INSERT INTO bookings (resource_id, requester_id, start_at, end_at, purpose) VALUES ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b3','2026-11-03 12:00+00','2026-11-03 11:00+00','x')$$, '23514');

-- 3. every decision carries a reason
SELECT pg_temp.must_fail('an approved booking inserted with no reason is refused',
  $$INSERT INTO bookings (resource_id, requester_id, start_at, end_at, purpose, status)
    VALUES ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b3','2026-11-04 10:00+00','2026-11-04 11:00+00','x','approved')$$, '23514');
SELECT pg_temp.must_fail('rejecting without a new reason is refused (the old waitlist reason does not count)',
  $$UPDATE bookings SET status = 'rejected' WHERE id = (SELECT id FROM bookings WHERE status = 'waitlisted' LIMIT 1)$$, '23514');
SELECT pg_temp.must_fail('a blank reason is refused',
  $$UPDATE bookings SET status = 'rejected', decision_reason = '   ' WHERE id = (SELECT id FROM bookings WHERE status = 'waitlisted' LIMIT 1)$$, '23514');
SELECT pg_temp.must_pass('rejecting with a reason is allowed',
  $$UPDATE bookings SET status = 'rejected', decision_reason = 'Needs the laser induction first' WHERE id = (SELECT id FROM bookings WHERE status = 'waitlisted' LIMIT 1)$$);

-- 4. the state machine
SELECT pg_temp.must_fail('rejected cannot be approved later',
  $$UPDATE bookings SET status = 'approved', decision_reason = 'changed mind' WHERE status = 'rejected'$$, '23514');
SELECT pg_temp.must_fail('approved cannot skip to returned',
  $$UPDATE bookings SET status = 'returned' WHERE id = '00000000-0000-0000-0000-0000000000d1'$$, '23514');
SELECT pg_temp.must_fail('check-in without a condition record is refused (V3)',
  $$UPDATE bookings SET status = 'checked_in', checked_in_at = now() WHERE id = '00000000-0000-0000-0000-0000000000d1'$$, '23514');
SELECT pg_temp.must_pass('a check-in condition record can be written',
  $$INSERT INTO condition_records (booking_id, phase, rating, recorded_by) VALUES ('00000000-0000-0000-0000-0000000000d1','check_in','good','00000000-0000-0000-0000-0000000000b1')$$);
SELECT pg_temp.must_pass('approved -> checked_in',
  $$UPDATE bookings SET status = 'checked_in', checked_in_at = now() WHERE id = '00000000-0000-0000-0000-0000000000d1'$$);
SELECT pg_temp.must_fail('checked_in cannot be cancelled',
  $$UPDATE bookings SET status = 'cancelled', decision_reason = 'oops' WHERE id = '00000000-0000-0000-0000-0000000000d1'$$, '23514');
SELECT pg_temp.must_fail('return without a condition record is refused (V3)',
  $$UPDATE bookings SET status = 'returned', returned_at = now() WHERE id = '00000000-0000-0000-0000-0000000000d1'$$, '23514');
SELECT pg_temp.must_pass('a return condition record can be written',
  $$INSERT INTO condition_records (booking_id, phase, rating, recorded_by) VALUES ('00000000-0000-0000-0000-0000000000d1','return','good','00000000-0000-0000-0000-0000000000b1')$$);
SELECT pg_temp.must_pass('checked_in -> returned',
  $$UPDATE bookings SET status = 'returned', returned_at = now() WHERE id = '00000000-0000-0000-0000-0000000000d1'$$);
SELECT pg_temp.must_pass('returned -> closed',
  $$UPDATE bookings SET status = 'closed', closed_at = now() WHERE id = '00000000-0000-0000-0000-0000000000d1'$$);
SELECT pg_temp.must_fail('closed is final',
  $$UPDATE bookings SET status = 'requested' WHERE id = '00000000-0000-0000-0000-0000000000d1'$$, '23514');

-- 5. extensions: moving end_at into another live booking is refused
SELECT pg_temp.must_pass('a short approved booking before the 12:00 one is allowed',
  $$INSERT INTO bookings (resource_id, requester_id, start_at, end_at, purpose, status, decision_reason)
    VALUES ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b2','2026-11-02 08:00+00','2026-11-02 10:00+00','x','approved','ok')$$);
SELECT pg_temp.must_fail('extending into the next approved booking is refused',
  $$UPDATE bookings SET end_at = '2026-11-02 13:00+00' WHERE status = 'approved' AND start_at = '2026-11-02 08:00+00'$$, '23P01');
SELECT pg_temp.must_pass('extending within free time is allowed',
  $$UPDATE bookings SET end_at = '2026-11-02 11:30+00' WHERE status = 'approved' AND start_at = '2026-11-02 08:00+00'$$);

-- 6. condition records
SELECT pg_temp.must_fail('damaged without notes is refused',
  $$INSERT INTO condition_records (booking_id, phase, rating, recorded_by) VALUES ('00000000-0000-0000-0000-0000000000d1','return','damaged','00000000-0000-0000-0000-0000000000b1')$$, '23514');
SELECT pg_temp.must_pass('damaged with notes is allowed',
  $$INSERT INTO condition_records (booking_id, phase, rating, notes, recorded_by)
    SELECT id, 'check_in', 'damaged', 'Scratched lid already there', '00000000-0000-0000-0000-0000000000b1'
    FROM bookings WHERE status = 'approved' AND start_at = '2026-11-02 08:00+00'$$);
SELECT pg_temp.must_fail('a second record for the same phase is refused',
  $$INSERT INTO condition_records (booking_id, phase, rating, recorded_by) VALUES ('00000000-0000-0000-0000-0000000000d1','return','good','00000000-0000-0000-0000-0000000000b1')$$, '23505');

-- 7. resolving an incident needs a resolution
SELECT pg_temp.must_pass('incident can be raised',
  $$INSERT INTO incidents (id, booking_id, resource_id, kind, description, raised_by) VALUES ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1','damage','Lens cracked','00000000-0000-0000-0000-0000000000b1')$$);
SELECT pg_temp.must_fail('resolving without a resolution is refused',
  $$UPDATE incidents SET status = 'resolved', resolved_by = '00000000-0000-0000-0000-0000000000b1', resolved_at = now() WHERE id = '00000000-0000-0000-0000-0000000000e1'$$, '23514');

-- 8. credentials reviewed need a reviewer and a reason
SELECT pg_temp.must_pass('credential request can be filed',
  $$INSERT INTO credentials (id, user_id, kind) VALUES ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000b2','student_id')$$);
SELECT pg_temp.must_fail('verifying without a reason is refused',
  $$UPDATE credentials SET status = 'verified', reviewed_by = '00000000-0000-0000-0000-0000000000b1', reviewed_at = now() WHERE id = '00000000-0000-0000-0000-0000000000f1'$$, '23514');

-- 9. the audit log is append-only
SELECT pg_temp.must_pass('audit event can be written',
  $$INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, from_status, to_status, reason)
    VALUES ('00000000-0000-0000-0000-0000000000b1','owner','booking.approved','booking','00000000-0000-0000-0000-0000000000d1','requested','approved','Meets conditions')$$);
SELECT pg_temp.must_fail('audit event cannot be updated',
  $$UPDATE audit_events SET reason = 'edited'$$, '42501');
SELECT pg_temp.must_fail('audit event cannot be deleted',
  $$DELETE FROM audit_events$$, '42501');
SELECT pg_temp.must_fail('audit log cannot be truncated',
  $$TRUNCATE audit_events$$, '42501');

-- 10. views
-- Ann has the closed 10:00-12:00 booking (2 h) and the approved 08:00-11:30 booking (3.5 h) = 5.5 h
SELECT pg_temp.must_pass('weekly usage view counts committed hours',
  $$SELECT 1 / (CASE WHEN (SELECT sum(hours) FROM v_weekly_usage WHERE subject_id = '00000000-0000-0000-0000-0000000000b2') = 5.50 THEN 1 ELSE 0 END)$$);

-- 11. photos (V2)
SELECT pg_temp.must_fail('a blob with an unsupported type is refused',
  $$INSERT INTO photo_blobs (id, content_type, size_bytes, content) VALUES ('00000000-0000-0000-0000-00000000aa00','image/gif',4,'\x47494638')$$, '23514');
SELECT pg_temp.must_fail('a blob whose declared size differs from its bytes is refused',
  $$INSERT INTO photo_blobs (id, content_type, size_bytes, content) VALUES ('00000000-0000-0000-0000-00000000aa00','image/png',9,'\x89504e47')$$, '23514');
SELECT pg_temp.must_fail('a blob over 5 MB is refused',
  $$INSERT INTO photo_blobs (id, content_type, size_bytes, content) VALUES ('00000000-0000-0000-0000-00000000aa00','image/png',5242881,repeat('a', 5242881)::bytea)$$, '23514');
SELECT pg_temp.must_pass('a valid blob is accepted',
  $$INSERT INTO photo_blobs (id, content_type, size_bytes, content) VALUES
      ('00000000-0000-0000-0000-00000000aa01','image/png',4,'\x89504e47'),
      ('00000000-0000-0000-0000-00000000aa02','image/jpeg',4,'\xffd8ffe0'),
      ('00000000-0000-0000-0000-00000000aa03','image/jpeg',4,'\xffd8ffe1')$$);
SELECT pg_temp.must_fail('a blob cannot be edited',
  $$UPDATE photo_blobs SET content_type = 'image/webp' WHERE id = '00000000-0000-0000-0000-00000000aa01'$$, '42501');

SELECT pg_temp.must_pass('owner adds a listing photo',
  $$INSERT INTO resource_photos (id, resource_id, blob_id, caption, uploaded_by)
    VALUES ('00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000aa01','Front view','00000000-0000-0000-0000-0000000000b1')$$);
SELECT pg_temp.must_pass('owner removes a listing photo',
  $$DELETE FROM resource_photos WHERE id = '00000000-0000-0000-0000-00000000ab01'$$);

SELECT pg_temp.must_fail('a photo cannot be added to a rejected booking',
  $$INSERT INTO booking_photos (booking_id, phase, side, blob_id, uploaded_by)
    SELECT id, 'check_in', 'borrower', '00000000-0000-0000-0000-00000000aa02', requester_id FROM bookings WHERE status = 'rejected' LIMIT 1$$, '23514');
SELECT pg_temp.must_fail('a photo cannot be added to a closed booking',
  $$INSERT INTO booking_photos (booking_id, phase, side, blob_id, uploaded_by)
    VALUES ('00000000-0000-0000-0000-0000000000d1', 'return', 'staff', '00000000-0000-0000-0000-00000000aa02', '00000000-0000-0000-0000-0000000000b1')$$, '23514');
SELECT pg_temp.must_fail('an unknown phase is refused',
  $$INSERT INTO booking_photos (booking_id, phase, side, blob_id, uploaded_by)
    SELECT id, 'later', 'borrower', '00000000-0000-0000-0000-00000000aa02', requester_id FROM bookings WHERE status = 'approved' LIMIT 1$$, '23514');
SELECT pg_temp.must_pass('the borrower adds a photo to an approved booking',
  $$INSERT INTO booking_photos (id, booking_id, phase, side, blob_id, caption, uploaded_by)
    SELECT '00000000-0000-0000-0000-00000000ac01', id, 'check_in', 'borrower', '00000000-0000-0000-0000-00000000aa02', 'Scratch on the left edge', requester_id
    FROM bookings WHERE status = 'approved' AND start_at = '2026-11-02 08:00+00'$$);
SELECT pg_temp.must_pass('staff add a photo to the same booking',
  $$INSERT INTO booking_photos (booking_id, phase, side, blob_id, caption, uploaded_by)
    SELECT id, 'check_in', 'staff', '00000000-0000-0000-0000-00000000aa03', 'Handover photo', '00000000-0000-0000-0000-0000000000b1'
    FROM bookings WHERE status = 'approved' AND start_at = '2026-11-02 08:00+00'$$);
SELECT pg_temp.must_fail('a booking photo cannot be edited',
  $$UPDATE booking_photos SET caption = 'edited' WHERE id = '00000000-0000-0000-0000-00000000ac01'$$, '42501');
SELECT pg_temp.must_fail('a booking photo cannot be deleted',
  $$DELETE FROM booking_photos WHERE id = '00000000-0000-0000-0000-00000000ac01'$$, '42501');
SELECT pg_temp.must_fail('the blob behind a booking photo cannot be deleted',
  $$DELETE FROM photo_blobs WHERE id = '00000000-0000-0000-0000-00000000aa02'$$, '23503');

-- 12. security deposit (V3)
CREATE FUNCTION pg_temp.expect_deposit(test_name text, p_booking uuid, expected text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN
    SELECT deposit_status INTO actual FROM bookings WHERE id = p_booking;
    INSERT INTO results VALUES (test_name, actual = expected);
    RAISE NOTICE '% % (deposit is %, expected %)', CASE WHEN actual = expected THEN 'PASS ' ELSE 'FAIL ' END, test_name, actual, expected;
END $$;

-- a booking on the camera kit that is approved with a 500 rupee (50000 paise) deposit pending
CREATE FUNCTION pg_temp.deposit_booking(p_id uuid, p_start timestamptz) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO bookings (id, resource_id, requester_id, start_at, end_at, purpose)
    VALUES (p_id, '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b2',
            p_start, p_start + interval '2 hours', 'deposit scenario');
    UPDATE bookings SET status = 'approved', decision_reason = 'Meets conditions',
           decided_by = '00000000-0000-0000-0000-0000000000b1', deposit_minor = 50000, deposit_status = 'pending'
    WHERE id = p_id;
END $$;

INSERT INTO resources (id, org_id, name, category, deposit_minor)
VALUES ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1', 'Camera kit', 'equipment', 50000);

SELECT pg_temp.must_fail('a booking with no deposit takes no charge',
  $$INSERT INTO deposit_transactions (booking_id, kind, amount_minor, provider, actor_id)
    VALUES ('00000000-0000-0000-0000-0000000000d1','charge',100,'demo','00000000-0000-0000-0000-0000000000b2')$$, '23514');

-- 12a. paid, returned in original condition, refunded
SELECT pg_temp.deposit_booking('00000000-0000-0000-0000-0000000000d2', '2026-11-10 10:00+00');
SELECT pg_temp.expect_deposit('approval fixes the deposit as pending', '00000000-0000-0000-0000-0000000000d2', 'pending');
SELECT pg_temp.must_fail('a direct edit of deposit_status is refused',
  $$UPDATE bookings SET deposit_status = 'paid' WHERE id = '00000000-0000-0000-0000-0000000000d2'$$, '23514');
SELECT pg_temp.must_fail('the deposit amount cannot be changed once set',
  $$UPDATE bookings SET deposit_minor = 100 WHERE id = '00000000-0000-0000-0000-0000000000d2'$$, '23514');
SELECT pg_temp.must_fail('a charge of the wrong amount is refused',
  $$INSERT INTO deposit_transactions (booking_id, kind, amount_minor, provider, actor_id)
    VALUES ('00000000-0000-0000-0000-0000000000d2','charge',100,'demo','00000000-0000-0000-0000-0000000000b2')$$, '23514');
INSERT INTO condition_records (booking_id, phase, rating, recorded_by)
VALUES ('00000000-0000-0000-0000-0000000000d2', 'check_in', 'good', '00000000-0000-0000-0000-0000000000b1');
SELECT pg_temp.must_fail('check-in is refused while the deposit is unpaid',
  $$UPDATE bookings SET status = 'checked_in', checked_in_at = now() WHERE id = '00000000-0000-0000-0000-0000000000d2'$$, '23514');
SELECT pg_temp.must_pass('the borrower pays the deposit',
  $$INSERT INTO deposit_transactions (booking_id, kind, amount_minor, provider, provider_ref, actor_id)
    VALUES ('00000000-0000-0000-0000-0000000000d2','charge',50000,'demo','DEMO-0001','00000000-0000-0000-0000-0000000000b2')$$);
SELECT pg_temp.expect_deposit('paying marks the deposit paid', '00000000-0000-0000-0000-0000000000d2', 'paid');
SELECT pg_temp.must_fail('paying twice is refused',
  $$INSERT INTO deposit_transactions (booking_id, kind, amount_minor, provider, actor_id)
    VALUES ('00000000-0000-0000-0000-0000000000d2','charge',50000,'demo','00000000-0000-0000-0000-0000000000b2')$$, '23514');
SELECT pg_temp.must_fail('a deposit is not refunded while the booking is still approved',
  $$INSERT INTO deposit_transactions (booking_id, kind, amount_minor, provider, actor_id, reason)
    VALUES ('00000000-0000-0000-0000-0000000000d2','refund',50000,'manual','00000000-0000-0000-0000-0000000000b1','too early')$$, '23514');
SELECT pg_temp.must_pass('check-in is allowed once the deposit is paid',
  $$UPDATE bookings SET status = 'checked_in', checked_in_at = now() WHERE id = '00000000-0000-0000-0000-0000000000d2'$$);
INSERT INTO condition_records (booking_id, phase, rating, recorded_by)
VALUES ('00000000-0000-0000-0000-0000000000d2', 'return', 'good', '00000000-0000-0000-0000-0000000000b1');
UPDATE bookings SET status = 'returned', returned_at = now() WHERE id = '00000000-0000-0000-0000-0000000000d2';
SELECT pg_temp.must_fail('the booking cannot close while the deposit is held',
  $$UPDATE bookings SET status = 'closed', closed_at = now() WHERE id = '00000000-0000-0000-0000-0000000000d2'$$, '23514');
SELECT pg_temp.must_fail('a deposit is not forfeited without a resolved damage incident',
  $$INSERT INTO deposit_transactions (booking_id, kind, amount_minor, provider, actor_id, reason)
    VALUES ('00000000-0000-0000-0000-0000000000d2','forfeit',50000,'manual','00000000-0000-0000-0000-0000000000b1','no reason to keep it')$$, '23514');
SELECT pg_temp.must_pass('the deposit is refunded when the item came back in its original condition',
  $$INSERT INTO deposit_transactions (booking_id, kind, amount_minor, provider, actor_id, reason)
    VALUES ('00000000-0000-0000-0000-0000000000d2','refund',50000,'manual','00000000-0000-0000-0000-0000000000b1','Returned in original condition')$$);
SELECT pg_temp.expect_deposit('the booking shows the deposit refunded', '00000000-0000-0000-0000-0000000000d2', 'refunded');
SELECT pg_temp.must_pass('the booking closes after the refund',
  $$UPDATE bookings SET status = 'closed', closed_at = now() WHERE id = '00000000-0000-0000-0000-0000000000d2'$$);
SELECT pg_temp.must_fail('the deposit ledger cannot be edited',
  $$UPDATE deposit_transactions SET reason = 'edited'$$, '42501');
SELECT pg_temp.must_fail('the deposit ledger cannot be deleted',
  $$DELETE FROM deposit_transactions$$, '42501');
SELECT pg_temp.must_fail('the deposit ledger cannot be truncated',
  $$TRUNCATE deposit_transactions$$, '42501');

-- 12b. returned damaged: no refund; forfeit only after a resolved damage incident
SELECT pg_temp.deposit_booking('00000000-0000-0000-0000-0000000000d3', '2026-11-11 10:00+00');
INSERT INTO condition_records (booking_id, phase, rating, recorded_by)
VALUES ('00000000-0000-0000-0000-0000000000d3', 'check_in', 'good', '00000000-0000-0000-0000-0000000000b1');
INSERT INTO deposit_transactions (booking_id, kind, amount_minor, provider, actor_id)
VALUES ('00000000-0000-0000-0000-0000000000d3', 'charge', 50000, 'demo', '00000000-0000-0000-0000-0000000000b2');
UPDATE bookings SET status = 'checked_in', checked_in_at = now() WHERE id = '00000000-0000-0000-0000-0000000000d3';
INSERT INTO condition_records (booking_id, phase, rating, notes, recorded_by)
VALUES ('00000000-0000-0000-0000-0000000000d3', 'return', 'damaged', 'Lens cracked', '00000000-0000-0000-0000-0000000000b1');
UPDATE bookings SET status = 'returned', returned_at = now() WHERE id = '00000000-0000-0000-0000-0000000000d3';
SELECT pg_temp.must_fail('no refund when the item came back worse than it left',
  $$INSERT INTO deposit_transactions (booking_id, kind, amount_minor, provider, actor_id, reason)
    VALUES ('00000000-0000-0000-0000-0000000000d3','refund',50000,'manual','00000000-0000-0000-0000-0000000000b1','full refund please')$$, '23514');
SELECT pg_temp.must_fail('no forfeit before a damage incident exists',
  $$INSERT INTO deposit_transactions (booking_id, kind, amount_minor, provider, actor_id, reason)
    VALUES ('00000000-0000-0000-0000-0000000000d3','forfeit',50000,'manual','00000000-0000-0000-0000-0000000000b1','Lens cracked')$$, '23514');
INSERT INTO incidents (id, booking_id, resource_id, kind, description, raised_by)
VALUES ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000c2',
        'damage', 'Lens cracked', '00000000-0000-0000-0000-0000000000b1');
SELECT pg_temp.must_fail('no forfeit while the damage incident is still open',
  $$INSERT INTO deposit_transactions (booking_id, kind, amount_minor, provider, actor_id, reason)
    VALUES ('00000000-0000-0000-0000-0000000000d3','forfeit',50000,'manual','00000000-0000-0000-0000-0000000000b1','Lens cracked')$$, '23514');
UPDATE incidents SET status = 'resolved', resolved_by = '00000000-0000-0000-0000-0000000000b1', resolved_at = now(),
       resolution = 'Damage happened during the booking'
WHERE id = '00000000-0000-0000-0000-0000000000e2';
SELECT pg_temp.must_pass('the deposit is forfeited after the damage incident is resolved',
  $$INSERT INTO deposit_transactions (booking_id, kind, amount_minor, provider, actor_id, reason)
    VALUES ('00000000-0000-0000-0000-0000000000d3','forfeit',50000,'manual','00000000-0000-0000-0000-0000000000b1','Lens cracked during use; see the incident')$$);
SELECT pg_temp.expect_deposit('the booking shows the deposit forfeited', '00000000-0000-0000-0000-0000000000d3', 'forfeited');
SELECT pg_temp.must_pass('the booking closes after the forfeit',
  $$UPDATE bookings SET status = 'closed', closed_at = now() WHERE id = '00000000-0000-0000-0000-0000000000d3'$$);

-- 12c. worn but unchanged is original condition, but an open dispute blocks the refund
SELECT pg_temp.deposit_booking('00000000-0000-0000-0000-0000000000d4', '2026-11-12 10:00+00');
INSERT INTO condition_records (booking_id, phase, rating, notes, recorded_by)
VALUES ('00000000-0000-0000-0000-0000000000d4', 'check_in', 'minor_wear', 'Light scuffs', '00000000-0000-0000-0000-0000000000b1');
INSERT INTO deposit_transactions (booking_id, kind, amount_minor, provider, actor_id)
VALUES ('00000000-0000-0000-0000-0000000000d4', 'charge', 50000, 'demo', '00000000-0000-0000-0000-0000000000b2');
UPDATE bookings SET status = 'checked_in', checked_in_at = now() WHERE id = '00000000-0000-0000-0000-0000000000d4';
INSERT INTO condition_records (booking_id, phase, rating, notes, recorded_by)
VALUES ('00000000-0000-0000-0000-0000000000d4', 'return', 'minor_wear', 'Same light scuffs', '00000000-0000-0000-0000-0000000000b1');
UPDATE bookings SET status = 'returned', returned_at = now() WHERE id = '00000000-0000-0000-0000-0000000000d4';
INSERT INTO incidents (id, booking_id, resource_id, kind, description, raised_by)
VALUES ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000c2',
        'dispute', 'Borrower says the scuffs were there before', '00000000-0000-0000-0000-0000000000b2');
SELECT pg_temp.must_fail('no refund while a dispute is open',
  $$INSERT INTO deposit_transactions (booking_id, kind, amount_minor, provider, actor_id, reason)
    VALUES ('00000000-0000-0000-0000-0000000000d4','refund',50000,'manual','00000000-0000-0000-0000-0000000000b1','same condition')$$, '23514');
UPDATE incidents SET status = 'resolved', resolved_by = '00000000-0000-0000-0000-0000000000b1', resolved_at = now(),
       resolution = 'Scuffs were already recorded at check-in'
WHERE id = '00000000-0000-0000-0000-0000000000e3';
SELECT pg_temp.must_pass('refund once the dispute is resolved, since the item came back as it left',
  $$INSERT INTO deposit_transactions (booking_id, kind, amount_minor, provider, actor_id, reason)
    VALUES ('00000000-0000-0000-0000-0000000000d4','refund',50000,'manual','00000000-0000-0000-0000-0000000000b1','Same condition as at check-in')$$);
SELECT pg_temp.expect_deposit('the booking shows the deposit refunded after the dispute', '00000000-0000-0000-0000-0000000000d4', 'refunded');

-- 12d. cancelled before pickup: the deposit goes back
SELECT pg_temp.deposit_booking('00000000-0000-0000-0000-0000000000d5', '2026-11-13 10:00+00');
INSERT INTO deposit_transactions (booking_id, kind, amount_minor, provider, actor_id)
VALUES ('00000000-0000-0000-0000-0000000000d5', 'charge', 50000, 'demo', '00000000-0000-0000-0000-0000000000b2');
SELECT pg_temp.must_pass('the borrower cancels before pickup',
  $$UPDATE bookings SET status = 'cancelled', decision_reason = 'Plans changed' WHERE id = '00000000-0000-0000-0000-0000000000d5'$$);
SELECT pg_temp.must_pass('the to-do list recommends a refund for the cancelled booking',
  $$SELECT 1 / (CASE WHEN (SELECT recommended_action FROM v_deposits_to_resolve WHERE booking_id = '00000000-0000-0000-0000-0000000000d5') = 'refund' THEN 1 ELSE 0 END)$$);
SELECT pg_temp.must_pass('the deposit is refunded because the item was never taken',
  $$INSERT INTO deposit_transactions (booking_id, kind, amount_minor, provider, actor_id, reason)
    VALUES ('00000000-0000-0000-0000-0000000000d5','refund',50000,'manual','00000000-0000-0000-0000-0000000000b1','Cancelled before pickup')$$);
SELECT pg_temp.must_pass('a settled deposit leaves the to-do list',
  $$SELECT 1 / (CASE WHEN NOT EXISTS (SELECT 1 FROM v_deposits_to_resolve WHERE booking_id = '00000000-0000-0000-0000-0000000000d5') THEN 1 ELSE 0 END)$$);

-- 12e. staff can waive the deposit, with a reason
SELECT pg_temp.deposit_booking('00000000-0000-0000-0000-0000000000d6', '2026-11-14 10:00+00');
SELECT pg_temp.must_fail('waiving without a reason is refused',
  $$INSERT INTO deposit_transactions (booking_id, kind, amount_minor, provider, actor_id)
    VALUES ('00000000-0000-0000-0000-0000000000d6','waive',50000,'manual','00000000-0000-0000-0000-0000000000b1')$$, '23514');
SELECT pg_temp.must_pass('staff waive the deposit with a reason',
  $$INSERT INTO deposit_transactions (booking_id, kind, amount_minor, provider, actor_id, reason)
    VALUES ('00000000-0000-0000-0000-0000000000d6','waive',50000,'manual','00000000-0000-0000-0000-0000000000b1','Member of the lending college; deposit waived')$$);
SELECT pg_temp.expect_deposit('the booking shows the deposit waived', '00000000-0000-0000-0000-0000000000d6', 'waived');
INSERT INTO condition_records (booking_id, phase, rating, recorded_by)
VALUES ('00000000-0000-0000-0000-0000000000d6', 'check_in', 'good', '00000000-0000-0000-0000-0000000000b1');
SELECT pg_temp.must_pass('check-in is allowed once the deposit is waived',
  $$UPDATE bookings SET status = 'checked_in', checked_in_at = now() WHERE id = '00000000-0000-0000-0000-0000000000d6'$$);

DO $$
DECLARE failed integer; total integer;
BEGIN
    SELECT count(*) FILTER (WHERE NOT ok), count(*) INTO failed, total FROM results;
    RAISE NOTICE '% checks, % failed', total, failed;
    IF failed > 0 THEN RAISE EXCEPTION 'schema rule tests failed'; END IF;
END $$;

ROLLBACK;
