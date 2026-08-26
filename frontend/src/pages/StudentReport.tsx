import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface ClassInfo {
  id: number;
  name: string;
  section: string;
  department_name?: string;
}

interface StudentSubmission {
  student_id: number;
  score: number;
  total_marks: number;
  incident_count: number;
  auto_submitted: number;
  submitted_at: string;
  exam_title: string;
}

interface StudentRow {
  id: number;
  name: string;
  email: string;
  submissions: StudentSubmission[];
}

const API_BASE = 'http://localhost:5000/api';

function StudentReport() {
  const navigate = useNavigate();

  const [currentUser] = useState<User | null>(() =>
    JSON.parse(localStorage.getItem('nexam_current_user') || 'null'),
  );

  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }
    if (currentUser.role !== 'faculty') {
      navigate('/login');
      return;
    }

    fetch(`${API_BASE}/auth/faculty-classes?facultyId=${currentUser.id}`)
      .then((res) => res.json())
      .then((data) => {
        setClasses(data.classes || []);
        if (data.classes && data.classes.length > 0) {
          setSelectedClassId(String(data.classes[0].id));
        }
      })
      .finally(() => setClassesLoading(false));
  }, [currentUser, navigate]);

  useEffect(() => {
    if (!currentUser || !selectedClassId) return;

    setStudentsLoading(true);
    fetch(`${API_BASE}/exams/students-for-class?classId=${selectedClassId}&facultyId=${currentUser.id}`)
      .then((res) => res.json())
      .then((data) => setStudents(data.students || []))
      .finally(() => setStudentsLoading(false));
  }, [selectedClassId, currentUser]);

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
        </div>
      </header>

      <section className="portal-content">
        <div className="portal-heading">
          <div>
            <Link to="/faculty" className="back-link">← Faculty dashboard</Link>
            <span className="exam-portal-code">STUDENT REPORT</span>
            <h1>Class-wise student scores</h1>
            <p>Pick a class to see every student and their scores across your exams.</p>
          </div>
        </div>

        <section className="portal-panel">
          {classesLoading ? (
            <p className="no-users">Loading your classes...</p>
          ) : classes.length === 0 ? (
            <p className="no-users">You have no assigned classes yet.</p>
          ) : (
            <div className="portal-table-title">
              <div>
                <h2>Select a class</h2>
              </div>
              <select
                className="portal-select"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
              >
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} - Section {cls.section}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>

        <section className="portal-panel portal-submissions">
          {studentsLoading ? (
            <p className="portal-empty-text">Loading students...</p>
          ) : students.length === 0 ? (
            <p className="portal-empty-text">No students found in this class.</p>
          ) : (
            <div className="portal-table-scroll">
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Exam</th>
                    <th>Score</th>
                    <th>Integrity status</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) =>
                    student.submissions.length === 0 ? (
                      <tr key={student.id}>
                        <td>
                          <div className="portal-user-cell">
                            <span className="portal-user-avatar-sm">{student.name.charAt(0).toUpperCase()}</span>
                            <div>
                              <strong>{student.name}</strong>
                              <small>{student.email}</small>
                            </div>
                          </div>
                        </td>
                        <td colSpan={4} className="portal-empty-text">No submissions yet</td>
                      </tr>
                    ) : (
                      student.submissions.map((sub, index) => {
                        const percentage = Math.round((sub.score / sub.total_marks) * 100);
                        return (
                          <tr key={`${student.id}-${index}`}>
                            <td>
                              {index === 0 ? (
                                <div className="portal-user-cell">
                                  <span className="portal-user-avatar-sm">{student.name.charAt(0).toUpperCase()}</span>
                                  <div>
                                    <strong>{student.name}</strong>
                                    <small>{student.email}</small>
                                  </div>
                                </div>
                              ) : null}
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
                          </tr>
                        );
                      })
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

export default StudentReport;