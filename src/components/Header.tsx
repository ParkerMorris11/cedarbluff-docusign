import { Link } from 'react-router';
import { USERS } from '../domain/seed';
import { useCurrentUser, useCurrentUserStore } from '../store/currentUser';

export function Header() {
  const user = useCurrentUser();
  const setUserId = useCurrentUserStore((s) => s.setUserId);
  return (
    <header className="header">
      <Link to="/" className="brand">MiniSign</Link>
      <label>
        Acting as{' '}
        <select value={user.id} onChange={(e) => setUserId(e.target.value)}>
          {USERS.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.email})
            </option>
          ))}
        </select>
      </label>
    </header>
  );
}
