import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

type Role = 'student' | 'faculty' | 'admin';

interface CurrentUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

interface PlatformUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  created_at: string;
  college_name?: string;
  department_name?: string;
  class_name?: string;
  class_section?: string;
}

const API_BASE = 'http://localhost:5000/api/auth';

function AdminDashboard() {
  const navigate = useNavigate();

  const [currentUser] = useState<CurrentUser | null>(() =>
    JSON.parse(localStorage.getItem('nexam_current_user') || 'null'),
  );

  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') {
      navigate('/login');
      return;
    }

    loadUsers();
  }, [currentUser, navigate]);

  function loadUsers() {
    setLoading(true);
    fetch(`${API_BASE}/users`)
      .then((res) => res.json())
      .then((data) => setUsers(data.users || []))
      .finally(() => setLoading(false));
  }

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        !term ||
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term) ||
        (user.college_name || '').toLowerCase().includes(term) ||
        (user.department_name || '').toLowerCase().includes(term);

      const matchesRole = roleFilter === 'all' || user.role === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [search, users, roleFilter]);

  const students = users.filter((user) => user.role === 'student').length;
  const faculty = users.filter((user) => user.role === 'faculty').length;
  const admins = users.filter((user) => user.role === 'admin').length;

  async function deleteUser(user: PlatformUser) {
    if (!currentUser) return;

    if (user.id === currentUser.id) {
      window.alert('You cannot delete the account you are currently using.');
      return;
    }

    const confirmed = window.confirm(
      `Delete ${user.name}'s account? This will permanently remove their profile and cannot be undone.`,
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`${API_BASE}/users/${user.id}`, { method: 'DELETE' });
      const data = await response.json();

      if (!response.ok) {
        window.alert(data.error || 'Failed to delete user.');
        return;
      }

      setUsers((current) => current.filter((item) => item.id !== user.id));
    } catch {
      window.alert('Could not connect to the server.');
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
          <span className="portal-avatar">{currentUser.name.charAt(0).toUpperCase()}</span>
          <div>
            <strong>{currentUser.name}</strong>
            <small>Administrator</small>
          </div>
          <button className="exam-outline-btn" onClick={logout}>Sign out</button>
        </div>
      </header>

      <section className="portal-content">
        <div className="portal-heading">
          <div>
            <span className="exam-portal-code">ADMINISTRATION PORTAL</span>
            <h1>Platform overview</h1>
            <p>Manage NEXAM AI students, faculty, and platform activity.</p>
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
              <p>View student and faculty profiles, or remove accounts.</p>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <select
                className="portal-select"
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value as 'all' | Role)}
              >
                <option value="all">All roles</option>
                <option value="student">Students</option>
                <option value="faculty">Faculty</option>
                <option value="admin">Admins</option>
              </select>

              <input
                className="portal-select"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, email, college..."
              />
            </div>
          </div>

          {loading ? (
            <p className="portal-empty-text">Loading users...</p>
          ) : (
            <div className="portal-table-scroll">
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>College / Dept</th>
                    <th>Class</th>
                    <th>Joined</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div className="portal-user-cell">
                          <span className="portal-user-avatar-sm">{user.name.charAt(0).toUpperCase()}</span>
                          <strong>{user.name}</strong>
                        </div>
                      </td>

                      <td>{user.email}</td>

                      <td>
                        <span className={`faculty-exam-pill ${user.role === 'admin' ? 'proctored' : 'unproctored'}`}>
                          {user.role}
                        </span>
                      </td>

                      <td>
                        {user.college_name ? (
                          <>
                            <strong>{user.college_name}</strong>
                            <br />
                            <small>{user.department_name}</small>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>

                      <td>{user.class_name ? `${user.class_name} - ${user.class_section}` : '—'}</td>

                      <td>{new Date(user.created_at).toLocaleDateString('en-IN')}</td>

                      <td>
                        <button className="faculty-delete-btn" onClick={() => deleteUser(user)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && filteredUsers.length === 0 && (
            <p className="portal-empty-text">No matching users found.</p>
          )}
        </section>
      </section>
    </main>
  );
}

export default AdminDashboard;