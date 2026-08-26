import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

type Role = 'student' | 'faculty' | 'admin';

interface User {
  name: string;
  email: string;
  password: string;
  role: Role;
  joinedAt?: string;
}

function AdminDashboard() {
  const navigate = useNavigate();

  const [currentUser] = useState<User | null>(() =>
    JSON.parse(localStorage.getItem('nexam_current_user') || 'null'),
  );

  const [users, setUsers] = useState<User[]>(() =>
    JSON.parse(localStorage.getItem('nexam_users') || '[]'),
  );

  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') {
      navigate('/login');
    }
  }, [currentUser, navigate]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();

    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term) ||
        user.role.toLowerCase().includes(term),
    );
  }, [search, users]);

  const students = users.filter((user) => user.role === 'student').length;
  const faculty = users.filter((user) => user.role === 'faculty').length;
  const admins = users.filter((user) => user.role === 'admin').length;

  function saveUsers(updatedUsers: User[]) {
    localStorage.setItem('nexam_users', JSON.stringify(updatedUsers));
    setUsers(updatedUsers);
  }

  function changeRole(email: string, role: Role) {
    const updatedUsers = users.map((user) =>
      user.email === email ? { ...user, role } : user,
    );

    saveUsers(updatedUsers);
  }

  function deleteUser(user: User) {
    if (!currentUser) {
      return;
    }

    if (user.email === currentUser.email) {
      window.alert('You cannot delete the account you are currently using.');
      return;
    }

    const confirmed = window.confirm(
      `Delete ${user.name}'s account? This cannot be undone.`,
    );

    if (confirmed) {
      const updatedUsers = users.filter(
        (item) => item.email !== user.email,
      );

      saveUsers(updatedUsers);
    }
  }

  function logout() {
    localStorage.removeItem('nexam_current_user');
    navigate('/login');
  }

  if (!currentUser || currentUser.role !== 'admin') {
    return null;
  }

  return (
    <main className="portal-page">
      <header className="portal-header">
        <Link to="/" className="portal-brand">
          <span>N</span>
          NEXAM <strong>AI</strong>
        </Link>

        <div className="portal-user">
          <span className="portal-avatar">
            {currentUser.name.charAt(0).toUpperCase()}
          </span>

          <div>
            <strong>{currentUser.name}</strong>
            <small>Administrator</small>
          </div>

          <button className="exam-outline-btn" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <section className="portal-content">
        <div className="portal-heading">
          <div>
            <span className="exam-portal-code">ADMINISTRATION PORTAL</span>
            <h1>Platform overview</h1>
            <p>Manage NEXAM AI users, access roles, and platform activity.</p>
          </div>
        </div>

        <section className="portal-stats">
          <article className="portal-stat-card">
            <span className="portal-stat-icon">◉</span>
            <div>
              <small>Total users</small>
              <strong>{users.length}</strong>
              <small className="portal-stat-sub">Platform accounts</small>
            </div>
          </article>

          <article className="portal-stat-card">
            <span className="portal-stat-icon">◒</span>
            <div>
              <small>Students</small>
              <strong>{students}</strong>
              <small className="portal-stat-sub">Active learners</small>
            </div>
          </article>

          <article className="portal-stat-card">
            <span className="portal-stat-icon">◈</span>
            <div>
              <small>Faculty</small>
              <strong>{faculty}</strong>
              <small className="portal-stat-sub">Exam creators</small>
            </div>
          </article>

          <article className="portal-stat-card">
            <span className="portal-stat-icon">⌘</span>
            <div>
              <small>Administrators</small>
              <strong>{admins}</strong>
              <small className="portal-stat-sub">Platform managers</small>
            </div>
          </article>
        </section>

        <section className="portal-panel portal-submissions">
          <div className="portal-table-title">
            <div>
              <h2>User management</h2>
              <p>Update roles or remove inactive user accounts.</p>
            </div>

            <input
              className="portal-select"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search users..."
            />
          </div>

          <div className="portal-table-scroll">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role access</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.email}>
                    <td>
                      <div className="portal-user-cell">
                        <span className="portal-user-avatar-sm">
                          {user.name.charAt(0).toUpperCase()}
                        </span>
                        <strong>{user.name}</strong>
                      </div>
                    </td>

                    <td>{user.email}</td>

                    <td>
                      <select
                        className="portal-select"
                        value={user.role}
                        onChange={(event) =>
                          changeRole(
                            user.email,
                            event.target.value as Role,
                          )
                        }
                      >
                        <option value="student">Student</option>
                        <option value="faculty">Faculty</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </td>

                    <td>
                      <button
                        className="faculty-delete-btn"
                        onClick={() => deleteUser(user)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredUsers.length === 0 && (
            <p className="portal-empty-text">No matching users found.</p>
          )}
        </section>
      </section>
    </main>
  );
}

export default AdminDashboard;