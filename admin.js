const ADMIN_PASSWORD = "1234";
const ADMIN_AUTH_KEY = "quiz-mission-admin-auth-v1";
const ADMIN_DRAFT_KEY = "quiz-mission-admin-draft-v1";
const SURVEY_RESULTS_KEY = "quiz-mission-survey-results-v1";
const BASE_URL_KEY = "quiz-mission-base-url-v1";

let mission = {
  title: "퀴즈를 풀어라",
  description: "",
  finalHint: "",
  settings: {},
  questions: [],
  survey: {
    enabled: false,
    externalUrl: "",
    eventName: "행사 만족도 조사",
    questions: [],
  },
};
let selectedQuestionId = null;

const $ = (selector) => document.querySelector(selector);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAdmin, { once: true });
} else {
  initAdmin();
}

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
  $("#download-json-button").addEventListener("click", downloadQuestionsJson);
  $("#add-question-button").addEventListener("click", addQuestion);
  $("#save-question-button").addEventListener("click", saveQuestion);
  $("#delete-question-button").addEventListener("click", deleteQuestion);
  $("#add-survey-button").addEventListener("click", addSurveyQuestion);
  $("#survey-event-name-input").addEventListener("input", () => {
    normalizeSurveyConfig(mission);
    mission.survey.eventName = $("#survey-event-name-input").value.trim() || "행사 만족도 조사";
    saveDraft();
  });
  $("#survey-enabled-input").addEventListener("change", () => {
    setSurveyEnabled($("#survey-enabled-input").checked);
    saveDraft();
  });
  $("#survey-external-url-input").addEventListener("input", () => {
    normalizeSurveyConfig(mission);
    mission.survey.externalUrl = $("#survey-external-url-input").value.trim();
    saveDraft();
  });
  $("#base-url-input").addEventListener("input", () => {
    localStorage.setItem(
      BASE_URL_KEY,
      $("#base-url-input").value.trim()
    );
    renderQrList();
  });
  $("#download-csv-button").addEventListener("click", downloadSurveyCsv);
  $("#print-results-button").addEventListener("click", printSurveyResults);
  $("#save-pdf-button").addEventListener("click", printSurveyResults);
  $("#clear-results-button").addEventListener("click", clearSurveyResults);
  $("#question-type").addEventListener("change", () => {
    applyQuestionEditorChanges();
    updateChoiceAvailability();
  });
  [
    "question-title",
    "question-prompt",
    "question-points",
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
  if (draft) {
    const parsedDraft = normalizeSurveyConfig(sanitizeMissionMediaDataUrls(JSON.parse(draft)));
    try {
      localStorage.setItem(ADMIN_DRAFT_KEY, JSON.stringify(createLocalStorageDraft(parsedDraft)));
    } catch {
      localStorage.removeItem(ADMIN_DRAFT_KEY);
    }
    return parsedDraft;
  }

  const response = await fetch(`./questions.json?v=${Date.now()}`, {
    cache: "no-store",
  });
  if (!response.ok) return mission;
  return normalizeSurveyConfig(sanitizeMissionMediaDataUrls(await response.json()));
}

function renderAll() {
  $("#mission-title-input").value = mission.title || "";
  $("#mission-description-input").value = mission.description || "";
  $("#mission-final-hint-input").value = mission.finalHint || "";
  normalizeSurveyConfig(mission);
  $("#survey-enabled-input").checked = mission.survey.enabled;
  $("#survey-external-url-input").value = mission.survey.externalUrl || "";
  $("#survey-event-name-input").value = mission.survey.eventName || "행사 만족도 조사";
  showMediaStorageNotice();
  const savedBaseUrl =
    localStorage.getItem(BASE_URL_KEY) || defaultBaseUrl();

  $("#base-url-input").value = savedBaseUrl;
  $("#base-url-input").placeholder = defaultBaseUrl();
  renderQuestionList();
  renderQuestionEditor();
  renderSurveyList();
  renderQrList();
  renderSurveyResults();
}

