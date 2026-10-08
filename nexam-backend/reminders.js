import db from './db.js';
import { sendMail } from './mailer.js';

function fmt(time) {
  return new Date(time).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function recipients(examId, onlyNotAttempted) {
  const extra = onlyNotAttempted
    ? `AND NOT EXISTS (
         SELECT 1 FROM users u
         JOIN submissions s ON s.student_id = u.id
         WHERE u.email = a.email AND s.exam_id = ec.exam_id
       )`
    : '';

  return db.prepare(`
    SELECT DISTINCT a.email, a.name
    FROM approved_students a
    JOIN exam_classes ec ON ec.class_id = a.class_id
    WHERE ec.exam_id = ? ${extra}
  `).all(examId);
}

async function sendToAll(list, subject, makeText) {
  for (const s of list) {
    try {
      await sendMail(s.email, subject, makeText(s.name));
    } catch (err) {
      console.log('Reminder failed for', s.email, err.message);
    }
  }
}

// 1) Right after faculty post the exam
export async function sendPostedReminder(examId) {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId);
  if (!exam) return;

  const list = recipients(examId, false);
  await sendToAll(list, `New exam: ${exam.title}`, (name) =>
    `Hi ${name},\n\nA new exam has been posted: ${exam.title}${exam.subject ? ` (${exam.subject})` : ''}.\n` +
    `Duration: ${exam.duration} minutes\n` +
    `Opens: ${fmt(exam.start_time)}\n` +
    `Closes: ${fmt(exam.end_time)}\n\n` +
    `Please log in to NEXAM and attempt it within this window.\n\nNEXAM AI`,
  );
  console.log(`Posted reminder sent to ${list.length} students for exam ${examId}`);
}

// 2) One hour before the exam closes, only to students who have not attempted
async function checkClosingReminders() {
  const exams = db.prepare('SELECT * FROM exams WHERE closing_reminder_sent = 0').all();
  const now = Date.now();

  for (const exam of exams) {
    const end = new Date(exam.end_time).getTime();
    if (Number.isNaN(end)) continue;

    const msLeft = end - now;

    if (msLeft <= 0) {
      db.prepare('UPDATE exams SET closing_reminder_sent = 1 WHERE id = ?').run(exam.id);
      continue;
    }

    if (msLeft <= 60 * 60 * 1000) {
      db.prepare('UPDATE exams SET closing_reminder_sent = 1 WHERE id = ?').run(exam.id);

      const list = recipients(exam.id, true);
      await sendToAll(list, `Last hour: ${exam.title}`, (name) =>
        `Hi ${name},\n\nYou have not attempted "${exam.title}" yet.\n` +
        `The exam closes at ${fmt(exam.end_time)}, in about an hour.\n\n` +
        `Please log in to NEXAM and attempt it now.\n\nNEXAM AI`,
      );
      console.log(`Closing reminder sent to ${list.length} students for exam ${exam.id}`);
    }
  }
}

export function startReminderLoop() {
  setInterval(() => {
    checkClosingReminders().catch((err) => console.log('Reminder check error:', err.message));
  }, 60 * 1000);
}