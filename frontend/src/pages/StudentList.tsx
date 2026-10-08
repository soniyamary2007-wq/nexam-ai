import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

interface User {
  id: number;
  name: string;
  role: string;
}

interface ClassItem {
  id: number;
  name: string;
  section: string;
  department_name: string;
}

interface Student {
  id: number;
  roll_no: string;
  name: string;
  email: string;
  registered: number;
}

const API_BASE = 'http://localhost:5000/api';

function StudentList() {
  const navigate = useNavigate();

  const [currentUser] = useState<User | null>(() =>
    JSON.parse(localStorage.getItem('nexam_current_user') || 'null'),
  );

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [message, setMessage] = useState('');

  const [rollNo, setRollNo] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'faculty') {
      navigate('/login');
      return;
    }

    fetch(`${API_BASE}/auth/faculty-classes?facultyId=${currentUser.id}`)
      .then((res) => res.json())
      .then((data) => setClasses(data.classes || []));
  }, [currentUser, navigate]);

  function loadStudents(selectedClass = classId) {
    if (!currentUser || !selectedClass) {
      setStudents([]);
      return;
    }

    fetch(`${API_BASE}/student-list?facultyId=${currentUser.id}&classId=${selectedClass}`)
      .then((res) => res.json())
      .then((data) => setStudents(data.students || []));
  }

  useEffect(() => {
    loadStudents();
  }, [classId]);

  async function addStudent() {
    if (!currentUser) return;
    setMessage('');

    if (!classId || !rollNo.trim() || !name.trim() || !email.trim()) {
      setMessage('Select a class and fill roll number, name and email.');
      return;
    }

    const res = await fetch(`${API_BASE}/student-list/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        facultyId: currentUser.id,
        classId: Number(classId),
        rollNo,
        name,
        email,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || 'Could not add student.');
      return;
    }

    setRollNo('');
    setName('');
    setEmail('');
    setMessage('Student added.');
    loadStudents();
  }

  async function handleCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !currentUser) return;
    setMessage('');

    if (!classId) {
      setMessage('Select a class first, then upload the file.');
      event.target.value = '';
      return;
    }

    const text = await file.text();
    const rows = text
      .split(/\r?\n/)
      .map((line) => line.split(',').map((cell) => cell.trim()))
      .filter((cells) => cells.length >= 3 && cells[0] !== '');

    // Skip the header row if the third column is not an email
    if (rows.length > 0 && !rows[0][2].includes('@')) rows.shift();

    const list = rows.map((cells) => ({ rollNo: cells[0], name: cells[1], email: cells[2] }));

    if (list.length === 0) {
      setMessage('No students found in the file. Use 3 columns: roll number, name, email.');
      event.target.value = '';
      return;
    }

    const res = await fetch(`${API_BASE}/student-list/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facultyId: currentUser.id, classId: Number(classId), students: list }),
    });
    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || 'Upload failed.');
    } else {
      const skippedText = data.skipped.length
        ? ` Skipped ${data.skipped.length}: ${data.skipped.map((s: any) => `${s.rollNo} (${s.reason})`).join(', ')}`
        : '';
      setMessage(`Added ${data.added} students.${skippedText}`);
      loadStudents();
    }

    event.target.value = '';
  }

  async function removeStudent(id: number) {
    if (!currentUser) return;
    if (!window.confirm('Remove this student from the list?')) return;

    await fetch(`${API_BASE}/student-list/${id}?facultyId=${currentUser.id}`, { method: 'DELETE' });
    loadStudents();
  }

  if (!currentUser || currentUser.role !== 'faculty') return null;

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
            <small>Student list</small>
          </div>
        </div>
      </header>

      <section className="portal-content">
        <div className="portal-heading">
          <div>
            <Link to="/faculty" className="back-link">← Faculty dashboard</Link>
            <span className="exam-portal-code">STUDENT LIST</span>
            <h1>Approved students</h1>
            <p>Only students on this list can register. Each email can register once.</p>
          </div>
        </div>

        <section className="portal-panel">
          <h2>1. Choose class</h2>
          <select className="portal-select" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Select class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.department_name} - {c.name} - Section {c.section}
              </option>
            ))}
          </select>
        </section>

        <section className="portal-panel">
          <h2>2. Upload CSV file</h2>
          <p>Columns in order: roll number, name, college email. A header row is fine.</p>
          <input type="file" accept=".csv" onChange={handleCsv} />
        </section>

        <section className="portal-panel">
          <h2>3. Or add one student</h2>
          <div className="faculty-class-options">
            <input placeholder="Roll number" value={rollNo} onChange={(e) => setRollNo(e.target.value)} />
            <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <input placeholder="College email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="exam-primary-btn" onClick={addStudent}>Add student</button>
          </div>
        </section>

        {message && <p className="face-capture-status">{message}</p>}

        <section className="portal-panel portal-submissions">
          <h2>Students in this class ({students.length})</h2>
          {students.length === 0 ? (
            <p className="portal-empty-text">No students yet. Choose a class and add students.</p>
          ) : (
            <div className="portal-table-scroll">
              <table className="portal-table">
                <thead>
                  <tr><th>Roll no</th><th>Name</th><th>Email</th><th>Registered</th><th></th></tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id}>
                      <td>{s.roll_no}</td>
                      <td>{s.name}</td>
                      <td>{s.email}</td>
                      <td>{s.registered ? '✓ Yes' : 'Not yet'}</td>
                      <td>
                        <button className="faculty-delete-btn" onClick={() => removeStudent(s.id)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

export default StudentList;