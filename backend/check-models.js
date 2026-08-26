import dotenv from 'dotenv';
dotenv.config();

const res = await fetch(
  'https://generativelanguage.googleapis.com/v1beta/models?key=' + process.env.GEMINI_API_KEY
);
const data = await res.json();

if (data.models) {
  console.log(data.models.map((m) => m.name));
} else {
  console.log('No models returned. Full response:');
  console.log(JSON.stringify(data, null, 2));
}