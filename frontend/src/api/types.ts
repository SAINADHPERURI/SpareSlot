// Mirrors the backend records (Java record component names, camelCase). Timestamps are ISO-8601 strings.

export type Role = 'user' | 'owner' | 'manager' | 'admin';
export type BorrowerType = 'student' | 'researcher' | 'creator' | 'startup_team';
export type CredentialKind =
  | 'student_id'
  | 'research_affiliation'
  | 'creator_portfolio'
  | 'team_registration'
  | 'safety_induction'
  | 'other';
export type BookingStatus =
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'waitlisted'
  | 'checked_in'
  | 'returned'
  | 'closed'
  | 'cancelled';
export type DepositStatus = 'none' | 'pending' | 'paid' | 'refunded' | 'forfeited' | 'waived';
export type Rating = 'good' | 'minor_wear' | 'damaged';
export type IncidentKind = 'damage' | 'delay' | 'conflict' | 'pre_existing_damage' | 'dispute';
export type IncidentStatus = 'open' | 'under_review' | 'resolved';
export type PhotoPhase = 'check_in' | 'return' | 'incident';

export interface ErrorBody {
  code: string;
  message: string;
  rule?: string;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------- auth

export interface TokenResponse {
  token: string;
  userId: string;
  role: Role;
  orgId: string | null;
  fullName: string;
}

export interface DemoAccount {
  email: string;
  fullName: string;
  role: Role;
  borrowerType: BorrowerType | null;
  orgName: string | null;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  borrowerType: BorrowerType | null;
  affiliation: string;
}

export interface RegisterOrganisationRequest {
  organisationName: string;
  kind: string;
  location: string;
  description: string;
  email: string;
  password: string;
  fullName: string;
}

// ---------------------------------------------------------------- me

export interface Team {
  id: string;
  name: string;
  members: string[];
}

export interface WeeklyUsage {
  resourceId: string;
  resourceName: string;
  hours: number;
  weeklyHourCap: number;
}

export interface MyCredential {
  id: string;
  kind: CredentialKind;
  status: 'pending' | 'verified' | 'rejected';
  reviewReason: string | null;
  expiresAt: string | null;
  expired: boolean;
  createdAt: string;
}

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  borrowerType: BorrowerType | null;
  affiliation: string;
  orgId: string | null;
  orgName: string | null;
  orgVerified: boolean | null;
  status: string;
  team: Team | null;
  credentials: MyCredential[];
  weeklyUsage: WeeklyUsage[];
  hoursLast30Days: number;
  createdAt: string;
}

// ---------------------------------------------------------------- resources

export interface ResourceCard {
  id: string;
  orgId: string;
  orgName: string;
  orgKind: string;
  orgVerified: boolean;
  name: string;
  category: 'equipment' | 'space';
  description: string;
  location: string;
  conditions: string;
  maxBookingHours: number;
  weeklyHourCap: number;
  depositMinor: number;
  active: boolean;
  requirements: CredentialKind[];
  coverPhotoId: string | null;
  eligible: boolean | null;
  missingCredentials: CredentialKind[] | null;
}

export interface PhotoMeta {
  id: string;
  caption: string;
  position: number;
  createdAt: string;
}

export interface BookedWindow {
  startAt: string;
  endAt: string;
  status: BookingStatus;
}

export interface ResourceDetail {
  resource: ResourceCard;
  photos: PhotoMeta[];
  bookedWindows: BookedWindow[];
  myHoursThisWeek: number | null;
  canEdit: boolean;
}

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

export interface ResourceRequest {
  name: string;
  category: 'equipment' | 'space';
  description: string;
  location: string;
  conditions: string;
  maxBookingHours: number;
  weeklyHourCap: number;
  depositMinor: number;
  active: boolean;
  requirements: CredentialKind[];
}

export interface Organisation {
  id: string;
  name: string;
  kind: string;
  description: string;
  location: string;
  verified: boolean;
  verifiedAt: string | null;
  resourceCount: number;
}

export interface OrganisationProfile {
  organisation: Organisation;
  resources: ResourceCard[];
}

// ---------------------------------------------------------------- credentials (review queue)

