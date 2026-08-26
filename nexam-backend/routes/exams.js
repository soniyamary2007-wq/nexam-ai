import express from 'express';
import db from '../db.js';

const router = express.Router();

// ---------- Create exam (faculty) ----------

router.post('/', (req, res) => {
  try {
    const {
      title,
      subject,
      description,
      duration,
      startTime,
      endTime,
      proctoringEnabled,
      createdBy,
      classIds,
      questions,
    } = req.body;

    if (!title || !duration || !startTime || !endTime || !createdBy) {
      return res.status(400).json({ error: 'Title, duration, start time, end time, and creator are required.' });
    }

    if (!Array.isArray(classIds) || classIds.length === 0) {
      return res.status(400).json({ error: 'Select at least one class for this exam.' });
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'Add at least one question.' });
    }

    for (const q of questions) {
      if (!q.question || !q.optionA || !q.optionB || !q.optionC || !q.optionD) {
        return res.status(400).json({ error: 'Every question needs text and 4 options.' });
      }
    }

    const totalMarks = questions.reduce((sum, q) => sum + (q.marks || 5), 0);

    const insertExam = db.prepare(`
      INSERT INTO exams (title, subject, description, difficulty, duration, total_marks, proctoring_enabled, start_time, end_time, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const examResult = insertExam.run(
      title.trim(),
      subject || null,
      description || null,
      'manual',
      duration,
      totalMarks,
      proctoringEnabled ? 1 : 0,
      startTime,
      endTime,
      createdBy,
    );

    const examId = examResult.lastInsertRowid;

    const insertExamClass = db.prepare('INSERT INTO exam_classes (exam_id, class_id) VALUES (?, ?)');
    for (const classId of classIds) {
      insertExamClass.run(examId, classId);
    }

    const insertQuestion = db.prepare(`
      INSERT INTO questions (exam_id, question, option_a, option_b, option_c, option_d, correct_index, marks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const q of questions) {
      insertQuestion.run(examId, q.question, q.optionA, q.optionB, q.optionC, q.optionD, q.correctIndex, q.marks || 5);
    }

    res.status(201).json({ examId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create exam.', details: err.message });
  }
});

// ---------- List exams visible to a student's class ----------

router.get('/for-class', (req, res) => {
  const { classId } = req.query;

  if (!classId) {
    return res.status(400).json({ error: 'classId is required.' });
  }

  const exams = db.prepare(`
    SELECT e.* FROM exams e
    JOIN exam_classes ec ON ec.exam_id = e.id
    WHERE ec.class_id = ?
    ORDER BY e.start_time DESC
  `).all(classId);

  res.json({ exams });
});

// ---------- List exams created by a faculty member ----------

router.get('/for-faculty', (req, res) => {
  const { facultyId } = req.query;

  if (!facultyId) {
    return res.status(400).json({ error: 'facultyId is required.' });
  }

  const exams = db.prepare(`
    SELECT * FROM exams WHERE created_by = ? ORDER BY start_time DESC
  `).all(facultyId);

  res.json({ exams });
});

router.get('/students-for-class', (req, res) => {
  const { classId, facultyId } = req.query;

  if (!classId || !facultyId) {
    return res.status(400).json({ error: 'classId and facultyId are required.' });
  }

  const students = db.prepare(`
    SELECT id, name, email FROM users WHERE role = 'student' AND class_id = ?
  `).all(classId);

  const submissions = db.prepare(`
    SELECT s.student_id, s.score, s.total_marks, s.incident_count, s.auto_submitted, s.submitted_at, e.title AS exam_title
    FROM submissions s
    JOIN exams e ON e.id = s.exam_id
    JOIN exam_classes ec ON ec.exam_id = e.id
    WHERE ec.class_id = ? AND e.created_by = ?
  `).all(classId, facultyId);

  const result = students.map((student) => ({
    ...student,
    submissions: submissions.filter((s) => s.student_id === student.id),
  }));

  res.json({ students: result });
});
// ---------- Get single exam with questions (for taking the exam) ----------

router.get('/:id', (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);

  if (!exam) {
    return res.status(404).json({ error: 'Exam not found.' });
  }

  const questions = db.prepare('SELECT * FROM questions WHERE exam_id = ?').all(exam.id);
  const classes = db.prepare(`
    SELECT c.id, c.name, c.section FROM classes c
    JOIN exam_classes ec ON ec.class_id = c.id
    WHERE ec.exam_id = ?
  `).all(exam.id);

  res.json({ exam, questions, classes });
}); 
// ---------- Submit exam attempt ----------

