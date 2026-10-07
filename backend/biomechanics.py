"""Joint angles and biomechanical metrics from pose landmarks."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any


@dataclass
class PersonMetrics:
    person_id: int
    angles: dict[str, float] = field(default_factory=dict)
    scores: dict[str, float] = field(default_factory=dict)
    issues: list[str] = field(default_factory=list)
    overall_score: float = 100.0


def _vec(a: tuple[float, float, float], b: tuple[float, float, float]) -> tuple[float, float, float]:
    return (b[0] - a[0], b[1] - a[1], b[2] - a[2])


def _dot(u: tuple[float, float, float], v: tuple[float, float, float]) -> float:
    return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]


def _norm(v: tuple[float, float, float]) -> float:
    return math.sqrt(_dot(v, v))


def angle_at_joint(
    a: tuple[float, float, float],
    b: tuple[float, float, float],
    c: tuple[float, float, float],
) -> float:
    """Angle at vertex B (degrees), formed by segments BA and BC."""
    ba = _vec(b, a)
    bc = _vec(b, c)
    n_ba, n_bc = _norm(ba), _norm(bc)
    if n_ba < 1e-6 or n_bc < 1e-6:
        return 0.0
    cos_angle = max(-1.0, min(1.0, _dot(ba, bc) / (n_ba * n_bc)))
    return math.degrees(math.acos(cos_angle))


def _lm(landmarks: list[dict], idx: int) -> tuple[float, float, float]:
    p = landmarks[idx]
    return (float(p["x"]), float(p["y"]), float(p["z"]))


# MediaPipe Pose landmark indices
class LM:
    NOSE = 0
    LEFT_SHOULDER, RIGHT_SHOULDER = 11, 12
    LEFT_ELBOW, RIGHT_ELBOW = 13, 14
    LEFT_WRIST, RIGHT_WRIST = 15, 16
    LEFT_HIP, RIGHT_HIP = 23, 24
    LEFT_KNEE, RIGHT_KNEE = 25, 26
    LEFT_ANKLE, RIGHT_ANKLE = 27, 28


def compute_angles(landmarks: list[dict]) -> dict[str, float]:
    if len(landmarks) < 33:
        return {}

    def ang(name: str, i: int, j: int, k: int) -> None:
        angles[name] = round(angle_at_joint(_lm(landmarks, i), _lm(landmarks, j), _lm(landmarks, k)), 1)

    angles: dict[str, float] = {}
    ang("left_elbow", LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST)
    ang("right_elbow", LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST)
    ang("left_knee", LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE)
    ang("right_knee", LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE)
    ang("left_hip", LM.LEFT_SHOULDER, LM.LEFT_HIP, LM.LEFT_KNEE)
    ang("right_hip", LM.RIGHT_SHOULDER, LM.RIGHT_HIP, LM.RIGHT_KNEE)
    ang("left_shoulder", LM.LEFT_ELBOW, LM.LEFT_SHOULDER, LM.LEFT_HIP)
    ang("right_shoulder", LM.RIGHT_ELBOW, LM.RIGHT_SHOULDER, LM.RIGHT_HIP)

    # Torso lean: angle between hip-mid to shoulder-mid vs vertical
    l_sh, r_sh = _lm(landmarks, LM.LEFT_SHOULDER), _lm(landmarks, LM.RIGHT_SHOULDER)
    l_hip, r_hip = _lm(landmarks, LM.LEFT_HIP), _lm(landmarks, LM.RIGHT_HIP)
    mid_sh = ((l_sh[0] + r_sh[0]) / 2, (l_sh[1] + r_sh[1]) / 2, (l_sh[2] + r_sh[2]) / 2)
    mid_hip = ((l_hip[0] + r_hip[0]) / 2, (l_hip[1] + r_hip[1]) / 2, (l_hip[2] + r_hip[2]) / 2)
    vertical = (0.0, -1.0, 0.0)
    torso = _vec(mid_hip, mid_sh)
    n_t = _norm(torso)
    if n_t > 1e-6:
        cos_t = max(-1.0, min(1.0, _dot(torso, vertical) / n_t))
        angles["torso_lean"] = round(math.degrees(math.acos(cos_t)), 1)
    else:
        angles["torso_lean"] = 0.0

    # Knee valgus proxy: horizontal distance knee vs ankle
    lk, la = _lm(landmarks, LM.LEFT_KNEE), _lm(landmarks, LM.LEFT_ANKLE)
    rk, ra = _lm(landmarks, LM.RIGHT_KNEE), _lm(landmarks, LM.RIGHT_ANKLE)
    angles["left_knee_offset"] = round(abs(lk[0] - la[0]) * 100, 1)
    angles["right_knee_offset"] = round(abs(rk[0] - ra[0]) * 100, 1)

    return angles


def visibility_ok(
    landmarks: list[dict],
    indices: list[int],
    min_vis: float = 0.15,
    min_ratio: float = 0.5,
) -> bool:
    """Require at least min_ratio of core joints to meet visibility (lenient for video)."""
    if not indices:
        return True
    visible = sum(1 for i in indices if landmarks[i].get("visibility", 1.0) >= min_vis)
    return visible >= max(1, int(len(indices) * min_ratio))
