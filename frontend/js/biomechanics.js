/** Joint angles from pose landmarks (mirrors backend/biomechanics.py) */

export const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
};

const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],[9,10],[11,12],
  [11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],
  [24,26],[25,27],[26,28],[27,29],[28,30],[29,31],[30,32],
];

export { CONNECTIONS };

function vec(a, b) {
  return [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
}
function dot(u, v) { return u[0]*v[0]+u[1]*v[1]+u[2]*v[2]; }
function norm(v) { return Math.sqrt(dot(v,v)); }

export function angleAtJoint(a, b, c) {
  const ba = vec(b, a), bc = vec(b, c);
  const nb = norm(ba), nc = norm(bc);
  if (nb < 1e-6 || nc < 1e-6) return 0;
  const cos = Math.max(-1, Math.min(1, dot(ba, bc) / (nb * nc)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function lm(landmarks, i) {
  const p = landmarks[i];
  return [p.x, p.y, p.z ?? 0];
}

export function computeAngles(landmarks) {
  if (!landmarks || landmarks.length < 33) return {};
  const angles = {};
  const ang = (name, i, j, k) => {
    angles[name] = Math.round(angleAtJoint(lm(landmarks,i), lm(landmarks,j), lm(landmarks,k)) * 10) / 10;
  };
  ang("left_elbow", LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST);
  ang("right_elbow", LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST);
  ang("left_knee", LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE);
  ang("right_knee", LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE);
  ang("left_hip", LM.LEFT_SHOULDER, LM.LEFT_HIP, LM.LEFT_KNEE);
  ang("right_hip", LM.RIGHT_SHOULDER, LM.RIGHT_HIP, LM.RIGHT_KNEE);
  ang("left_shoulder", LM.LEFT_ELBOW, LM.LEFT_SHOULDER, LM.LEFT_HIP);
  ang("right_shoulder", LM.RIGHT_ELBOW, LM.RIGHT_SHOULDER, LM.RIGHT_HIP);

  const lSh = lm(landmarks, LM.LEFT_SHOULDER), rSh = lm(landmarks, LM.RIGHT_SHOULDER);
  const lHip = lm(landmarks, LM.LEFT_HIP), rHip = lm(landmarks, LM.RIGHT_HIP);
  const midSh = [(lSh[0]+rSh[0])/2, (lSh[1]+rSh[1])/2, (lSh[2]+rSh[2])/2];
  const midHip = [(lHip[0]+rHip[0])/2, (lHip[1]+rHip[1])/2, (lHip[2]+rHip[2])/2];
  const torso = vec(midHip, midSh);
  const nT = norm(torso);
  if (nT > 1e-6) {
    const vertical = [0, -1, 0];
    const cosT = Math.max(-1, Math.min(1, dot(torso, vertical) / nT));
    angles.torso_lean = Math.round((Math.acos(cosT) * 180) / Math.PI * 10) / 10;
  } else angles.torso_lean = 0;

  const lk = lm(landmarks, LM.LEFT_KNEE), la = lm(landmarks, LM.LEFT_ANKLE);
  const rk = lm(landmarks, LM.RIGHT_KNEE), ra = lm(landmarks, LM.RIGHT_ANKLE);
  angles.left_knee_offset = Math.round(Math.abs(lk[0] - la[0]) * 100 * 10) / 10;
  angles.right_knee_offset = Math.round(Math.abs(rk[0] - ra[0]) * 100 * 10) / 10;
  return angles;
}

export function landmarksFromResult(pose2d, poseWorld) {
  const lm2d = pose2d.map((p) => ({
    x: p.x, y: p.y, z: p.z,
    visibility: p.visibility ?? 1,
  }));
  const lm3d = poseWorld
    ? poseWorld.map((p) => ({ x: p.x, y: p.y, z: p.z }))
    : lm2d;
  return { lm2d, lm3d };
}