function showTab(name) {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === name);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `tab-${name}`);
  });
  if (name === "qr") renderQrList();
  if (name === "results") renderSurveyResults();
}

function syncMissionMeta() {
  mission.title = $("#mission-title-input").value.trim() || "퀴즈를 풀어라";
  mission.description = $("#mission-description-input").value.trim();
  mission.finalHint = $("#mission-final-hint-input").value.trim();
  setSurveyEnabled($("#survey-enabled-input").checked);
  mission.survey.externalUrl = $("#survey-external-url-input").value.trim();
}

function setSurveyEnabled(value) {
  mission.survey = mission.survey || { eventName: "행사 만족도 조사", questions: [] };
  mission.survey.externalUrl = mission.survey.externalUrl || "";
  mission.survey.enabled = value === true;
}

function showAdminStatus(message, isError = false) {
  let status = $("#admin-status-message");
  if (!status) {
    status = document.createElement("p");
    status.id = "admin-status-message";
    status.className = "help-text";
    const editorTitle = $("#question-id")?.closest(".card")?.querySelector("h2");
    const fallback = $("#save-draft-button")?.closest(".card");
    if (editorTitle) {
      editorTitle.insertAdjacentElement("afterend", status);
    } else if (fallback) {
      fallback.append(status);
    } else {
      document.body.append(status);
    }
  }

  status.textContent = message;
  status.style.color = isError ? "var(--danger)" : "var(--primary-dark)";
  status.style.fontWeight = message ? "900" : "";
}

function showMediaStorageNotice() {
  const card = $("#save-draft-button")?.closest(".card");
  if (!card || $("#media-storage-notice")) return;

  const notice = document.createElement("p");
  notice.id = "media-storage-notice";
  notice.className = "help-text";
  notice.textContent = "이미지, 영상, 오디오는 GitHub 저장소에 업로드한 뒤 ./파일명 형태의 경로만 입력해주세요. Data URL(base64)은 사용하지 않습니다.";
  card.append(notice);
}

function saveDraftToLocalStorage() {
  try {
    localStorage.setItem(ADMIN_DRAFT_KEY, JSON.stringify(createLocalStorageDraft(mission)));
    return true;
  } catch (error) {
    if (error?.name === "QuotaExceededError") {
      showAdminStatus("브라우저 저장 공간이 부족해 미디어를 제외한 초안만 보관합니다. questions.json 다운로드는 계속 사용할 수 있습니다.", true);
      return false;
    }
    showAdminStatus(`브라우저 초안을 저장할 수 없습니다: ${error.message}`, true);
    return false;
  }
}

function createLocalStorageDraft(source) {
  normalizeSurveyConfig(source);
  return {
    ...source,
    settings: cleanSettings(source.settings),
    survey: {
      enabled: source.survey.enabled === true,
      externalUrl: source.survey.externalUrl || "",
      eventName: source.survey.eventName || "행사 만족도 조사",
      questions: source.survey.questions.map((question) => ({ ...question, options: [...(question.options || [])] })),
    },
    questions: (source.questions || []).map(stripDataUrlsFromQuestion),
  };
}

function cleanSettings(settings = {}) {
  const clean = { ...settings };
  delete clean.surveyEnabled;
  return clean;
}

function normalizeSurveyConfig(source) {
  source.survey = source.survey || {};
  const legacyQuestions = Array.isArray(source.surveyQuestions) ? source.surveyQuestions : [];
  const questions = Array.isArray(source.survey.questions) && source.survey.questions.length
    ? source.survey.questions
    : legacyQuestions;

  source.survey = {
    enabled: source.survey.enabled === true || source.settings?.surveyEnabled === true,
    externalUrl: source.survey.externalUrl || "",
    eventName: source.survey.eventName || "행사 만족도 조사",
    questions: (questions.length ? questions : defaultSurveyQuestions()).map(normalizeSurveyQuestion),
  };
  source.settings = cleanSettings(source.settings);
  delete source.surveyQuestions;
  return source;
}

