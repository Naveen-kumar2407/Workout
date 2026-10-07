/** Browser MediaPipe Pose (runs on phone — no server needed) */

import { PoseLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
import { computeAngles, landmarksFromResult, CONNECTIONS } from "./biomechanics.js";
import { coachPerson } from "./coach.js";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_LITE =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export class MobilePoseEngine {
  constructor() {
    this.landmarker = null;
    this.timestampMs = 0;
    this.mode = "VIDEO";
  }

  async init() {
    const vision = await FilesetResolver.forVisionTasks(WASM);
    const opts = {
      baseOptions: { modelAssetPath: MODEL_LITE, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 2,
      minPoseDetectionConfidence: 0.4,
      minPosePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    };
    try {
      this.landmarker = await PoseLandmarker.createFromOptions(vision, opts);
    } catch {
      opts.baseOptions.delegate = "CPU";
      this.landmarker = await PoseLandmarker.createFromOptions(vision, opts);
    }
  }

  reset() {
    this.timestampMs = 0;
  }

  detect(videoEl, exercise, fps = 30) {
    if (!this.landmarker || videoEl.readyState < 2) return [];

    this.timestampMs += Math.floor(1000 / Math.max(fps, 1));
    const result = this.landmarker.detectForVideo(videoEl, this.timestampMs);
    return this._parse(result, exercise);
  }

  detectImage(bitmap, exercise) {
    if (!this.landmarker) return [];
    const result = this.landmarker.detect(bitmap);
    return this._parse(result, exercise);
  }

  _parse(result, exercise) {
    if (!result?.poseLandmarks?.length) return [];
    const world = result.poseWorldLandmarks || [];
    const people = [];

    result.poseLandmarks.forEach((pose2d, pid) => {
      const poseWorld = world[pid];
      const { lm2d, lm3d } = landmarksFromResult(pose2d, poseWorld);
      const angles = computeAngles(lm3d);
      if (!Object.keys(angles).length) return;
      const coached = coachPerson(pid, angles, exercise);
      people.push({
        ...coached,
        landmarks_2d: lm2d,
        landmarks_3d: lm3d,
      });
    });
    return people;
  }

  drawSkeleton(ctx, people, width, height) {
    ctx.clearRect(0, 0, width, height);
    const colors = ["#50c878", "#64b5f6"];

    people.forEach((person, i) => {
      const lm = person.landmarks_2d;
      if (!lm) return;
      const color = colors[i % colors.length];
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 3;

      const pts = lm.map((p) => [p.x * width, p.y * height]);
      CONNECTIONS.forEach(([a, b]) => {
        if (pts[a] && pts[b]) {
          ctx.beginPath();
          ctx.moveTo(pts[a][0], pts[a][1]);
          ctx.lineTo(pts[b][0], pts[b][1]);
          ctx.stroke();
        }
      });
      pts.forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      });
    });
  }
}
