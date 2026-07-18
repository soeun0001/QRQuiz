const STORAGE_KEY = "quiz-mission-player-state-v2";
const SURVEY_RESULTS_KEY = "quiz-mission-survey-results-v1";
const TOTAL_QUESTIONS = 6;
const PRIZE_THRESHOLD = 3;
const DEFAULT_LOCATIONS = [
  "1층 로비",
  "나나의 방",
  "동물마을",
  "메인전시실",
  "지하 놀이체험실",
  "산책길",
];

const screens = {
  home: document.querySelector("#home-screen"),
  notice: document.querySelector("#notice-screen"),
  scanner: document.querySelector("#scanner-screen"),
  guard: document.querySelector("#guard-screen"),
  quiz: document.querySelector("#quiz-screen"),
  result: document.querySelector("#result-screen"),
  survey: document.querySelector("#survey-screen"),
  complete: document.querySelector("#complete-screen"),
};

let mission = null;
let state = {
  completed: {},
  score: 0,
  currentQuestionId: null,
  survey: null,
};
let activeQuestion = null;
let lastResult = null;
let scannerStream = null;
let scannerFrameId = null;
let barcodeDetector = null;
let returnScreenAfterGuard = "home";

const $ = (selector) => document.querySelector(selector);

init();

async function init() {
  bindEvents();

  try {
    mission = await loadMission();
    normalizeQuestionLocations();
    normalizeSurveyConfig();
    $("#mission-title").textContent = mission.title || "퀴즈를 풀어라";
    state = { ...state, ...loadState() };
    renderSurvey();
    openFromUrl();
    updateProgress();
  } catch {
    showMessage("문제 데이터를 불러오지 못했습니다.", "questions.json 파일을 확인해 주세요.");
  }
}

