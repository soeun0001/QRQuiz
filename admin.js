const ADMIN_PASSWORD = "1234";
const ADMIN_AUTH_KEY = "quiz-mission-admin-auth-v1";
const ADMIN_DRAFT_KEY = "quiz-mission-admin-draft-v1";
const SURVEY_RESULTS_KEY = "quiz-mission-survey-results-v1";
const BASE_URL_KEY = "quiz-mission-base-url-v1";

let mission = {
  title: "퀴즈를 풀어라",
  description: "",
  finalHint: "",
  questions: [],
  surveyQuestions: [],
};
let selectedQuestionId = null;

const $ = (selector) => document.querySelector(selector);

initAdmin();

async function initAdmin() {
  bindAdminEvents();
  if (sessionStorage.getItem(ADMIN_AUTH_KEY) === "true") {
    await openAdmin();
  }
}

function bindAdminEvents() {
  $("#login-form").addEventListener("submit", handleLogin);
  $("#logout-button").addEventListener("click", logout);
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => showTab(button.dataset.tab));
  });

  $("#save-draft-button").addEventListener("click", saveDraft);
  $("#download-json-button").addEventListener("click", downloadJson);
  $("#add-question-button").addEventListener("click", addQuestion);
  $("#save-question-button").addEventListener("click", saveQuestion);
  $("#delete-question-button").addEventListener("click", deleteQuestion);
  $("#add-survey-button").addEventListener("click", addSurveyQuestion);
  $("#base-url-input").addEventListener("input", () => {
    localStorage.setItem(
      BASE_URL_KEY,
      $("#base-url-input").value.trim()
    );
    renderQrList();
  });
  $("#download-csv-button").addEventListener("click", downloadSurveyCsv);
  $("#clear-results-button").addEventListener("click", clearSurveyResults);
  $("#question-type").addEventListener("change", updateChoiceAvailability);
  [
    "question-title",
    "question-prompt",
    "question-choices",
    "question-answer",
    "question-explanation",
    "question-next-hint",
    "question-media-image-src",
    "question-media-video-src",
    "question-media-audio-src",
    "question-image-src",
    "question-image-alt",
  ].forEach((id) => {
    $(`#${id}`).addEventListener("input", applyQuestionEditorChanges);
  });
  $("#question-media-image-file").addEventListener("change", () => readMediaFile("question-media-image-file", "question-media-image-src"));
  $("#question-media-video-file").addEventListener("change", () => readMediaFile("question-media-video-file", "question-media-video-src"));
  $("#question-media-audio-file").addEventListener("change", () => readMediaFile("question-media-audio-file", "question-media-audio-src"));
}

async function handleLogin(event) {
  event.preventDefault();
  if ($("#password-input").value === ADMIN_PASSWORD) {
    sessionStorage.setItem(ADMIN_AUTH_KEY, "true");
    $("#login-error").textContent = "";
    await openAdmin();
    return;
  }
  $("#login-error").textContent = "비밀번호가 올바르지 않습니다.";
}

async function openAdmin() {
  $("#login-panel").classList.add("is-hidden");
  $("#admin-app").classList.remove("is-hidden");
  mission = await loadMission();
  selectedQuestionId = mission.questions[0]?.id || null;
  renderAll();
}

function logout() {
  sessionStorage.removeItem(ADMIN_AUTH_KEY);
  location.reload();
}

async function loadMission() {
  const draft = localStorage.getItem(ADMIN_DRAFT_KEY);
  if (draft) return JSON.parse(draft);

  const response = await fetch("questions.json", { cache: "no-store" });
  if (!response.ok) return mission;
  return response.json();
}

function renderAll() {
  $("#mission-title-input").value = mission.title || "";
  $("#mission-description-input").value = mission.description || "";
  $("#mission-final-hint-input").value = mission.finalHint || "";
  const savedBaseUrl =
    localStorage.getItem(BASE_URL_KEY) || defaultBaseUrl();

  $("#base-url-input").value = savedBaseUrl;
  $("#base-url-input").placeholder = defaultBaseUrl();
  renderQuestionList();
  renderQuestionEditor();
  renderSurveyList();
  renderQrList();
  renderResultCount();
}

