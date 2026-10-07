# 3D Biomechanical Multi-Person Coach

Real-time workout posture coaching for **up to 4 people** at once. Uses MediaPipe Pose for multi-person skeleton tracking, computes joint angles for biomechanical analysis, and shows a live **3D skeleton view** with exercise-specific coaching feedback.

## Features

- **Multi-person detection** — track up to 4 bodies in one camera frame
- **3D skeleton visualization** — Three.js scene with orbit controls
- **Biomechanical metrics** — knee, hip, elbow, shoulder angles and torso lean
- **Exercise modes** — Squat, Push-up, Plank, Lunge, Standing Posture
- **Per-person coaching** — form score and actionable cues for each person
- **Video upload** — analyze recorded workouts (MP4, MOV, AVI, WebM) with full posture report

## Requirements

- Python 3.10+
- Webcam
- Modern browser (Chrome / Edge recommended)

## Setup

```bash
cd "c:\Users\Naveen\Desktop\project workout posture"
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

On first run, the MediaPipe pose model (~30 MB) downloads automatically into `models/`.

## Run

```bash
python run.py
```

Open **https://127.0.0.1:8000** (desktop) or **https://YOUR_PC_IP:8000/mobile** (phone), choose an exercise, then either:

### Mobile app (PWA)

1. Start the server on your PC (`python run.py`)
2. On your phone (same Wi‑Fi), open **`https://YOUR_PC_IP:8000/mobile`** (must be **https**, not http)  
   (find IP: `ipconfig` → IPv4 Address, e.g. `192.168.1.5`)
3. **Accept the certificate warning** on your phone (Advanced → Proceed) — required for camera
4. **Install**: Android Chrome → menu → *Install app* / *Add to Home screen*  
   iPhone Safari → Share → *Add to Home Screen*
5. The mobile app runs pose AI **on your phone** (no upload to server for live camera)

> **Note:** First launch needs internet to download the AI model (~5 MB). Camera requires permission.

---

Desktop browser — choose an exercise, then either:

- **Camera** — click **Start Camera** for live coaching, or
- **Upload Video** — choose a file, click **Analyze Video** for a full posture report with timeline scrubbing

## Project structure

```
├── backend/
│   ├── main.py           # FastAPI + WebSocket server
│   ├── pose_engine.py    # MediaPipe multi-pose detection
│   ├── biomechanics.py   # Joint angle calculations
│   └── coach.py          # Exercise coaching rules
├── frontend/
│   ├── index.html
│   ├── app.js            # Camera + WebSocket client
│   ├── three-scene.js    # 3D skeleton renderer
│   └── style.css
├── run.py
└── requirements.txt
```

## How it works

1. The browser captures webcam frames and sends them over WebSocket.
2. The server runs MediaPipe Pose Landmarker (heavy model) with `num_poses=4`.
3. 3D world landmarks drive joint-angle math and coaching rules.
4. Annotated video and per-person metrics return to the UI; Three.js renders 3D skeletons.

## Tips for best results

- Full body in frame, good lighting, camera 2–3 m away for multiple people
- Face the camera at roughly 45° for side-view exercises (squat depth)
- Stand far enough apart so skeletons do not overlap

## License

MIT — for educational and fitness coaching use.
