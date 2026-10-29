import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { API_BASE } from '../api/client';
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

/** Closes a popover on an outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return ref;
}

function Bell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ref = useDismiss(open, () => setOpen(false));
  const inbox = useQuery({ queryKey: ['inbox'], queryFn: api.inbox, refetchInterval: 30_000 });
  const read = useMutation({ mutationFn: api.markRead, onSuccess: (d) => qc.setQueryData(['inbox'], d) });
  const readAll = useMutation({ mutationFn: api.markAllRead, onSuccess: (d) => qc.setQueryData(['inbox'], d) });
  const unread = inbox.data?.unread ?? 0;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Notifications, ${unread} unread`}
        className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-white hover:bg-ink-soft"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[1.25rem] rounded-full bg-accent px-1 text-center text-xs font-bold text-ink">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(92vw,24rem)] overflow-hidden rounded-lg border border-slate-200 bg-white text-ink shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 bg-mist-soft px-4 py-3">
            <h2 className="font-bold">Notifications</h2>
            <button
              type="button"
              className="text-sm font-semibold text-brand hover:underline disabled:opacity-50 disabled:no-underline"
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
                <li key={n.id} className={`border-b border-slate-100 ${n.readAt ? '' : 'border-l-4 border-l-brand bg-mist-soft'}`}>
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
                      {!n.readAt && <span className="mr-1 font-bold text-brand">New:</span>}
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

function UserMenu() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  if (!session) return null;
  const initials = session.fullName
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
  const item = 'block px-4 py-2 text-sm text-ink no-underline hover:bg-mist-soft hover:no-underline';
  return (
    <div className="relative hidden md:block" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Account: ${session.fullName}, ${label(session.role)}`}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[44px] items-center gap-2 rounded-md px-2 text-left text-white hover:bg-ink-soft"
      >
        <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-ink">
          {initials}
        </span>
        <span aria-hidden="true" className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">{session.fullName}</span>
          <span className="text-xs text-accent">{label(session.role)}</span>
        </span>
        <span aria-hidden="true" className="text-xs">
          ▾
        </span>
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-ink shadow-xl">
          <Link to="/profile" className={item} onClick={() => setOpen(false)}>
            Profile
          </Link>
          <Link to="/tour" className={item} onClick={() => setOpen(false)}>
            Judge’s tour
          </Link>
          <button
            type="button"
            className="block w-full border-t border-slate-200 px-4 py-2 text-left text-sm font-semibold text-ink hover:bg-mist-soft"
            onClick={() => {
              signOut();
              navigate('/signin');
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * On free hosting the API sleeps when idle and takes about a minute to wake. If the first call is slow, say so
 * instead of leaving the page looking frozen; the banner goes away by itself once the API answers.
 */
function ServerWaking() {
  const [waiting, setWaiting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    let done = false;
    const slow = setTimeout(() => !done && setWaiting(true), 2500);
    const tick = setInterval(() => !done && setSeconds((s) => s + 1), 1000);
    // read the body too, so the request completes instead of staying open
    fetch(API_BASE + '/api/organisations')
      .then((res) => res.arrayBuffer())
      .catch(() => undefined)
      .finally(() => {
        done = true;
        setWaiting(false);
        clearTimeout(slow);
        clearInterval(tick);
      });
    return () => {
      done = true;
      clearTimeout(slow);
      clearInterval(tick);
    };
  }, []);
  if (!waiting) return null;
  return (
    <div role="status" aria-live="polite" className="mb-6 rounded-lg border-2 border-accent bg-mist p-4 text-ink">
      <p className="font-bold">The demo server is waking up…</p>
      <p className="text-sm">
        It runs on free hosting and sleeps when nobody has used it for a while. The first visit takes up to a minute
        ({seconds} s so far); this page will load by itself. After that everything is quick.
      </p>
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
    `relative block rounded-md px-3 py-2 text-sm font-semibold no-underline hover:bg-ink-soft hover:text-white hover:no-underline ${
      isActive ? 'text-white after:absolute after:inset-x-3 after:-bottom-1 after:h-[3px] after:rounded-full after:bg-accent' : 'text-slate-200'
    }`;
  const mobileCls = ({ isActive }: { isActive: boolean }) =>
    `block rounded-md border-l-4 px-3 py-2 text-sm font-semibold no-underline hover:bg-ink-soft hover:no-underline ${
      isActive ? 'border-accent bg-ink-soft text-white' : 'border-transparent text-slate-200'
    }`;

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">
        Skip to content
      </a>
      <header className="on-ink sticky top-0 z-30 bg-ink text-white shadow-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <Link to="/" className="mr-3 flex items-center gap-2 text-lg font-bold text-white no-underline hover:no-underline">
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
              <UserMenu />
            ) : (
              <Link
                to="/signin"
                className="hidden min-h-[44px] items-center rounded-md bg-accent px-4 text-sm font-semibold text-ink no-underline hover:bg-white hover:no-underline md:inline-flex"
              >
                Sign in
              </Link>
            )}
            <button
              type="button"
              className="inline-flex min-h-[44px] items-center rounded-md border border-slate-400 px-3 text-sm font-semibold text-white md:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? 'Close menu' : 'Menu'}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav id="mobile-menu" aria-label="Main" className="border-t border-ink-soft px-4 pb-3 md:hidden">
            {session && (
              <p className="pt-3 text-sm">
                {session.fullName} <span className="text-accent">· {label(session.role)}</span>
              </p>
            )}
            <ul className="space-y-1 pt-2">
              {items.map((i) => (
                <li key={i.to}>
                  <NavLink to={i.to} end={i.to === '/' || i.to === '/staff'} className={mobileCls}>
                    {i.text}
                  </NavLink>
                </li>
              ))}
              <li>
                <NavLink to="/tour" className={mobileCls}>
                  Judge’s tour
                </NavLink>
              </li>
              <li className="pt-2">
                {session ? (
                  <button
                    type="button"
                    className="w-full rounded-md border border-slate-400 px-3 py-2 text-left text-sm font-semibold text-white"
                    onClick={() => {
                      signOut();
                      navigate('/signin');
                    }}
                  >
                    Sign out
                  </button>
                ) : (
                  <NavLink to="/signin" className={mobileCls}>
                    Sign in
                  </NavLink>
                )}
              </li>
            </ul>
          </nav>
        )}
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <ServerWaking />
        <Outlet />
      </main>
      <footer className="mt-8 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-5 text-xs text-slate-600">
          <span>SpareSlot — a hackathon prototype. All demo data is fictional.</span>
          <Link to="/privacy">Privacy and security</Link>
          <Link to="/tour">Judge’s tour</Link>
          <span>Payments are a demo: no real money moves.</span>
        </div>
      </footer>
    </div>
  );
}
