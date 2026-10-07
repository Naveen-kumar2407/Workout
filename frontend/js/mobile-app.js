import { MobilePoseEngine } from "./pose-client.js";
import { EXERCISES } from "./coach.js";

const $ = (id) => document.getElementById(id);

const video = $("video");
const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const exerciseSelect = $("exercise");
const btnStart = $("btnStart");
const btnStop = $("btnStop");
const btnPick = $("btnPick");
const videoInput = $("videoInput");
const scoreRing = $("scoreRing");
const scoreValue = $("scoreValue");
const statusEl = $("status");
const feedbackList = $("feedbackList");
const loader = $("loader");
const loaderText = $("loaderText");
const tabBtns = document.querySelectorAll(".nav-tab");
const panels = document.querySelectorAll(".tab-panel");

let engine = null;
let stream = null;
let rafId = null;
let running = false;
let facingMode = "user";

/** Mobile browsers only expose camera over HTTPS (not http:// on Wi-Fi). */
function getCameraStream(constraints) {
  if (navigator.mediaDevices?.getUserMedia) {
    return navigator.mediaDevices.getUserMedia(constraints);
  }
  const legacy =
    navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia;
  if (legacy) {
    return new Promise((resolve, reject) => {
      legacy.call(navigator, constraints, resolve, reject);
    });
  }
  if (!window.isSecureContext) {
    throw new Error(
      "Camera needs HTTPS. On your phone open the https:// link from the terminal (not http://).",
    );
  }
  throw new Error("Camera not supported in this browser.");
}

function showSecureHint() {
  const banner = $("secureBanner");
  if (!banner) return;
  if (!window.isSecureContext) {
    banner.classList.remove("hidden");
    banner.innerHTML =
      "<strong>Camera blocked:</strong> Use <code>https://</code> URL from your PC terminal, not <code>http://</code>. Accept the security warning, then allow camera.";
  } else {
    banner.classList.add("hidden");
  }
}

tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabBtns.forEach((b) => b.classList.remove("active"));
    panels.forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
  });
});

function setLoader(show, text = "Loading AI model…") {
  loader.classList.toggle("hidden", !show);
  loaderText.textContent = text;
}

function setStatus(msg, live = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("live", live);
}

function setScore(score) {
  const s = Math.round(score);
  scoreValue.textContent = s;
  scoreRing.style.setProperty("--pct", s);
  scoreRing.classList.remove("good", "mid", "bad");
  if (s >= 75) scoreRing.classList.add("good");
  else if (s >= 50) scoreRing.classList.add("mid");
  else scoreRing.classList.add("bad");
}

function resizeCanvas() {
  const wrap = canvas.parentElement;
  canvas.width = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
}

function renderFeedback(people) {
  if (!people?.length) {
    feedbackList.innerHTML = '<li class="empty">Step into frame — full body visible</li>';
    setScore(0);
    return;
  }
  const p = people[0];
  setScore(p.overall_score ?? 0);
  const items = (p.issues?.length)
    ? p.issues.map((i) => `<li>${i}</li>`).join("")
    : '<li class="ok">Great form — keep it up!</li>';
  feedbackList.innerHTML = items;

  const angles = Object.entries(p.angles || {})
    .slice(0, 6)
    .map(([k, v]) => `<span class="chip">${k.replace(/_/g, " ")}: ${v}°</span>`)
    .join("");
  $("angleChips").innerHTML = angles;
}

function loop() {
  if (!running || !engine) return;
  resizeCanvas();
  const exercise = exerciseSelect.value;
  const people = engine.detect(video, exercise, 24);
  engine.drawSkeleton(ctx, people, canvas.width, canvas.height);
  renderFeedback(people);
  rafId = requestAnimationFrame(loop);
}

