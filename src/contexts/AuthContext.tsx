import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, isAuthenticated, getAuthToken, logout as authLogout } from '../services/authService';

interface User {
  id: number;
  email: string;
  credits: number;
  isSubUser?: boolean;
  parentUserId?: number;
  name?: string;
  recharge_disabled?: boolean;
  is_agent?: boolean;
  invited_by?: number | null;
  applied_agent?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => void;
  setUser: (user: User | null) => void;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = () => {
      if (isAuthenticated()) {
        const currentUser = getCurrentUser();
        setUser(currentUser);
      }
      setIsLoading(false);
    };

    checkAuth();

    const handleCreditsUpdate = () => {
      const currentUser = getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
      }
    };

    const handleAuthStateChanged = () => {
      checkAuth();
    };

    window.addEventListener('credits-updated', handleCreditsUpdate);
    window.addEventListener('auth-state-changed', handleAuthStateChanged);
    return () => {
      window.removeEventListener('credits-updated', handleCreditsUpdate);
      window.removeEventListener('auth-state-changed', handleAuthStateChanged);
    };
  }, []);

  const logout = () => {
    authLogout();
    setUser(null);
    window.location.href = '/auth';
  };

const refreshUser = async () => {
    try {
      const token = getAuthToken();
      if (!token) { setUser(null); return; }
      
      const response = await fetch('/api/auth/credits', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      
      if (data.success) {
        const currentUser = getCurrentUser();
        if (currentUser) {
          currentUser.credits = data.credits;
          if (data.quota_mode) currentUser.quota_mode = data.quota_mode;
          if (data.recharge_disabled !== undefined) currentUser.recharge_disabled = data.recharge_disabled;
          sessionStorage.setItem('user', JSON.stringify(currentUser));
          setUser(currentUser);
        }
      }
    } catch (error) {
      console.error('refreshUser error:', error);
      const currentUser = getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        logout,
        setUser,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