function defaultSurveyQuestions() {
  return [
    { id: "gender", type: "choice", question: "성별이 어떻게 되시나요?", options: ["여성", "남성"], required: true },
    { id: "age", type: "choice", question: "연령대가 어떻게 되시나요?", options: ["10대", "20대", "30대", "40대 이상"], required: true },
    { id: "residence", type: "choice", question: "현재 거주지가 어떻게 되십니까?", options: ["서울·경기", "충주", "대전·세종", "충청북도", "충청남도", "전라북도", "전라남도", "경상북도", "경상남도"], required: true },
    { id: "visitCount", type: "choice", question: "저희 체험관에는 몇 번 방문하셨나요?", options: ["첫 방문", "2회 이상", "5회 이상"], required: true },
    { id: "eventSatisfaction", type: "choice", question: "행사에 만족하셨습니까?", options: ["매우 만족", "만족", "보통", "불만족", "매우 불만족"], required: true },
    { id: "revisitIntent", type: "choice", question: "본 행사를 통해 체험관을 다시 찾고 싶은 마음이 드셨나요?", options: ["매우 그렇다", "그렇다", "보통이다", "아니다", "매우 아니다"], required: true },
    { id: "comment", type: "text", question: "참여하신 행사나 체험관에 하고 싶은 말씀을 적어주세요.", options: [], required: false },
  ];
}

function normalizeSurveyQuestion(question, index) {
  const type = question.type === "choice" ? "choice" : "text";
  return {
    id: question.id || `survey-${index + 1}`,
    type,
    question: question.question || question.label || "",
    options: type === "choice" ? question.options || [] : [],
    required: Boolean(question.required),
  };
}

function getSurveyQuestions() {
  normalizeSurveyConfig(mission);
  return mission.survey.questions;
}

function sanitizeMissionMediaDataUrls(source) {
  return createLocalStorageDraft(source);
}

function stripDataUrlsFromQuestion(question) {
  const cleanQuestion = { ...question };

  if (isDataUrl(cleanQuestion.mediaUrl)) delete cleanQuestion.mediaUrl;
  ["image", "video", "audio"].forEach((key) => {
    if (isDataUrl(cleanQuestion[key]) || isDataUrl(cleanQuestion[key]?.src)) {
      delete cleanQuestion[key];
    }
  });
  cleanQuestion.media = stripMediaDataUrls(cleanQuestion.media);
  if (!cleanQuestion.media) delete cleanQuestion.media;

  if (isDataUrl(cleanQuestion.imageHint?.src)) delete cleanQuestion.imageHint;
  if (isDataUrl(cleanQuestion.hintImage?.src)) delete cleanQuestion.hintImage;
  if (isDataUrl(cleanQuestion.imageHint)) delete cleanQuestion.imageHint;
  if (isDataUrl(cleanQuestion.hintImage)) delete cleanQuestion.hintImage;

  return cleanQuestion;
}

function stripMediaDataUrls(media) {
  if (!media) return null;
  const cleanMedia = {};
  Object.entries(media).forEach(([key, value]) => {
    cleanMedia[key] = value && typeof value === "object" && !Array.isArray(value)
      ? { ...value }
      : value;
  });

  ["image", "video", "audio"].forEach((key) => {
    if (isDataUrl(cleanMedia[key]?.src) || isDataUrl(cleanMedia[key])) {
      delete cleanMedia[key];
    }
  });

  Object.keys(cleanMedia).forEach((key) => {
    if (isDataUrl(cleanMedia[key]?.mediaUrl)) delete cleanMedia[key].mediaUrl;
    if (isDataUrl(cleanMedia[key]?.url)) delete cleanMedia[key].url;
  });

  return Object.keys(cleanMedia).length ? cleanMedia : null;
}