async function startCamera() {
  try {
    setLoader(true, "Starting camera…");
    stop();
    engine = engine || new MobilePoseEngine();
    if (!engine.landmarker) await engine.init();

    stream = await getCameraStream({
      video: {
        facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    video.srcObject = stream;
    video.playsInline = true;
    video.muted = true;
    await video.play();
    engine.reset();
    running = true;
    btnStart.disabled = true;
    btnStop.disabled = false;
    setLoader(false);
    setStatus("Live coaching", true);
    loop();
  } catch (e) {
    setLoader(false);
    const name = e.name || "";
    let msg = e.message || "Could not open camera";
    if (name === "NotAllowedError") {
      msg = "Camera permission denied. Allow camera in browser settings.";
    } else if (name === "NotFoundError") {
      msg = "No camera found on this device.";
    }
    setStatus(msg);
    showSecureHint();
  }
}

function stop() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  video.srcObject = null;
  video.removeAttribute("src");
  btnStart.disabled = false;
  btnStop.disabled = true;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  setStatus("Stopped");
}

$("btnFlip").addEventListener("click", () => {
  facingMode = facingMode === "user" ? "environment" : "user";
  if (running) startCamera();
});

btnStart.addEventListener("click", startCamera);
btnStop.addEventListener("click", stop);

btnPick.addEventListener("click", () => videoInput.click());

videoInput.addEventListener("change", async () => {
  const file = videoInput.files?.[0];
  if (!file) return;

  stop();
  tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === "video"));
  panels.forEach((p) => p.classList.toggle("active", p.id === "panel-video"));
  document.getElementById("panel-video").classList.add("active");

  setLoader(true, "Loading video…");
  engine = engine || new MobilePoseEngine();
  if (!engine.landmarker) await engine.init();

  const url = URL.createObjectURL(file);
  video.srcObject = null;
  video.src = url;
  video.controls = true;
  video.muted = true;
  await video.play();

  setLoader(true, "Analyzing posture…");
  engine.reset();
  const exercise = exerciseSelect.value;
  const timeline = [];
  const duration = video.duration || 10;
  const step = 0.25;
  video.pause();

  for (let t = 0; t < duration; t += step) {
    video.currentTime = t;
    await new Promise((r) => {
      video.onseeked = r;
      setTimeout(r, 150);
    });
    const people = engine.detect(video, exercise, 4);
    if (people.length) {
      timeline.push({ time: t, score: people[0].overall_score, people });
    }
    setLoader(true, `Analyzing ${Math.round((t / duration) * 100)}%`);
  }

  setLoader(false);
  if (!timeline.length) {
    setStatus("No person detected. Use MP4, full body in frame.");
    return;
  }

  const avg = timeline.reduce((a, f) => a + f.score, 0) / timeline.length;
  $("videoReport").innerHTML = `
    <p><strong>Avg score:</strong> ${Math.round(avg)}%</p>
    <p><strong>Frames detected:</strong> ${timeline.length}</p>
    <p class="hint">Play video and scrub to review form.</p>
  `;

  video.ontimeupdate = () => {
    let best = timeline[0];
    for (const f of timeline) {
      if (Math.abs(f.time - video.currentTime) < Math.abs(best.time - video.currentTime))
        best = f;
    }
    resizeCanvas();
    engine.drawSkeleton(ctx, best.people, canvas.width, canvas.height);
    renderFeedback(best.people);
  };
  setStatus("Video ready — play to review", true);
});

// PWA install
let deferredPrompt;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $("installBanner").classList.remove("hidden");
});
$("btnInstall")?.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  $("installBanner").classList.add("hidden");
});

// Init model on load
(async () => {
  setLoader(true);
  try {
    engine = new MobilePoseEngine();
    await engine.init();
    setLoader(false);
    showSecureHint();
    setStatus(
      window.isSecureContext
        ? "Ready — tap Start Camera"
        : "Open https:// link on phone for camera",
    );
  } catch (e) {
    setLoader(false);
    setStatus(`Model load failed: ${e.message}. Check internet once.`);
  }
})();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

window.addEventListener("resize", resizeCanvas);
