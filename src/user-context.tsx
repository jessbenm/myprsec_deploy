import { createContext, useContext, useState, useCallback } from 'react';
import { getCurrentUser } from './app/auth-api';

export interface AppUser {
  id: number;
  name: string;
  email: string;
  phone: string;
  location: string;
  timezone: string;
  created_at: number;
  updated_at: number;
}

interface UserContextValue {
  user: AppUser | null;
  setUser: (u: AppUser | null) => void;
  refreshUser: () => Promise<void>;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  setUser: () => {},
  refreshUser: async () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      const res = await getCurrentUser();
      if (res.success && res.data?.user) {
        setUser(res.data.user as AppUser);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  }, []);

  return (
    <UserContext.Provider value={{ user, setUser, refreshUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
