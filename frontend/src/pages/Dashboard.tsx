import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

interface Exam {
  id: number;
  title: string;
  subject?: string;
  duration: number;
  total_marks: number;
  start_time: string;
  end_time: string;
}

interface CurrentUser {
  name: string;
  email: string;
  role: string;
  class_id: number;
}

const API_BASE = 'http://localhost:5000/api';

function Dashboard() {
  const [currentUser] = useState<CurrentUser | null>(() =>
    JSON.parse(localStorage.getItem('nexam_current_user') || 'null'),
  );

  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser?.class_id) {
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/exams/for-class?classId=${currentUser.class_id}`)
      .then((res) => res.json())
      .then((data) => setExams(data.exams || []))
      .finally(() => setLoading(false));
  }, [currentUser]);

  function examStatus(exam: Exam) {
    const now = new Date();
    const start = new Date(exam.start_time);
    const end = new Date(exam.end_time);

    if (now < start) return 'upcoming';
    if (now > end) return 'closed';
    return 'open';
  }

  return (
    <main className="exam-workspace-formal">
      <header className="exam-formal-header">
        <div className="exam-formal-header-left">
          <span className="exam-portal-code">STUDENT PORTAL</span>
          <h2>Examination dashboard</h2>
        </div>

        {currentUser && (
          <div className="exam-formal-candidate">
            <div>
              <strong>{currentUser.name}</strong>
              <small style={{ color: '#94a3b8' }}>{currentUser.email}</small>
            </div>
          </div>
        )}
      </header>

      <section className="dash-content">
        <div className="dash-section-header">
          <h3>Available examinations</h3>
          <p>Only exams assigned to your class appear here.</p>
        </div>

        {loading ? (
          <p className="no-users">Loading exams...</p>
        ) : exams.length === 0 ? (
          <div className="dash-empty-state">
            <span>◎</span>
            <h4>No exams assigned to your class yet</h4>
            <p>Check back once your faculty publishes one.</p>
          </div>
        ) : (
          <div className="dash-exam-list">
            {exams.map((exam) => {
              const status = examStatus(exam);

              return (
                <article className="dash-exam-card" key={exam.id}>
                  <div className="dash-exam-main">
                    <div className="dash-exam-title-row">
                      <h4>{exam.title}</h4>
                      <span className={`dash-status-badge ${status === 'open' ? 'completed' : 'pending'}`}>
                        {status === 'upcoming' ? 'Upcoming' : status === 'closed' ? 'Closed' : 'Open now'}
                      </span>
                    </div>

                    <div className="dash-exam-meta">
                      <span>{exam.subject || 'General'}</span>
                      <span>·</span>
                      <span>{exam.duration} min</span>
                      <span>·</span>
                      <span>{exam.total_marks} marks</span>
                      <span>·</span>
                      <span>{new Date(exam.start_time).toLocaleString()} → {new Date(exam.end_time).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="dash-exam-action">
                    {status === 'open' ? (
                      <Link to={`/exam/${exam.id}`}>
                        <button className="exam-primary-btn">Start exam →</button>
                      </Link>
                    ) : (
                      <button className="exam-outline-btn" disabled>
                        {status === 'upcoming' ? 'Not yet open' : 'Window closed'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

export default Dashboard;