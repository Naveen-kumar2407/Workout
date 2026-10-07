"""Multi-person pose detection with MediaPipe Pose Landmarker."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

from backend.biomechanics import compute_angles, visibility_ok, LM
from backend.coach import coach_person

_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task"
)
_MODEL_LITE_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
)
_MODEL_NAME = "pose_landmarker_heavy.task"
_MODEL_LITE_NAME = "pose_landmarker_lite.task"

CORE_INDICES = [
    LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
    LM.LEFT_HIP, LM.RIGHT_HIP,
    LM.LEFT_KNEE, LM.RIGHT_KNEE,
]

POSE_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 7), (0, 4), (4, 5), (5, 6), (6, 8),
    (9, 10), (11, 12), (11, 13), (13, 15), (15, 17), (15, 19), (15, 21),
    (17, 19), (12, 14), (14, 16), (16, 18), (16, 20), (16, 22), (18, 20),
    (11, 23), (12, 24), (23, 24), (23, 25), (24, 26), (25, 27), (26, 28),
    (27, 29), (28, 30), (29, 31), (30, 32), (27, 31), (28, 32),
]


def _model_path(name: str, url: str) -> str:
    root = Path(__file__).resolve().parent.parent
    models_dir = root / "models"
    models_dir.mkdir(exist_ok=True)
    path = models_dir / name
    if not path.exists():
        import urllib.request
        print(f"Downloading pose model to {path} ...")
        urllib.request.urlretrieve(url, path)
    return str(path)


def prepare_frame(frame_bgr: np.ndarray, max_width: int = 960) -> np.ndarray:
    """Resize large frames so pose detection is reliable."""
    if frame_bgr is None or frame_bgr.size == 0:
        return frame_bgr
    h, w = frame_bgr.shape[:2]
    if w > max_width:
        scale = max_width / w
        frame_bgr = cv2.resize(
            frame_bgr,
            (max_width, int(h * scale)),
            interpolation=cv2.INTER_AREA,
        )
    return np.ascontiguousarray(frame_bgr)


def _landmarks_to_dict(pose_2d, pose_world) -> tuple[list[dict], list[dict] | None]:
    lm_2d = [
        {
            "x": float(p.x),
            "y": float(p.y),
            "z": float(p.z),
            "visibility": float(getattr(p, "visibility", 1.0) or 1.0),
            "presence": float(getattr(p, "presence", 1.0) or 1.0),
        }
        for p in pose_2d
    ]
    lm_world = None
    if pose_world:
        lm_world = [{"x": float(p.x), "y": float(p.y), "z": float(p.z)} for p in pose_world]
    return lm_2d, lm_world


def _parse_poses(
    result,
    frame_bgr: np.ndarray,
    exercise: str,
    draw: bool,
    strict_visibility: bool,
) -> list[dict[str, Any]]:
    people: list[dict[str, Any]] = []
    if not result.pose_landmarks:
        return people

    h, w = frame_bgr.shape[:2]
    world_list = result.pose_world_landmarks or [None] * len(result.pose_landmarks)
    colors = [(80, 200, 120), (100, 180, 255), (255, 180, 80), (255, 120, 180)]

    for pid, (pose_2d, pose_world) in enumerate(zip(result.pose_landmarks, world_list)):
        lm_2d, lm_world = _landmarks_to_dict(pose_2d, pose_world)

        if strict_visibility and not visibility_ok(lm_2d, CORE_INDICES, min_vis=0.15, min_ratio=0.5):
            continue

        # Use 2D normalized landmarks for angles when world coords unavailable
        angle_src = lm_world if lm_world else lm_2d
        angles = compute_angles(angle_src)
        if not angles:
            continue

        metrics = coach_person(pid, angles, exercise)
        person = {
            "id": pid,
            "landmarks_2d": lm_2d,
            "landmarks_3d": lm_world or lm_2d,
            "angles": metrics.angles,
            "scores": metrics.scores,
            "issues": metrics.issues,
            "overall_score": metrics.overall_score,
        }
        people.append(person)

        if draw:
            color = colors[pid % len(colors)]
            _draw_skeleton(frame_bgr, lm_2d, w, h, color, metrics.overall_score)

    return people


def _draw_skeleton(
    frame: np.ndarray,
    landmarks: list[dict],
    w: int,
    h: int,
    color: tuple[int, int, int],
    score: float,
) -> None:
    pts = [(int(lm["x"] * w), int(lm["y"] * h)) for lm in landmarks]
    for i, j in POSE_CONNECTIONS:
        if i < len(pts) and j < len(pts):
            cv2.line(frame, pts[i], pts[j], color, 2, cv2.LINE_AA)
    for pt in pts:
        cv2.circle(frame, pt, 4, color, -1, cv2.LINE_AA)
    if pts:
        cv2.putText(
            frame, f"{int(score)}%", (pts[0][0], max(20, pts[0][1] - 10)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2, cv2.LINE_AA,
        )


class PoseEngine:
    """IMAGE mode — for live camera / single frames."""

    def __init__(self, max_poses: int = 4) -> None:
        base = python.BaseOptions(model_asset_path=_model_path(_MODEL_NAME, _MODEL_URL))
        options = vision.PoseLandmarkerOptions(
            base_options=base,
            running_mode=vision.RunningMode.IMAGE,
            num_poses=max_poses,
            min_pose_detection_confidence=0.4,
            min_pose_presence_confidence=0.4,
            min_tracking_confidence=0.4,
            output_segmentation_masks=False,
        )
        self._landmarker = vision.PoseLandmarker.create_from_options(options)

    def process_frame(
        self,
        frame_bgr: np.ndarray,
        exercise: str = "squat",
        draw: bool = True,
        strict_visibility: bool = False,
    ) -> tuple[np.ndarray, list[dict[str, Any]]]:
        frame_bgr = prepare_frame(frame_bgr)
        rgb = np.ascontiguousarray(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = self._landmarker.detect(mp_image)
        people = _parse_poses(result, frame_bgr, exercise, draw, strict_visibility)

        if not people:
            people = self._retry_scales(frame_bgr, exercise, draw, strict_visibility)

        return frame_bgr, people

    def _retry_scales(
        self, frame_bgr: np.ndarray, exercise: str, draw: bool, strict_visibility: bool,
    ) -> list[dict]:
        for scale in (1.25, 0.75):
            h, w = frame_bgr.shape[:2]
            resized = cv2.resize(
                frame_bgr,
                (int(w * scale), int(h * scale)),
                interpolation=cv2.INTER_LINEAR,
            )
            rgb = np.ascontiguousarray(cv2.cvtColor(resized, cv2.COLOR_BGR2RGB))
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = self._landmarker.detect(mp_image)
            people = _parse_poses(result, resized, exercise, draw, strict_visibility)
            if people:
                return people
        return []

    def close(self) -> None:
        self._landmarker.close()


class VideoPoseEngine:
    """VIDEO mode — temporal tracking for uploaded videos."""

    def __init__(self, max_poses: int = 4, use_lite_fallback: bool = True) -> None:
        self._max_poses = max_poses
        self._use_lite_fallback = use_lite_fallback
        self._timestamp_ms = 0
        self._landmarker = self._create_landmarker(lite=False)

    def _create_landmarker(self, lite: bool = False) -> vision.PoseLandmarker:
        if lite:
            path = _model_path(_MODEL_LITE_NAME, _MODEL_LITE_URL)
        else:
            path = _model_path(_MODEL_NAME, _MODEL_URL)
        base = python.BaseOptions(model_asset_path=path)
        options = vision.PoseLandmarkerOptions(
            base_options=base,
            running_mode=vision.RunningMode.VIDEO,
            num_poses=self._max_poses,
            min_pose_detection_confidence=0.35,
            min_pose_presence_confidence=0.35,
            min_tracking_confidence=0.35,
            output_segmentation_masks=False,
        )
        return vision.PoseLandmarker.create_from_options(options)

    def reset(self) -> None:
        self._timestamp_ms = 0

    def process_frame(
        self,
        frame_bgr: np.ndarray,
        exercise: str = "squat",
        fps: float = 30.0,
        draw: bool = False,
    ) -> list[dict[str, Any]]:
        frame_bgr = prepare_frame(frame_bgr)
        rgb = np.ascontiguousarray(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        step_ms = int(1000.0 / max(fps, 1.0))
        self._timestamp_ms += step_ms

        result = self._landmarker.detect_for_video(mp_image, self._timestamp_ms)
        return _parse_poses(result, frame_bgr, exercise, draw, strict_visibility=False)

    def process_frame_with_fallback(
        self,
        frame_bgr: np.ndarray,
        exercise: str,
        fps: float,
        image_engine: PoseEngine | None = None,
    ) -> list[dict[str, Any]]:
        people = self.process_frame(frame_bgr, exercise, fps, draw=False)
        if people:
            return people

        if image_engine is not None:
            _, people = image_engine.process_frame(
                frame_bgr, exercise=exercise, draw=False, strict_visibility=False,
            )
            if people:
                return people

        # Try 90° rotation (phone videos often stored sideways)
        for rot in (cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_90_COUNTERCLOCKWISE):
            rotated = cv2.rotate(frame_bgr, rot)
            people = self.process_frame(rotated, exercise, fps, draw=False)
            if people:
                return people
            if image_engine is not None:
                _, people = image_engine.process_frame(
                    rotated, exercise=exercise, draw=False, strict_visibility=False,
                )
                if people:
                    return people

        return []

    def close(self) -> None:
        self._landmarker.close()
