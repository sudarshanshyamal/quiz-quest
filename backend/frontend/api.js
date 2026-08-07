// Drop-in client so the QuizQuest React app calls the backend instead of the
// Anthropic API directly. Point VITE_API_BASE at your deployed backend.

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE) ||
  "http://localhost:8000";

export async function generateQuiz({ topic, age, count, types, seed }) {
  const res = await fetch(`${API_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, age, count, types, seed }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Couldn't build your quiz. Try again!");
  }
  return res.json(); // { topic, age, questions: [...], cached }
}

export async function gradeAnswer({ question, modelAnswer, keyPoints, childAnswer, age }) {
  const res = await fetch(`${API_BASE}/api/grade`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      model_answer: modelAnswer,
      key_points: keyPoints,
      child_answer: childAnswer,
      age,
    }),
  });
  if (!res.ok) throw new Error("Couldn't check that answer.");
  return res.json(); // { verdict, feedback }
}