router.post('/:id/submit', (req, res) => {
  try {
    const examId = req.params.id;
    const { studentId, answers, incidentCount, autoSubmitted } = req.body;

    if (!studentId || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'studentId and answers are required.' });
    }

    const existing = db
      .prepare('SELECT id FROM submissions WHERE exam_id = ? AND student_id = ?')
      .get(examId, studentId);

    if (existing) {
      return res.status(409).json({ error: 'You have already submitted this exam.' });
    }

    const questions = db.prepare('SELECT * FROM questions WHERE exam_id = ? ORDER BY id').all(examId);

    let score = 0;
    let totalMarks = 0;

    questions.forEach((q, index) => {
      totalMarks += q.marks;
      if (answers[index] === q.correct_index) {
        score += q.marks;
      }
    });

    const insertSubmission = db.prepare(`
      INSERT INTO submissions (exam_id, student_id, score, total_marks, incident_count, auto_submitted)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertSubmission.run(examId, studentId, score, totalMarks, incidentCount || 0, autoSubmitted ? 1 : 0);

    res.status(201).json({ score, totalMarks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit exam.', details: err.message });
  }
});

// ---------- Check if a student already attempted an exam ----------

router.get('/:id/attempted', (req, res) => {
  const { studentId } = req.query;

  const existing = db
    .prepare('SELECT id, score, total_marks FROM submissions WHERE exam_id = ? AND student_id = ?')
    .get(req.params.id, studentId);

  res.json({ attempted: Boolean(existing), submission: existing || null });
});
// ---------- Get all submissions for a faculty's exams ----------

router.get('/submissions-for-faculty', (req, res) => {
  const { facultyId } = req.query;

  if (!facultyId) {
    return res.status(400).json({ error: 'facultyId is required.' });
  }

  const submissions = db.prepare(`
    SELECT s.*, u.name AS student_name, u.email AS student_email, e.title AS exam_title
    FROM submissions s
    JOIN exams e ON e.id = s.exam_id
    JOIN users u ON u.id = s.student_id
    WHERE e.created_by = ?
    ORDER BY s.submitted_at DESC
  `).all(facultyId);

  res.json({ submissions });
});
// ---------- Delete an exam ----------

router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM exams WHERE id = ?').run(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete exam.', details: err.message });
  }
});

// ---------- Students in a class, with their submissions to this faculty's exams ----------

router.get('/students-for-class', (req, res) => {
  const { classId, facultyId } = req.query;

  if (!classId || !facultyId) {
    return res.status(400).json({ error: 'classId and facultyId are required.' });
  }

  const students = db.prepare(`
    SELECT id, name, email FROM users WHERE role = 'student' AND class_id = ?
  `).all(classId);

  const submissions = db.prepare(`
    SELECT s.student_id, s.score, s.total_marks, s.incident_count, s.auto_submitted, s.submitted_at, e.title AS exam_title
    FROM submissions s
    JOIN exams e ON e.id = s.exam_id
    JOIN exam_classes ec ON ec.exam_id = e.id
    WHERE ec.class_id = ? AND e.created_by = ?
  `).all(classId, facultyId);

  const result = students.map((student) => ({
    ...student,
    submissions: submissions.filter((s) => s.student_id === student.id),
  }));

  res.json({ students: result });
});

// ---------- Get all submissions for a faculty's exams ----------

router.get('/submissions-for-faculty', (req, res) => {
  const { facultyId } = req.query;

  if (!facultyId) {
    return res.status(400).json({ error: 'facultyId is required.' });
  }

  const submissions = db.prepare(`
    SELECT s.*, u.name AS student_name, u.email AS student_email, e.title AS exam_title
    FROM submissions s
    JOIN exams e ON e.id = s.exam_id
    JOIN users u ON u.id = s.student_id
    WHERE e.created_by = ?
    ORDER BY s.submitted_at DESC
  `).all(facultyId);

  res.json({ submissions });
});

// ---------- Delete an exam ----------

router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM exams WHERE id = ?').run(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete exam.', details: err.message });
  }
});

// ---------- Students in a class, with their submissions to this faculty's exams ----------

router.get('/students-for-class', (req, res) => {
  const { classId, facultyId } = req.query;

  if (!classId || !facultyId) {
    return res.status(400).json({ error: 'classId and facultyId are required.' });
  }

  const students = db.prepare(`
    SELECT id, name, email FROM users WHERE role = 'student' AND class_id = ?
  `).all(classId);

  const submissions = db.prepare(`
    SELECT s.student_id, s.score, s.total_marks, s.incident_count, s.auto_submitted, s.submitted_at, e.title AS exam_title
    FROM submissions s
    JOIN exams e ON e.id = s.exam_id
    JOIN exam_classes ec ON ec.exam_id = e.id
    WHERE ec.class_id = ? AND e.created_by = ?
  `).all(classId, facultyId);

  const result = students.map((student) => ({
    ...student,
    submissions: submissions.filter((s) => s.student_id === student.id),
  }));

  res.json({ students: result });
});
export default router;