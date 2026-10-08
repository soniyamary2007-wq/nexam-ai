import express from 'express';
import db from '../db.js';

const router = express.Router();

function facultyTeaches(facultyId, classId) {
  return Boolean(
    db.prepare('SELECT 1 FROM faculty_classes WHERE faculty_id = ? AND class_id = ?').get(facultyId, classId),
  );
}

function addOne(classId, rollNo, name, email) {
  db.prepare('INSERT INTO approved_students (class_id, roll_no, name, email) VALUES (?, ?, ?, ?)').run(
    classId,
    String(rollNo).trim(),
    String(name).trim(),
    String(email).trim().toLowerCase(),
  );
}

// Add one student by hand
router.post('/add', (req, res) => {
  const { facultyId, classId, rollNo, name, email } = req.body;

  if (!facultyId || !classId || !rollNo || !name || !email) {
    return res.status(400).json({ error: 'Roll number, name and email are required.' });
  }
  if (!facultyTeaches(facultyId, classId)) {
    return res.status(403).json({ error: 'You do not teach this class.' });
  }

  try {
    addOne(classId, rollNo, name, email);
    res.status(201).json({ added: true });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'This roll number or email is already in the list.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to add student.' });
  }
});

// Add many students (the CSV is read in the browser and sent here)
router.post('/bulk', (req, res) => {
  const { facultyId, classId, students } = req.body;

  if (!facultyId || !classId || !Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ error: 'No students received.' });
  }
  if (!facultyTeaches(facultyId, classId)) {
    return res.status(403).json({ error: 'You do not teach this class.' });
  }

  let added = 0;
  const skipped = [];

  for (const s of students) {
    if (!s.rollNo || !s.name || !s.email) {
      skipped.push({ rollNo: s.rollNo || '?', reason: 'Missing roll number, name or email' });
      continue;
    }
    try {
      addOne(classId, s.rollNo, s.name, s.email);
      added += 1;
    } catch {
      skipped.push({ rollNo: s.rollNo, reason: 'Roll number or email already exists' });
    }
  }

  res.json({ added, skipped });
});

// List students of a class, with "registered or not"
router.get('/', (req, res) => {
  const { facultyId, classId } = req.query;

  if (!facultyId || !classId) {
    return res.status(400).json({ error: 'facultyId and classId are required.' });
  }
  if (!facultyTeaches(facultyId, classId)) {
    return res.status(403).json({ error: 'You do not teach this class.' });
  }

  const students = db.prepare(`
    SELECT a.id, a.roll_no, a.name, a.email,
           CASE WHEN u.id IS NULL THEN 0 ELSE 1 END AS registered
    FROM approved_students a
    LEFT JOIN users u ON u.email = a.email
    WHERE a.class_id = ?
    ORDER BY a.roll_no
  `).all(classId);

  res.json({ students });
});

// Remove one student from the list
router.delete('/:id', (req, res) => {
  const { facultyId } = req.query;
  const row = db.prepare('SELECT class_id FROM approved_students WHERE id = ?').get(req.params.id);

  if (!row) return res.status(404).json({ error: 'Student not found.' });
  if (!facultyTeaches(facultyId, row.class_id)) {
    return res.status(403).json({ error: 'You do not teach this class.' });
  }

  db.prepare('DELETE FROM approved_students WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

export default router;