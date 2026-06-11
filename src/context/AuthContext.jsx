import React, { createContext, useEffect, useState, useContext } from 'react';
import { supabase } from '../lib/supabaseClient';
import { buildSupabaseProfile, normalizeAppUser } from '../lib/authProfile';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let mounted = true;

    const bootstrapSession = async () => {
      const { data: refreshData } = await supabase.auth.refreshSession().catch(() => ({ data: null }));
      const { data } = refreshData?.session ? refreshData : await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      const sessionUser = data.session?.user || null;
      const profile = buildSupabaseProfile(sessionUser);

      setUser(profile);
      setIsAuthenticated(Boolean(profile));
    };

    bootstrapSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const profile = buildSupabaseProfile(session?.user || null);

      setUser(profile);
      setIsAuthenticated(Boolean(profile));
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
    localStorage.setItem('user', JSON.stringify(normalizedUser));
  };

  const logout = async () => {
    await supabase.auth.signOut().catch(() => {});
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
