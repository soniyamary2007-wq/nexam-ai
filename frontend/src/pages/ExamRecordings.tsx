import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

interface User {
  id: number;
  name: string;
  role: string;
}

interface RosterRow {
  roll_no: string;
  name: string;
  email: string;
  student_id: number | null;
  score: number | null;
  total_marks: number | null;
  submitted_at: string | null;
  flag_count: number;
  status: 'not_attempted' | 'completed' | 'terminated';
}

interface Flag {
  id: number;
  type: string;
  detail: string | null;
  offset_seconds: number;
}

const API_BASE = 'http://localhost:5000/api';
const SERVER_BASE = 'http://localhost:5000';

const STATUS_LABEL: Record<RosterRow['status'], string> = {
  completed: '✓ Completed',
  terminated: '! Terminated',
  not_attempted: '✗ Not attempted',
};

const TYPE_LABEL: Record<string, string> = {
  no_face: 'No face',
  multiple_faces: 'Other person',
  face_mismatch: 'Face mismatch',
  speech: 'Speech',
};

function formatOffset(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// SQLite stores UTC without a "Z", so we add it before showing in India time
function formatDbTime(value: string | null) {
  if (!value) return '—';
  return new Date(value.replace(' ', 'T') + 'Z').toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function ExamRecordings() {
  const navigate = useNavigate();
  const { examId } = useParams();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [currentUser] = useState<User | null>(() =>
    JSON.parse(localStorage.getItem('nexam_current_user') || 'null'),
  );

  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [selected, setSelected] = useState<RosterRow | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'faculty') {
      navigate('/login');
      return;
    }

    function loadRoster() {
      fetch(`${API_BASE}/exams/${examId}/roster`)
        .then((res) => res.json())
        .then((data) => setRoster(data.roster || []));
    }

    loadRoster();
    const interval = window.setInterval(loadRoster, 5000);
    return () => window.clearInterval(interval);
  }, [examId, currentUser, navigate]);

  useEffect(() => {
    if (!selected || !selected.student_id) return;

    setChecking(true);
    setVideoUrl(null);
    setFlags([]);

    fetch(`${API_BASE}/exams/${examId}/recording?studentId=${selected.student_id}`)
      .then((res) => res.json())
      .then((data) => setVideoUrl(data.exists ? `${SERVER_BASE}${data.url}` : null))
      .finally(() => setChecking(false));

    fetch(`${API_BASE}/exams/${examId}/flags?studentId=${selected.student_id}`)
      .then((res) => res.json())
      .then((data) => setFlags(data.flags || []));
  }, [selected?.student_id, examId]);

  function jumpTo(seconds: number) {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, seconds - 2); // start 2 seconds early
    videoRef.current.play();
  }

  if (!currentUser || currentUser.role !== 'faculty') return null;

  const completed = roster.filter((r) => r.status !== 'not_attempted').length;

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
            <span className="exam-portal-code">CANDIDATE REVIEW</span>
            <h1>Students and recordings</h1>
            <p>{completed} of {roster.length} students have taken this exam. Click a student to review.</p>
          </div>
        </div>

        <section className="portal-panel portal-submissions">
          <h2>Student list (roll number order)</h2>
          {roster.length === 0 ? (
            <p className="portal-empty-text">No students on the list for this exam's classes yet.</p>
          ) : (
            <div className="portal-table-scroll">
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>Roll no</th>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Score</th>
                    <th>Flags</th>
                    <th>Submitted</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((r) => (
                    <tr key={r.roll_no}>
                      <td>{r.roll_no}</td>
                      <td>
                        <strong>{r.name}</strong>
                        <small className="portal-table-sub">{r.email}</small>
                        {!r.student_id && <small className="portal-table-sub">Not registered yet</small>}
                      </td>
                      <td>{STATUS_LABEL[r.status]}</td>
                      <td>{r.score !== null ? `${r.score}/${r.total_marks}` : '—'}</td>
                      <td>{r.status === 'not_attempted' ? '—' : r.flag_count}</td>
                      <td>{formatDbTime(r.submitted_at)}</td>
                      <td>
                        {r.student_id && r.status !== 'not_attempted' && (
                          <button className="exam-outline-btn" onClick={() => setSelected(r)}>
                            Review
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selected && (
          <section className="portal-panel portal-submissions">
            <h2>{selected.name}: session recording</h2>
            {checking ? (
              <p className="portal-empty-text">Checking for recording...</p>
            ) : videoUrl ? (
              <video ref={videoRef} src={videoUrl} controls style={{ width: '100%', maxWidth: 720, borderRadius: 8 }} />
            ) : (
              <p className="portal-empty-text">No recording found for this student.</p>
            )}

            <h3 style={{ marginTop: 16 }}>Flags ({flags.length})</h3>
            {flags.length === 0 ? (
              <p className="portal-empty-text">No flags for this student.</p>
            ) : (
              <div className="portal-table-scroll">
                <table className="portal-table">
                  <thead>
                    <tr><th>Time</th><th>Type</th><th>Detail</th><th></th></tr>
                  </thead>
                  <tbody>
                    {flags.map((f) => (
                      <tr key={f.id}>
                        <td>{formatOffset(f.offset_seconds)}</td>
                        <td>{TYPE_LABEL[f.type] || f.type}</td>
                        <td>{f.detail || '—'}</td>
                        <td>
                          <button className="exam-outline-btn" onClick={() => jumpTo(f.offset_seconds)}>
                            Jump to moment
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </section>
    </main>
  );
}

export default ExamRecordings;