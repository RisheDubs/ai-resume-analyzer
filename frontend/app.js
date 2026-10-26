// ---------- Settings ----------
const API = window.APP_CONFIG.API_BASE_URL.replace(/\/$/, "");
const MAX_FILE_BYTES = 5 * 1024 * 1024;           // 5 MB
const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg"];
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 180000;                    // 3 minutes
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 52;      // circle radius in the SVG
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const STEP_FOR_STATUS = {
  UPLOADING: 0,
  PENDING: 1, PROCESSING: 1, TEXT_EXTRACTED: 1,
  ANALYZING: 2,
  DONE: 3,
};

const STATUS_TEXT = {
  UPLOADING: "Uploading your resume",
  PENDING: "Waiting to start",
  PROCESSING: "Reading your document",
  TEXT_EXTRACTED: "Text extracted",
  ANALYZING: "AI is reviewing your resume",
  DONE: "Done",
};

// ---------- Small helpers ----------
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

function showSection(name) {
  for (const section of ["upload", "progress", "results"]) {
    $(`${section}-section`).hidden = section !== name;
  }
  window.scrollTo({ top: 0, behavior: REDUCED_MOTION ? "auto" : "smooth" });
}

function showFormError(message) {
  const el = $("form-error");
  el.textContent = message;
  el.hidden = !message;
}

function formatBytes(bytes) {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function scoreClass(score) {
  if (score >= 75) return "good";
  if (score >= 50) return "ok";
  return "bad";
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  let body = {};
  try { body = await res.json(); } catch { /* empty or non-JSON body */ }
  if (res.status === 429) throw new Error("Too many requests right now. Please wait a moment and try again.");
  if (!res.ok) throw new Error(body.error || body.message || `Request failed (${res.status})`);
  return body;
}

// ---------- Theme ----------
function currentTheme() {
  const explicit = document.documentElement.dataset.theme;
  if (explicit) return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

$("theme-toggle").addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("theme", next); } catch { /* storage unavailable */ }
});

// ---------- File picking & drag-and-drop ----------
const fileInput = $("resume-file");
const dropzone = $("dropzone");
const DROPZONE_DEFAULT = $("dropzone-text").innerHTML;

function updateDropzone() {
  const file = fileInput.files[0];
  if (file) {
    $("dropzone-text").textContent = `📄 ${file.name} (${formatBytes(file.size)})`;
    dropzone.classList.add("has-file");
  } else {
    $("dropzone-text").innerHTML = DROPZONE_DEFAULT;   // static markup we wrote, safe
    dropzone.classList.remove("has-file");
  }
  showFormError("");
}

fileInput.addEventListener("change", updateDropzone);

["dragenter", "dragover"].forEach((type) =>
  dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  })
);
["dragleave", "drop"].forEach((type) =>
  dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
  })
);
dropzone.addEventListener("drop", (e) => {
  if (e.dataTransfer.files.length) {
    fileInput.files = e.dataTransfer.files;
    updateDropzone();
  }
});

// Job description character counter
$("job-description").addEventListener("input", (e) => {
  $("jd-count").textContent = e.target.value.length;
});

// ---------- Validation ----------
function validateFile(file) {
  if (!file) return "Please choose a resume file.";
  if (!ALLOWED_TYPES.includes(file.type)) return "Only PDF, PNG or JPEG files are supported.";
  if (file.size > MAX_FILE_BYTES) return "File is too large. Maximum size is 5 MB.";
  return null;
}

// ---------- Progress ----------
let elapsedTimer = null;

function startElapsedTimer() {
  const started = Date.now();
  $("elapsed").textContent = "0s";
  elapsedTimer = setInterval(() => {
    $("elapsed").textContent = `${Math.round((Date.now() - started) / 1000)}s`;
  }, 1000);
}

function stopElapsedTimer() {
  clearInterval(elapsedTimer);
}

function setStep(status) {
  const active = STEP_FOR_STATUS[status] ?? 0;
  document.querySelectorAll("#steps li").forEach((li, i) => {
    li.classList.toggle("done", i < active || status === "DONE");
    li.classList.toggle("active", i === active && status !== "DONE");
  });
  $("progress-text").textContent = STATUS_TEXT[status] || status;
}

// ---------- API flow ----------
async function uploadResume(file, targetRole, jobDescription) {
  // 1. Ask our API for a presigned upload URL (JSON request)
  const { resumeId, uploadUrl } = await requestJson(`${API}/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: file.type, fileSize: file.size, targetRole, jobDescription }),
  });

  // 2. Upload the actual file to S3 (raw file bytes, NOT JSON)
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status}). Please try again.`);
  return resumeId;
}

async function waitForResult(resumeId) {
  const started = Date.now();
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const result = await requestJson(`${API}/results/${resumeId}`);
    setStep(result.status);
    if (result.isComplete) return result;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("The analysis is taking longer than expected. Please try again.");
}

