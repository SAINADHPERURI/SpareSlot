import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { setUnauthorizedHandler } from './api';
import { Layout } from './components/Layout';
import { Alert } from './components/ui';
import { homeFor, useAuth } from './lib/auth';
import { SignInPage } from './pages/SignInPage';
import { RegisterPage } from './pages/RegisterPage';
import { RegisterOrganisationPage } from './pages/RegisterOrganisationPage';
import { DiscoverPage } from './pages/DiscoverPage';
import { ResourcePage } from './pages/ResourcePage';
import { OrganisationPage } from './pages/OrganisationPage';
import { BookingPage } from './pages/BookingPage';
import { BorrowerDashboardPage } from './pages/BorrowerDashboardPage';
import { MyBookingsPage } from './pages/MyBookingsPage';
import { ProfilePage } from './pages/ProfilePage';
import { VerifyPage } from './pages/VerifyPage';
import { StaffDashboardPage } from './pages/StaffDashboardPage';
import { StaffQueuePage } from './pages/StaffQueuePage';
import { StaffBookingsPage } from './pages/StaffBookingsPage';
import { VerificationsPage } from './pages/VerificationsPage';
import { ResourceFormPage } from './pages/ResourceFormPage';
import { AdminPage } from './pages/AdminPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { TourPage } from './pages/TourPage';

type RoleName = 'user' | 'owner' | 'manager' | 'admin';

/** Sends anonymous visitors to sign in, and explains when the role cannot open a page. */
function RequireRole({ roles, children }: { roles: RoleName[]; children: ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  if (!roles.includes(session.role)) {
    return (
      <Alert tone="warning" title="This page is for another role">
        You are signed in as {session.role}. This page is for {roles.join(' or ')} accounts.
      </Alert>
    );
  }
  return <>{children}</>;
}

function NotFound() {
  return (
    <Alert tone="warning" title="Page not found">
      This page does not exist, or you do not have access to it.
    </Alert>
  );
}

export function App() {
  const navigate = useNavigate();
  const { session } = useAuth();

  useEffect(() => {
    setUnauthorizedHandler(() => navigate('/signin', { state: { expired: true } }));
  }, [navigate]);

  const staff: RoleName[] = ['owner', 'manager'];
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DiscoverPage />} />
        <Route path="signin" element={session ? <Navigate to={homeFor(session.role)} replace /> : <SignInPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="register-organisation" element={<RegisterOrganisationPage />} />
        <Route path="resources/:id" element={<ResourcePage />} />
        <Route path="organisations/:id" element={<OrganisationPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="tour" element={<TourPage />} />

        <Route path="bookings/:id" element={<RequireRole roles={['user', 'owner', 'manager', 'admin']}><BookingPage /></RequireRole>} />

        <Route path="dashboard" element={<RequireRole roles={['user']}><BorrowerDashboardPage /></RequireRole>} />
        <Route path="bookings" element={<RequireRole roles={['user']}><MyBookingsPage /></RequireRole>} />
        <Route path="profile" element={<RequireRole roles={['user', 'owner', 'manager', 'admin']}><ProfilePage /></RequireRole>} />
        <Route path="profile/verify" element={<RequireRole roles={['user']}><VerifyPage /></RequireRole>} />

        <Route path="staff" element={<RequireRole roles={staff}><StaffDashboardPage /></RequireRole>} />
        <Route path="staff/queue" element={<RequireRole roles={staff}><StaffQueuePage /></RequireRole>} />
        <Route path="staff/bookings" element={<RequireRole roles={staff}><StaffBookingsPage /></RequireRole>} />
        <Route path="staff/verifications" element={<RequireRole roles={staff}><VerificationsPage /></RequireRole>} />
        <Route path="staff/resources/new" element={<RequireRole roles={['owner']}><ResourceFormPage /></RequireRole>} />
        <Route path="staff/resources/:id/edit" element={<RequireRole roles={['owner']}><ResourceFormPage /></RequireRole>} />

        <Route path="admin" element={<RequireRole roles={['admin']}><AdminPage /></RequireRole>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
