import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface Exam {
  id: number;
  title: string;
  subject?: string;
  duration: number;
  total_marks: number;
  proctoring_enabled: number;
  start_time: string;
  end_time: string;
}

interface Submission {
  id: number;
  exam_id: number;
  student_id: number;
  score: number;
  total_marks: number;
  incident_count: number;
  auto_submitted: number;
  submitted_at: string;
  student_name?: string;
  student_email?: string;
}

const API_BASE = 'http://localhost:5000/api';

function FacultyDashboard() {
  const navigate = useNavigate();

  const [currentUser] = useState<User | null>(() =>
    JSON.parse(localStorage.getItem('nexam_current_user') || 'null'),
  );

  const [exams, setExams] = useState<Exam[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [reattemptRequests, setReattemptRequests] = useState<any[]>([]);
  const [selectedExam, setSelectedExam] = useState('all');
  const [loading, setLoading] = useState(true);

  interface FullSubmission extends Submission {
    exam_title: string;
  }

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }
    if (currentUser.role === 'student') {
      navigate('/dashboard');
      return;
    }
    if (currentUser.role === 'admin') {
      navigate('/admin');
      return;
    }

        Promise.all([
      fetch(`${API_BASE}/exams/for-faculty?facultyId=${currentUser.id}`).then((r) => r.json()),
      fetch(`${API_BASE}/exams/submissions-for-faculty?facultyId=${currentUser.id}`).then((r) => r.json()),
      fetch(`${API_BASE}/exams/reattempt-requests?facultyId=${currentUser.id}`).then((r) => r.json()),
    ])
      .then(([examData, subData, reqData]) => {
        setExams(examData.exams || []);
        setSubmissions(subData.submissions || []);
        setReattemptRequests(reqData.requests || []);
      })
      .finally(() => setLoading(false));
  }, [currentUser, navigate]);

  const filteredSubmissions = selectedExam === 'all'
    ? submissions
    : submissions.filter((s) => String(s.exam_id) === selectedExam);

  const averageScore = submissions.length === 0 ? 0 : Math.round(
    submissions.reduce((total, s) => total + (s.score / s.total_marks) * 100, 0) / submissions.length,
  );

  const totalIncidents = submissions.reduce((total, s) => total + (s.incident_count || 0), 0);

    async function resolveReattempt(requestId: number, decision: 'approved' | 'denied') {
    try {
      const response = await fetch(`${API_BASE}/exams/reattempt-requests/${requestId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });

      if (response.ok) {
        setReattemptRequests((current) => current.filter((r) => r.id !== requestId));
      }
    } catch {
      window.alert('Could not connect to the server.');
    }
  }
  function logout() {
    localStorage.removeItem('nexam_current_user');
    navigate('/login');
  }

  function formatSchedule(time: string) {
    const date = new Date(time);
    if (Number.isNaN(date.getTime())) return 'Not scheduled';
    return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  if (!currentUser || currentUser.role !== 'faculty') {
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
            <small>Faculty workspace</small>
          </div>
          <button className="exam-outline-btn" onClick={logout}>Sign out</button>
        </div>
      </header>

      <section className="portal-content">
        <div className="portal-heading">
          <div>
            <span className="exam-portal-code">FACULTY WORKSPACE</span>
            <h1>Assessment command center</h1>
            <p>Create secure exams and review submissions for your classes.</p>
          </div>
          <Link to="/create-exam" className="exam-primary-btn">+ Create exam</Link>
          <Link to="/student-report" className="exam-outline-btn">View student report</Link>
        </div>

        <section className="portal-stats">
          <article className="portal-stat-card">
            <span className="portal-stat-icon">◫</span>
            <div><small>Published exams</small><strong>{exams.length}</strong></div>
          </article>
          <article className="portal-stat-card">
            <span className="portal-stat-icon">✓</span>
            <div><small>Student submissions</small><strong>{submissions.length}</strong></div>
          </article>
          <article className="portal-stat-card">
            <span className="portal-stat-icon">↗</span>
            <div><small>Average score</small><strong>{averageScore ? `${averageScore}%` : '—'}</strong></div>
          </article>
          <article className="portal-stat-card">
            <span className="portal-stat-icon warn">!</span>
            <div><small>Proctoring incidents</small><strong className={totalIncidents > 0 ? 'stat-danger' : ''}>{totalIncidents}</strong></div>
          </article>
        </section>

        <div className="portal-section-header">
          <div>
            <h2>My examinations</h2>
            <p>Exams you've published, assigned to your classes.</p>
          </div>
          <Link to="/create-exam" className="exam-outline-btn">Create another exam</Link>
        </div>

        {loading ? (
          <p className="no-users">Loading exams...</p>
        ) : exams.length === 0 ? (
          <section className="portal-panel portal-empty">
            <span>◫</span>
            <h3>No exams published yet</h3>
            <p>Create your first exam for your assigned classes.</p>
            <Link to="/create-exam" className="exam-primary-btn">Create exam →</Link>
          </section>
        ) : (
          <section className="faculty-exam-list-formal">
            {exams.map((exam) => (
              <article className="faculty-exam-card-formal" key={exam.id}>
                <div className="faculty-exam-main-formal">
                  <span className="exam-subject-icon-formal">⌘</span>
                  <div>
                    <small className="faculty-exam-subject">{exam.subject || 'General Assessment'}</small>
                    <h3>{exam.title}</h3>
                    <p className="faculty-exam-meta-formal">
                      {exam.duration} minutes · {formatSchedule(exam.start_time)} → {formatSchedule(exam.end_time)}
                    </p>
                  </div>
                </div>

                <div className="faculty-exam-details-formal">
                  <span className={`faculty-exam-pill ${exam.proctoring_enabled ? 'proctored' : 'unproctored'}`}>
                    {exam.proctoring_enabled ? '◉ AI proctored' : '○ Unproctored'}
                  </span>
                </div>
              </article>
            ))}
          </section>
        )}
                {reattemptRequests.length > 0 && (
          <section className="portal-panel portal-submissions">
            <div className="portal-table-title">
              <div>
                <h2>Reattempt requests</h2>
                <p>Students requesting permission to retake an exam.</p>
              </div>
            </div>
            <div className="portal-table-scroll">
              <table className="portal-table">
                <thead>
                  <tr><th>Student</th><th>Exam</th><th>Reason</th><th>Requested</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {reattemptRequests.map((req) => (
                    <tr key={req.id}>
                      <td><strong>{req.student_name}</strong><br /><small>{req.student_email}</small></td>
                      <td>{req.exam_title}</td>
                      <td>{req.reason || '—'}</td>
                      <td>{new Date(req.requested_at).toLocaleString('en-IN')}</td>
                      <td style={{ display: 'flex', gap: 8 }}>
                        <button className="exam-outline-btn" onClick={() => resolveReattempt(req.id, 'approved')}>Approve</button>
                        <button className="faculty-delete-btn" onClick={() => resolveReattempt(req.id, 'denied')}>Deny</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

          <section className="portal-panel portal-submissions">
          <div className="portal-table-title">
            <div>
              <h2>Evaluation and integrity queue</h2>
              <p>Objective answers are graded instantly. Review flagged attempts below.</p>
            </div>
            <select className="portal-select" value={selectedExam} onChange={(e) => setSelectedExam(e.target.value)}>
              <option value="all">All examinations</option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>{exam.title}</option>
              ))}
            </select>
          </div>

          {filteredSubmissions.length === 0 ? (
            <p className="portal-empty-text">No student submissions are available yet.</p>
          ) : (
            <div className="portal-table-scroll">
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Examination</th>
                    <th>Score</th>
                    <th>Integrity status</th>
                    <th>Submitted</th>
                    <th>Proctoring</th>
                  </tr>
                </thead>
                <tbody>
                  {(filteredSubmissions as unknown as FullSubmission[]).map((sub) => {
                    const percentage = Math.round((sub.score / sub.total_marks) * 100);
                    return (
                      <tr key={sub.id}>
                        <td>
                          <div className="portal-user-cell">
                            <span className="portal-user-avatar-sm">{sub.student_name?.charAt(0).toUpperCase() || 'S'}</span>
                            <div>
                              <strong>{sub.student_name}</strong>
                              <small>{sub.student_email}</small>
                            </div>
                          </div>
                        </td>
                        <td>{sub.exam_title}</td>
                        <td>
                          <strong>{sub.score}/{sub.total_marks}</strong>
                          <small className="portal-table-sub">{percentage}%</small>
                        </td>
                        <td className={sub.incident_count > 0 ? 'portal-integrity-risk' : 'portal-integrity-clear'}>
                          {sub.incident_count > 0 ? `! ${sub.incident_count} incident(s)` : '✓ Clear'}
                          {Boolean(sub.auto_submitted) && <small className="portal-table-sub">Auto-submitted</small>}
                        </td>
                        <td>{new Date(sub.submitted_at).toLocaleString('en-IN')}</td>
                        <td>
                          <Link to={`/faculty/exam/${sub.exam_id}/snapshots`} className="exam-outline-btn">
                            View snapshots
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

export default FacultyDashboard;