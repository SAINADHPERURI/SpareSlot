import { API_BASE, http, qs } from './client';
import type * as T from './types';

export * from './client';
export type * from './types';

/** Typed functions for the endpoints in SPEC section 6 (plus the dashboards and admin). */
export const api = {
  // auth
  login: (email: string, password: string) => http.post<T.TokenResponse>('/api/auth/login', { email, password }),
  register: (body: T.RegisterRequest) => http.post<T.TokenResponse>('/api/auth/register', body),
  registerOrganisation: (body: T.RegisterOrganisationRequest) =>
    http.post<T.TokenResponse>('/api/auth/register-organisation', body),
  demoAccounts: () => http.get<T.DemoAccount[]>('/api/auth/demo-accounts'),
  demoLogin: (email: string) => http.post<T.TokenResponse>('/api/auth/demo-login', { email }),

  // me
  me: () => http.get<T.Profile>('/api/me'),
  updateMe: (body: { fullName: string; borrowerType: T.BorrowerType | null; affiliation: string }) =>
    http.put<T.Profile>('/api/me', body),
  createTeam: (name: string) => http.post<T.Profile>('/api/me/team', { name }),
  joinTeam: (teamId: string) => http.post<T.Profile>('/api/me/team/join', { teamId }),
  leaveTeam: () => http.post<T.Profile>('/api/me/team/leave'),

  // resources and organisations
  resources: (p: { q?: string; category?: string; orgId?: string; eligible?: boolean; page?: number; size?: number }) =>
    http.get<T.Page<T.ResourceCard>>('/api/resources' + qs(p)),
  resource: (id: string) => http.get<T.ResourceDetail>(`/api/resources/${id}`),
  createResource: (body: T.ResourceRequest) => http.post<{ id: string }>('/api/resources', body),
  updateResource: (id: string, body: T.ResourceRequest) => http.put<T.ResourceDetail>(`/api/resources/${id}`, body),
  orgResources: () => http.get<T.ResourceCard[]>('/api/org/resources'),
  organisations: () => http.get<T.Organisation[]>('/api/organisations'),
  organisation: (id: string) => http.get<T.OrganisationProfile>(`/api/organisations/${id}`),
  addListingPhoto: (resourceId: string, file: File, caption: string) => {
    const f = new FormData();
    f.append('file', file);
    if (caption) f.append('caption', caption);
    return http.upload<T.PhotoMeta>(`/api/resources/${resourceId}/photos`, f);
  },
  removeListingPhoto: (resourceId: string, photoId: string) =>
    http.del<void>(`/api/resources/${resourceId}/photos/${photoId}`),
  listingPhotoUrl: (photoId: string) => `${API_BASE}/api/resource-photos/${photoId}/content`,

  // credentials
  fileCredential: (body: { kind: T.CredentialKind; evidence: string; expiresAt: string | null; orgId: string | null }) =>
    http.post<T.Credential>('/api/credentials', body),
  myCredentials: () => http.get<T.Credential[]>('/api/credentials/mine'),
  credentialQueue: (status = 'pending') => http.get<T.Credential[]>('/api/credentials' + qs({ status })),
  reviewCredential: (id: string, body: { decision: 'verified' | 'rejected'; reason: string; expiresAt: string | null }) =>
    http.post<T.Credential>(`/api/credentials/${id}/review`, body),

  // bookings
  createBooking: (body: { resourceId: string; startAt: string; endAt: string; purpose: string }) =>
    http.post<T.BookingDetail>('/api/bookings', body),
  bookings: (p: { mine?: boolean; status?: string; resourceId?: string; orgId?: string; overdue?: boolean }) =>
    http.get<T.BookingSummary[]>('/api/bookings' + qs(p)),
  booking: (id: string) => http.get<T.BookingDetail>(`/api/bookings/${id}`),
  events: (id: string) => http.get<T.AuditEvent[]>(`/api/bookings/${id}/events`),
  decide: (id: string, action: 'approve' | 'reject' | 'waitlist', reason: string) =>
    http.post<T.BookingDetail>(`/api/bookings/${id}/decision`, { action, reason }),
  cancel: (id: string, reason: string) => http.post<T.BookingDetail>(`/api/bookings/${id}/cancel`, { reason }),
  checkIn: (id: string, rating: T.Rating, notes: string) =>
    http.post<T.BookingDetail>(`/api/bookings/${id}/check-in`, { rating, notes }),
  returnItem: (id: string, rating: T.Rating, notes: string) =>
    http.post<T.BookingDetail>(`/api/bookings/${id}/return`, { rating, notes }),
  close: (id: string, reason: string) => http.post<T.BookingDetail>(`/api/bookings/${id}/close`, { reason }),

  // deposit
  deposit: (id: string) => http.get<T.DepositView>(`/api/bookings/${id}/deposit`),
  payDeposit: (id: string) => http.post<T.DepositView>(`/api/bookings/${id}/deposit/pay`),
  waiveDeposit: (id: string, reason: string) => http.post<T.DepositView>(`/api/bookings/${id}/deposit/waive`, { reason }),
  refundDeposit: (id: string, reason: string) =>
    http.post<T.DepositView>(`/api/bookings/${id}/deposit/refund`, { reason }),
  forfeitDeposit: (id: string, reason: string) =>
    http.post<T.DepositView>(`/api/bookings/${id}/deposit/forfeit`, { reason }),
  depositsToResolve: () => http.get<T.ToResolve[]>('/api/deposits/to-resolve'),

  // photos
  bookingPhotos: (id: string) => http.get<T.BookingPhoto[]>(`/api/bookings/${id}/photos`),
  addBookingPhoto: (id: string, file: File, phase: T.PhotoPhase, caption: string) => {
    const f = new FormData();
    f.append('file', file);
    f.append('phase', phase);
    if (caption) f.append('caption', caption);
    return http.upload<T.BookingPhoto>(`/api/bookings/${id}/photos`, f);
  },
  bookingPhotoPath: (photoId: string) => `/api/photos/${photoId}/content`,

  // incidents
  raiseIncident: (body: { bookingId: string; kind: T.IncidentKind; description: string }) =>
    http.post<T.Incident>('/api/incidents', body),
  incidents: (status?: string) => http.get<T.Incident[]>('/api/incidents' + qs({ status })),
  reviewIncident: (id: string, note: string) => http.post<T.Incident>(`/api/incidents/${id}/review`, { note }),
  resolveIncident: (id: string, resolution: string) =>
    http.post<T.Incident>(`/api/incidents/${id}/resolve`, { resolution }),

  // extensions
  requestExtension: (bookingId: string, requestedEndAt: string, reason: string) =>
    http.post<T.Extension>(`/api/bookings/${bookingId}/extensions`, { requestedEndAt, reason }),
  extensions: (status = 'requested') => http.get<T.Extension[]>('/api/extensions' + qs({ status })),
  decideExtension: (id: string, action: 'approve' | 'reject', reason: string) =>
    http.post<T.Extension>(`/api/extensions/${id}/decision`, { action, reason }),

  // notifications
  inbox: () => http.get<T.Inbox>('/api/notifications'),
  markRead: (id: number) => http.post<T.Inbox>(`/api/notifications/${id}/read`),
  markAllRead: () => http.post<T.Inbox>('/api/notifications/read-all'),

  // dashboards
  borrowerDashboard: () => http.get<T.BorrowerDashboard>('/api/dashboard/borrower'),
  staffDashboard: () => http.get<T.StaffDashboard>('/api/dashboard/staff'),
  adminDashboard: () => http.get<T.AdminDashboard>('/api/dashboard/admin'),

  // admin
  adminOrganisations: (verified?: boolean) =>
    http.get<T.AdminOrganisation[]>('/api/admin/organisations' + qs({ verified })),
  verifyOrganisation: (id: string, reason: string) =>
    http.post<T.AdminOrganisation>(`/api/admin/organisations/${id}/verify`, { reason }),
  adminUsers: (q?: string) => http.get<T.AdminUser[]>('/api/admin/users' + qs({ q })),
  suspendUser: (id: string, reason: string) => http.post<T.AdminUser>(`/api/admin/users/${id}/suspend`, { reason }),
  reinstateUser: (id: string, reason: string) => http.post<T.AdminUser>(`/api/admin/users/${id}/reinstate`, { reason }),
  adminAudit: (p: { entityType?: string; action?: string; actorRole?: string; q?: string; page?: number; size?: number }) =>
    http.get<T.AuditPage>('/api/admin/audit' + qs(p)),
};
