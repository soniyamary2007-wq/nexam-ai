import 'dotenv/config';
import { sendMail } from './mailer.js';

sendMail(process.env.GMAIL_USER, 'NEXAM test', 'If you see this, email works.')
  .then(() => console.log('Email sent. Check your inbox.'))
  .catch((err) => console.log('Failed:', err.message));