-- V10 (backend range): the system account.
--
-- Some columns need a user id even when the system acts on its own: incidents.raised_by for the overdue job
-- and deposit_transactions.actor_id for the automatic refund when a booking is cancelled before pickup.
-- This row fills those columns. It can never sign in: it is suspended and its password hash matches nothing.
-- Audit events for system actions still record actor_role = 'system' and actor_id = NULL.

INSERT INTO users (id, email, password_hash, full_name, role, status)
VALUES ('00000000-0000-0000-0000-000000000000', 'system@spareslot.invalid', '!', 'SpareSlot system', 'admin', 'suspended');
