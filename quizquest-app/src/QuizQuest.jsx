import { useState, useEffect, useRef } from "react";
import {
  Sparkles, Brain, Trophy, Star, Check, X, ArrowRight, ArrowLeft,
  RefreshCw, Lightbulb, Rocket, Loader2, Wand2, PartyPopper, Home,
} from "lucide-react";
import { generateQuiz, gradeAnswer } from "./api";

/*
  QuizQuest — an AI quiz generator for curious kids (ages 7–10, extensible).
  Flow:
    setup → generate (backend /api/generate) → quiz →
    verify (deterministic for MCQ/fill/TF, backend /api/grade for subjective) → score

  MOCK_MODE: when true, the app skips the backend and uses the hardcoded quiz
  below — handy for pure UI work with no server running. When false (default),
  it talks to the FastAPI backend via ./api. (The backend has its own MOCK_MODE,
  so you can also run everything offline by pointing at a backend started with
  MOCK_MODE=true.)
*/

// ---------- MOCK MODE ----------
const MOCK_MODE = false;

// Hardcoded sample: topic "Pokémon", all multiple-choice, aimed at ~age 8.
const MOCK_QUIZ = [
  {
    type: "mcq",
    question: "Which Pokémon is Ash's best buddy and rides on his shoulder?",
    options: ["Pikachu", "Charizard", "Snorlax", "Gengar"],
    correctIndex: 0,
    explanation: "Pikachu is Ash's famous partner Pokémon.",
    hint: "It's small, yellow, and can zap with electricity!",
  },
  {
    type: "mcq",
    question: "What type of Pokémon is Charmander?",
    options: ["Water", "Grass", "Fire", "Ice"],
    correctIndex: 2,
    explanation: "Charmander has a flame on its tail, so it's a Fire type.",
    hint: "Look at the flame on the tip of its tail.",
  },
  {
    type: "mcq",
    question: "Pikachu is which type of Pokémon?",
    options: ["Electric", "Water", "Rock", "Grass"],
    correctIndex: 0,
    explanation: "Pikachu attacks with electricity, so it's an Electric type.",
    hint: "It can shoot lightning-like bolts.",
  },
  {
    type: "mcq",
    question: "Which of these is a Water-type starter Pokémon?",
    options: ["Bulbasaur", "Squirtle", "Charmander", "Rattata"],
    correctIndex: 1,
    explanation: "Squirtle is a little turtle and a Water-type starter.",
    hint: "It looks like a tiny turtle.",
  },
  {
    type: "mcq",
    question: "What do trainers throw to catch a wild Pokémon?",
    options: ["A net", "A Poké Ball", "A rock", "A frisbee"],
    correctIndex: 1,
    explanation: "Trainers use Poké Balls to catch Pokémon.",
    hint: "It's round, and colored red and white.",
  },
  {
    type: "mcq",
    question: "Which type is Bulbasaur?",
    options: ["Grass", "Fire", "Flying", "Electric"],
    correctIndex: 0,
    explanation: "Bulbasaur has a plant bulb on its back, so it's a Grass type.",
    hint: "It has a plant growing on its back.",
  },
  {
    type: "mcq",
    question: "What does Charmander evolve into first?",
    options: ["Charizard", "Charmeleon", "Vulpix", "Ponyta"],
    correctIndex: 1,
    explanation: "Charmander evolves into Charmeleon, and later into Charizard.",
    hint: "Its name also starts with 'Char'.",
  },
  {
    type: "mcq",
    question: "What color is Pikachu?",
    options: ["Blue", "Green", "Yellow", "Purple"],
    correctIndex: 2,
    explanation: "Pikachu is bright yellow with red cheeks.",
    hint: "Think of the color of the sun.",
  },
  {
    type: "mcq",
    question: "A person who catches and trains Pokémon is called a Pokémon ___?",
    options: ["Doctor", "Trainer", "Painter", "Pilot"],
    correctIndex: 1,
    explanation: "They are called Pokémon Trainers.",
    hint: "It's someone who helps Pokémon get stronger.",
  },
  {
    type: "mcq",
    question: "Which Pokémon loves to sing songs that make others sleepy?",
    options: ["Jigglypuff", "Onix", "Machamp", "Magikarp"],
    correctIndex: 0,
    explanation: "Jigglypuff sings a lullaby that puts others to sleep.",
    hint: "It's round, pink, and puffy.",
  },
];

