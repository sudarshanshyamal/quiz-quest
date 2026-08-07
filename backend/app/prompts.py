"""Prompt construction. Kept separate so prompts are easy to tune and test."""
from typing import List

from .schemas import GenerateRequest, GradeRequest, QType

TYPE_NAMES = {
    QType.mcq: "multiple choice (four options, one correct)",
    QType.fill: "fill in the blank (use ___ for the blank)",
    QType.truefalse: "true or false",
    QType.subjective: "open-ended (answered in the child's own words)",
}

GEN_SYSTEM = (
    "You are a warm, encouraging quiz maker for children. "
    "Every question must be factually correct, age-appropriate, and never scary, "
    "violent, or unsafe. You always return data that matches the required schema."
)

GRADE_SYSTEM = (
    "You are a kind, patient teacher grading a young child's answer. "
    "Be generous: reward the core idea even when the wording is simple or the "
    "spelling is off. Keep feedback short and warm."
)


def build_generation_prompt(req: GenerateRequest) -> str:
    types = req.types or list(QType)
    names = "; ".join(TYPE_NAMES[t] for t in types)
    seed_line = (
        f"\nVariety token: {req.seed} — use it to make this set different from other sets."
        if req.seed else ""
    )
    return (
        f'Create a fun quiz for a {req.age}-year-old child.\n'
        f'Topic: "{req.topic}".\n'
        f"Make exactly {req.count} question(s).\n"
        f"Use only these question styles, mixed nicely: {names}.{seed_line}\n\n"
        "Guidelines:\n"
        f"- Match vocabulary and difficulty to age {req.age}. Short, clear sentences.\n"
        "- No trick questions. Encouraging tone.\n"
        "- For multiple choice: exactly four options; set correctIndex (0-3).\n"
        "- For fill in the blank: put ___ in the question; answer is the missing word.\n"
        '- For true/false: answer is exactly "true" or "false".\n'
        "- For open-ended: give a short model answer plus 2-3 keyPoints.\n"
        "- Every question needs a one-sentence kid-friendly explanation and a gentle hint."
    )


def build_grading_prompt(req: GradeRequest) -> str:
    key = "; ".join(req.key_points) if req.key_points else "(none provided)"
    return (
        f"Grade this {req.age}-year-old's answer.\n"
        f"Question: {req.question}\n"
        f"Model answer: {req.model_answer or '(none)'}\n"
        f"Key points a good answer includes: {key}\n"
        f"Child's answer: {req.child_answer}\n\n"
        'Decide the verdict: "correct", "partial", or "incorrect". '
        "Be generous for a child. Then write one or two warm, encouraging sentences "
        "of feedback addressed to the child."
    )


def topic_moderation_prompt(topic: str) -> str:
    return (
        "You screen quiz topics for a children's app (ages 7-10). "
        f'Topic: "{topic}". '
        'Reply with "safe" if it is appropriate for young children, or "unsafe" '
        "if it involves violence, sex, drugs, self-harm, hate, or other adult themes. "
        "Reply with only one word."
    )
