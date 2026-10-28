-- V11 (backend range): a waitlisted request expires.
--
-- Product decision (2026-10-28): a request that is still waitlisted 24 hours after it joined the waitlist, or
-- whose start time has passed, is cancelled by the system with a reason. The borrower can request again.
-- The system may therefore take the waitlisted -> cancelled edge as well as the requester. It still never
-- rejects: only people reject. A reason stays mandatory on this edge.

UPDATE booking_transitions
SET allowed_roles = '{requester,system}'
WHERE from_status = 'waitlisted' AND to_status = 'cancelled';
