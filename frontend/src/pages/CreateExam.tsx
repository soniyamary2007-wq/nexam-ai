import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

interface Question {
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctIndex: number;
  marks: number;
}

interface CurrentUser {
  id: number;
  name: string;
  email: string;
  role: string;
  classIds: number[];
  departmentId: number;
}

interface ClassInfo {
  id: number;
  name: string;
  section: string;
}

const API_BASE = 'http://localhost:5000/api';

const emptyQuestion: Question = {
  question: '',
  optionA: '',
  optionB: '',
  optionC: '',
  optionD: '',
  correctIndex: 0,
  marks: 5,
};

function CreateExam() {
  const navigate = useNavigate();

  const [currentUser] = useState<CurrentUser | null>(() =>
    JSON.parse(localStorage.getItem('nexam_current_user') || 'null'),
  );

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(60);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [proctoringEnabled, setProctoringEnabled] = useState(true);
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);

  const [questions, setQuestions] = useState<Question[]>([{ ...emptyQuestion }]);

  const [assignedClasses, setAssignedClasses] = useState<ClassInfo[]>([]);
  const [classesLoaded, setClassesLoaded] = useState(false);

  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch full class details for the faculty's assigned classIds once
    // Fetch classes assigned to this faculty member once
  if (!classesLoaded && currentUser) {
    setClassesLoaded(true);
    fetch(`${API_BASE}/auth/faculty-classes?facultyId=${currentUser.id}`)
      .then((res) => res.json())
      .then((data) => setAssignedClasses(data.classes || []));
  }
  

  function toggleClass(classId: number) {
    setSelectedClassIds((current) =>
      current.includes(classId)
        ? current.filter((id) => id !== classId)
        : [...current, classId],
    );
  }

  function updateQuestion(index: number, field: keyof Question, value: string | number) {
    setQuestions((current) =>
      current.map((q, i) => (i === index ? { ...q, [field]: value } : q)),
    );
  }

  function addQuestion() {
    setQuestions((current) => [...current, { ...emptyQuestion }]);
  }

  function removeQuestion(index: number) {
    setQuestions((current) => current.filter((_, i) => i !== index));
  }

  async function publishExam() {
    setStatus('');

    if (!title.trim() || !duration || !startTime || !endTime) {
      setStatus('Please fill in the title, duration, start time, and end time.');
      return;
    }

    if (new Date(endTime) <= new Date(startTime)) {
      setStatus('End time must be after start time.');
      return;
    }

    if (selectedClassIds.length === 0) {
      setStatus('Select at least one class that can attempt this exam.');
      return;
    }

    const incomplete = questions.some(
      (q) => !q.question.trim() || !q.optionA.trim() || !q.optionB.trim() || !q.optionC.trim() || !q.optionD.trim(),
    );

    if (incomplete) {
      setStatus('Fill in every question and all 4 options before publishing.');
      return;
    }

    if (!currentUser) return;

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/exams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          subject: subject.trim() || null,
          description: description.trim() || null,
          duration,
          startTime,
          endTime,
          proctoringEnabled,
          createdBy: currentUser.id,
          classIds: selectedClassIds,
          questions,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus(data.error || 'Failed to publish exam.');
        setLoading(false);
        return;
      }

      setStatus('Exam published successfully. Redirecting...');
      window.setTimeout(() => navigate('/faculty'), 1000);
    } catch {
      setStatus('Could not connect to the server. Make sure the backend is running.');
      setLoading(false);
    }
  }

  if (!currentUser || currentUser.role !== 'faculty') {
    return null;
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <Link to="/faculty" className="back-link">← Faculty dashboard</Link>
        <Link to="/" className="admin-brand">
          <span>N</span>
          NEXAM <strong>AI</strong>
        </Link>
      </header>

      <section className="admin-content">
        <div className="admin-intro">
          <span>FACULTY WORKSPACE</span>
          <h1>Create an exam</h1>
          <p>Write your questions manually, assign it to your classes, and set the exam window.</p>
        </div>

        <section className="admin-table-card">
          <h2>1. Exam details</h2>

          <div className="create-grid">
            <label>
              Exam title
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mid-term Test" />
            </label>

            <label>
              Subject
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Data Structures" />
            </label>

            <label>
              Duration (minutes)
              <input type="number" min="10" max="240" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </label>

            <label>
              Start time
              <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </label>

            <label>
              End time
              <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </label>
          </div>

          <label>
            Description
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this exam covers..." />
          </label>

          <label className="proctoring-check">
            <input type="checkbox" checked={proctoringEnabled} onChange={(e) => setProctoringEnabled(e.target.checked)} />
            <span>
              <strong>Enable AI proctoring</strong>
              <small>Identity check-in, tab-switch detection, and incident logging.</small>
            </span>
          </label>
        </section>

        <section className="admin-table-card">
          <h2>2. Assign to classes</h2>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
            Only students in the selected class(es) will see and be able to attempt this exam.
          </p>

          {assignedClasses.length === 0 ? (
            <p className="no-users">You have no assigned classes yet.</p>
          ) : (
            <div className="faculty-class-options">
              {assignedClasses.map((cls) => (
                <label key={cls.id} className="faculty-class-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedClassIds.includes(cls.id)}
                    onChange={() => toggleClass(cls.id)}
                  />
                  <span>{cls.name} - Section {cls.section}</span>
                </label>
              ))}
            </div>
          )}
        </section>

        <section className="admin-table-card">
          <div className="table-title">
            <div>
              <h2>3. Questions</h2>
              <p>{questions.length} question(s) added</p>
            </div>
          </div>

          {questions.map((q, index) => (
            <article key={index} className="admin-table-card" style={{ background: '#f8fafc' }}>
              <div className="table-title">
                <strong>Question {index + 1}</strong>
                {questions.length > 1 && (
                  <button className="delete-user-button" onClick={() => removeQuestion(index)}>
                    Remove
                  </button>
                )}
              </div>

              <label>
                Question text
                <textarea
                  rows={2}
                  value={q.question}
                  onChange={(e) => updateQuestion(index, 'question', e.target.value)}
                  placeholder="What is the time complexity of binary search?"
                />
              </label>

              <p>Type all 4 options, then select the correct one.</p>

              {(['optionA', 'optionB', 'optionC', 'optionD'] as const).map((field, optIndex) => (
                <label className="review-option" key={field}>
                  <input
                    type="radio"
                    name={`correct-${index}`}
                    checked={q.correctIndex === optIndex}
                    onChange={() => updateQuestion(index, 'correctIndex', optIndex)}
                  />
                  <input
                    value={q[field]}
                    onChange={(e) => updateQuestion(index, field, e.target.value)}
                    placeholder={`Option ${String.fromCharCode(65 + optIndex)}`}
                  />
                </label>
              ))}

              <label style={{ maxWidth: 140, marginTop: 10 }}>
                Marks
                <input
                  type="number"
                  min="1"
                  value={q.marks}
                  onChange={(e) => updateQuestion(index, 'marks', Number(e.target.value))}
                />
              </label>
            </article>
          ))}

          <button className="exam-outline-btn" onClick={addQuestion} style={{ marginTop: 10 }}>
            + Add another question
          </button>
        </section>

        {status && <p className="generation-status">{status}</p>}

        <section className="publish-exam-bar">
          <div>
            <strong>Ready to publish?</strong>
            <p>{questions.length} questions · {selectedClassIds.length} class(es) selected</p>
          </div>

          <button className="publish-exam-button" onClick={publishExam} disabled={loading}>
            {loading ? 'Publishing...' : 'Publish exam →'}
          </button>
        </section>
      </section>
    </main>
  );
}

export default CreateExam;