import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

interface User {
  id: number;
  name: string;
  role: string;
}

interface StudentSummary {
  id: number;
  name: string;
}

const API_BASE = 'http://localhost:5000/api';
const SERVER_BASE = 'http://localhost:5000';

function ExamRecordings() {
  const navigate = useNavigate();
  const { examId } = useParams();

  const [currentUser] = useState<User | null>(() =>
    JSON.parse(localStorage.getItem('nexam_current_user') || 'null'),
  );

  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'faculty') {
      navigate('/login');
      return;
    }

    function loadStudents() {
      fetch(`${API_BASE}/exams/${examId}/recording-students`)
        .then((res) => res.json())
        .then((data) => setStudents(data.students || []));
    }

    loadStudents();
    const interval = window.setInterval(loadStudents, 5000);
    return () => window.clearInterval(interval);
  }, [examId, currentUser, navigate]);

  useEffect(() => {
    if (!selectedStudentId) return;

    setChecking(true);
    setVideoUrl(null);

    fetch(`${API_BASE}/exams/${examId}/recording?studentId=${selectedStudentId}`)
      .then((res) => res.json())
      .then((data) => setVideoUrl(data.exists ? `${SERVER_BASE}${data.url}` : null))
      .finally(() => setChecking(false));
  }, [selectedStudentId, examId]);

  if (!currentUser || currentUser.role !== 'faculty') {
    return null;
  }

  return (
    <main className="portal-page">
      <header className="portal-header">
        <Link to="/faculty" className="portal-brand">
          <span>N</span>
          NEXAM <strong>AI</strong>
        </Link>
        <div className="portal-user">
          <div>
            <strong>{currentUser.name}</strong>
            <small>Recording review</small>
          </div>
        </div>
      </header>

      <section className="portal-content">
        <div className="portal-heading">
          <div>
            <Link to="/faculty" className="back-link">← Faculty dashboard</Link>
            <span className="exam-portal-code">CANDIDATE RECORDINGS</span>
            <h1>Full exam session recordings</h1>
            <p>One complete video per student, covering their entire exam session.</p>
          </div>
        </div>

        <section className="portal-panel">
          <h2>Students</h2>
          {students.length === 0 ? (
            <p className="no-users">No recordings available yet for this exam.</p>
          ) : (
            <div className="faculty-class-options">
              {students.map((s) => (
                <button
                  key={s.id}
                  className={`exam-outline-btn ${selectedStudentId === s.id ? 'active' : ''}`}
                  onClick={() => setSelectedStudentId(s.id)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </section>

        {selectedStudentId && (
          <section className="portal-panel portal-submissions">
            <h2>Session recording</h2>
            {checking ? (
              <p className="portal-empty-text">Checking for recording...</p>
            ) : videoUrl ? (
              <video src={videoUrl} controls style={{ width: '100%', maxWidth: 720, borderRadius: 8 }} />
            ) : (
              <p className="portal-empty-text">No recording found for this student yet. It uploads once they finish or are terminated from the exam.</p>
            )}
          </section>
        )}
      </section>
    </main>
  );
}

export default ExamRecordings;