export interface Credential {
  id: string;
  userId: string;
  userName: string;
  borrowerType: BorrowerType | null;
  affiliation: string;
  orgId: string | null;
  orgName: string | null;
  kind: CredentialKind;
  evidence: string;
  status: 'pending' | 'verified' | 'rejected';
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
  expiresAt: string | null;
  expired: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------- bookings

export interface Queue {
  position: number;
  size: number;
  yourHoursLast30Days: number;
  explanation: string;
}

export interface BookingSummary {
  id: string;
  resourceId: string;
  resourceName: string;
  resourceCategory: string;
  orgId: string;
  orgName: string;
  requesterId: string;
  requesterName: string;
  startAt: string;
  endAt: string;
  hours: number;
  purpose: string;
  status: BookingStatus;
  decisionReason: string | null;
  decidedAt: string | null;
  depositMinor: number;
  depositStatus: DepositStatus;
  overdue: boolean;
  queue: Queue | null;
  allowedActions: string[];
  blockedActions: Record<string, string>;
  createdAt: string;
}

export interface ConditionRecord {
  phase: 'check_in' | 'return';
  rating: Rating;
  notes: string;
  recordedBy: string;
  recordedByName: string;
  recordedAt: string;
}

export interface BookingIncident {
  id: string;
  kind: IncidentKind;
  description: string;
  status: IncidentStatus;
  raisedBy: string;
  raisedByName: string;
  raisedAt: string;
  resolvedByName: string | null;
  resolvedAt: string | null;
  resolution: string | null;
}

export interface BookingExtension {
  id: string;
  requestedEndAt: string;
  reason: string;
  status: 'requested' | 'approved' | 'rejected';
  decisionReason: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface BookingDetail {
  booking: BookingSummary;
  myRole: string | null;
  resourceLocation: string;
  resourceConditions: string;
  requesterBorrowerType: BorrowerType | null;
  requesterAffiliation: string;
  teamName: string | null;
  decidedByName: string | null;
  checkedInAt: string | null;
  returnedAt: string | null;
  closedAt: string | null;
  conditions: ConditionRecord[];
  incidents: BookingIncident[];
  extensions: BookingExtension[];
}

export interface AuditEvent {
  id: number;
  at: string;
  actorId: string | null;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  details: Record<string, unknown>;
}

// ---------------------------------------------------------------- deposit

export interface LedgerEntry {
  id: string;
  kind: 'charge' | 'refund' | 'forfeit' | 'waive';
  amountMinor: number;
  currency: string;
  provider: string;
  providerRef: string | null;
  actorId: string;
  actorName: string;
  reason: string | null;
  createdAt: string;
}

export interface DepositCondition {
  phase: string;
  rating: Rating;
  notes: string;
  recordedByName: string;
  recordedAt: string;
}

export interface DepositView {
  bookingId: string;
  amountMinor: number;
  currency: string;
  status: DepositStatus;
  bookingStatus: BookingStatus;
  ledger: LedgerEntry[];
  checkIn: DepositCondition | null;
  returned: DepositCondition | null;
  originalCondition: boolean | null;
  openIncidents: number;
  recommendedAction: string | null;
  demoNotice: string;
}

export interface ToResolve {
  bookingId: string;
  resourceId: string;
  resourceName: string;
  requesterId: string;
  requesterName: string;
  bookingStatus: BookingStatus;
  depositMinor: number;
  recommendedAction: string;
  checkInRating: Rating | null;
  returnRating: Rating | null;
  openIncidents: number;
  endAt: string;
}

// ---------------------------------------------------------------- photos

export interface BookingPhoto {
  id: string;
  phase: PhotoPhase;
  side: 'borrower' | 'staff';
  caption: string;
  uploadedBy: string;
  uploadedByName: string;
  createdAt: string;
}

// ---------------------------------------------------------------- incidents, extensions, notifications

export interface Incident {
  id: string;
  bookingId: string;
  resourceId: string;
  resourceName: string;
  requesterName: string;
  kind: IncidentKind;
  description: string;
  status: IncidentStatus;
  raisedByName: string;
  raisedAt: string;
  resolvedByName: string | null;
  resolvedAt: string | null;
  resolution: string | null;
}

export interface Extension {
  id: string;
  bookingId: string;
  resourceName: string;
  requesterName: string;
  currentEndAt: string;
  requestedEndAt: string;
  reason: string;
  status: 'requested' | 'approved' | 'rejected';
  decisionReason: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface Notification {
  id: number;
  message: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Inbox {
  unread: number;
  items: Notification[];
}

// ---------------------------------------------------------------- dashboards

export interface CredentialStatus {
  kind: CredentialKind;
  label: string;
  status: string;
  expiresAt: string | null;
  reviewReason: string | null;
}

export interface MissingCredential {
  kind: CredentialKind;
  label: string;
  resourcesNeedingIt: number;
}

export interface BorrowerDashboard {
  credentials: CredentialStatus[];
  missingCredentials: MissingCredential[];
  upcoming: BookingSummary[];
  active: BookingSummary[];
  openRequests: BookingSummary[];
  depositsToPay: BookingSummary[];
  recent: BookingSummary[];
  openRequestCount: number;
  openRequestLimit: number;
  hoursLast30Days: number;
  unreadNotifications: number;
}

export interface StaffCounts {
  requestsToDecide: number;
  verificationsToReview: number;
  checkInsDue: number;
  overdue: number;
  depositsToResolve: number;
  openIncidents: number;
  extensionRequests: number;
}

export interface StaffDashboard {
  counts: StaffCounts;
  requestsToDecide: BookingSummary[];
  checkInsDue: BookingSummary[];
  active: BookingSummary[];
  overdue: BookingSummary[];
  depositsToResolve: ToResolve[];
  orgName: string;
  orgVerified: boolean | null;
}

export interface AdminDashboard {
  organisationsAwaiting: number;
  users: number;
  suspendedUsers: number;
  bookings: number;
  auditEvents: number;
}

// ---------------------------------------------------------------- admin

export interface AdminOrganisation {
  id: string;
  name: string;
  kind: string;
  description: string;
  location: string;
  verified: boolean;
  verifiedByName: string | null;
  verifiedAt: string | null;
  staffCount: number;
  resourceCount: number;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  borrowerType: BorrowerType | null;
  affiliation: string;
  orgName: string | null;
  status: 'active' | 'suspended';
  createdAt: string;
}

export interface AuditPage {
  items: AuditEvent[];
  page: number;
  size: number;
  total: number;
}
