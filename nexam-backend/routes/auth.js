import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';

const router = express.Router();

// ---------- Reference data (for dropdowns) ----------

router.get('/states', (req, res) => {
  const states = db
    .prepare('SELECT DISTINCT state FROM colleges ORDER BY state')
    .all()
    .map((row) => row.state);

  res.json({ states });
});

router.get('/colleges', (req, res) => {
  const { state } = req.query;

  const colleges = state
    ? db.prepare('SELECT id, name, place FROM colleges WHERE state = ? ORDER BY name').all(state)
    : db.prepare('SELECT id, name, place, state FROM colleges ORDER BY name').all();

  res.json({ colleges });
});

router.get('/departments', (req, res) => {
  const { collegeId } = req.query;

  if (!collegeId) {
    return res.status(400).json({ error: 'collegeId is required.' });
  }

  const departments = db
    .prepare('SELECT id, name FROM departments WHERE college_id = ? ORDER BY name')
    .all(collegeId);

  res.json({ departments });
});

router.get('/classes', (req, res) => {
  const { departmentId } = req.query;

  if (!departmentId) {
    return res.status(400).json({ error: 'departmentId is required.' });
  }

  const classes = db
    .prepare('SELECT id, name, section FROM classes WHERE department_id = ? ORDER BY name, section')
    .all(departmentId);

  res.json({ classes });
});

// ---------- Signup ----------

router.post('/signup', async (req, res) => {
  try {
        const { name, email, password, role, collegeId, departmentId, classId, classIds, faceDescriptor } = req.body;

    if (!name || !email || !password || !role || !collegeId || !departmentId) {
      return res.status(400).json({
        error: 'Name, email, password, role, college, and department are required.',
      });
    }

    if (!['student', 'faculty'].includes(role)) {
      return res.status(400).json({ error: 'Role must be student or faculty.' });
    }

    if (role === 'student' && !classId) {
      return res.status(400).json({ error: 'Students must select a class and section.' });
    }

    if (role === 'faculty' && (!Array.isArray(classIds) || classIds.length === 0)) {
      return res.status(400).json({ error: 'Faculty must select at least one class.' });
          if (role === 'student' && (!Array.isArray(faceDescriptor) || faceDescriptor.length !== 128)) {
      return res.status(400).json({ error: 'Face capture is required for students. Please complete the camera step.' });
    }
    }

    const existing = db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(email.trim().toLowerCase());

    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const insertUser = db.prepare(
      'INSERT INTO users (name, email, password, role, college_id, department_id, class_id, face_descriptor) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );

    const result = insertUser.run(
      name.trim(),
      email.trim().toLowerCase(),
      passwordHash,
      role,
      collegeId,
      departmentId,
      role === 'student' ? classId : null,
      role === 'student' ? JSON.stringify(faceDescriptor) : null,
    );

    const userId = result.lastInsertRowid;

    if (role === 'faculty') {
      const insertFacultyClass = db.prepare(
        'INSERT INTO faculty_classes (faculty_id, class_id) VALUES (?, ?)',
      );

      for (const cid of classIds) {
        insertFacultyClass.run(userId, cid);
      }
    }

    const user = db
      .prepare('SELECT id, name, email, role, college_id, department_id, class_id FROM users WHERE id = ?')
      .get(userId);

    res.status(201).json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed.', details: err.message });
  }
});

// ---------- Login ----------

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(email.trim().toLowerCase());

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    let facultyClassIds = [];

    if (user.role === 'faculty') {
      facultyClassIds = db
        .prepare('SELECT class_id FROM faculty_classes WHERE faculty_id = ?')
        .all(user.id)
        .map((row) => row.class_id);
    }

    const { password: _omit, face_descriptor, ...safeUser } = user;

    res.json({ user: { ...safeUser, classIds: facultyClassIds, faceDescriptor: face_descriptor ? JSON.parse(face_descriptor) : null } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed.', details: err.message });
  }
});

router.get('/faculty-classes', (req, res) => {
  const { facultyId } = req.query;

  if (!facultyId) {
    return res.status(400).json({ error: 'facultyId is required.' });
  }

  const classes = db.prepare(`
    SELECT c.id, c.name, c.section, d.name AS department_name
    FROM classes c
    JOIN faculty_classes fc ON fc.class_id = c.id
    JOIN departments d ON d.id = c.department_id
    WHERE fc.faculty_id = ?
    ORDER BY c.name, c.section
  `).all(facultyId);

  res.json({ classes });
});
router.get('/faculty-classes', (req, res) => {
  const { facultyId } = req.query;

  if (!facultyId) {
    return res.status(400).json({ error: 'facultyId is required.' });
  }

  const classes = db.prepare(`
    SELECT c.id, c.name, c.section, d.name AS department_name
    FROM classes c
    JOIN faculty_classes fc ON fc.class_id = c.id
    JOIN departments d ON d.id = c.department_id
    WHERE fc.faculty_id = ?
    ORDER BY c.name, c.section
  `).all(facultyId);

  res.json({ classes });
});
export default router;