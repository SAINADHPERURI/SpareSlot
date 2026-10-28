import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSession, onSessionChange, setSession, type Session } from '../api';
import type { TokenResponse } from '../api/types';

interface AuthValue {
  session: Session | null;
  signIn: (t: TokenResponse) => void;
  signOut: () => void;
  isStaff: boolean;
  isUser: boolean;
  isAdmin: boolean;
  isOwner: boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setLocal] = useState<Session | null>(getSession());
  const queryClient = useQueryClient();

  useEffect(() => onSessionChange(setLocal), []);

  const value: AuthValue = {
    session,
    signIn: (t) => {
      queryClient.clear();
      setSession({ token: t.token, userId: t.userId, role: t.role, orgId: t.orgId, fullName: t.fullName });
    },
    signOut: () => {
      setSession(null);
      queryClient.clear();
    },
    isStaff: session?.role === 'owner' || session?.role === 'manager',
    isUser: session?.role === 'user',
    isAdmin: session?.role === 'admin',
    isOwner: session?.role === 'owner',
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** Where each role lands after signing in. */
export function homeFor(role: string | undefined): string {
  switch (role) {
    case 'user':
      return '/dashboard';
    case 'owner':
    case 'manager':
      return '/staff';
    case 'admin':
      return '/admin';
    default:
      return '/';
  }
}