function isDataUrl(value) {
  return typeof value === "string" && value.trim().startsWith("data:");
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

  ensureQuestionTypeOptions();
  $("#question-id").value = question.id || "";
  $("#question-type").value = dataTypeToEditorType(question.type);
  $("#question-id").readOnly = true;
  $("#question-type").disabled = false;
  $("#question-points").disabled = false;
  $("#question-title").value = question.title || "";
  $("#question-prompt").value = question.prompt || "";
  $("#question-points").value = question.points ?? 10;
  $("#question-choices").value = getQuestionOptions(question).join("\n");
  $("#question-answer").value = Array.isArray(question.answer) ? question.answer.join("\n") : question.answer || "";
  $("#question-explanation").value = question.explanation || "";
  $("#question-next-hint").value = question.nextHint || "";
  $("#question-media-image-src").value = question.media?.image?.src || "";
  $("#question-media-video-src").value = question.media?.video?.src || "";
  $("#question-media-audio-src").value = question.media?.audio?.src || "";
  const hintImage = getQuestionHintImage(question);
  $("#question-image-src").value = hintImage?.src || "";
  $("#question-image-alt").value = hintImage?.alt || "";
  updateChoiceAvailability();
}

function updateChoiceAvailability() {
  const type = $("#question-type").value;
  $("#question-choices").disabled = type !== "multiple";
}

function dataTypeToEditorType(type) {
  if (type === "choice" || type === "multiple") return "multiple";
  if (type === "text" || type === "short") return "short";
  return "ox";
}

function editorTypeToDataType(type) {
  if (type === "multiple" || type === "choice") return "choice";
  if (type === "short" || type === "text") return "text";
  return "ox";
}

function getQuestionOptions(question) {
  return Array.isArray(question.options) ? question.options : question.choices || [];
}

function ensureQuestionTypeOptions() {
  const typeSelect = $("#question-type");
  const options = [
    ["multiple", "객관식"],
    ["ox", "OX"],
    ["short", "주관식"],
  ];

  typeSelect.innerHTML = "";
  options.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    typeSelect.append(option);
  });
}

function getQuestionHintImage(question) {
  return question.imageHint || question.hintImage || null;
}

function applyQuestionEditorChanges(options = {}) {
  try {
    const shouldRender = options.render !== false;
    const index = getSelectedQuestionIndex();
    if (index < 0) return;

    mission.questions[index] = readQuestionFromEditor(mission.questions[index], {
      validate: false,
    });

    if (shouldRender) {
      renderQuestionList();
      renderQrList();
    }
    showAdminStatus("");
  } catch (error) {
    showAdminStatus(`저장할 수 없습니다: ${error.message}`, true);
  }
}

function getSelectedQuestionIndex() {
  return mission.questions.findIndex((item) => item.id === selectedQuestionId);
}

function readQuestionFromEditor(originalQuestion, options = {}) {
  const shouldValidate = options.validate === true;
  const editorType = $("#question-type").value;
  const type = editorTypeToDataType(editorType);
  const title = $("#question-title").value.trim();
  const prompt = $("#question-prompt").value.trim();
  const answerInput = $("#question-answer").value.trim();
  const points = Math.max(0, Number($("#question-points").value) || 0);

  if (shouldValidate && !title) throw new Error("문제 제목을 입력해주세요.");
  if (shouldValidate && !prompt) throw new Error("문제 내용을 입력해주세요.");
  if (shouldValidate && !answerInput) throw new Error("정답을 입력해주세요.");

  const question = {
    ...originalQuestion,
    id: originalQuestion.id,
    type,
    title,
    prompt,
    points,
    explanation: $("#question-explanation").value.trim(),
    nextHint: $("#question-next-hint").value.trim(),
  };

  if (type === "choice") {
    const optionList = parseLines($("#question-choices").value);
    const answer = parseLines(answerInput)[0] || "";
    if (shouldValidate && optionList.length < 2) throw new Error("객관식 보기는 2개 이상 입력해주세요.");
    if (shouldValidate && answer && !optionList.includes(answer)) {
      throw new Error("객관식 정답은 보기와 정확히 일치해야 합니다.");
    }
    question.options = optionList;
    question.choices = optionList;
    question.answer = answer;
  } else if (type === "ox") {
    const answer = answerInput.toUpperCase();
    if (shouldValidate && !["O", "X"].includes(answer)) {
      throw new Error("OX 정답은 O 또는 X만 입력해주세요.");
    }
    question.options = ["O", "X"];
    question.answer = ["O", "X"].includes(answer) ? answer : "";
    delete question.choices;
  } else {
    question.options = [];
    question.answer = answerInput;
    delete question.choices;
  }

  applyQuestionMediaFields(question);
  return question;
}

