import React, { createContext, useEffect, useState, useContext } from 'react';
import { supabase } from '../lib/supabaseClient';
import { buildSupabaseProfile, normalizeAppUser } from '../lib/authProfile';

const AuthContext = createContext({
  user: null,
  isAuthenticated: false,
  loading: true,
  login: () => {},
  logout: async () => {},
});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const bootstrapSession = async () => {
      const refreshResult = await supabase.auth.refreshSession().catch(() => null);
      const refreshSession = refreshResult?.data?.session || null;
      const sessionResult = refreshSession ? refreshResult : await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      const session = sessionResult?.data?.session || refreshSession || null;

      if (!mounted) {
        return;
      }

      const sessionUser = session?.user || null;
      const profile = buildSupabaseProfile(sessionUser);

      setUser(profile);
      setIsAuthenticated(Boolean(profile));
      setLoading(false);
    };

    bootstrapSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const profile = buildSupabaseProfile(session?.user || null);

      setUser(profile);
      setIsAuthenticated(Boolean(profile));
      setLoading(false);
      if (profile) {
        localStorage.setItem('user', JSON.stringify(profile));
      } else {
        localStorage.removeItem('user');
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const login = (userData) => {
    const normalizedUser = normalizeAppUser(userData);

    setUser(normalizedUser);
    setIsAuthenticated(true);
    setLoading(false);
    localStorage.setItem('user', JSON.stringify(normalizedUser));
  };

  const logout = async () => {
    await supabase.auth.signOut().catch(() => {});
    setUser(null);
    setIsAuthenticated(false);
    setLoading(false);
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
