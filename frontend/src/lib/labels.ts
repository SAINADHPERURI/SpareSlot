// Every enum value the UI shows, humanised in one place.

const LABELS: Record<string, string> = {
  // roles
  user: 'Borrower',
  owner: 'Owner',
  manager: 'Manager',
  admin: 'Admin',
  system: 'System',
  requester: 'Borrower',
  // borrower types
  student: 'Student',
  researcher: 'Researcher',
  creator: 'Independent creator',
  startup_team: 'Startup team',
  // credential kinds
  student_id: 'Student ID',
  research_affiliation: 'Research affiliation',
  creator_portfolio: 'Creator portfolio',
  team_registration: 'Team registration',
  safety_induction: 'Safety induction',
  other: 'Other',
  // booking statuses
  requested: 'Requested',
  approved: 'Approved',
  rejected: 'Rejected',
  waitlisted: 'Waitlisted',
  checked_in: 'Checked in',
  returned: 'Returned',
  closed: 'Closed',
  cancelled: 'Cancelled',
  // deposit statuses
  none: 'No deposit',
  pending: 'Pending',
  paid: 'Paid',
  refunded: 'Refunded',
  forfeited: 'Forfeited',
  waived: 'Waived',
  // credential statuses
  verified: 'Verified',
  expired: 'Expired',
  // ratings
  good: 'Good',
  minor_wear: 'Minor wear',
  damaged: 'Damaged',
  // incidents
  damage: 'Damage',
  delay: 'Delay',
  conflict: 'Conflict',
  pre_existing_damage: 'Pre-existing damage',
  dispute: 'Dispute',
  open: 'Open',
  under_review: 'Under review',
  resolved: 'Resolved',
  // photo phases and sides
  check_in: 'Check-in',
  return: 'Return',
  incident: 'Incident',
  borrower: 'Borrower',
  staff: 'Staff',
  // categories and organisation kinds
  equipment: 'Equipment',
  space: 'Space',
  college_lab: 'College lab',
  makerspace: 'Makerspace',
  studio: 'Studio',
  // deposit advice
  refund: 'Refund',
  review: 'Review by a person',
  // ledger kinds
  charge: 'Paid',
  forfeit: 'Forfeited',
  waive: 'Waived',
};

export function label(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  return LABELS[value] ?? value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export const CREDENTIAL_KINDS = [
  'student_id',
  'research_affiliation',
  'creator_portfolio',
  'team_registration',
  'safety_induction',
  'other',
] as const;

export const BORROWER_TYPES = ['student', 'researcher', 'creator', 'startup_team'] as const;

export const INCIDENT_KINDS = ['damage', 'pre_existing_damage', 'delay', 'conflict', 'dispute'] as const;

/** Guidance shown on the verification form, per verification path. */
export const EVIDENCE_GUIDANCE: Record<string, string> = {
  student_id:
    'A manager checks your student ID. Give your college, programme and ID number, and say when the card expires.',
  research_affiliation:
    'Name your institute and research group, and give a supervisor contact (name and work email) who can confirm it.',
  creator_portfolio:
    'Link your portfolio or describe your ID, and give one reference (a person who has worked with you) with contact details.',
  team_registration:
    'Give your team or company registration number, or the founder ID of the person applying, and list the team members.',
  safety_induction:
    'Say where and when you completed the safety induction, and who ran it. Some equipment needs this before use.',
  other: 'Describe the credential and how a reviewer can check it.',
};

/** booking.approved -> Approved; deposit.charged -> Deposit paid; photo.added -> Photo added */
const ACTIONS: Record<string, string> = {
  'booking.requested': 'Requested',
  'booking.approved': 'Approved',
  'booking.rejected': 'Rejected',
  'booking.waitlisted': 'Waitlisted',
  'booking.cancelled': 'Cancelled',
  'booking.checked_in': 'Checked in (pickup)',
  'booking.returned': 'Returned',
  'booking.closed': 'Closed',
  'deposit.charged': 'Deposit paid',
  'deposit.refunded': 'Deposit refunded',
  'deposit.forfeited': 'Deposit forfeited',
  'deposit.waived': 'Deposit waived',
  'photo.added': 'Photo added',
  'photo.removed': 'Photo removed',
  'incident.raised': 'Incident raised',
  'incident.under_review': 'Incident under review',
  'incident.resolved': 'Incident resolved',
  'extension.requested': 'More time requested',
  'extension.approved': 'More time approved',
  'extension.rejected': 'More time not approved',
  'credential.requested': 'Verification requested',
  'credential.verified': 'Credential verified',
  'credential.rejected': 'Credential not accepted',
  'resource.created': 'Listing created',
  'resource.updated': 'Listing changed',
  'organisation.registered': 'Organisation registered',
  'organisation.verified': 'Organisation verified',
  'user.registered': 'Account created',
  'user.suspended': 'Account suspended',
  'user.reinstated': 'Account reinstated',
  'user.profile_updated': 'Profile updated',
  'team.created': 'Team created',
  'team.joined': 'Joined team',
  'team.left': 'Left team',
};

export function actionLabel(action: string): string {
  return ACTIONS[action] ?? label(action.split('.').pop() ?? action);
}

/** Button text for each allowed action from the server. */
export const ACTION_BUTTONS: Record<string, string> = {
  approve: 'Approve',
  reject: 'Reject',
  waitlist: 'Waitlist',
  cancel: 'Cancel booking',
  check_in: 'Check in (pickup)',
  return: 'Record return',
  close: 'Close booking',
  pay_deposit: 'Pay deposit',
  waive_deposit: 'Waive deposit',
  refund_deposit: 'Refund deposit',
  forfeit_deposit: 'Forfeit deposit',
  add_photo: 'Add photo',
  request_extension: 'Ask for more time',
  raise_incident: 'Raise an incident',
};