async function loadMission() {
  const response = await fetch(`./questions.json?v=${Date.now()}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("questions.json not found");
  return response.json();
}

function bindEvents() {
  $("#start-button").addEventListener("click", showNotice);
  $("#notice-next-button").addEventListener("click", startScanner);
  $("#notice-back-button").addEventListener("click", () => showScreen("home"));
  $("#resume-button").addEventListener("click", resumeMission);
  $("#check-button").addEventListener("click", checkAnswer);
  $("#next-button").addEventListener("click", goNext);
  $("#external-survey-button").addEventListener("click", openExternalSurvey);
  $("#reset-button").addEventListener("click", resetMission);
  $("#stop-scanner-button").addEventListener("click", stopScannerAndGoHome);
  $("#guard-confirm-button").addEventListener("click", returnFromGuard);
  $("#survey-form").addEventListener("submit", submitSurvey);
}

function openFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const questionId = params.get("q");

  if (questionId && mission.questions.some((question) => question.id === questionId)) {
    openQuestionWithOrderCheck(questionId, "home", false);
    return;
  }

  showScreen("home");
}

function resumeMission() {
  const nextQuestion = getNextUncompletedQuestion();
  if (nextQuestion) {
    openQuestionWithOrderCheck(nextQuestion.id, "home");
    return;
  }

  renderComplete();
  showScreen("complete");
}

function showNotice() {
  stopScanner();
  showScreen("notice");
}

function openQuestionWithOrderCheck(questionId, returnScreen = "home", updateUrl = true) {
  const validation = validateQuestionOrder(questionId);

  if (validation.status === "available") {
    goToQuestion(questionId, updateUrl);
    return;
  }

  if (updateUrl) history.replaceState(null, "", location.pathname);
  showOrderGuard(validation, returnScreen);
}

function goToQuestion(questionId, updateUrl = true) {
  activeQuestion = mission.questions.find((question) => question.id === questionId);
  if (!activeQuestion) return;

  stopScanner();
  state.currentQuestionId = questionId;
  saveState();

  if (updateUrl) {
    history.replaceState(null, "", `${location.pathname}?q=${encodeURIComponent(questionId)}`);
  }

  renderQuestion(activeQuestion);
  updateProgress();
  showScreen("quiz");
}

function renderQuestion(question) {
  $("#question-type").textContent = typeLabel(question.type);
  $("#question-title").textContent = question.title;
  $("#question-text").textContent = question.prompt;
  $("#question-points").textContent = `${question.points || 0}점`;
  renderQuestionMedia(question);

  const form = $("#answer-form");
  form.innerHTML = "";

  if (question.type === "short" || question.type === "text") {
    const input = document.createElement("input");
    input.type = "text";
    input.name = "answer";
    input.placeholder = "정답을 입력하세요";
    input.autocomplete = "off";
    form.append(input);
    input.focus();
    return;
  }

  const choices = question.type === "ox" ? ["O", "X"] : question.options || question.choices || [];
  const template = $("#choice-template");
  choices.forEach((choice) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const input = node.querySelector("input");
    input.value = choice;
    node.querySelector("span").textContent = choice;
    form.append(node);
  });
}

function renderQuestionMedia(question) {
  const container = $("#question-media");
  const media = question.media || {};
  const questionImage = getQuestionImage(question);
  container.innerHTML = "";

  if (questionImage.src) {
    const image = document.createElement("img");
    image.src = questionImage.src;
    image.alt = questionImage.alt || "문제 사진";
    image.loading = "lazy";
    container.append(image);
  }

  if (media.video?.src) {
    const video = document.createElement("video");
    video.src = media.video.src;
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("controlsList", "nodownload");
    container.append(video);
  }

  if (media.audio?.src) {
    const audio = document.createElement("audio");
    audio.src = media.audio.src;
    audio.controls = true;
    audio.preload = "metadata";
    container.append(audio);
  }

  container.classList.toggle("is-visible", Boolean(container.children.length));
}

function getQuestionImage(question) {
  if (question.media?.image?.src) {
    return {
      src: question.media.image.src,
      alt: question.media.image.alt || "문제 사진",
    };
  }

  if (typeof question.image === "string" && question.image.trim()) {
    return {
      src: question.image.trim(),
      alt: question.title ? `${question.title} 사진` : "문제 사진",
    };
  }

  return { src: "", alt: "" };
}

function checkAnswer() {
  if (!activeQuestion) return;

  const answer = readAnswer();
  if (!answer) {
    navigator.vibrate?.(40);
    return;
  }

  const isCorrect = isCorrectAnswer(activeQuestion, answer);
  const previousResult = state.completed[activeQuestion.id];

  state.completed[activeQuestion.id] = {
    answer,
    isCorrect: Boolean(previousResult?.isCorrect || isCorrect),
    completedAt: new Date().toISOString(),
  };

  if (isCorrect && !previousResult?.isCorrect) {
    state.score += Number(activeQuestion.points || 0);
  }

  saveState();
  lastResult = { isCorrect, question: activeQuestion };

  renderResult();
  updateProgress();
  showScreen("result");
}

function readAnswer() {
  const checked = document.querySelector("input[name='answer']:checked");
  if (checked) return checked.value;

  const text = document.querySelector("input[name='answer'][type='text']");
  return text?.value.trim() || "";
}

function isCorrectAnswer(question, answer) {
  const normalize = (value) => String(value).trim().toLowerCase().replace(/\s+/g, "");
  const answers = Array.isArray(question.answer) ? question.answer : [question.answer];
  return answers.some((item) => normalize(item) === normalize(answer));
}

function renderResult() {
  const { isCorrect, question } = lastResult;
  const badge = $("#result-badge");
  const hintCard = $("#hint-card");
  const imageHint = $("#image-hint");
  const hintImage = $("#hint-image");
  const hintImageData = question.imageHint || question.hintImage || null;
  const hasNextQuestion = Boolean(getNextUncompletedQuestion());

  badge.textContent = isCorrect ? "정답입니다!" : "아쉽지만 정답이 아니에요!";
  badge.classList.toggle("is-wrong", !isCorrect);
  $("#result-title").textContent = isCorrect
    ? `${question.points || 0}점을 획득했어요`
    : hasNextQuestion
      ? "정답과 해설을 확인하고 다음 장소로 이동해 주세요."
      : "정답과 해설을 확인해 주세요.";
  $("#explanation").textContent = question.explanation || "";
  $("#next-button").textContent = nextButtonLabel();

  hintCard.classList.toggle("is-hidden", !hasNextQuestion);
  if (!hasNextQuestion) {
    hintImage.removeAttribute("src");
    imageHint.classList.remove("is-visible");
    return;
  }

  $("#next-hint").textContent = question.nextHint || "다음 장소로 이동하세요.";

  if (hintImageData?.src) {
    hintImage.src = hintImageData.src;
    hintImage.alt = hintImageData.alt || "다음 장소 힌트 이미지";
    hintImage.style.objectPosition = hintImageData.position || "center";
    imageHint.classList.add("is-visible");
  } else {
    hintImage.removeAttribute("src");
    imageHint.classList.remove("is-visible");
  }
}

function nextButtonLabel() {
  if (getNextUncompletedQuestion()) return "다음 QR 찾기";
  return "결과 확인하기";
}

function goNext() {
  const nextQuestion = getNextUncompletedQuestion();
  history.replaceState(null, "", location.pathname);

  if (nextQuestion) {
    startScanner();
    return;
  }

  state.survey = null;
  saveState();
  renderComplete();
  showScreen("complete");
}

async function startScanner() {
  if (!navigator.mediaDevices?.getUserMedia) {
    $("#scanner-status").textContent = "이 브라우저에서는 카메라 실행을 지원하지 않습니다.";
    showScreen("scanner");
    return;
  }

  showScreen("scanner");
  $("#scanner-status").textContent = "카메라 권한을 허용해 주세요.";

  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });

    const video = $("#scanner-video");
    video.srcObject = scannerStream;
    await video.play();
    $("#scanner-status").textContent = "QR 코드를 화면 안에 맞춰주세요.";

    if ("BarcodeDetector" in window) {
      barcodeDetector = new BarcodeDetector({ formats: ["qr_code"] });
    }

    scanLoop();
  } catch {
    $("#scanner-status").textContent = "카메라를 실행할 수 없습니다. 브라우저 권한을 확인해 주세요.";
  }
}

async function scanLoop() {
  const video = $("#scanner-video");
  if (!scannerStream || video.readyState < 2) {
    scannerFrameId = requestAnimationFrame(scanLoop);
    return;
  }

  try {
    const value = await readQrFromVideo(video);
    if (value) {
      handleQrValue(value);
      return;
    }
  } catch {
    $("#scanner-status").textContent = "QR을 읽는 중입니다. 코드를 조금 더 가까이 비춰주세요.";
  }

  scannerFrameId = requestAnimationFrame(scanLoop);
}

async function readQrFromVideo(video) {
  if (barcodeDetector) {
    const codes = await barcodeDetector.detect(video);
    return codes[0]?.rawValue || "";
  }

  if (!window.jsQR) return "";

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const code = window.jsQR(imageData.data, imageData.width, imageData.height);
  return code?.data || "";
}

function handleQrValue(value) {
  const questionId = extractQuestionId(value);
  if (!questionId || !mission.questions.some((question) => question.id === questionId)) {
    $("#scanner-status").textContent = "등록되지 않은 QR입니다. 다른 QR을 비춰주세요.";
    scannerFrameId = requestAnimationFrame(scanLoop);
    return;
  }

  openQuestionWithOrderCheck(questionId, "scanner");
}

function extractQuestionId(value) {
  try {
    const url = new URL(value, location.href);
    return url.searchParams.get("q");
  } catch {
    const match = String(value).match(/[?&]q=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : String(value).trim();
  }
}

function stopScannerAndGoHome() {
  stopScanner();
  showScreen("home");
}

function stopScanner() {
  if (scannerFrameId) cancelAnimationFrame(scannerFrameId);
  scannerFrameId = null;

  if (scannerStream) {
    scannerStream.getTracks().forEach((track) => track.stop());
    scannerStream = null;
  }

  const video = $("#scanner-video");
  if (video) video.srcObject = null;
}

function validateQuestionOrder(questionId) {
  const questionIndex = mission.questions.findIndex((question) => question.id === questionId);
  const currentIndex = getCurrentQuestionIndex();

  if (questionIndex === -1) return { status: "unknown", currentIndex };
  if (state.completed[questionId]) return { status: "completed", questionIndex, currentIndex };
  if (questionIndex !== currentIndex) return { status: "locked", questionIndex, currentIndex };
  return { status: "available", questionIndex, currentIndex };
}

function getCurrentQuestionIndex() {
  const index = mission.questions.findIndex((question) => !state.completed[question.id]);
  return index === -1 ? Math.min(mission.questions.length - 1, TOTAL_QUESTIONS - 1) : index;
}

function showOrderGuard(validation, returnScreen) {
  stopScanner();
  returnScreenAfterGuard = returnScreen;

  const isCompleted = validation.status === "completed";
  const nextPlace = placeName(validation.currentIndex);
  $("#guard-icon").textContent = isCompleted ? "✅" : "🚫";
  $("#guard-title").textContent = isCompleted ? "이미 완료한 미션입니다." : "아직 이 QR은 사용할 수 없습니다.";
  $("#guard-message").textContent = isCompleted ? "이미 완료한 QR입니다. 다음 장소로 이동해주세요." : "이전 미션을 먼저 완료해주세요.";
  $("#guard-current-wrap").style.display = "grid";
  $("#guard-current-place").textContent = nextPlace;
  $("#guard-extra").textContent = isCompleted ? `${nextPlace}로 이동하여 QR을 스캔해 주세요.` : "다음으로 이동하여 QR을 스캔해 주세요.";
  showScreen("guard");
}

function returnFromGuard() {
  if (returnScreenAfterGuard === "scanner") {
    startScanner();
    return;
  }

  history.replaceState(null, "", location.pathname);
  showScreen(returnScreenAfterGuard || "home");
}

function placeName(index) {
  return mission.questions[index]?.location || DEFAULT_LOCATIONS[index] || `미션 ${index + 1}`;
}

function normalizeQuestionLocations() {
  if (!mission?.questions) return;
  mission.questions.forEach((question, index) => {
    if (!question.location && DEFAULT_LOCATIONS[index]) {
      question.location = DEFAULT_LOCATIONS[index];
    }
  });
}

function normalizeSurveyConfig() {
  const surveyQuestions = mission.survey?.questions?.length
    ? mission.survey.questions
    : defaultSurveyQuestions();
  const enabled = mission.survey?.enabled === true;

  mission.survey = {
    enabled,
    externalUrl: mission.survey?.externalUrl || "",
    eventName: mission.survey?.eventName || "행사 만족도 조사",
    questions: surveyQuestions.map(normalizeSurveyQuestion),
  };
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

function renderSurvey() {
  const form = $("#survey-form");
  const questions = getSurveyQuestions();

  form.innerHTML = "";
  const notice = document.createElement("p");
  notice.className = "survey-error";
  notice.id = "survey-error";
  notice.setAttribute("role", "alert");
  form.append(notice);
  questions.forEach((question) => form.append(createSurveyField(question)));

  const button = document.createElement("button");
  button.className = "primary-button large-button";
  button.type = "submit";
  button.textContent = "제출하고 완료하기";
  form.append(button);
}

function isSurveyEnabled() {
  return mission.survey?.enabled === true;
}

function externalSurveyUrl() {
  return String(mission.survey?.externalUrl || "").trim();
}

function createSurveyField(question) {
  if (question.type === "choice") {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "survey-choice-group";
    fieldset.innerHTML = `<legend>${escapeHtml(surveyQuestionText(question))}</legend>`;
    const options = document.createElement("div");
    options.className = "survey-choice-options";
    (question.options || []).forEach((value) => {
      const label = document.createElement("label");
      label.innerHTML = `<input type="radio" name="${escapeAttribute(question.id)}" value="${escapeAttribute(value)}" ${question.required ? "required" : ""} /><span>${escapeHtml(value)}</span>`;
      options.append(label);
    });
    fieldset.append(options);
    return fieldset;
  }

  const label = document.createElement("label");
  label.textContent = surveyQuestionText(question);
  const control = document.createElement("textarea");
  control.name = question.id;
  control.required = Boolean(question.required);
  control.placeholder = question.placeholder || "";
  control.rows = 4;
  label.append(control);
  return label;
}

function defaultSurveyQuestions() {
  return [
    { id: "gender", question: "성별이 어떻게 되시나요?", type: "choice", options: ["여성", "남성"], required: true },
    { id: "age", question: "연령대가 어떻게 되시나요?", type: "choice", options: ["10대", "20대", "30대", "40대 이상"], required: true },
    { id: "residence", question: "현재 거주지가 어떻게 되십니까?", type: "choice", options: ["서울·경기", "충주", "대전·세종", "충청북도", "충청남도", "전라북도", "전라남도", "경상북도", "경상남도"], required: true },
    { id: "visitCount", question: "저희 체험관에는 몇 번 방문하셨나요?", type: "choice", options: ["첫 방문", "2회 이상", "5회 이상"], required: true },
    { id: "eventSatisfaction", question: "행사에 만족하셨습니까?", type: "choice", options: ["매우 만족", "만족", "보통", "불만족", "매우 불만족"], required: true },
    { id: "revisitIntent", question: "본 행사를 통해 체험관을 다시 찾고 싶은 마음이 드셨나요?", type: "choice", options: ["매우 그렇다", "그렇다", "보통이다", "아니다", "매우 아니다"], required: true },
    { id: "comment", question: "참여하신 행사나 체험관에 하고 싶은 말씀을 적어주세요.", type: "text", options: [], required: false },
  ];
}

function getSurveyQuestions() {
  return mission.survey?.questions?.length ? mission.survey.questions : defaultSurveyQuestions();
}

function surveyQuestionText(question) {
  return question.question || question.label || "";
}

function submitSurvey(event) {
  event.preventDefault();
  const error = $("#survey-error");
  if (!validateSurveyRequired()) {
    if (error) error.textContent = "필수 문항에 응답해주세요.";
    return;
  }
  if (error) error.textContent = "";
  const formData = new FormData(event.currentTarget);
  state.survey = Object.fromEntries(formData.entries());
  saveState();
  saveSurveyResult(state.survey);
  renderComplete();
  showScreen("complete");
}

function validateSurveyRequired() {
  return getSurveyQuestions().every((question) => {
    if (!question.required) return true;
    const value = new FormData($("#survey-form")).get(question.id);
    return String(value || "").trim().length > 0;
  });
}

function saveSurveyResult(answers) {
  const results = JSON.parse(localStorage.getItem(SURVEY_RESULTS_KEY) || "[]");
  results.push({
    submittedAt: new Date().toISOString(),
    score: state.score,
    completedCount: Object.keys(state.completed).length,
    answers,
  });
  localStorage.setItem(SURVEY_RESULTS_KEY, JSON.stringify(results));
}

function renderComplete() {
  const correctCount = Object.values(state.completed).filter((answer) => answer.isCorrect).length;
  const qualified = correctCount >= PRIZE_THRESHOLD;

  $("#complete-title").textContent = qualified ? "축하합니다!" : "아쉽습니다";
  $("#final-correct").textContent = `정답: ${correctCount} / ${TOTAL_QUESTIONS}`;
  $("#final-score").textContent = `${state.score}점`;
  $("#final-message").textContent = qualified
    ? "축하합니다! 6문제 중 3문제 이상 정답을 맞히셨습니다. 안내데스크에서 확인 후 상품 추첨에 도전하세요."
    : "아쉽지만 상품 추첨 참여 기준인 3문제 이상 정답에 도달하지 못했습니다. 다음에도 도전해 주세요!";
  updateExternalSurveyButton();
}

function updateExternalSurveyButton() {
  const surveyButton = $("#external-survey-button");
  const surveyUrl = externalSurveyUrl();
  surveyButton.classList.toggle("is-hidden", !(isSurveyEnabled() && surveyUrl));
}

function openExternalSurvey() {
  const surveyUrl = externalSurveyUrl();
  if (!isSurveyEnabled() || !surveyUrl) return;
  window.location.href = surveyUrl;
}

function getNextUncompletedQuestion() {
  return mission.questions.find((question) => !state.completed[question.id]);
}

function updateProgress() {
  if (!mission) return;
  const completedCount = Object.keys(state.completed).length;
  const percent = TOTAL_QUESTIONS ? Math.round((completedCount / TOTAL_QUESTIONS) * 100) : 0;
  $("#progress-label").textContent = `${Math.min(completedCount, TOTAL_QUESTIONS)}/${TOTAL_QUESTIONS}`;
  $("#score-label").textContent = `${state.score}점`;
  $("#progress-bar").style.width = `${percent}%`;
}

function showScreen(name) {
  document.body.dataset.screen = name;
  Object.entries(screens).forEach(([screenName, element]) => {
    element.classList.toggle("is-active", screenName === name);
  });
}

function showMessage(title, detail) {
  $("#scanner-status").textContent = `${title} ${detail}`;
  showScreen("home");
}

function resetMission() {
  stopScanner();
  localStorage.removeItem(STORAGE_KEY);
  state = { completed: {}, score: 0, currentQuestionId: null, survey: null };
  lastResult = null;
  history.replaceState(null, "", location.pathname);
  updateProgress();
  showScreen("home");
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
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

function typeLabel(type) {
  return {
    multiple: "객관식",
    choice: "객관식",
    ox: "O / X",
    short: "주관식",
    text: "주관식",
  }[type] || "문제";
}
