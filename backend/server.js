import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.get('/', (req, res) => {
  res.send('NEXAM AI backend is running.');
});

app.post('/api/generate-questions', async (req, res) => {
  try {
    const { pdfText, difficulty, numQuestions } = req.body;

    if (!pdfText || !difficulty || !numQuestions) {
      return res.status(400).json({ error: 'Missing pdfText, difficulty, or numQuestions.' });
    }

    const prompt = `You are generating a multiple-choice exam from the following study material.

Study material:
"""
${pdfText.slice(0, 15000)}
"""

Generate exactly ${numQuestions} multiple-choice questions at "${difficulty}" difficulty level.
Each question must have exactly 4 options, with only one correct answer.

Respond ONLY with valid JSON, no other text, no markdown formatting, in this exact format:
[
  {
    "question": "string",
    "options": ["string", "string", "string", "string"],
    "correctIndex": 0
  }
]`;

   const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const rawText = result.response.text();

    const cleaned = rawText.replace(/```json|```/g, '').trim();
    const questions = JSON.parse(cleaned);

    res.json({ questions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate questions.', details: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});