function applyQuestionMediaFields(question) {
  delete question.image;
  delete question.video;
  delete question.audio;
  delete question.mediaUrl;
  delete question.media;
  delete question.imageHint;
  delete question.hintImage;

  const media = {};
  const mediaImageSrc = readPathInput("question-media-image-src", "사진 경로");
  const mediaVideoSrc = readPathInput("question-media-video-src", "영상 경로");
  const mediaAudioSrc = readPathInput("question-media-audio-src", "오디오 경로");
  if (mediaImageSrc) media.image = { src: mediaImageSrc, alt: `${question.title || "문제"} 사진` };
  if (mediaVideoSrc) media.video = { src: mediaVideoSrc };
  if (mediaAudioSrc) media.audio = { src: mediaAudioSrc };
  if (Object.keys(media).length) {
    question.media = media;
  } else {
    delete question.media;
  }

  const imageSrc = readPathInput("question-image-src", "힌트 이미지 경로");
  if (imageSrc) {
    question.imageHint = {
      src: imageSrc,
      alt: $("#question-image-alt").value.trim(),
      position: "center",
    };
  }
}

function readPathInput(id, label) {
  const value = $(`#${id}`).value.trim();
  if (isDataUrl(value)) {
    throw new Error(`${label}에는 Data URL(base64)을 사용할 수 없습니다. ./파일명 형태로 입력해주세요.`);
  }
  return value;
}