function showTab(name) {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === name);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `tab-${name}`);
  });
  if (name === "qr") renderQrList();
  if (name === "results") renderResultCount();
}

function syncMissionMeta() {
  mission.title = $("#mission-title-input").value.trim() || "퀴즈를 풀어라";
  mission.description = $("#mission-description-input").value.trim();
  mission.finalHint = $("#mission-final-hint-input").value.trim();
}

function renderQuestionList() {
  const list = $("#question-list");
  list.innerHTML = "";

  mission.questions.forEach((question, index) => {
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <button type="button">${index + 1}. ${escapeHtml(question.title || question.id)}</button>
      <span class="list-meta">${escapeHtml(typeLabel(question.type))} · ${escapeHtml(question.id)}</span>
    `;
    item.querySelector("button").addEventListener("click", () => {
      selectedQuestionId = question.id;
      renderQuestionEditor();
      renderQuestionList();
    });
    if (question.id === selectedQuestionId) item.style.borderColor = "#1b9b68";
    list.append(item);
  });
}

function renderQuestionEditor() {
  const question = mission.questions.find((item) => item.id === selectedQuestionId);
  const disabled = !question;
  document.querySelectorAll("#tab-questions input, #tab-questions textarea, #tab-questions select").forEach((input) => {
    if (!input.id.startsWith("mission-")) input.disabled = disabled;
  });

  if (!question) return;

  $("#question-id").value = question.id || "";
  $("#question-type").value = question.type || "multiple";
  $("#question-id").readOnly = true;
  $("#question-type").disabled = true;
  $("#question-points").disabled = true;
  $("#question-title").value = question.title || "";
  $("#question-prompt").value = question.prompt || "";
  $("#question-points").value = question.points ?? 10;
  $("#question-choices").value = (question.choices || []).join("\n");
  $("#question-answer").value = Array.isArray(question.answer) ? question.answer.join("\n") : question.answer || "";
  $("#question-explanation").value = question.explanation || "";
  $("#question-next-hint").value = question.nextHint || "";
  $("#question-media-image-src").value = question.media?.image?.src || "";
  $("#question-media-video-src").value = question.media?.video?.src || "";
  $("#question-media-audio-src").value = question.media?.audio?.src || "";
  $("#question-media-image-file").value = "";
  $("#question-media-video-file").value = "";
  $("#question-media-audio-file").value = "";
  $("#question-image-src").value = question.imageHint?.src || "";
  $("#question-image-alt").value = question.imageHint?.alt || "";
  updateChoiceAvailability();
}

function updateChoiceAvailability() {
  const type = $("#question-type").value;
  $("#question-choices").disabled = type !== "multiple";
}

function readMediaFile(fileInputId, targetInputId) {
  const fileInput = $(`#${fileInputId}`);
  const targetInput = $(`#${targetInputId}`);
  const file = fileInput.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    targetInput.value = reader.result;
    applyQuestionEditorChanges();
  });
  reader.readAsDataURL(file);
}

function applyQuestionEditorChanges() {
  const question = mission.questions.find((item) => item.id === selectedQuestionId);
  if (!question) return;

  question.title = $("#question-title").value.trim();
  question.prompt = $("#question-prompt").value.trim();
  question.answer = parseLines($("#question-answer").value);
  if (question.answer.length === 1) question.answer = question.answer[0];
  question.explanation = $("#question-explanation").value.trim();
  question.nextHint = $("#question-next-hint").value.trim();

  if (question.type === "multiple") {
    question.choices = parseLines($("#question-choices").value);
  }

  const media = {};
  const mediaImageSrc = $("#question-media-image-src").value.trim();
  const mediaVideoSrc = $("#question-media-video-src").value.trim();
  const mediaAudioSrc = $("#question-media-audio-src").value.trim();
  if (mediaImageSrc) media.image = { src: mediaImageSrc, alt: `${question.title || "문제"} 사진` };
  if (mediaVideoSrc) media.video = { src: mediaVideoSrc };
  if (mediaAudioSrc) media.audio = { src: mediaAudioSrc };
  if (Object.keys(media).length) {
    question.media = media;
  } else {
    delete question.media;
  }

  const imageSrc = $("#question-image-src").value.trim();
  if (imageSrc) {
    question.imageHint = {
      src: imageSrc,
      alt: $("#question-image-alt").value.trim(),
      position: "center",
    };
  } else {
    delete question.imageHint;
  }

  renderQuestionList();
  renderQrList();
}

