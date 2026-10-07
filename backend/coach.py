"""Exercise-specific coaching rules and feedback."""

from __future__ import annotations

from backend.biomechanics import PersonMetrics


EXERCISES = ("squat", "pushup", "plank", "lunge", "posture")


def evaluate_squat(angles: dict[str, float]) -> tuple[list[str], dict[str, float], float]:
    issues: list[str] = []
    scores: dict[str, float] = {}
    lk, rk = angles.get("left_knee", 180), angles.get("right_knee", 180)
    depth = min(lk, rk)
    scores["depth"] = 100.0 if depth <= 100 else max(0, 100 - (depth - 100) * 2)

    if depth > 110:
        issues.append("Go deeper — aim for thighs parallel (knee angle ~90°).")
    elif depth < 70:
        issues.append("Avoid going too deep if you feel knee pain.")

    torso = angles.get("torso_lean", 0)
    scores["torso"] = max(0, 100 - abs(torso - 15) * 3)
    if torso > 35:
        issues.append("Chest up — reduce forward lean to protect your lower back.")
    if torso < 5:
        issues.append("Slight forward lean is normal in a squat.")

    lk_off = angles.get("left_knee_offset", 0)
    rk_off = angles.get("right_knee_offset", 0)
    scores["knee_tracking"] = max(0, 100 - max(lk_off, rk_off) * 4)
    if max(lk_off, rk_off) > 12:
        issues.append("Drive knees out — avoid knee cave (valgus).")

    knee_diff = abs(lk - rk)
    scores["symmetry"] = max(0, 100 - knee_diff * 5)
    if knee_diff > 15:
        issues.append("Balance both legs — one knee is bending more than the other.")

    overall = sum(scores.values()) / max(len(scores), 1)
    return issues, scores, overall


def evaluate_pushup(angles: dict[str, float]) -> tuple[list[str], dict[str, float], float]:
    issues: list[str] = []
    scores: dict[str, float] = {}
    le, re = angles.get("left_elbow", 180), angles.get("right_elbow", 180)
    elbow = min(le, re)
    scores["depth"] = 100.0 if elbow <= 100 else max(0, 100 - (elbow - 100) * 2)
    if elbow > 120:
        issues.append("Lower your chest — bend elbows to ~90° at the bottom.")
    if elbow < 60:
        issues.append("Do not hyper-flex elbows at the bottom.")

    torso = angles.get("torso_lean", 0)
    scores["body_line"] = max(0, 100 - abs(torso - 90) * 2)
    if abs(torso - 90) > 15:
        issues.append("Keep a straight line from head to heels (no sagging hips).")

    elbow_diff = abs(le - re)
    scores["symmetry"] = max(0, 100 - elbow_diff * 6)
    if elbow_diff > 20:
        issues.append("Press evenly — one arm is bending more than the other.")

    overall = sum(scores.values()) / max(len(scores), 1)
    return issues, scores, overall


def evaluate_plank(angles: dict[str, float]) -> tuple[list[str], dict[str, float], float]:
    issues: list[str] = []
    scores: dict[str, float] = {}
    torso = angles.get("torso_lean", 90)
    scores["alignment"] = max(0, 100 - abs(torso - 90) * 3)
    if torso < 75:
        issues.append("Hips too high — lower them toward shoulder height.")
    if torso > 105:
        issues.append("Hips sagging — engage core and glutes.")

    lk, rk = angles.get("left_knee", 180), angles.get("right_knee", 180)
    scores["legs"] = max(0, 100 - max(abs(lk - 180), abs(rk - 180)) * 2)
    if lk < 160 or rk < 160:
        issues.append("Keep legs straight in a full plank.")

    overall = sum(scores.values()) / max(len(scores), 1)
    return issues, scores, overall


def evaluate_lunge(angles: dict[str, float]) -> tuple[list[str], dict[str, float], float]:
    issues: list[str] = []
    scores: dict[str, float] = {}
    lk, rk = angles.get("left_knee", 180), angles.get("right_knee", 180)
    front_knee = min(lk, rk)
    scores["depth"] = 100.0 if 80 <= front_knee <= 110 else max(0, 100 - abs(front_knee - 95) * 2)
    if front_knee > 120:
        issues.append("Drop the back knee lower — front thigh near parallel.")
    if front_knee < 70:
        issues.append("Front knee is too closed — step longer or stay higher.")

    torso = angles.get("torso_lean", 0)
    scores["torso"] = max(0, 100 - abs(torso - 10) * 4)
    if torso > 25:
        issues.append("Stay upright — slight forward lean only.")

    overall = sum(scores.values()) / max(len(scores), 1)
    return issues, scores, overall


def evaluate_posture(angles: dict[str, float]) -> tuple[list[str], dict[str, float], float]:
    issues: list[str] = []
    scores: dict[str, float] = {}
    torso = angles.get("torso_lean", 0)
    scores["upright"] = max(0, 100 - abs(torso) * 4)
    if torso > 12:
        issues.append("Stand taller — reduce forward slouch.")
    if torso < -8:
        issues.append("Avoid leaning back excessively.")

    ls, rs = angles.get("left_shoulder", 0), angles.get("right_shoulder", 0)
    shoulder_diff = abs(ls - rs)
    scores["shoulders"] = max(0, 100 - shoulder_diff * 5)
    if shoulder_diff > 15:
        issues.append("Level your shoulders — possible asymmetry.")

    overall = sum(scores.values()) / max(len(scores), 1)
    return issues, scores, overall


_EVALUATORS = {
    "squat": evaluate_squat,
    "pushup": evaluate_pushup,
    "plank": evaluate_plank,
    "lunge": evaluate_lunge,
    "posture": evaluate_posture,
}


def coach_person(person_id: int, angles: dict[str, float], exercise: str) -> PersonMetrics:
    fn = _EVALUATORS.get(exercise, evaluate_posture)
    issues, scores, overall = fn(angles)
    return PersonMetrics(
        person_id=person_id,
        angles=angles,
        scores=scores,
        issues=issues,
        overall_score=round(overall, 1),
    )
