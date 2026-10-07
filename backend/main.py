"""FastAPI server: WebSocket pose stream + static frontend."""

from __future__ import annotations

import base64
import json
import os
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.coach import EXERCISES
from backend.pose_engine import PoseEngine
from backend.video_analyzer import analyze_video_file

app = FastAPI(title="3D Biomechanical Multi-Person Coach")
FRONTEND = ROOT / "frontend"

engine: PoseEngine | None = None
current_exercise = "squat"


def get_engine() -> PoseEngine:
    global engine
    if engine is None:
        engine = PoseEngine(max_poses=4)
    return engine


@app.get("/api/exercises")
def list_exercises():
    return {"exercises": list(EXERCISES)}


@app.get("/api/health")
def health():
    return {"status": "ok", "exercise": current_exercise}


@app.post("/api/analyze-video")
async def analyze_video(
    file: UploadFile = File(...),
    exercise: str = Form("squat"),
):
    if exercise not in EXERCISES:
        exercise = "squat"

    suffix = Path(file.filename or "video.mp4").suffix or ".mp4"
    if suffix.lower() not in {".mp4", ".mov", ".avi", ".webm", ".mkv", ".m4v"}:
        suffix = ".mp4"

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
            content = await file.read()
            tmp.write(content)

        # Fresh engines per upload — VIDEO mode must not share state with camera
        image_engine = PoseEngine(max_poses=4)
        try:
            result = analyze_video_file(
                tmp_path,
                exercise=exercise,
                engine=image_engine,
                sample_fps=8.0,
            )
            if result.get("meta", {}).get("frames_with_detection", 0) == 0:
                result["summary"]["verdict"] = (
                    result["summary"].get("verdict", "")
                    + " Try a shorter clip with the full body visible, or re-encode as MP4."
                )
            return result
        finally:
            image_engine.close()
    except ValueError as e:
        return {"error": str(e)}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": f"Analysis failed: {e}"}
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.websocket("/ws/pose")
async def pose_websocket(ws: WebSocket):
    global current_exercise
    await ws.accept()
    pose_engine = get_engine()

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)

            if msg.get("type") == "config":
                ex = msg.get("exercise", "squat")
                if ex in EXERCISES:
                    current_exercise = ex
                await ws.send_json({"type": "config_ack", "exercise": current_exercise})
                continue

            if msg.get("type") != "frame":
                continue

            b64 = msg.get("data", "")
            if not b64:
                continue

            if "," in b64:
                b64 = b64.split(",", 1)[1]

            buf = base64.b64decode(b64)
            arr = np.frombuffer(buf, dtype=np.uint8)
            frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if frame is None:
                continue

            annotated, people = pose_engine.process_frame(
                frame, exercise=current_exercise, draw=True
            )

            _, jpeg = cv2.imencode(
                ".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 80]
            )
            out_b64 = base64.b64encode(jpeg.tobytes()).decode("ascii")

            await ws.send_json({
                "type": "result",
                "image": f"data:image/jpeg;base64,{out_b64}",
                "people": people,
                "exercise": current_exercise,
            })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


if FRONTEND.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND)), name="static")


@app.get("/manifest.webmanifest")
def manifest():
    path = FRONTEND / "manifest.webmanifest"
    if path.exists():
        return FileResponse(path, media_type="application/manifest+json")
    return {"error": "manifest not found"}


@app.get("/sw.js")
def service_worker():
    path = FRONTEND / "sw.js"
    if path.exists():
        return FileResponse(path, media_type="application/javascript")
    return {"error": "sw not found"}


@app.get("/mobile")
def mobile_app():
    path = FRONTEND / "mobile.html"
    if path.exists():
        return FileResponse(path)
    return {"message": "Mobile app not found"}


@app.get("/")
def index():
    index_path = FRONTEND / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"message": "Frontend not found. Place files in /frontend."}


@app.on_event("shutdown")
def shutdown():
    global engine
    if engine is not None:
        engine.close()
        engine = None
