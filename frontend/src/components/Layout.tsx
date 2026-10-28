import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Notification } from '../api/types';
import { useAuth } from '../lib/auth';
import { when } from '../lib/format';
import { label } from '../lib/labels';

interface NavItem {
  to: string;
  text: string;
}

function navFor(role: string | undefined): NavItem[] {
  const common: NavItem[] = [{ to: '/', text: 'Discover' }];
  switch (role) {
    case 'user':
      return [...common, { to: '/dashboard', text: 'My dashboard' }, { to: '/bookings', text: 'My bookings' }, { to: '/profile', text: 'Profile' }];
    case 'owner':
    case 'manager':
      return [
        ...common,
        { to: '/staff', text: 'Staff dashboard' },
        { to: '/staff/queue', text: 'Requests' },
        { to: '/staff/verifications', text: 'Verifications' },
        { to: '/staff/bookings', text: 'All bookings' },
      ];
    case 'admin':
      return [...common, { to: '/admin', text: 'Admin' }];
    default:
      return common;
  }
}

function notificationLink(n: Notification): string | null {
  if (n.entityType === 'booking' && n.entityId) return `/bookings/${n.entityId}`;
  if (n.entityType === 'credential') return '/profile';
  if (n.entityType === 'organisation') return '/staff';
  return null;
}

function Bell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const inbox = useQuery({ queryKey: ['inbox'], queryFn: api.inbox, refetchInterval: 30_000 });
  const read = useMutation({ mutationFn: api.markRead, onSuccess: (d) => qc.setQueryData(['inbox'], d) });
  const readAll = useMutation({ mutationFn: api.markAllRead, onSuccess: (d) => qc.setQueryData(['inbox'], d) });
  const unread = inbox.data?.unread ?? 0;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Notifications, ${unread} unread`}
        className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-white hover:bg-teal-800"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[1.25rem] rounded-full bg-amber-300 px-1 text-center text-xs font-bold text-slate-950">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(92vw,24rem)] rounded-lg border border-slate-200 bg-white text-slate-900 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
            <h2 className="font-bold">Notifications</h2>
            <button
              type="button"
              className="text-sm font-semibold text-teal-800 hover:underline disabled:opacity-50"
              onClick={() => readAll.mutate()}
              disabled={unread === 0}
            >
              Mark all read
            </button>
          </div>
          {inbox.isLoading && <p className="p-4 text-slate-700">Loading…</p>}
          {inbox.data && inbox.data.items.length === 0 && <p className="p-4 text-slate-700">Nothing yet.</p>}
          <ul className="max-h-[60vh] overflow-y-auto">
            {inbox.data?.items.map((n) => {
              const to = notificationLink(n);
              return (
                <li key={n.id} className={`border-b border-slate-100 ${n.readAt ? '' : 'bg-teal-50'}`}>
                  <button
                    type="button"
                    className="block w-full px-4 py-3 text-left hover:bg-slate-50"
                    onClick={() => {
                      if (!n.readAt) read.mutate(n.id);
                      setOpen(false);
                      if (to) navigate(to);
                    }}
                  >
                    <span className="block text-sm">
                      {!n.readAt && <span className="mr-1 font-bold text-teal-900">New:</span>}
                      {n.message}
                    </span>
                    <span className="mt-1 block text-xs text-slate-600">{when(n.createdAt)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { session, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const items = navFor(session?.role);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `block rounded-md px-3 py-2 text-sm font-semibold text-white no-underline hover:bg-teal-800 hover:no-underline ${isActive ? 'bg-teal-900 underline' : ''}`;

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">
        Skip to content
      </a>
      <header className="bg-teal-700 text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2">
          <Link to="/" className="mr-2 flex items-center gap-2 text-lg font-bold text-white no-underline hover:no-underline">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            SpareSlot
          </Link>
          <nav aria-label="Main" className="hidden flex-1 md:block">
            <ul className="flex flex-wrap items-center gap-1">
              {items.map((i) => (
                <li key={i.to}>
                  <NavLink to={i.to} end={i.to === '/' || i.to === '/staff'} className={linkCls}>
                    {i.text}
                  </NavLink>
                </li>
              ))}
              <li>
                <NavLink to="/tour" className={linkCls}>
                  Judge’s tour
                </NavLink>
              </li>
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {session && <Bell />}
            {session ? (
              <div className="hidden items-center gap-2 md:flex">
                <span className="text-sm">
                  {session.fullName} <span className="opacity-90">({label(session.role)})</span>
                </span>
                <button
                  type="button"
                  className="min-h-[44px] rounded-md border border-white/70 px-3 text-sm font-semibold hover:bg-teal-800"
                  onClick={() => {
                    signOut();
                    navigate('/signin');
                  }}
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                to="/signin"
                className="hidden min-h-[44px] items-center rounded-md bg-white px-3 text-sm font-semibold text-teal-900 no-underline hover:no-underline md:inline-flex"
              >
                Sign in
              </Link>
            )}
            <button
              type="button"
              className="inline-flex min-h-[44px] items-center rounded-md border border-white/70 px-3 text-sm font-semibold md:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? 'Close menu' : 'Menu'}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav id="mobile-menu" aria-label="Main" className="border-t border-teal-600 px-4 pb-3 md:hidden">
            <ul className="space-y-1 pt-2">
              {items.map((i) => (
                <li key={i.to}>
                  <NavLink to={i.to} end={i.to === '/' || i.to === '/staff'} className={linkCls}>
                    {i.text}
                  </NavLink>
                </li>
              ))}
              <li>
                <NavLink to="/tour" className={linkCls}>
                  Judge’s tour
                </NavLink>
              </li>
              <li className="pt-2">
                {session ? (
                  <button
                    type="button"
                    className="w-full rounded-md border border-white/70 px-3 py-2 text-left text-sm font-semibold"
                    onClick={() => {
                      signOut();
                      navigate('/signin');
                    }}
                  >
                    Sign out ({session.fullName}, {label(session.role)})
                  </button>
                ) : (
                  <NavLink to="/signin" className={linkCls}>
                    Sign in
                  </NavLink>
                )}
              </li>
            </ul>
          </nav>
        )}
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 px-4 py-4 text-sm text-slate-700">
          <span>SpareSlot — a hackathon prototype. All demo data is fictional.</span>
          <Link to="/privacy">Privacy and security</Link>
          <Link to="/tour">Judge’s tour</Link>
          <span>Payments are a demo: no real money moves.</span>
        </div>
      </footer>
    </div>
  );
}
