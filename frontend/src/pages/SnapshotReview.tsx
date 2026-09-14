import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const API_BASE = 'http://localhost:5000/api';

interface StudentSummary {
  student_id: number;
  student_name: string;
  last_seen: string;
}

interface Snapshot {
  id: number;
  student_id: number;
  student_name: string;
  image: string;
  captured_at: string;
}

function SnapshotReview() {
  const { examId } = useParams();
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<number | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);

  // Poll the list of students who have snapshots for this exam
  useEffect(() => {
    if (!examId) return;

    const fetchStudents = () => {
      fetch(`${API_BASE}/exams/${examId}/snapshot-students`)
        .then((res) => res.json())
        .then((data) => setStudents(data.students || []))
        .catch(() => {});
    };

    fetchStudents();
    const interval = window.setInterval(fetchStudents, 5000);
    return () => window.clearInterval(interval);
  }, [examId]);

  // Poll snapshots for the selected student
  useEffect(() => {
    if (!examId || !selectedStudent) return;

    const fetchSnapshots = () => {
      setLoading(true);
      fetch(`${API_BASE}/exams/${examId}/snapshots?studentId=${selectedStudent}`)
        .then((res) => res.json())
        .then((data) => setSnapshots(data.snapshots || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    };

    fetchSnapshots();
    const interval = window.setInterval(fetchSnapshots, 5000);
    return () => window.clearInterval(interval);
  }, [examId, selectedStudent]);

  return (
    <div style={{ display: 'flex', gap: '24px', padding: '20px' }}>
      <div style={{ width: '220px', borderRight: '1px solid #ddd', paddingRight: '16px' }}>
        <h3>Students</h3>
        {students.length === 0 && <p style={{ color: '#888' }}>No snapshots yet.</p>}
        {students.map((s) => (
          <div
            key={s.student_id}
            onClick={() => setSelectedStudent(s.student_id)}
            style={{
              padding: '10px',
              marginBottom: '6px',
              borderRadius: '6px',
              cursor: 'pointer',
              background: selectedStudent === s.student_id ? '#e0eaff' : '#f5f5f5',
            }}
          >
            <div style={{ fontWeight: 600 }}>{s.student_name}</div>
            <div style={{ fontSize: '12px', color: '#777' }}>
              Last seen: {new Date(s.last_seen).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }}>
        <h3>Snapshots {loading && '(refreshing...)'}</h3>
        {!selectedStudent && <p style={{ color: '#888' }}>Select a student to view captures.</p>}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '12px',
          }}
        >
          {snapshots.map((snap) => (
            <div key={snap.id} style={{ textAlign: 'center' }}>
              <img
                src={snap.image}
                alt="snapshot"
                style={{ width: '100%', borderRadius: '6px', border: '1px solid #ccc' }}
              />
              <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                {new Date(snap.captured_at).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SnapshotReview;