// Returns `count` questions with fresh ids (cycles the list if more are asked for).
function buildMockQuiz(count) {
  const n = Math.max(1, count || MOCK_QUIZ.length);
  return Array.from({ length: n }, (_, i) => ({ id: i, ...MOCK_QUIZ[i % MOCK_QUIZ.length] }));
}

const QUESTION_TYPES = [
  { id: "mcq", label: "Multiple choice", emoji: "🔤" },
  { id: "fill", label: "Fill in the blank", emoji: "✏️" },
  { id: "truefalse", label: "True or false", emoji: "⚖️" },
  { id: "subjective", label: "Open answer", emoji: "💭" },
];

const OPTION_STYLES = [
  { ring: "border-rose-300", bg: "bg-rose-50", chip: "bg-rose-500", text: "text-rose-700" },
  { ring: "border-amber-300", bg: "bg-amber-50", chip: "bg-amber-500", text: "text-amber-700" },
  { ring: "border-emerald-300", bg: "bg-emerald-50", chip: "bg-emerald-500", text: "text-emerald-700" },
  { ring: "border-sky-300", bg: "bg-sky-50", chip: "bg-sky-500", text: "text-sky-700" },
];

const LOADING_LINES = [
  "Waking up the question wizard…",
  "Digging up brainy questions…",
  "Sprinkling in some fun facts…",
  "Mixing tricky bits with easy bits…",
  "Almost ready, hold tight!",
];

// ---------- helpers ----------

function normalize(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:'"()\-_/]/g, "")
    .replace(/\s+/g, " ");
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return d[m][n];
}

// forgiving check for fill-in answers (kids misspell!)
function fillIsCorrect(user, answer) {
  const u = normalize(user), a = normalize(answer);
  if (!u) return false;
  if (u === a) return true;
  if (a.includes(" ")) return u.includes(a) || (a.includes(u) && u.length > 3);
  const tol = a.length <= 4 ? 1 : 2;
  return levenshtein(u, a) <= tol;
}

// ---------- small UI atoms ----------

function BigButton({ children, onClick, disabled, color = "violet", className = "" }) {
  const colors = {
    violet: "bg-violet-500 hover:bg-violet-600 shadow-violet-300",
    emerald: "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-300",
    amber: "bg-amber-500 hover:bg-amber-600 shadow-amber-300",
    rose: "bg-rose-500 hover:bg-rose-600 shadow-rose-300",
    sky: "bg-sky-500 hover:bg-sky-600 shadow-sky-300",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`qq-font inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-lg font-bold text-white shadow-lg transition-transform duration-150 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 ${colors[color]} ${className}`}
    >
      {children}
    </button>
  );
}

function Mascot({ mood = "happy", size = "text-6xl" }) {
  const face = { happy: "🦉", think: "🤔", cheer: "🎉", oops: "🙂" }[mood] || "🦉";
  return <div className={`qq-float ${size} leading-none`} aria-hidden>{face}</div>;
}

// ---------- screens ----------

