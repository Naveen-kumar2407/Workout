"""Analyze posture across an uploaded video file."""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from backend.pose_engine import PoseEngine, VideoPoseEngine


def _open_video(path: str | Path) -> cv2.VideoCapture:
    """Open video with FFMPEG backend (better codec support on Windows)."""
    cap = cv2.VideoCapture(str(path), cv2.CAP_FFMPEG)
    if not cap.isOpened():
        cap = cv2.VideoCapture(str(path))
    return cap


def _avg_person_score(people: list[dict]) -> float:
    if not people:
        return 0.0
    return sum(p.get("overall_score", 0) for p in people) / len(people)


def analyze_video_file(
    video_path: str | Path,
    exercise: str,
    engine: PoseEngine | None = None,
    sample_fps: float = 8.0,
    max_samples: int = 400,
) -> dict[str, Any]:
    cap = _open_video(video_path)
    if not cap.isOpened():
        raise ValueError("Could not open video file. Try MP4 (H.264) format.")

    fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
    if fps <= 0 or fps > 120:
        fps = 30.0

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = total_frames / fps if total_frames > 0 else 0.0
    step = max(1, int(round(fps / sample_fps)))

    image_engine = engine or PoseEngine(max_poses=4)
    video_engine = VideoPoseEngine(max_poses=4)
    video_engine.reset()

    timeline: list[dict[str, Any]] = []
    all_scores: list[float] = []
    issue_counter: Counter[str] = Counter()
    frames_with_people = 0
    frame_idx = 0
    frames_read = 0

    try:
        while True:
            ret, frame = cap.read()
            if not ret or frame is None or frame.size == 0:
                break

            frames_read += 1

            if frame_idx % step != 0:
                frame_idx += 1
                continue

            time_sec = round(frame_idx / fps, 2)
            people = video_engine.process_frame_with_fallback(
                frame,
                exercise=exercise,
                fps=fps,
                image_engine=image_engine,
            )

            if people:
                frames_with_people += 1

            frame_score = round(_avg_person_score(people), 1)
            if people:
                all_scores.append(frame_score)
                for p in people:
                    for issue in p.get("issues", []):
                        issue_counter[issue] += 1

            timeline.append({
                "time": time_sec,
                "frame": frame_idx,
                "score": frame_score,
                "people_count": len(people),
                "people": [
                    {
                        "id": p["id"],
                        "overall_score": p.get("overall_score", 0),
                        "angles": p.get("angles", {}),
                        "issues": p.get("issues", []),
                        "landmarks_3d": p.get("landmarks_3d", []),
                    }
                    for p in people
                ],
            })

            frame_idx += 1
            if len(timeline) >= max_samples:
                break

        # If nothing detected, scan more densely through first 5 seconds
        if frames_with_people == 0 and duration > 0:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            video_engine.reset()
            dense_step = max(1, int(fps / 15))  # 15 fps dense scan
            frame_idx = 0
            scan_limit = int(min(duration, 5.0) * fps)

            while frame_idx < scan_limit:
                ret, frame = cap.read()
                if not ret:
                    break
                if frame_idx % dense_step == 0:
                    people = video_engine.process_frame_with_fallback(
                        frame, exercise, fps, image_engine,
                    )
                    if people:
                        frames_with_people += 1
                        time_sec = round(frame_idx / fps, 2)
                        frame_score = round(_avg_person_score(people), 1)
                        all_scores.append(frame_score)
                        timeline.append({
                            "time": time_sec,
                            "frame": frame_idx,
                            "score": frame_score,
                            "people_count": len(people),
                            "people": [
                                {
                                    "id": p["id"],
                                    "overall_score": p.get("overall_score", 0),
                                    "angles": p.get("angles", {}),
                                    "issues": p.get("issues", []),
                                    "landmarks_3d": p.get("landmarks_3d", []),
                                }
                                for p in people
                            ],
                        })
                frame_idx += 1

    finally:
        cap.release()
        video_engine.close()

    if frames_read == 0:
        raise ValueError("Video has no readable frames. Re-export as MP4 (H.264).")

    detection_rate = round(
        100 * frames_with_people / max(len(timeline), 1), 1,
    )

    summary = _build_summary(
        timeline, all_scores, issue_counter, duration, exercise, detection_rate,
    )

    return {
        "summary": summary,
        "timeline": timeline,
        "meta": {
            "duration_sec": round(duration, 2),
            "fps": round(fps, 2),
            "frames_analyzed": len(timeline),
            "frames_with_detection": frames_with_people,
            "detection_rate_percent": detection_rate,
            "exercise": exercise,
        },
    }


def _build_summary(
    timeline: list[dict],
    scores: list[float],
    issues: Counter[str],
    duration: float,
    exercise: str,
    detection_rate: float,
) -> dict[str, Any]:
    if not scores:
        tips = (
            "No person detected. Tips: use MP4 format, ensure full body is in frame, "
            "good lighting, person at least 2m from camera, and avoid heavy motion blur."
        )
        if detection_rate == 0 and duration > 0:
            tips += f" ({duration:.0f}s video scanned)"
        return {
            "exercise": exercise,
            "avg_score": 0,
            "min_score": 0,
            "max_score": 0,
            "good_form_percent": 0,
            "detection_rate_percent": detection_rate,
            "verdict": tips,
            "worst_moments": [],
            "best_moments": [],
            "top_issues": [],
        }

    avg = round(sum(scores) / len(scores), 1)
    min_s, max_s = min(scores), max(scores)
    good_pct = round(100 * sum(1 for s in scores if s >= 75) / len(scores), 1)

    sorted_frames = sorted(
        [t for t in timeline if t.get("people_count", 0) > 0],
        key=lambda t: t["score"],
    )
    worst = [
        {"time": t["time"], "score": t["score"], "issues": _collect_issues(t)}
        for t in sorted_frames[:5]
    ]
    best = [
        {"time": t["time"], "score": t["score"], "issues": _collect_issues(t)}
        for t in sorted(sorted_frames, key=lambda t: t["score"], reverse=True)[:3]
    ]

    if avg >= 80:
        verdict = "Excellent form overall. Minor tweaks possible at low-score moments."
    elif avg >= 65:
        verdict = "Good form with room to improve. Review flagged timestamps."
    elif avg >= 50:
        verdict = "Form needs work. Focus on the recurring issues below."
    else:
        verdict = "Poor form detected. Consider reducing load and fixing technique."

    return {
        "exercise": exercise,
        "avg_score": avg,
        "min_score": round(min_s, 1),
        "max_score": round(max_s, 1),
        "good_form_percent": good_pct,
        "detection_rate_percent": detection_rate,
        "verdict": verdict,
        "worst_moments": worst,
        "best_moments": best,
        "top_issues": [{"text": t, "count": c} for t, c in issues.most_common(5)],
    }


def _collect_issues(frame: dict) -> list[str]:
    seen: list[str] = []
    for p in frame.get("people", []):
        for issue in p.get("issues", []):
            if issue not in seen:
                seen.append(issue)
    return seen