function addQuestion() {
  const id = uniqueId("question");
  mission.questions.push({
    id,
    type: "choice",
    title: "새 문제",
    prompt: "",
    options: ["보기 1", "보기 2", "보기 3", "보기 4"],
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
  try {
    const index = getSelectedQuestionIndex();
    if (index < 0) throw new Error("저장할 문제를 선택해주세요.");

    mission.questions[index] = readQuestionFromEditor(mission.questions[index], {
      validate: true,
    });
    const draftSaved = saveDraftToLocalStorage();
    renderQuestionList();
    renderQuestionEditor();
    renderQrList();
    renderSurveyResults();
    if (draftSaved) showAdminStatus("문제를 저장했습니다.");
  } catch (error) {
    showAdminStatus(`저장할 수 없습니다: ${error.message}`, true);
  }
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
  const surveyQuestions = getSurveyQuestions();

  surveyQuestions.forEach((question, index) => {
    const row = document.createElement("div");
    row.className = "survey-editor";
    row.innerHTML = `
      <label>문항 <input type="text" value="${escapeAttribute(question.question || "")}" /></label>
      <label>문항 유형
        <select>
          <option value="choice">객관식</option>
          <option value="text">주관식</option>
        </select>
      </label>
      <label>필수
        <select>
          <option value="true">필수</option>
          <option value="false">선택</option>
        </select>
      </label>
      <div class="survey-options-editor">
        <label>객관식 보기 <textarea rows="5" placeholder="한 줄에 보기 하나씩 입력"></textarea></label>
        <div class="button-row">
          <button class="secondary-button small" type="button" data-action="add-option">보기 추가</button>
          <button class="danger-button small" type="button" data-action="delete-option">마지막 보기 삭제</button>
        </div>
      </div>
      <div class="survey-move-actions">
        <button class="secondary-button small" type="button" data-action="move-up">위로</button>
        <button class="secondary-button small" type="button" data-action="move-down">아래로</button>
      </div>
      <button class="danger-button small" type="button" data-action="delete-question">삭제</button>
    `;
    const [labelInput, typeSelect, requiredSelect] = row.querySelectorAll("input, select");
    typeSelect.value = question.type === "choice" ? "choice" : "text";
    requiredSelect.value = String(Boolean(question.required));
    const optionEditor = row.querySelector(".survey-options-editor");
    const optionTextarea = optionEditor.querySelector("textarea");
    optionTextarea.value = (question.options || []).join("\n");

    const renderOptions = () => {
      optionEditor.classList.toggle("is-hidden", question.type !== "choice");
      optionTextarea.value = (question.options || []).join("\n");
    };

    labelInput.addEventListener("input", () => {
      question.question = labelInput.value;
      question.id = slugify(labelInput.value) || question.id || uniqueId("survey");
      saveDraft();
    });
    typeSelect.addEventListener("change", () => {
      question.type = typeSelect.value;
      if (question.type === "choice" && !question.options?.length) {
        question.options = ["보기 1", "보기 2"];
      }
      if (question.type === "text") {
        question.options = [];
      }
      renderOptions();
      saveDraft();
    });
    optionTextarea.addEventListener("input", () => {
      question.options = parseLines(optionTextarea.value);
      saveDraft();
    });
    requiredSelect.addEventListener("change", () => {
      question.required = requiredSelect.value === "true";
      saveDraft();
    });
    row.querySelector("[data-action='delete-question']").addEventListener("click", () => {
      surveyQuestions.splice(index, 1);
      renderSurveyList();
      saveDraft();
    });
    row.querySelector("[data-action='add-option']").addEventListener("click", () => {
      question.options = question.options || [];
      question.options.push(`보기 ${question.options.length + 1}`);
      renderOptions();
      saveDraft();
    });
    row.querySelector("[data-action='delete-option']").addEventListener("click", () => {
      question.options = question.options || [];
      question.options.pop();
      renderOptions();
      saveDraft();
    });
    row.querySelector("[data-action='move-up']").disabled = index === 0;
    row.querySelector("[data-action='move-down']").disabled = index === surveyQuestions.length - 1;
    row.querySelector("[data-action='move-up']").addEventListener("click", () => {
      moveSurveyQuestion(index, -1);
    });
    row.querySelector("[data-action='move-down']").addEventListener("click", () => {
      moveSurveyQuestion(index, 1);
    });
    if (typeSelect.value === "choice" && !question.options.length) question.options = ["보기 1", "보기 2"];
    renderOptions();
    list.append(row);
  });
}

function addSurveyQuestion() {
  const surveyQuestions = getSurveyQuestions();
  surveyQuestions.push({
    id: uniqueId("survey"),
    question: "새 설문 문항",
    type: "choice",
    options: ["보기 1", "보기 2"],
    required: true,
  });
  renderSurveyList();
  saveDraft();
}

function moveSurveyQuestion(index, direction) {
  const surveyQuestions = getSurveyQuestions();
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= surveyQuestions.length) return;
  const [question] = surveyQuestions.splice(index, 1);
  surveyQuestions.splice(targetIndex, 0, question);
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
  try {
    applyQuestionEditorChanges({ render: false });
    syncMissionMeta();
    const draftSaved = saveDraftToLocalStorage();
    renderQuestionList();
    renderQrList();
    renderSurveyResults();
    if (draftSaved) showAdminStatus("변경사항을 저장했습니다.");
  } catch (error) {
    showAdminStatus(`저장할 수 없습니다: ${error.message}`, true);
  }
}

function downloadQuestionsJson() {
  try {
    applyQuestionEditorChanges({ render: false });
    syncMissionMeta();
    normalizeSurveyConfig(mission);
    const draftSaved = saveDraftToLocalStorage();

    const json = JSON.stringify(mission, null, 2);
    const blob = new Blob([json], {
      type: "application/json;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "questions.json";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showAdminStatus(draftSaved
      ? "questions.json 다운로드를 시작했습니다."
      : "브라우저 초안 저장은 건너뛰었지만 questions.json 다운로드를 시작했습니다.");
  } catch (error) {
    showAdminStatus(`저장할 수 없습니다: ${error.message}`, true);
  }
}

function downloadSurveyCsv() {
  const results = JSON.parse(localStorage.getItem(SURVEY_RESULTS_KEY) || "[]");
  const surveyQuestions = getSurveyQuestions();
  const surveyIds = surveyQuestions.map((question) => question.id);
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
  renderSurveyResults();
}

function renderSurveyResults() {
  const results = JSON.parse(localStorage.getItem(SURVEY_RESULTS_KEY) || "[]");
  $("#result-count").textContent = `${results.length}건`;
  const container = $("#survey-results");
  if (!container) return;

  container.innerHTML = "";
  const questions = getSurveyQuestions();
  if (!results.length) {
    container.innerHTML = `<p class="help-text">아직 저장된 설문 응답이 없습니다.</p>`;
    return;
  }

  questions.forEach((question) => {
    const card = document.createElement("section");
    card.className = "survey-result-card";
    card.innerHTML = `<h3>${escapeHtml(question.question || question.id)}</h3>`;

    if (question.type === "choice") {
      card.append(renderChoiceSummary(question, results));
    } else {
      card.append(renderTextSummary(question, results));
    }

    container.append(card);
  });
}

function renderChoiceSummary(question, results) {
  const wrapper = document.createElement("div");
  wrapper.className = "choice-summary";
  const counts = {};
  const options = question.options || [];
  options.forEach((option) => {
    counts[option] = 0;
  });

  results.forEach((result) => {
    const value = result.answers?.[question.id];
    if (!value) return;
    counts[value] = (counts[value] || 0) + 1;
  });

  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const chart = document.createElement("div");
  chart.className = "pie-chart";
  chart.style.background = buildPieGradient(counts, total);
  chart.setAttribute("aria-label", `${question.question} 원형 그래프`);
  wrapper.append(chart);

  const list = document.createElement("div");
  list.className = "choice-summary-list";
  Object.entries(counts).forEach(([option, count], index) => {
    const percent = total ? Math.round((count / total) * 100) : 0;
    const row = document.createElement("div");
    row.className = "choice-summary-row";
    row.innerHTML = `
      <span class="legend-dot" style="background:${chartColor(index)}"></span>
      <strong>${escapeHtml(option)}</strong>
      <span>${count}명 · ${percent}%</span>
    `;
    list.append(row);
  });
  wrapper.append(list);
  return wrapper;
}

function renderTextSummary(question, results) {
  const list = document.createElement("ul");
  list.className = "text-answer-list";
  const answers = results
    .map((result) => String(result.answers?.[question.id] || "").trim())
    .filter(Boolean);

  if (!answers.length) {
    list.innerHTML = `<li>작성된 의견이 없습니다.</li>`;
    return list;
  }

  answers.forEach((answer) => {
    const item = document.createElement("li");
    item.textContent = answer;
    list.append(item);
  });
  return list;
}

function buildPieGradient(counts, total) {
  if (!total) return "#eef5ef";
  let cursor = 0;
  const segments = Object.values(counts).map((count, index) => {
    const start = cursor;
    const end = cursor + (count / total) * 100;
    cursor = end;
    return `${chartColor(index)} ${start}% ${end}%`;
  });
  return `conic-gradient(${segments.join(", ")})`;
}

function chartColor(index) {
  return ["#20a66a", "#ffd45a", "#ff7b64", "#7654d6", "#36c7d0", "#f08ab8", "#8bd846", "#f6a04d", "#7aa7ff"][index % 9];
}

function printSurveyResults() {
  window.print();
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 1000);
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
  return {
    multiple: "객관식",
    choice: "객관식",
    ox: "OX",
    short: "주관식",
    text: "주관식",
  }[type] || type;
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
