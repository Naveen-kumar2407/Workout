/** Exercise coaching rules (mirrors backend/coach.py) */

export const EXERCISES = ["squat", "pushup", "plank", "lunge", "posture"];

function avgScore(scores) {
  const vals = Object.values(scores);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

function evaluateSquat(a) {
  const issues = [], scores = {};
  const lk = a.left_knee ?? 180, rk = a.right_knee ?? 180;
  const depth = Math.min(lk, rk);
  scores.depth = depth <= 100 ? 100 : Math.max(0, 100 - (depth - 100) * 2);
  if (depth > 110) issues.push("Go deeper — aim for thighs parallel (~90° knee).");
  const torso = a.torso_lean ?? 0;
  scores.torso = Math.max(0, 100 - Math.abs(torso - 15) * 3);
  if (torso > 35) issues.push("Chest up — reduce forward lean.");
  const off = Math.max(a.left_knee_offset ?? 0, a.right_knee_offset ?? 0);
  scores.knee_tracking = Math.max(0, 100 - off * 4);
  if (off > 12) issues.push("Drive knees out — avoid knee cave.");
  scores.symmetry = Math.max(0, 100 - Math.abs(lk - rk) * 5);
  if (Math.abs(lk - rk) > 15) issues.push("Balance both legs evenly.");
  return { issues, scores, overall: avgScore(scores) };
}

function evaluatePushup(a) {
  const issues = [], scores = {};
  const le = a.left_elbow ?? 180, re = a.right_elbow ?? 180;
  const elbow = Math.min(le, re);
  scores.depth = elbow <= 100 ? 100 : Math.max(0, 100 - (elbow - 100) * 2);
  if (elbow > 120) issues.push("Lower chest — elbows ~90° at bottom.");
  const torso = a.torso_lean ?? 0;
  scores.body_line = Math.max(0, 100 - Math.abs(torso - 90) * 2);
  if (Math.abs(torso - 90) > 15) issues.push("Straight line head to heels.");
  scores.symmetry = Math.max(0, 100 - Math.abs(le - re) * 6);
  return { issues, scores, overall: avgScore(scores) };
}

function evaluatePlank(a) {
  const issues = [], scores = {};
  const torso = a.torso_lean ?? 90;
  scores.alignment = Math.max(0, 100 - Math.abs(torso - 90) * 3);
  if (torso < 75) issues.push("Hips too high.");
  if (torso > 105) issues.push("Hips sagging — engage core.");
  const lk = a.left_knee ?? 180, rk = a.right_knee ?? 180;
  scores.legs = Math.max(0, 100 - Math.max(Math.abs(lk-180), Math.abs(rk-180)) * 2);
  return { issues, scores, overall: avgScore(scores) };
}

function evaluateLunge(a) {
  const issues = [], scores = {};
  const fk = Math.min(a.left_knee ?? 180, a.right_knee ?? 180);
  scores.depth = fk >= 80 && fk <= 110 ? 100 : Math.max(0, 100 - Math.abs(fk - 95) * 2);
  if (fk > 120) issues.push("Drop back knee lower.");
  const torso = a.torso_lean ?? 0;
  scores.torso = Math.max(0, 100 - Math.abs(torso - 10) * 4);
  if (torso > 25) issues.push("Stay more upright.");
  return { issues, scores, overall: avgScore(scores) };
}

function evaluatePosture(a) {
  const issues = [], scores = {};
  const torso = a.torso_lean ?? 0;
  scores.upright = Math.max(0, 100 - Math.abs(torso) * 4);
  if (torso > 12) issues.push("Stand taller — less slouch.");
  scores.shoulders = Math.max(0, 100 - Math.abs((a.left_shoulder??0)-(a.right_shoulder??0)) * 5);
  return { issues, scores, overall: avgScore(scores) };
}

const EVAL = {
  squat: evaluateSquat, pushup: evaluatePushup, plank: evaluatePlank,
  lunge: evaluateLunge, posture: evaluatePosture,
};

export function coachPerson(personId, angles, exercise) {
  const fn = EVAL[exercise] || evaluatePosture;
  const { issues, scores, overall } = fn(angles);
  return {
    id: personId,
    angles,
    scores,
    issues,
    overall_score: Math.round(overall * 10) / 10,
  };
}