function addQuestion() {
  const id = uniqueId("question");
  mission.questions.push({
    id,
    type: "multiple",
    title: "새 문제",
    prompt: "",
    choices: ["보기 1", "보기 2", "보기 3", "보기 4"],
    answer: "보기 1",
    points: 10,
    explanation: "",
    nextHint: "",
  });
  selectedQuestionId = id;
  renderQuestionList();
  renderQuestionEditor();
  renderQrList();
}

function saveQuestion() {
  const question = mission.questions.find((item) => item.id === selectedQuestionId);
  if (!question) return;
  applyQuestionEditorChanges();
  renderQuestionList();
  renderQrList();
  saveDraft();
}

function deleteQuestion() {
  if (!selectedQuestionId) return;
  const question = mission.questions.find((item) => item.id === selectedQuestionId);
  if (!question) return;
  if (!confirm(`'${question.title || question.id}' 문제를 삭제할까요?`)) return;

  mission.questions = mission.questions.filter((item) => item.id !== selectedQuestionId);
  selectedQuestionId = mission.questions[0]?.id || null;
  renderQuestionList();
  renderQuestionEditor();
  renderQrList();
  saveDraft();
}

function renderSurveyList() {
  const list = $("#survey-list");
  list.innerHTML = "";
  mission.surveyQuestions = mission.surveyQuestions || [];

  mission.surveyQuestions.forEach((question, index) => {
    const row = document.createElement("div");
    row.className = "survey-editor";
    row.innerHTML = `
      <label>문항 <input type="text" value="${escapeAttribute(question.label || "")}" /></label>
      <label>유형
        <select>
          <option value="text">단답형</option>
          <option value="textarea">장문형</option>
          <option value="rating">별점</option>
        </select>
      </label>
      <label>필수
        <select>
          <option value="true">필수</option>
          <option value="false">선택</option>
        </select>
      </label>
      <button class="danger-button small" type="button">삭제</button>
    `;
    const [labelInput, typeSelect, requiredSelect] = row.querySelectorAll("input, select");
    typeSelect.value = question.type || "text";
    requiredSelect.value = String(Boolean(question.required));
    labelInput.addEventListener("input", () => {
      question.label = labelInput.value;
      question.id = slugify(labelInput.value) || question.id || uniqueId("survey");
      saveDraft();
    });
    typeSelect.addEventListener("change", () => {
      question.type = typeSelect.value;
      saveDraft();
    });
    requiredSelect.addEventListener("change", () => {
      question.required = requiredSelect.value === "true";
      saveDraft();
    });
    row.querySelector("button").addEventListener("click", () => {
      mission.surveyQuestions.splice(index, 1);
      renderSurveyList();
      saveDraft();
    });
    list.append(row);
  });
}

function addSurveyQuestion() {
  mission.surveyQuestions = mission.surveyQuestions || [];
  mission.surveyQuestions.push({
    id: uniqueId("survey"),
    label: "새 설문 문항",
    type: "text",
    required: false,
  });
  renderSurveyList();
  saveDraft();
}