// ---------- Rendering (textContent only: AI output is never treated as HTML) ----------
function fillList(id, items) {
  const list = $(id);
  list.replaceChildren();
  for (const text of items || []) {
    const li = document.createElement("li");
    li.textContent = text;
    list.appendChild(li);
  }
}

function fillChips(id, items) {
  const container = $(id);
  container.replaceChildren();
  for (const text of items || []) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = text;
    container.appendChild(chip);
  }
}

function animateNumber(el, target, duration = 1200) {
  if (REDUCED_MOTION) {
    el.textContent = target;
    return;
  }
  const start = performance.now();
  function frame(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);       // ease-out
    el.textContent = Math.round(target * eased);
    if (progress < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function headlineFor(score) {
  if (score >= 75) return "Strong resume 🎉";
  if (score >= 50) return "Good, with room to improve";
  return "Needs some work";
}

async function renderResults(result) {
  const a = result.analysis;
  const score = a.ats_score;
  const level = scoreClass(score);

  $("score-headline").textContent = headlineFor(score);
  $("result-role").textContent = result.targetRole ? `Evaluated for: ${result.targetRole}` : "";

  // Gauge starts empty...
  const gauge = $("gauge-fill");
  gauge.setAttribute("class", `gauge-fill ${level}`);
  gauge.style.strokeDasharray = GAUGE_CIRCUMFERENCE;
  gauge.style.strokeDashoffset = GAUGE_CIRCUMFERENCE;

  // Section score bars start empty...
  const container = $("section-scores");
  container.replaceChildren();
  const fills = [];
  for (const [name, value] of Object.entries(a.section_scores || {})) {
    const row = document.createElement("div");
    row.className = "score-row";
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = name;
    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("div");
    fill.className = `fill ${scoreClass(value)}`;
    bar.appendChild(fill);
    const num = document.createElement("span");
    num.className = "value";
    num.textContent = value;
    row.append(label, bar, num);
    container.appendChild(row);
    fills.push([fill, value]);
  }

  fillList("strengths-list", a.strengths);
  fillChips("keywords-list", a.missing_keywords);
  fillList("improvements-list", a.improvements);
  fillChips("skills-list", a.recommended_skills);
  $("summary-text").textContent = a.professional_summary;

  // ...then animate everything in once the section is visible
  await nextFrame();
  gauge.style.strokeDashoffset = GAUGE_CIRCUMFERENCE * (1 - score / 100);
  fills.forEach(([fill, value]) => (fill.style.width = `${value}%`));
  animateNumber($("ats-score"), score);
}

// ---------- Event handlers ----------
$("upload-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  showFormError("");

  const file = fileInput.files[0];
  const error = validateFile(file);
  if (error) return showFormError(error);

  const targetRole = $("target-role").value.trim();
  const jobDescription = $("job-description").value.trim();

  $("submit-btn").disabled = true;
  try {
    showSection("progress");
    setStep("UPLOADING");
    startElapsedTimer();

    const resumeId = await uploadResume(file, targetRole, jobDescription);
    const result = await waitForResult(resumeId);

    if (result.status === "FAILED") {
      throw new Error(result.error || "Analysis failed. Please try a different file.");
    }
    showSection("results");
    await renderResults(result);
  } catch (err) {
    console.error(err);
    showSection("upload");
    showFormError(err.message || "Something went wrong. Please try again.");
  } finally {
    stopElapsedTimer();
    $("submit-btn").disabled = false;
  }
});

$("copy-summary").addEventListener("click", async () => {
  const button = $("copy-summary");
  try {
    await navigator.clipboard.writeText($("summary-text").textContent);
    button.textContent = "Copied!";
  } catch {
    button.textContent = "Copy failed";
  }
  setTimeout(() => (button.textContent = "Copy summary"), 2000);
});

$("download-report").addEventListener("click", () => {
  // The browser's print dialog has "Save as PDF"; the print stylesheet formats the page.
  const originalTitle = document.title;
  const role = $("result-role").textContent.replace("Evaluated for: ", "");
  document.title = `Resume Analysis${role ? " - " + role : ""}`;   // becomes the PDF file name
  window.print();
  document.title = originalTitle;
});

$("analyze-another").addEventListener("click", () => {
  $("upload-form").reset();
  $("jd-count").textContent = "0";
  updateDropzone();
  showSection("upload");
});

// ---------- Developer link ----------
// Hidden for visitors. Open the site once with ?dev=1 to show it in this browser
// (?dev=0 hides it again). Signing in to the developer page also enables it.
// This only controls visibility; the developer page itself requires a sign-in.
(function () {
  try {
    const flag = new URLSearchParams(location.search).get("dev");
    if (flag === "1") localStorage.setItem("devLink", "1");
    if (flag === "0") localStorage.removeItem("devLink");
    $("dev-link").hidden = localStorage.getItem("devLink") !== "1";
  } catch { /* storage unavailable: keep the link hidden */ }
})();