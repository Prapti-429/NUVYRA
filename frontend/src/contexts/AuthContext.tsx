import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiClient } from '../services/api';

export interface User {
  id: string;
  email: string;
  full_name?: string;
  role?: string;
  is_active: boolean;
  subject_anonymous_id?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const clearStoredAuth = () => { localStorage.removeItem('nuvyra_token'); localStorage.removeItem('access_token'); localStorage.removeItem('refresh_token'); };

const loadCurrentUser = async (): Promise<User> => {
  const response = await apiClient.get('/auth/me');
  return response.data as User;
};

const decodeAccessTokenUser = (accessToken: string): User | null => {
  try {
    const payloadPart = accessToken.split('.')[1];
    if (!payloadPart) return null;
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const payload = JSON.parse(window.atob(padded)) as {
      sub?: string;
      role?: string;
    };
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      email: '',
      role: payload.role || 'patient',
      is_active: true,
    };
  } catch {
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('nuvyra_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('nuvyra_token');
      if (storedToken) {
        try {
          const currentUser = await loadCurrentUser();
          setUser(currentUser);
          setToken(storedToken);
        } catch (error: any) {
          if (error?.status === 401 || error?.code === 'HTTP_401') { clearStoredAuth(); setToken(null); setUser(null); }
          else {
            // Keep an already-issued session available during a temporary
            // network outage; decode only non-sensitive identity claims locally.
            const tokenUser = decodeAccessTokenUser(storedToken);
            if (tokenUser) setUser(tokenUser);
            setToken(storedToken);
          }
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const response = await apiClient.post('/auth/login', {
      email: normalizedEmail,
      password,
    });
    const { access_token, refresh_token, user: authenticatedUser } = response.data || {};

    // Validate the complete response before persisting anything. A partial
    // response must never leave the UI looking signed in with a broken session.
    if (!access_token || !authenticatedUser?.id) {
      throw new Error('Sign-in could not be completed because the server returned an incomplete session. Please try again.');
    }

    localStorage.setItem('nuvyra_token', access_token);
    localStorage.setItem('access_token', access_token);
    if (refresh_token) localStorage.setItem('refresh_token', refresh_token);
    setToken(access_token);
    setUser(authenticatedUser as User);
  };

  const register = async (email: string, password: string, fullName?: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const response = await apiClient.post('/auth/register-session', {
      email: normalizedEmail,
      password,
      full_name: fullName,
    });
    const { access_token, refresh_token, user: authenticatedUser } = response.data || {};

    if (!access_token || !authenticatedUser?.id) {
      throw new Error('The server did not complete account registration and sign-in. Please try again.');
    }

    localStorage.setItem('nuvyra_token', access_token);
    localStorage.setItem('access_token', access_token);
    if (refresh_token) localStorage.setItem('refresh_token', refresh_token);
    setToken(access_token);
    setUser(authenticatedUser as User);
  };

  const logout = () => {
    // Fire-and-forget server revocation, then clear the browser session
    // immediately. Logout must never leave the user waiting for a cold backend.
    void apiClient.post('/auth/logout').catch(() => undefined);
    clearStoredAuth();
    setToken(null);
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
