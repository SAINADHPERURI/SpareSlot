-- V91: a fresh waitlist for the demo (fictional data).
--
-- V11 closes waitlisted requests after 24 hours, so the V90 workbench queue (a day old when the seed runs) is
-- closed by the system within a minute of the first start, which itself shows the rule at work. This adds a
-- queue that stays open for the next day: Ravi holds the LED light set; Zoya, then Asha, asked for the same time.
-- Asha has used fewer hours in the last 30 days than Zoya's team, so she is first in the queue now.

INSERT INTO bookings (id, resource_id, requester_id, team_id, start_at, end_at, purpose, created_at, updated_at) VALUES
 ('40000000-0000-4000-8000-000000000017', '30000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000002', NULL,
  date_trunc('day', now()) + interval '2 days 10 hours', date_trunc('day', now()) + interval '2 days 13 hours',
  'Lighting a lab demonstration video', now() - interval '6 hours', now() - interval '6 hours'),
 ('40000000-0000-4000-8000-000000000018', '30000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000005',
  '60000000-0000-4000-8000-000000000001',
  date_trunc('day', now()) + interval '2 days 11 hours', date_trunc('day', now()) + interval '2 days 13 hours',
  'Product video for the Tinkerbots launch', now() - interval '3 hours', now() - interval '3 hours'),
 ('40000000-0000-4000-8000-000000000019', '30000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000001', NULL,
  date_trunc('day', now()) + interval '2 days 10 hours', date_trunc('day', now()) + interval '2 days 12 hours',
  'Filming the robotics club showcase', now() - interval '1 hour', now() - interval '1 hour');

UPDATE bookings SET status = 'approved', decision_reason = 'Lights are free that morning',
       decided_by = '20000000-0000-4000-8000-000000000016'
WHERE id = '40000000-0000-4000-8000-000000000017';
UPDATE bookings SET status = 'waitlisted', decision_reason = 'Slot taken; you joined the waitlist at number 1'
WHERE id IN ('40000000-0000-4000-8000-000000000018', '40000000-0000-4000-8000-000000000019');
UPDATE bookings SET decided_at = now() - interval '5 hours' WHERE id = '40000000-0000-4000-8000-000000000017';
UPDATE bookings SET decided_at = created_at WHERE id IN ('40000000-0000-4000-8000-000000000018', '40000000-0000-4000-8000-000000000019');

INSERT INTO audit_events (at, actor_id, actor_role, action, entity_type, entity_id, from_status, to_status, reason, details) VALUES
 (now() - interval '6 hours', '20000000-0000-4000-8000-000000000002', 'user', 'booking.requested', 'booking',
  '40000000-0000-4000-8000-000000000017', NULL, 'requested', NULL, '{"purpose": "Lighting a lab demonstration video"}'),
 (now() - interval '5 hours', '20000000-0000-4000-8000-000000000016', 'manager', 'booking.approved', 'booking',
  '40000000-0000-4000-8000-000000000017', 'requested', 'approved', 'Lights are free that morning', '{}'),
 (now() - interval '3 hours', '20000000-0000-4000-8000-000000000005', 'user', 'booking.requested', 'booking',
  '40000000-0000-4000-8000-000000000018', NULL, 'requested', NULL, '{"purpose": "Product video for the Tinkerbots launch"}'),
 (now() - interval '3 hours', NULL, 'system', 'booking.waitlisted', 'booking',
  '40000000-0000-4000-8000-000000000018', 'requested', 'waitlisted', 'Slot taken; you joined the waitlist at number 1', '{}'),
 (now() - interval '1 hour', '20000000-0000-4000-8000-000000000001', 'user', 'booking.requested', 'booking',
  '40000000-0000-4000-8000-000000000019', NULL, 'requested', NULL, '{"purpose": "Filming the robotics club showcase"}'),
 (now() - interval '1 hour', NULL, 'system', 'booking.waitlisted', 'booking',
  '40000000-0000-4000-8000-000000000019', 'requested', 'waitlisted', 'Slot taken; you joined the waitlist at number 1', '{}');

INSERT INTO notifications (user_id, message, entity_type, entity_id, created_at) VALUES
 ('20000000-0000-4000-8000-000000000005', 'Waitlisted: Portable LED light set. Slot taken; you joined the waitlist at number 1',
  'booking', '40000000-0000-4000-8000-000000000018', now() - interval '3 hours'),
 ('20000000-0000-4000-8000-000000000001', 'Waitlisted: Portable LED light set. Slot taken; you joined the waitlist at number 1',
  'booking', '40000000-0000-4000-8000-000000000019', now() - interval '1 hour');
