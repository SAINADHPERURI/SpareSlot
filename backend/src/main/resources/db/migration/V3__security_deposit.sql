-- V3: security deposit and the checks around it. Owned by the contract session.
--
-- The deposit is paid by the borrower after approval and before pickup, and is refunded only when the item
-- was never taken or came back in its original condition. The database enforces this, not just the application.
--
-- bookings.deposit_status
--   none       no deposit on this booking (the resource has none)
--   pending    required; amount fixed when the booking was approved; the borrower has not paid yet
--   paid       held until the booking ends
--   refunded   returned to the borrower
--   forfeited  kept by the owner, only after a damage incident was resolved
--   waived     staff waived it, with a reason
--
-- Money moves only through deposit_transactions (an append-only ledger). Inserting a ledger row checks the
-- rules below and updates bookings.deposit_status itself, so the two can never disagree.
--
-- "Original condition" = the condition recorded at return is not worse than the one recorded at check-in
-- (good < minor_wear < damaged), and no damage or dispute incident on the booking is still open.
--
-- Also new here: check-in needs a check-in condition record, return needs a return condition record, and a
-- booking cannot close while money is still held. Amounts are in minor units (paise); there is no real
-- payment integration in the contract, only a provider label.

COMMENT ON COLUMN resources.deposit_minor IS
    'Refundable security deposit in paise; 0 = none. Applies to every borrower of this resource; staff may waive it per booking (V3).';
COMMENT ON COLUMN users.affiliation IS
    'College or institute, informational only. It does not decide whether a deposit applies (V3).';

ALTER TABLE bookings DROP CONSTRAINT bookings_deposit_status_check;
ALTER TABLE bookings
    ADD CONSTRAINT bookings_deposit_status_check
        CHECK (deposit_status IN ('none', 'pending', 'paid', 'refunded', 'forfeited', 'waived')),
    ADD CONSTRAINT bookings_deposit_amount_check
        CHECK ((deposit_status = 'none') = (deposit_minor = 0));

-- ---------------------------------------------------------------- condition helpers

CREATE FUNCTION condition_rank(p_rating text) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p_rating WHEN 'good' THEN 0 WHEN 'minor_wear' THEN 1 WHEN 'damaged' THEN 2 END
$$;

CREATE FUNCTION returned_in_original_condition(p_booking uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
               (SELECT condition_rank(ret.rating) <= condition_rank(took.rating)
                FROM condition_records took
                JOIN condition_records ret ON ret.booking_id = took.booking_id AND ret.phase = 'return'
                WHERE took.booking_id = p_booking AND took.phase = 'check_in'),
               false)
           AND NOT EXISTS (SELECT 1 FROM incidents i
                           WHERE i.booking_id = p_booking
                             AND i.kind IN ('damage', 'dispute')
                             AND i.status <> 'resolved')
$$;

-- ---------------------------------------------------------------- the ledger

CREATE TABLE deposit_transactions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id   uuid NOT NULL REFERENCES bookings (id),
    kind         text NOT NULL CHECK (kind IN ('charge', 'refund', 'forfeit', 'waive')),
    amount_minor integer NOT NULL CHECK (amount_minor > 0),
    currency     char(3) NOT NULL DEFAULT 'INR',
    provider     text NOT NULL CHECK (provider IN ('demo', 'manual', 'razorpay_test')),
    provider_ref text,
    actor_id     uuid NOT NULL REFERENCES users (id),
    reason       text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    CHECK (kind = 'charge' OR btrim(coalesce(reason, '')) <> '')
);

CREATE INDEX deposit_transactions_booking_idx ON deposit_transactions (booking_id, created_at);

CREATE FUNCTION deposit_transactions_apply() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    b          bookings%ROWTYPE;
    new_status text;
BEGIN
    SELECT * INTO b FROM bookings WHERE id = NEW.booking_id FOR UPDATE;

    IF NEW.amount_minor <> b.deposit_minor THEN
        RAISE EXCEPTION 'the amount must equal the booking deposit (% paise)', b.deposit_minor
            USING ERRCODE = 'check_violation';
    END IF;

    CASE NEW.kind
        WHEN 'charge' THEN
            IF b.deposit_status <> 'pending' OR b.status <> 'approved' THEN
                RAISE EXCEPTION 'a deposit is paid only while the booking is approved and the deposit is pending'
                    USING ERRCODE = 'check_violation';
            END IF;
            new_status := 'paid';
        WHEN 'waive' THEN
            IF b.deposit_status <> 'pending' OR b.status <> 'approved' THEN
                RAISE EXCEPTION 'a deposit is waived only while the booking is approved and the deposit is pending'
                    USING ERRCODE = 'check_violation';
            END IF;
            new_status := 'waived';
        WHEN 'refund' THEN
            IF b.deposit_status <> 'paid' THEN
                RAISE EXCEPTION 'only a paid deposit can be refunded' USING ERRCODE = 'check_violation';
            END IF;
            IF NOT ((b.status = 'cancelled' AND b.checked_in_at IS NULL)
                    OR (b.status = 'returned' AND returned_in_original_condition(b.id))) THEN
                RAISE EXCEPTION 'a deposit is refunded only if the item was never taken, or came back in its original condition'
                    USING ERRCODE = 'check_violation';
            END IF;
            new_status := 'refunded';
        WHEN 'forfeit' THEN
            IF b.deposit_status <> 'paid' OR b.status <> 'returned' THEN
                RAISE EXCEPTION 'a deposit is forfeited only after the item is returned' USING ERRCODE = 'check_violation';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM incidents i
                           WHERE i.booking_id = b.id AND i.kind = 'damage' AND i.status = 'resolved') THEN
                RAISE EXCEPTION 'a deposit is forfeited only after a damage incident has been resolved'
                    USING ERRCODE = 'check_violation';
            END IF;
            new_status := 'forfeited';
    END CASE;

    -- tell bookings_guard that this change comes from the ledger
    PERFORM set_config('spareslot.ledger', 'on', true);
    UPDATE bookings SET deposit_status = new_status WHERE id = b.id;
    PERFORM set_config('spareslot.ledger', 'off', true);
    RETURN NEW;
