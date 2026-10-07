import { SkeletonScene } from "./three-scene.js";

const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const capture = document.getElementById("capture");
const statusEl = document.getElementById("status");
const feedTitle = document.getElementById("feedTitle");
const exerciseSelect = document.getElementById("exercise");
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const peopleCards = document.getElementById("peopleCards");
const threeContainer = document.getElementById("threeContainer");
const cameraControls = document.getElementById("cameraControls");
const uploadControls = document.getElementById("uploadControls");
const videoFile = document.getElementById("videoFile");
const btnPickVideo = document.getElementById("btnPickVideo");
const btnAnalyze = document.getElementById("btnAnalyze");
const fileNameEl = document.getElementById("fileName");
const videoProgress = document.getElementById("videoProgress");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const playbackBar = document.getElementById("playbackBar");
const seekBar = document.getElementById("seekBar");
const timeLabel = document.getElementById("timeLabel");
const videoSummary = document.getElementById("videoSummary");
const tabs = document.querySelectorAll(".source-tabs .tab");

let ws = null;
let stream = null;
let rafId = null;
let sending = false;
let sourceMode = "camera";
let selectedFile = null;
let videoObjectUrl = null;
let analysisResult = null;
let timelineIndex = 0;

const scene3d = new SkeletonScene(threeContainer);
const WS_URL = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/pose`;

function setStatus(text, live = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("live", live);
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function setSource(mode) {
  sourceMode = mode;
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.source === mode));
  cameraControls.classList.toggle("hidden", mode !== "camera");
  uploadControls.classList.toggle("hidden", mode !== "upload");
  feedTitle.textContent = mode === "camera" ? "Live Feed" : "Video Analysis";
  stop();
  if (mode === "upload") {
    setStatus("Choose a video file, then click Analyze Video");
  } else {
    setStatus("Click Start Camera to begin");
    playbackBar.classList.add("hidden");
    videoSummary.classList.add("hidden");
  }
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => setSource(tab.dataset.source));
});

btnPickVideo.addEventListener("click", () => videoFile.click());

videoFile.addEventListener("change", () => {
  const file = videoFile.files?.[0];
  if (!file) return;
  selectedFile = file;
  fileNameEl.textContent = file.name;
  btnAnalyze.disabled = false;
  if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
  videoObjectUrl = URL.createObjectURL(file);
  video.srcObject = null;
  video.src = videoObjectUrl;
  video.controls = true;
  video.classList.remove("hidden");
  overlay.classList.remove("active");
  setStatus(`Loaded: ${file.name} — click Analyze Video`);
});

async function analyzeVideo() {
  if (!selectedFile) return;

  stop();
  videoProgress.classList.remove("hidden");
  progressFill.style.width = "0%";
  progressText.textContent = "Uploading & analyzing…";
  btnAnalyze.disabled = true;
  btnPickVideo.disabled = true;
  exerciseSelect.disabled = true;

  const form = new FormData();
  form.append("file", selectedFile);
  form.append("exercise", exerciseSelect.value);

  try {
    progressFill.style.width = "30%";
    const res = await fetch("/api/analyze-video", { method: "POST", body: form });
    progressFill.style.width = "90%";

    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `Server error ${res.status}`);

    analysisResult = data;
    const detected = data.meta?.frames_with_detection ?? 0;
    const analyzed = data.meta?.frames_analyzed ?? 0;
    progressFill.style.width = "100%";
    progressText.textContent = `Done — ${detected}/${analyzed} frames with person detected`;

    renderVideoSummary(data);
    playbackBar.classList.remove("hidden");
    seekBar.max = data.meta.duration_sec || video.duration || 100;
    video.currentTime = 0;
    syncToTime(0);
    if (detected === 0) {
      setStatus(
        "No person detected. Use MP4 (H.264), full body in frame, and good lighting.",
      );
    } else {
      setStatus("Analysis complete — scrub or play video to review", true);
    }

    video.addEventListener("timeupdate", onVideoTimeUpdate);
    seekBar.addEventListener("input", onSeek);
  } catch (err) {
    setStatus(`Analysis failed: ${err.message}`);
    progressText.textContent = "Analysis failed";
  } finally {
    btnAnalyze.disabled = !selectedFile;
    btnPickVideo.disabled = false;
    exerciseSelect.disabled = false;
    setTimeout(() => videoProgress.classList.add("hidden"), 2000);
  }
}

function onVideoTimeUpdate() {
  syncToTime(video.currentTime);
  seekBar.value = video.currentTime;
  updateTimeLabel();
}

function onSeek() {
  const t = parseFloat(seekBar.value);
  video.currentTime = t;
  syncToTime(t);
  updateTimeLabel();
}

function updateTimeLabel() {
  const dur = analysisResult?.meta?.duration_sec || video.duration || 0;
  timeLabel.textContent = `${formatTime(video.currentTime)} / ${formatTime(dur)}`;
}

function syncToTime(timeSec) {
  if (!analysisResult?.timeline?.length) return;

  const tl = analysisResult.timeline;
  let best = tl[0];
  let bestDiff = Math.abs(tl[0].time - timeSec);

  for (const frame of tl) {
    const diff = Math.abs(frame.time - timeSec);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = frame;
    }
  }

  const people = best.people || [];
  updateUI(people, analysisResult.meta.exercise);
  scene3d.updatePeople(people);

  const score = best.score ?? 0;
  setStatus(
    `Video @ ${formatTime(timeSec)} — form score ${Math.round(score)}%`,
    score >= 75,
  );
}

function renderVideoSummary(data) {
  const s = data.summary;
  videoSummary.classList.remove("hidden");

  const avgClass = s.avg_score >= 75 ? "good" : s.avg_score >= 50 ? "mid" : "low";
  const chartBars = data.timeline
    .map((f) => {
      const h = Math.max(4, (f.score / 100) * 48);
      const cls = f.score >= 75 ? "" : f.score >= 50 ? "mid" : "low";
      return `<div class="bar ${cls}" style="height:${h}px" data-time="${f.time}" title="${formatTime(f.time)}: ${f.score}%"></div>`;
    })
    .join("");

  const worstHtml = (s.worst_moments || [])
    .map(
      (m) =>
        `<li data-time="${m.time}"><span class="score">${m.score}%</span> @ ${formatTime(m.time)} — ${(m.issues || []).slice(0, 2).join("; ") || "Low score"}</li>`,
    )
    .join("");

  const issuesHtml = (s.top_issues || [])
    .map((i) => `<li>${i.text} <span class="muted">(×${i.count})</span></li>`)
    .join("");

  videoSummary.innerHTML = `
    <h3>Video Posture Report — ${s.exercise}</h3>
    <p class="verdict">${s.verdict}</p>
    <div class="summary-stats">
      <div class="stat ${avgClass}"><div class="value">${s.avg_score}%</div><div class="label">Avg Score</div></div>
      <div class="stat"><div class="value">${s.min_score}%</div><div class="label">Lowest</div></div>
      <div class="stat good"><div class="value">${s.max_score}%</div><div class="label">Highest</div></div>
      <div class="stat"><div class="value">${s.good_form_percent}%</div><div class="label">Good Form Time</div></div>
    </div>
    <div class="timeline-chart" title="Click a bar to jump">${chartBars}</div>
    ${worstHtml ? `<p class="muted" style="font-size:0.8rem;margin-top:0.5rem">Worst moments (click to seek):</p><ul class="moment-list">${worstHtml}</ul>` : ""}
    ${issuesHtml ? `<p class="muted" style="font-size:0.8rem;margin-top:0.5rem">Most common issues:</p><ul class="moment-list">${issuesHtml}</ul>` : ""}
  `;

  videoSummary.querySelectorAll(".bar, .moment-list li[data-time]").forEach((el) => {
    el.addEventListener("click", () => {
      const t = parseFloat(el.dataset.time);
      if (!isNaN(t)) {
        video.currentTime = t;
        seekBar.value = t;
        syncToTime(t);
        updateTimeLabel();
      }
    });
  });
}

function connectWs() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "config", exercise: exerciseSelect.value }));
      resolve();
    };
    ws.onerror = () => reject(new Error("WebSocket connection failed"));
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "result") {
          overlay.src = msg.image;
          overlay.classList.add("active");
          video.classList.add("hidden");
          updateUI(msg.people, msg.exercise);
          scene3d.updatePeople(msg.people || []);
        } else if (msg.type === "error") {
          setStatus(`Error: ${msg.message}`);
        }
      } catch (_) { /* ignore */ }
      sending = false;
    };
  });
}

function updateUI(people, exercise) {
  if (!people || people.length === 0) {
    peopleCards.innerHTML =
      '<p class="placeholder">No people detected. Ensure full body is visible in the video.</p>';
    return;
  }

  peopleCards.innerHTML = people
    .map((p) => {
      const score = p.overall_score ?? 0;
      const tier = score >= 75 ? "good" : score >= 50 ? "mid" : "low";
      const cardClass = score >= 75 ? "" : score >= 50 ? "warn" : "bad";
      const angleEntries = Object.entries(p.angles || {})
        .slice(0, 8)
        .map(([k, v]) => `<span>${formatKey(k)}: ${v}°</span>`)
        .join("");
      const issues = (p.issues || []).length
        ? `<ul class="issues">${p.issues.map((i) => `<li>${i}</li>`).join("")}</ul>`
        : '<p class="issues empty">Form looks good at this moment!</p>';

      return `
        <article class="person-card ${cardClass}">
          <h3>Person ${p.id + 1}
            <span class="score-badge ${tier}">${Math.round(score)}%</span>
          </h3>
          <div class="angles">${angleEntries}</div>
          ${issues}
        </article>`;
    })
    .join("");
}

function formatKey(k) {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function sendFrame() {
  if (!ws || ws.readyState !== WebSocket.OPEN || sending) return;
  if (video.readyState < 2) return;

  const ctx = capture.getContext("2d");
  capture.width = video.videoWidth;
  capture.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);
  const dataUrl = capture.toDataURL("image/jpeg", 0.7);

  sending = true;
  ws.send(JSON.stringify({ type: "frame", data: dataUrl }));
}

function loop() {
  sendFrame();
  rafId = requestAnimationFrame(loop);
}

async function start() {
  if (sourceMode !== "camera") return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    video.src = "";
    video.controls = false;
    video.srcObject = stream;
    await video.play();
    await connectWs();
    btnStart.disabled = true;
    btnStop.disabled = false;
    exerciseSelect.disabled = true;
    playbackBar.classList.add("hidden");
    videoSummary.classList.add("hidden");
    setStatus("Live — coaching active", true);
    loop();
  } catch (err) {
    setStatus(`Camera error: ${err.message}`);
  }
}

function stop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  if (ws) {
    ws.close();
    ws = null;
  }
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  video.removeEventListener("timeupdate", onVideoTimeUpdate);
  video.srcObject = null;
  video.classList.remove("hidden");
  overlay.classList.remove("active");
  overlay.src = "";
  btnStart.disabled = false;
  btnStop.disabled = true;
  if (sourceMode === "camera") {
    exerciseSelect.disabled = false;
    setStatus("Stopped");
  }
  scene3d.updatePeople([]);
  if (sourceMode === "camera") {
    peopleCards.innerHTML =
      '<p class="placeholder">No people detected yet. Step into frame.</p>';
  }
}

exerciseSelect.addEventListener("change", () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "config", exercise: exerciseSelect.value }));
  }
});

btnStart.addEventListener("click", start);
btnStop.addEventListener("click", stop);
btnAnalyze.addEventListener("click", analyzeVideo);