function renderQrList() {
  const list = $("#qr-list");
  if (!list) return;
  list.innerHTML = "";
  const baseUrl =
    $("#base-url-input").value.trim() || defaultBaseUrl();

  mission.questions.forEach((question) => {
    const url = buildQuestionUrl(baseUrl, question.id);
    const item = document.createElement("div");
    item.className = "qr-item";
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(question.title || question.id)}</strong>
        <div class="list-meta">${escapeHtml(url)}</div>
        <div class="qr-actions">
          <button class="primary-button small" type="button" data-action="generate">QR 생성</button>
          <button class="secondary-button small" type="button" data-action="download">QR 다운로드(PNG)</button>
          <button class="secondary-button small" type="button" data-action="copy">QR 복사</button>
        </div>
      </div>
      <canvas class="qr-canvas" width="256" height="256"></canvas>
    `;
    const canvas = item.querySelector("canvas");
    item.querySelector("[data-action='generate']").addEventListener("click", () => generateQr(canvas, url));
    item.querySelector("[data-action='download']").addEventListener("click", async () => {
      await generateQr(canvas, url);
      downloadCanvas(canvas, `qr-${question.id}.png`);
    });
    item.querySelector("[data-action='copy']").addEventListener("click", async () => {
      await generateQr(canvas, url);
      await copyQr(canvas, url);
    });
    list.append(item);
    generateQr(canvas, url);
  });
}

async function generateQr(canvas, url) {
  if (!window.QRCode?.toCanvas) {
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#20312b";
    context.font = "18px sans-serif";
    context.fillText("QR 라이브러리", 42, 116);
    context.fillText("로드 필요", 70, 146);
    return;
  }
  await window.QRCode.toCanvas(canvas, url, {
    width: 256,
    margin: 2,
    color: { dark: "#20312b", light: "#ffffff" },
  });
}

function downloadCanvas(canvas, filename) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

async function copyQr(canvas, fallbackUrl) {
  try {
    if (!window.ClipboardItem) throw new Error("Clipboard image is not supported");
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    alert("QR 이미지를 복사했습니다.");
  } catch {
    await navigator.clipboard.writeText(fallbackUrl);
    alert("이 브라우저에서는 이미지 복사가 제한되어 QR 링크를 복사했습니다.");
  }
}

function saveDraft() {
  syncMissionMeta();
  localStorage.setItem(ADMIN_DRAFT_KEY, JSON.stringify(mission));
  renderResultCount();
}

function downloadJson() {
  saveDraft();
  downloadText("questions.json", JSON.stringify(mission, null, 2), "application/json");
}

function downloadSurveyCsv() {
  const results = JSON.parse(localStorage.getItem(SURVEY_RESULTS_KEY) || "[]");
  const surveyIds = mission.surveyQuestions.map((question) => question.id);
  const header = ["submittedAt", "score", "completedCount", ...surveyIds];
  const rows = results.map((result) => [
    result.submittedAt,
    result.score,
    result.completedCount,
    ...surveyIds.map((id) => result.answers?.[id] || ""),
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  downloadText("survey-results.csv", `\ufeff${csv}`, "text/csv;charset=utf-8");
}

function clearSurveyResults() {
  if (!confirm("이 브라우저에 저장된 설문 결과를 삭제할까요?")) return;
  localStorage.removeItem(SURVEY_RESULTS_KEY);
  renderResultCount();
}

function renderResultCount() {
  const results = JSON.parse(localStorage.getItem(SURVEY_RESULTS_KEY) || "[]");
  $("#result-count").textContent = `${results.length}건`;
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function parseLines(value) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function defaultBaseUrl() {
  return new URL("./", window.location.href).href;
}

function buildQuestionUrl(baseUrl, questionId) {
  const target = `index.html?q=${encodeURIComponent(questionId)}`;

  try {
    const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    return new URL(target, normalized).href;
  } catch {
    const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    return `${normalized}${target}`;
  }
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueId(prefix) {
  return `${prefix}-${Date.now().toString(36)}`;
}

function typeLabel(type) {
  return { multiple: "객관식", ox: "OX", short: "주관식" }[type] || type;
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
