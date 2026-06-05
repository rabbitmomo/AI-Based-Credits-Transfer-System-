import React, { createContext, useEffect, useState, useContext } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext();

const buildUserProfile = (supabaseUser) => {
  if (!supabaseUser) {
    return null;
  }

  const fallbackName = supabaseUser.email ? supabaseUser.email.split('@')[0] : 'user';

  return {
    id: supabaseUser.id,
    idPengguna: supabaseUser.id,
    namaPengguna: supabaseUser.user_metadata?.full_name || fallbackName,
    emel: supabaseUser.email || '',
    peranan: supabaseUser.user_metadata?.peranan || 'pelajar',
  };
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let mounted = true;

    const bootstrapSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      const sessionUser = data.session?.user || null;
      const profile = buildUserProfile(sessionUser);

      setUser(profile);
      setIsAuthenticated(Boolean(profile));
    };

    bootstrapSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const profile = buildUserProfile(session?.user || null);

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
    const normalizedUser = {
      ...userData,
      id: userData?.id || userData?.idPengguna || null,
      idPengguna: userData?.idPengguna || userData?.id || null,
    };

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
