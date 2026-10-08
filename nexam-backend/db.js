import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';

const db = new DatabaseSync('nexam.db');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS colleges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  place TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_id INTEGER NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  section TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('student','faculty','admin')),
  college_id INTEGER REFERENCES colleges(id),
  department_id INTEGER REFERENCES departments(id),
  class_id INTEGER REFERENCES classes(id),
  face_descriptor TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS faculty_classes (
  faculty_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (faculty_id, class_id)
);

CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subject TEXT,
  description TEXT,
  difficulty TEXT,
  duration INTEGER NOT NULL,
  total_marks INTEGER,
  proctoring_enabled INTEGER DEFAULT 1,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exam_classes (
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (exam_id, class_id)
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_index INTEGER NOT NULL,
  marks INTEGER DEFAULT 5
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id),
  score INTEGER NOT NULL,
  total_marks INTEGER NOT NULL,
  incident_count INTEGER DEFAULT 0,
  auto_submitted INTEGER DEFAULT 0,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(exam_id, student_id)
);


CREATE TABLE IF NOT EXISTS reattempt_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','denied')),
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS exam_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image TEXT NOT NULL,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS exam_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  detail TEXT,
  offset_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Add roll number column to users (safe to run many times)
try {
  db.exec('ALTER TABLE users ADD COLUMN roll_no TEXT');
} catch {
  // column already exists, nothing to do
} 
try {
  db.exec('ALTER TABLE exams ADD COLUMN closing_reminder_sent INTEGER DEFAULT 0');
} catch {
  // column already exists
}
db.exec(`
CREATE TABLE IF NOT EXISTS approved_students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  roll_no TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(class_id, roll_no)
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS email_codes (
  email TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0
);
`);
const collegeCount = db.prepare('SELECT COUNT(*) AS c FROM colleges').get().c;

if (collegeCount === 0) {
  const insertCollege = db.prepare('INSERT INTO colleges (name, state, place) VALUES (?, ?, ?)');
  const insertDept = db.prepare('INSERT INTO departments (college_id, name) VALUES (?, ?)');
  const insertClass = db.prepare('INSERT INTO classes (department_id, name, section) VALUES (?, ?, ?)');

  const seedData = [
    {
      name: 'Vels Institute of Science, Technology & Advanced Studies',
      state: 'Tamil Nadu',
      place: 'Chennai',
      departments: ['Computer Science', 'Information Technology', 'ECE'],
    },
    {
      name: 'Anna University',
      state: 'Tamil Nadu',
      place: 'Chennai',
      departments: ['Computer Science', 'Mechanical', 'Civil'],
    },
    {
      name: 'VIT Vellore',
      state: 'Tamil Nadu',
      place: 'Vellore',
      departments: ['Computer Science', 'Electronics'],
    },
  ];

  const years = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
  const sections = ['A', 'B'];

  for (const college of seedData) {
    const collegeResult = insertCollege.run(college.name, college.state, college.place);
    const collegeId = collegeResult.lastInsertRowid;

    for (const deptName of college.departments) {
      const deptResult = insertDept.run(collegeId, deptName);
      const deptId = deptResult.lastInsertRowid;

      for (const year of years) {
        for (const section of sections) {
          insertClass.run(deptId, year, section);
        }
      }
    }
  }

  console.log('Seeded starter colleges, departments, and classes.');
}

const adminEmail = 'admin@nexam.ai';
const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);

if (!existingAdmin) {
  const adminPasswordHash = bcrypt.hashSync('nexam123', 10);

  db.prepare(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
  ).run('Platform Admin', adminEmail, adminPasswordHash, 'admin');

  console.log('Seeded default admin account: admin@nexam.ai');
}
export default db;