function SetupScreen({ onGenerate }) {
  const [topic, setTopic] = useState("");
  const [age, setAge] = useState(8);
  const [count, setCount] = useState(5);
  const [types, setTypes] = useState([]); // empty = surprise mix

  const suggestions = ["Dinosaurs", "Outer space", "Ocean animals", "Volcanoes", "Ancient Egypt", "How plants grow"];

  const toggleType = (id) =>
    setTypes((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  return (
    <div className="w-full max-w-xl">
      <div className="mb-6 text-center">
        <div className="flex justify-center"><Mascot /></div>
        <h1 className="qq-font mt-2 text-4xl font-extrabold text-violet-700">Quiz Quest</h1>
        <p className="qq-font mt-1 text-lg font-semibold text-violet-500">
          Pick a topic and I'll make you a quiz!
        </p>
      </div>

      <div className="rounded-3xl border-4 border-violet-200 bg-white p-6 shadow-xl">
        <label className="qq-font block text-lg font-bold text-slate-700">What do you want a quiz about?</label>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && topic.trim() && onGenerate({ topic: topic.trim(), age, count, types })}
          placeholder="Type anything… like sharks or robots!"
          className="mt-2 w-full rounded-2xl border-4 border-slate-200 px-4 py-3 text-lg outline-none focus:border-violet-400"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => setTopic(s)}
              className="qq-font rounded-full bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-700 transition-transform hover:scale-105"
            >
              {s}
            </button>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div>
            <label className="qq-font block text-lg font-bold text-slate-700">How old are you?</label>
            <div className="mt-2 flex items-center gap-2">
              <button onClick={() => setAge((a) => Math.max(4, a - 1))} className="qq-font h-11 w-11 rounded-full bg-amber-400 text-2xl font-bold text-white active:scale-90">–</button>
              <div className="qq-font w-16 rounded-2xl bg-amber-50 py-2 text-center text-2xl font-extrabold text-amber-600">{age}</div>
              <button onClick={() => setAge((a) => Math.min(18, a + 1))} className="qq-font h-11 w-11 rounded-full bg-amber-400 text-2xl font-bold text-white active:scale-90">+</button>
            </div>
          </div>
          <div>
            <label className="qq-font block text-lg font-bold text-slate-700">How many questions?</label>
            <div className="mt-2 flex items-center gap-2">
              <button onClick={() => setCount((c) => Math.max(1, c - 1))} className="qq-font h-11 w-11 rounded-full bg-sky-400 text-2xl font-bold text-white active:scale-90">–</button>
              <div className="qq-font w-16 rounded-2xl bg-sky-50 py-2 text-center text-2xl font-extrabold text-sky-600">{count}</div>
              <button onClick={() => setCount((c) => Math.min(15, c + 1))} className="qq-font h-11 w-11 rounded-full bg-sky-400 text-2xl font-bold text-white active:scale-90">+</button>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <label className="qq-font block text-lg font-bold text-slate-700">Question styles</label>
          <p className="qq-font text-sm font-medium text-slate-400">Leave all off for a surprise mix!</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {QUESTION_TYPES.map((t) => {
              const on = types.includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => toggleType(t.id)}
                  className={`qq-font flex items-center gap-2 rounded-2xl border-4 px-3 py-2 text-left font-bold transition-transform hover:scale-[1.03] ${on ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500"}`}
                >
                  <span className="text-xl">{t.emoji}</span>
                  <span className="text-sm">{t.label}</span>
                  {on && <Check className="ml-auto h-5 w-5" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-7 flex justify-center">
          <BigButton
            color="violet"
            disabled={!topic.trim()}
            onClick={() => onGenerate({ topic: topic.trim(), age, count, types })}
          >
            <Wand2 className="h-5 w-5" /> Make my quiz!
          </BigButton>
        </div>
      </div>
    </div>
  );
}

function LoadingScreen({ topic }) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLine((l) => (l + 1) % LOADING_LINES.length), 1400);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex w-full max-w-md flex-col items-center text-center">
      <Mascot mood="think" size="text-7xl" />
      <div className="qq-font mt-6 flex items-center gap-2 text-2xl font-extrabold text-violet-700">
        <Loader2 className="h-6 w-6 animate-spin" /> Building your <span className="text-fuchsia-600">{topic}</span> quiz
      </div>
      <p className="qq-font mt-2 text-lg font-semibold text-violet-400">{LOADING_LINES[line]}</p>
    </div>
  );
}

function ErrorScreen({ message, onRetry, onHome }) {
  return (
    <div className="flex w-full max-w-md flex-col items-center text-center">
      <Mascot mood="oops" size="text-7xl" />
      <h2 className="qq-font mt-4 text-2xl font-extrabold text-rose-600">Oops, that didn't work</h2>
      <p className="qq-font mt-2 text-lg font-semibold text-slate-500">{message}</p>
      <div className="mt-6 flex gap-3">
        <BigButton color="violet" onClick={onRetry}><RefreshCw className="h-5 w-5" /> Try again</BigButton>
        <BigButton color="sky" onClick={onHome}><Home className="h-5 w-5" /> Start over</BigButton>
      </div>
    </div>
  );
}

