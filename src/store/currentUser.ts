import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { USERS } from '../domain/seed';
import type { User } from '../domain/types';

// The store holds only who is acting. Envelopes are NOT cached here:
// screens read them from the service, so there is one source of truth.
type CurrentUserState = { userId: string; setUserId: (id: string) => void };

export const useCurrentUserStore = create<CurrentUserState>()(
  persist((set) => ({ userId: USERS[0].id, setUserId: (userId) => set({ userId }) }), {
    name: 'minisign.currentUser.v1',
  }),
);

export function useCurrentUser(): User {
  const userId = useCurrentUserStore((s) => s.userId);
  return USERS.find((u) => u.id === userId) ?? USERS[0];
}
