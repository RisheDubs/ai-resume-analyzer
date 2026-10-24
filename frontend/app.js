// ---------- Settings ----------
const API = window.APP_CONFIG.API_BASE_URL.replace(/\/$/, "");
const MAX_FILE_BYTES = 5 * 1024 * 1024;           // 5 MB
const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg"];
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 180000;                    // 3 minutes

// Which progress step each backend status belongs to
const STEP_FOR_STATUS = {
  UPLOADING: 0,
  PENDING: 1, PROCESSING: 1, TEXT_EXTRACTED: 1,
  ANALYZING: 2,
  DONE: 3,
};

// ---------- Small helpers ----------
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function showSection(name) {
  for (const section of ["upload", "progress", "results"]) {
    $(`${section}-section`).hidden = section !== name;
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showFormError(message) {
  const el = $("form-error");
  el.textContent = message;
  el.hidden = !message;
}

function setStep(status) {
  const active = STEP_FOR_STATUS[status] ?? 0;
  document.querySelectorAll("#steps li").forEach((li, i) => {
    li.classList.toggle("done", i < active || status === "DONE");
    li.classList.toggle("active", i === active && status !== "DONE");
  });
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  let body = {};
  try { body = await res.json(); } catch { /* empty or non-JSON body */ }
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

// ---------- Validation ----------
function validateFile(file) {
  if (!file) return "Please choose a resume file.";
  if (!ALLOWED_TYPES.includes(file.type)) return "Only PDF, PNG or JPEG files are supported.";
  if (file.size > MAX_FILE_BYTES) return "File is too large. Maximum size is 5 MB.";
  return null;
}

// ---------- API flow ----------
async function uploadResume(file, targetRole, jobDescription) {
  // 1. Ask our API for a presigned upload URL
  const { resumeId, uploadUrl } = await requestJson(`${API}/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: file.type, targetRole, jobDescription }),
  });

  // 2. Upload the file directly to S3
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
    $("progress-text").textContent = `Status: ${result.status.replace("_", " ").toLowerCase()}`;
    if (result.isComplete) return result;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("The analysis is taking longer than expected. Please try again.");
}

// ---------- Rendering ----------
// Always use textContent (never innerHTML) for AI output, to prevent XSS.
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

function scoreClass(score) {
  if (score >= 75) return "good";
  if (score >= 50) return "ok";
  return "bad";
}

function renderSectionScores(sectionScores) {
  const container = $("section-scores");
  container.replaceChildren();
  for (const [name, value] of Object.entries(sectionScores || {})) {
    const row = document.createElement("div");
    row.className = "score-row";

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = name;

    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("div");
    fill.className = "fill";
    fill.style.width = `${value}%`;
    bar.appendChild(fill);

    const num = document.createElement("span");
    num.className = "value";
    num.textContent = value;

    row.append(label, bar, num);
    container.appendChild(row);
  }
}

function renderResults(result) {
  const a = result.analysis;

  const scoreEl = $("ats-score").parentElement;
  $("ats-score").textContent = a.ats_score;
  scoreEl.className = `score ${scoreClass(a.ats_score)}`;
  $("result-role").textContent = result.targetRole ? ` for ${result.targetRole}` : "";

  renderSectionScores(a.section_scores);
  fillList("strengths-list", a.strengths);
  fillChips("keywords-list", a.missing_keywords);
  fillList("improvements-list", a.improvements);
  fillChips("skills-list", a.recommended_skills);
  $("summary-text").textContent = a.professional_summary;
}

// ---------- Event handlers ----------
$("upload-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  showFormError("");

  const file = $("resume-file").files[0];
  const error = validateFile(file);
  if (error) return showFormError(error);

  const targetRole = $("target-role").value.trim();
  const jobDescription = $("job-description").value.trim();

  $("submit-btn").disabled = true;
  try {
    showSection("progress");
    setStep("UPLOADING");
    $("progress-text").textContent = "Uploading your resume…";

    const resumeId = await uploadResume(file, targetRole, jobDescription);
    const result = await waitForResult(resumeId);

    if (result.status === "FAILED") {
      throw new Error(result.error || "Analysis failed. Please try a different file.");
    }
    renderResults(result);
    showSection("results");
  } catch (err) {
    console.error(err);
    showSection("upload");
    showFormError(err.message || "Something went wrong. Please try again.");
  } finally {
    $("submit-btn").disabled = false;
  }
});

$("copy-summary").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("summary-text").textContent);
    $("copy-summary").textContent = "Copied!";
    setTimeout(() => ($("copy-summary").textContent = "Copy summary"), 2000);
  } catch {
    $("copy-summary").textContent = "Copy failed";
  }
});

$("analyze-another").addEventListener("click", () => {
  $("upload-form").reset();
  showSection("upload");
});