function QuizScreen({ topic, age, questions, results, setResult, onFinish, onQuit }) {
  const [idx, setIdx] = useState(0);
  const [choice, setChoice] = useState(null);   // mcq index
  const [tf, setTf] = useState(null);           // "true"/"false"
  const [text, setText] = useState("");         // fill / subjective
  const [showHint, setShowHint] = useState(false);
  const [grading, setGrading] = useState(false);

  const q = questions[idx];
  const result = results[idx];
  const total = questions.length;
  const answered = !!result;

  // reset per-question input when navigating
  useEffect(() => {
    setShowHint(false);
    const r = results[idx];
    setChoice(r ? r.given.choice ?? null : null);
    setTf(r ? r.given.tf ?? null : null);
    setText(r ? r.given.text ?? "" : "");
  }, [idx]); // eslint-disable-line

  const canCheck =
    !answered &&
    ((q.type === "mcq" && choice !== null) ||
      (q.type === "truefalse" && tf !== null) ||
      ((q.type === "fill" || q.type === "subjective") && text.trim().length > 0));

  async function check() {
    if (q.type === "mcq") {
      const ok = choice === q.correctIndex;
      setResult(idx, { verdict: ok ? "correct" : "incorrect", points: ok ? 1 : 0, given: { choice } });
    } else if (q.type === "truefalse") {
      const ok = normalize(tf) === normalize(q.answer);
      setResult(idx, { verdict: ok ? "correct" : "incorrect", points: ok ? 1 : 0, given: { tf } });
    } else if (q.type === "fill") {
      const ok = fillIsCorrect(text, q.answer);
      setResult(idx, { verdict: ok ? "correct" : "incorrect", points: ok ? 1 : 0, given: { text } });
    } else {
      // subjective
      if (MOCK_MODE) {
        const ok = text.trim().length >= 10;
        setResult(idx, {
          verdict: ok ? "correct" : "partial",
          points: ok ? 1 : 0.5,
          feedback: ok
            ? "Nice thinking! You explained that really well. 🌟"
            : "Good start! Try adding a little more next time.",
          given: { text },
        });
        return;
      }
      // subjective → backend grader (LLM-as-judge)
      setGrading(true);
      try {
        const j = await gradeAnswer({
          question: q.question,
          modelAnswer: q.answer,
          keyPoints: q.keyPoints,
          childAnswer: text,
          age,
        });
        const verdict = ["correct", "partial", "incorrect"].includes(j.verdict) ? j.verdict : "partial";
        const points = verdict === "correct" ? 1 : verdict === "partial" ? 0.5 : 0;
        setResult(idx, { verdict, points, feedback: j.feedback || "", given: { text } });
      } catch (e) {
        setResult(idx, { verdict: "partial", points: 0.5, feedback: "I couldn't fully check that one, so I'll give you half a point!", given: { text } });
      } finally {
        setGrading(false);
      }
    }
  }

  const verdictBanner = () => {
    if (!answered) return null;
    const v = result.verdict;
    const map = {
      correct: { bg: "bg-emerald-100", text: "text-emerald-700", icon: <Check className="h-6 w-6" />, msg: "Correct! 🌟" },
      partial: { bg: "bg-amber-100", text: "text-amber-700", icon: <Star className="h-6 w-6" />, msg: "So close! ⭐" },
      incorrect: { bg: "bg-rose-100", text: "text-rose-700", icon: <X className="h-6 w-6" />, msg: "Not quite — now you know!" },
    }[v];
    const correctText =
      q.type === "mcq" ? q.options[q.correctIndex]
        : q.type === "truefalse" ? (normalize(q.answer) === "true" ? "True" : "False")
          : q.answer;
    return (
      <div className={`qq-pop mt-4 rounded-2xl ${map.bg} p-4`}>
        <div className={`qq-font flex items-center gap-2 text-xl font-extrabold ${map.text}`}>{map.icon} {map.msg}</div>
        {v !== "correct" && (
          <p className="qq-font mt-1 text-base font-semibold text-slate-600">Answer: <span className="text-slate-800">{correctText}</span></p>
        )}
        {result.feedback && <p className="qq-font mt-1 text-base font-medium text-slate-600">{result.feedback}</p>}
        {q.explanation && <p className="qq-font mt-1 text-base font-medium text-slate-500">💡 {q.explanation}</p>}
      </div>
    );
  };

  return (
    <div className="w-full max-w-2xl">
      {/* top bar */}
      <div className="mb-4 flex items-center justify-between">
        <button onClick={onQuit} className="qq-font flex items-center gap-1 rounded-full bg-white px-3 py-1 text-sm font-bold text-slate-500 shadow">
          <Home className="h-4 w-4" /> Quit
        </button>
        <div className="qq-font rounded-full bg-white px-4 py-1 text-sm font-bold text-violet-600 shadow">
          Question {idx + 1} of {total}
        </div>
        <div className="qq-font flex items-center gap-1 rounded-full bg-amber-400 px-4 py-1 text-sm font-extrabold text-white shadow">
          <Star className="h-4 w-4" /> {results.reduce((s, r) => s + (r ? r.points : 0), 0)}
        </div>
      </div>

      {/* progress */}
      <div className="mb-5 h-3 w-full overflow-hidden rounded-full bg-white shadow-inner">
        <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-violet-500 transition-all duration-300" style={{ width: `${((idx + 1) / total) * 100}%` }} />
      </div>

      {/* card */}
      <div className="rounded-3xl border-4 border-violet-200 bg-white p-6 shadow-xl">
        <div className="qq-font mb-1 inline-flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-violet-600">
          {QUESTION_TYPES.find((t) => t.id === q.type)?.emoji} {QUESTION_TYPES.find((t) => t.id === q.type)?.label}
        </div>
        <h2 className="qq-font text-2xl font-extrabold text-slate-800">{q.question}</h2>

        {/* input area by type */}
        <div className="mt-5">
          {q.type === "mcq" && (
            <div className="grid gap-3">
              {q.options.map((opt, i) => {
                const s = OPTION_STYLES[i % 4];
                const isChosen = (answered ? result.given.choice : choice) === i;
                const isCorrect = i === q.correctIndex;
                let border = s.ring, bg = "bg-white";
                if (answered) {
                  if (isCorrect) { border = "border-emerald-400"; bg = "bg-emerald-50"; }
                  else if (isChosen) { border = "border-rose-400"; bg = "bg-rose-50"; }
                } else if (isChosen) { border = "border-violet-400"; bg = s.bg; }
                return (
                  <button
                    key={i}
                    disabled={answered}
                    onClick={() => setChoice(i)}
                    className={`qq-font flex items-center gap-3 rounded-2xl border-4 ${border} ${bg} px-4 py-3 text-left text-lg font-bold text-slate-700 transition-transform ${!answered && "hover:scale-[1.02]"}`}
                  >
                    <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-full ${s.chip} text-white`}>{String.fromCharCode(65 + i)}</span>
                    <span>{opt}</span>
                    {answered && isCorrect && <Check className="ml-auto h-6 w-6 text-emerald-500" />}
                    {answered && isChosen && !isCorrect && <X className="ml-auto h-6 w-6 text-rose-500" />}
                  </button>
                );
              })}
            </div>
          )}

          {q.type === "truefalse" && (
            <div className="grid grid-cols-2 gap-3">
              {["true", "false"].map((val) => {
                const chosen = (answered ? result.given.tf : tf) === val;
                const correct = normalize(q.answer) === val;
                let cls = "border-slate-200 bg-white text-slate-600";
                if (answered) {
                  if (correct) cls = "border-emerald-400 bg-emerald-50 text-emerald-700";
                  else if (chosen) cls = "border-rose-400 bg-rose-50 text-rose-700";
                } else if (chosen) cls = "border-violet-400 bg-violet-50 text-violet-700";
                return (
                  <button
                    key={val}
                    disabled={answered}
                    onClick={() => setTf(val)}
                    className={`qq-font rounded-2xl border-4 py-6 text-2xl font-extrabold transition-transform ${!answered && "hover:scale-105"} ${cls}`}
                  >
                    {val === "true" ? "👍 True" : "👎 False"}
                  </button>
                );
              })}
            </div>
          )}

          {(q.type === "fill" || q.type === "subjective") && (
            q.type === "subjective" ? (
              <textarea
                value={text}
                disabled={answered}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                placeholder="Type your answer in your own words…"
                className="qq-font w-full rounded-2xl border-4 border-slate-200 px-4 py-3 text-lg outline-none focus:border-violet-400 disabled:bg-slate-50"
              />
            ) : (
              <input
                value={text}
                disabled={answered}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && canCheck && check()}
                placeholder="Type the missing word…"
                className="qq-font w-full rounded-2xl border-4 border-slate-200 px-4 py-3 text-lg outline-none focus:border-violet-400 disabled:bg-slate-50"
              />
            )
          )}
        </div>

        {/* hint */}
        {!answered && q.hint && (
          <div className="mt-4">
            {showHint ? (
              <p className="qq-font rounded-2xl bg-amber-50 p-3 text-base font-semibold text-amber-700">💡 {q.hint}</p>
            ) : (
              <button onClick={() => setShowHint(true)} className="qq-font inline-flex items-center gap-1 text-base font-bold text-amber-500 hover:text-amber-600">
                <Lightbulb className="h-5 w-5" /> Need a hint?
              </button>
            )}
          </div>
        )}

        {verdictBanner()}

        {/* actions */}
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            className="qq-font inline-flex items-center gap-1 rounded-full px-4 py-2 font-bold text-slate-500 transition-transform hover:scale-105 disabled:opacity-30"
          >
            <ArrowLeft className="h-5 w-5" /> Back
          </button>

          {!answered ? (
            <BigButton color="emerald" disabled={!canCheck || grading} onClick={check}>
              {grading ? <><Loader2 className="h-5 w-5 animate-spin" /> Checking…</> : <><Check className="h-5 w-5" /> Check answer</>}
            </BigButton>
          ) : idx < total - 1 ? (
            <BigButton color="violet" onClick={() => setIdx((i) => i + 1)}>
              Next <ArrowRight className="h-5 w-5" />
            </BigButton>
          ) : (
            <BigButton color="amber" onClick={onFinish}>
              <Trophy className="h-5 w-5" /> See my score!
            </BigButton>
          )}
        </div>
      </div>
    </div>
  );
}

function Confetti() {
  const pieces = useRef(
    Array.from({ length: 46 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      dur: 2.2 + Math.random() * 1.6,
      color: ["#f43f5e", "#f59e0b", "#10b981", "#38bdf8", "#a855f7", "#ec4899"][i % 6],
      size: 8 + Math.random() * 8,
    }))
  ).current;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <div
          key={i}
          className="qq-confetti absolute -top-4 rounded-sm"
          style={{ left: `${p.left}%`, width: p.size, height: p.size, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }}
        />
      ))}
    </div>
  );
}

function ResultsScreen({ topic, questions, results, onReplaySame, onNewTopic }) {
  const score = results.reduce((s, r) => s + (r ? r.points : 0), 0);
  const total = questions.length;
  const pct = total ? Math.round((score / total) * 100) : 0;
  const stars = pct >= 90 ? 3 : pct >= 60 ? 2 : pct >= 30 ? 1 : 0;
  const msg =
    pct >= 90 ? "Quiz champion! You're on fire! 🔥"
      : pct >= 60 ? "Great job! You really know your stuff!"
        : pct >= 30 ? "Nice try! You're learning fast."
          : "Every expert started here. Let's try again!";

  return (
    <div className="relative w-full max-w-2xl">
      {pct >= 60 && <Confetti />}
      <div className="relative rounded-3xl border-4 border-amber-200 bg-white p-8 text-center shadow-xl">
        <Mascot mood="cheer" size="text-7xl" />
        <h1 className="qq-font mt-3 text-3xl font-extrabold text-violet-700">Your {topic} score</h1>

        <div className="qq-font my-4 text-6xl font-black text-amber-500">
          {score % 1 === 0 ? score : score.toFixed(1)}<span className="text-3xl text-slate-400"> / {total}</span>
        </div>

        <div className="flex justify-center gap-1">
          {[0, 1, 2].map((i) => (
            <Star key={i} className={`h-10 w-10 ${i < stars ? "fill-amber-400 text-amber-400" : "text-slate-200"}`} />
          ))}
        </div>
        <p className="qq-font mt-3 text-xl font-bold text-slate-700">{msg}</p>

        {/* review */}
        <div className="mt-6 space-y-2 text-left">
          {questions.map((q, i) => {
            const r = results[i];
            const v = r?.verdict || "incorrect";
            const c = v === "correct" ? "text-emerald-600" : v === "partial" ? "text-amber-600" : "text-rose-500";
            const icon = v === "correct" ? <Check className="h-5 w-5" /> : v === "partial" ? <Star className="h-5 w-5" /> : <X className="h-5 w-5" />;
            return (
              <div key={i} className="flex items-start gap-2 rounded-2xl bg-slate-50 p-3">
                <span className={`mt-0.5 flex-none ${c}`}>{icon}</span>
                <p className="qq-font text-base font-semibold text-slate-600">{q.question}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <BigButton color="violet" onClick={onReplaySame}><RefreshCw className="h-5 w-5" /> New {topic} quiz</BigButton>
          <BigButton color="sky" onClick={onNewTopic}><Rocket className="h-5 w-5" /> Pick a new topic</BigButton>
        </div>
      </div>
    </div>
  );
}

// ---------- root ----------

export default function App() {
  const [screen, setScreen] = useState("setup"); // setup | loading | error | quiz | results
  const [config, setConfig] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");

  async function generate(cfg) {
    setConfig(cfg);
    setScreen("loading");
    setError("");

    if (MOCK_MODE) {
      // Brief pause so the loading animation shows, then serve the hardcoded quiz.
      const qs = buildMockQuiz(cfg.count);
      setTimeout(() => {
        setQuestions(qs);
        setResults(new Array(qs.length).fill(null));
        setScreen("quiz");
      }, 700);
      return;
    }

    try {
      const data = await generateQuiz({
        ...cfg,
        seed: cfg.seed || Date.now().toString(),
      });
      const qs = data.questions || [];
      if (!qs.length) throw new Error("I couldn't think of good questions for that. Try a clearer topic!");
      setQuestions(qs);
      setResults(new Array(qs.length).fill(null));
      setScreen("quiz");
    } catch (e) {
      setError(e.message || "Something went wrong.");
      setScreen("error");
    }
  }

  const setResult = (i, r) =>
    setResults((prev) => {
      const next = [...prev];
      next[i] = r;
      return next;
    });

  const goHome = () => { setScreen("setup"); setQuestions([]); setResults([]); };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-amber-50 via-rose-50 to-violet-100 px-4 py-8">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&display=swap');
        .qq-font { font-family: 'Fredoka', ui-rounded, 'Segoe UI', system-ui, sans-serif; }
        @keyframes qqFloat { 0%,100%{ transform: translateY(0) } 50%{ transform: translateY(-10px) } }
        .qq-float { animation: qqFloat 3s ease-in-out infinite; }
        @keyframes qqPop { 0%{ transform: scale(.9); opacity:0 } 100%{ transform: scale(1); opacity:1 } }
        .qq-pop { animation: qqPop .25s ease-out; }
        @keyframes qqFall { 0%{ transform: translateY(0) rotate(0); opacity:1 } 100%{ transform: translateY(520px) rotate(540deg); opacity:0 } }
        .qq-confetti { animation-name: qqFall; animation-timing-function: linear; animation-iteration-count: infinite; }
        @media (prefers-reduced-motion: reduce) {
          .qq-float, .qq-confetti { animation: none !important; }
        }
      `}</style>

      <div className="flex min-h-[80vh] w-full items-center justify-center">
        {screen === "setup" && <SetupScreen onGenerate={generate} />}
        {screen === "loading" && <LoadingScreen topic={config?.topic} />}
        {screen === "error" && <ErrorScreen message={error} onRetry={() => generate(config)} onHome={goHome} />}
        {screen === "quiz" && (
          <QuizScreen
            topic={config.topic}
            age={config.age}
            questions={questions}
            results={results}
            setResult={setResult}
            onFinish={() => setScreen("results")}
            onQuit={goHome}
          />
        )}
        {screen === "results" && (
          <ResultsScreen
            topic={config.topic}
            questions={questions}
            results={results}
            onReplaySame={() => generate(config)}
            onNewTopic={goHome}
          />
        )}
      </div>
    </div>
  );
}