END $$;

CREATE TRIGGER deposit_transactions_apply_trg BEFORE INSERT ON deposit_transactions
    FOR EACH ROW EXECUTE FUNCTION deposit_transactions_apply();

CREATE FUNCTION deposit_transactions_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'deposit_transactions is append-only' USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER deposit_transactions_no_change BEFORE UPDATE OR DELETE ON deposit_transactions
    FOR EACH ROW EXECUTE FUNCTION deposit_transactions_immutable();
CREATE TRIGGER deposit_transactions_no_truncate BEFORE TRUNCATE ON deposit_transactions
    FOR EACH STATEMENT EXECUTE FUNCTION deposit_transactions_immutable();

-- ---------------------------------------------------------------- the booking guard, extended

-- Replaces the V1 function (same name, same trigger). Adds the deposit and condition-record rules.
CREATE OR REPLACE FUNCTION bookings_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    rule booking_transitions%ROWTYPE;
BEGIN
    -- deposit_status moves only through the ledger, except the pending snapshot taken at approval
    IF NEW.deposit_status IS DISTINCT FROM OLD.deposit_status
       AND current_setting('spareslot.ledger', true) IS DISTINCT FROM 'on' THEN
        IF NOT (OLD.deposit_status = 'none' AND NEW.deposit_status = 'pending'
                AND OLD.status IN ('requested', 'waitlisted') AND NEW.status = 'approved') THEN
            RAISE EXCEPTION 'deposit_status changes only through deposit_transactions'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    IF NEW.deposit_minor IS DISTINCT FROM OLD.deposit_minor
       AND NOT (OLD.deposit_status = 'none' AND NEW.deposit_status = 'pending') THEN
        RAISE EXCEPTION 'the deposit amount is fixed once set' USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status <> OLD.status THEN
        SELECT * INTO rule FROM booking_transitions t
        WHERE t.from_status = OLD.status AND t.to_status = NEW.status;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'illegal booking transition % -> %', OLD.status, NEW.status
                USING ERRCODE = 'check_violation';
        END IF;
        IF rule.requires_reason THEN
            IF btrim(coalesce(NEW.decision_reason, '')) = ''
               OR NEW.decision_reason IS NOT DISTINCT FROM OLD.decision_reason THEN
                RAISE EXCEPTION 'transition % -> % needs a new reason', OLD.status, NEW.status
                    USING ERRCODE = 'check_violation';
            END IF;
            NEW.decided_at := now();
        END IF;

        IF OLD.status = 'approved' AND NEW.status = 'checked_in' THEN
            IF NEW.deposit_status NOT IN ('none', 'paid', 'waived') THEN
                RAISE EXCEPTION 'the deposit must be paid or waived before check-in'
                    USING ERRCODE = 'check_violation';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM condition_records c
                           WHERE c.booking_id = NEW.id AND c.phase = 'check_in') THEN
                RAISE EXCEPTION 'check-in needs a condition record' USING ERRCODE = 'check_violation';
            END IF;
        ELSIF OLD.status = 'checked_in' AND NEW.status = 'returned' THEN
            IF NOT EXISTS (SELECT 1 FROM condition_records c
                           WHERE c.booking_id = NEW.id AND c.phase = 'return') THEN
                RAISE EXCEPTION 'return needs a condition record' USING ERRCODE = 'check_violation';
            END IF;
        ELSIF OLD.status = 'returned' AND NEW.status = 'closed' THEN
            IF NEW.deposit_status NOT IN ('none', 'refunded', 'forfeited', 'waived') THEN
                RAISE EXCEPTION 'the deposit must be refunded, forfeited or waived before the booking closes'
                    USING ERRCODE = 'check_violation';
            END IF;
        END IF;
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END $$;

-- ---------------------------------------------------------------- the staff to-do list

-- Deposits held for bookings that are over. The recommendation is advice; a person decides.
CREATE VIEW v_deposits_to_resolve AS
SELECT b.id           AS booking_id,
       r.org_id,
       b.resource_id,
       b.requester_id,
       b.status       AS booking_status,
       b.deposit_minor,
       CASE WHEN b.status = 'cancelled'                    THEN 'refund'
            WHEN returned_in_original_condition(b.id)      THEN 'refund'
            ELSE 'review' END AS recommended_action
FROM bookings b
JOIN resources r ON r.id = b.resource_id
WHERE b.deposit_status = 'paid'
  AND b.status IN ('cancelled', 'returned');
