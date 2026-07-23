/* 民法ⅠA 学習アプリ v2.0 — GitHub Pages / ローカル対応 */
(function () {
  "use strict";

  const APP_VERSION = "2.0.0";
  const SCHEMA_VERSION = 2;
  const STORAGE_KEY = "lawQuizApp.v2.data";
  const ACTIVE_MOCK_KEY = "lawQuizApp.v2.activeMock";
  const MAX_ACTIVITY = 800;
  const MAX_RATING_HISTORY = 30;
  const BANK_PAGE_SIZE = 20;
  const ALL = "all";

  const sourceQuestions = Array.isArray(window.questions)
    ? window.questions
    : (typeof questions !== "undefined" && Array.isArray(questions) ? questions : []);
  const QUESTIONS = sourceQuestions.filter(q => q && Number.isInteger(Number(q.id)) && String(q.question || "").trim());
  const questionById = new Map(QUESTIONS.map(q => [Number(q.id), q]));

  const DEFAULT_DATA = () => ({
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    progress: {},
    settings: { theme: "system", compact: false },
    activity: [],
    mockHistory: [],
    customSets: []
  });

  let data = loadData();
  let activeView = "home";
  let deferredInstallPrompt = null;
  let bankSelection = new Set();
  let editingSetId = null;
  let bankPage = 1;
  let currentBankResults = QUESTIONS.slice();
  let lastMockSetup = { source: "all", count: "10", customSetId: "" };

  const study = {
    config: {
      mode: "normal", order: "random", lecture: ALL, category: ALL, rating: ALL,
      idMin: "", idMax: "", search: "", memorizeType: ALL, importantOnly: false,
      precedentOnly: false, favoriteOnly: false, memoOnly: false, customIds: null
    },
    deck: [], pointer: 0, round: 1, answerStage: 0, previousId: null
  };

  let activeMock = loadActiveMock();
  let mockReviewIndex = 0;
  let lastMockResult = null;

  const dom = {};
  const qs = id => document.getElementById(id);

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheDom();
    validateQuestions();
    populateAllSelects();
    applySettings();
    bindNavigation();
    bindHome();
    bindStudy();
    bindMock();
    bindBank();
    bindSettings();
    bindDialogs();
    bindKeyboard();
    bindSwipe();
    registerPwa();
    applyUrlState();
    renderAllDashboard();
    renderSettingsLists();
    updateMockSourcePreview();
    updateResumeMockButton();
    if (!study.deck.length) startStudyRound();
  }

  function cacheDom() {
    [
      "mainContent", "summaryCards", "masteryPercent", "masteryCount", "masteryBar", "lastStudyLabel",
      "lectureProgressList", "recentActivity", "studyContextLabel", "studyModeSelect", "studyOrderSelect",
      "studyLectureSelect", "studyCategorySelect", "studyRatingSelect", "studyMemorizeTypeSelect", "studyIdMin", "studyIdMax",
      "studySearchInput", "studyImportantOnly", "studyPrecedentOnly", "studyFavoriteOnly", "studyMemoOnly",
      "filteredCountBadge", "studyEmptyState", "studyCard", "studyMeta", "favoriteButton", "studyProgressText",
      "studyProgressBar", "studyRoundText", "modeInstruction", "studyQuestionText", "essayComposer", "essayInput",
      "essaySaveStatus", "memorizeFront", "stageControls", "answerArea", "answerSections", "essayComparison",
      "essayPreview", "essayModelAnswer", "writingChecklist", "checklistSummary", "ratingStatus", "noteInput",
      "noteSaveStatus", "previousQuestionButton", "showAnswerButton", "nextQuestionButton", "toastRegion",
      "mockSetup", "mockSourceSelect", "mockCountSelect", "mockCustomSetSelect", "mockSourceCount",
      "mockSourceMessage", "startMockButton", "resumeMockButton", "mockSession", "mockSessionTitle",
      "mockSessionProgress", "mockMeta", "mockQuestionText", "mockAnswerInput", "mockReviewCheckbox",
      "mockPreviousButton", "mockNextButton", "submitMockButton", "mockReview", "mockReviewProgress",
      "mockReviewItems", "finishMockReviewButton", "mockResult", "mockResultSummary", "mockResultLists",
      "bankSearchInput", "bankLectureSelect", "bankCategorySelect", "bankRatingSelect", "bankSortSelect",
      "bankFavoriteOnly", "bankMemoOnly", "bankImportantOnly", "bankPrecedentOnly", "bankCountLabel",
      "selectionBar", "selectionCount", "bankList", "bankPageLabel", "bankPreviousPage", "bankNextPage",
      "themeSelect", "compactModeCheckbox", "installPwaButton", "customSetsList", "mockHistoryList",
      "appDialog", "dialogTitle", "dialogBody", "dialogActions", "searchDialog", "globalSearchInput",
      "globalSearchCount", "globalSearchResults", "mockNavigatorDialog", "mockNavigatorGrid"
    ].forEach(id => { dom[id] = qs(id); });
  }

  function validateQuestions() {
    const ids = QUESTIONS.map(q => Number(q.id));
    const missing = Array.from({ length: 131 }, (_, i) => i + 1).filter(id => !ids.includes(id));
    const duplicate = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (QUESTIONS.length !== 131 || missing.length || duplicate.length) {
      console.warn("問題データ検査:", { count: QUESTIONS.length, missing, duplicate });
      showToast(`問題データは${QUESTIONS.length}問です。欠番や重複を確認してください。`, "error", 8000);
    }
  }

  function safeParse(raw, fallback) {
    try { return JSON.parse(raw); } catch (error) { console.warn("保存データの解析に失敗しました。", error); return fallback; }
  }

  function loadData() {
    const fallback = DEFAULT_DATA();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      return migrateData(safeParse(raw, fallback));
    } catch (error) {
      console.warn("localStorageを利用できません。", error);
      return fallback;
    }
  }

  function migrateData(input) {
    const base = DEFAULT_DATA();
    if (!input || typeof input !== "object") return base;
    const out = {
      ...base,
      ...input,
      schemaVersion: SCHEMA_VERSION,
      appVersion: APP_VERSION,
      progress: input.progress && typeof input.progress === "object" ? input.progress : {},
      settings: { ...base.settings, ...(input.settings || {}) },
      activity: Array.isArray(input.activity) ? input.activity.slice(-MAX_ACTIVITY) : [],
      mockHistory: Array.isArray(input.mockHistory) ? input.mockHistory.slice(0, 100) : [],
      customSets: Array.isArray(input.customSets) ? input.customSets : []
    };
    Object.keys(out.progress).forEach(id => {
      const p = out.progress[id] || {};
      out.progress[id] = normalizeProgress(p);
    });
    return out;
  }

  function normalizeProgress(p = {}) {
    return {
      rating: ["bad", "unsure", "good"].includes(p.rating) ? p.rating : null,
      badCount: Number(p.badCount) || 0,
      unsureCount: Number(p.unsureCount) || 0,
      goodCount: Number(p.goodCount) || 0,
      firstAnswered: p.firstAnswered || null,
      lastAnswered: p.lastAnswered || null,
      totalReviews: Number(p.totalReviews) || 0,
      goodStreak: Number(p.goodStreak) || 0,
      mastered: Boolean(p.mastered),
      favorite: Boolean(p.favorite),
      note: typeof p.note === "string" ? p.note : "",
      essay: typeof p.essay === "string" ? p.essay : "",
      checklist: { issue: false, rule: false, apply: false, conclusion: false, ...(p.checklist || {}) },
      ratingHistory: Array.isArray(p.ratingHistory) ? p.ratingHistory.slice(-MAX_RATING_HISTORY) : []
    };
  }

  function saveData() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; }
    catch (error) { console.warn("学習データを保存できません。", error); showToast("学習データを保存できませんでした。ブラウザの保存設定を確認してください。", "error"); return false; }
  }

  function loadActiveMock() {
    try {
      const raw = localStorage.getItem(ACTIVE_MOCK_KEY);
      const parsed = raw ? safeParse(raw, null) : null;
      if (!parsed || !Array.isArray(parsed.ids) || !parsed.ids.length) return null;
      parsed.answers = parsed.answers || {};
      parsed.review = parsed.review || {};
      parsed.ratings = parsed.ratings || {};
      parsed.checklists = parsed.checklists || {};
      parsed.index = Math.max(0, Math.min(Number(parsed.index) || 0, parsed.ids.length - 1));
      return parsed;
    } catch (error) { return null; }
  }

  function saveActiveMock() {
    try {
      if (activeMock) localStorage.setItem(ACTIVE_MOCK_KEY, JSON.stringify(activeMock));
      else localStorage.removeItem(ACTIVE_MOCK_KEY);
    } catch (error) { console.warn("模擬試験の保存に失敗しました。", error); }
  }

  function getProgress(id) {
    const key = String(id);
    if (!data.progress[key]) data.progress[key] = normalizeProgress();
    else data.progress[key] = normalizeProgress(data.progress[key]);
    return data.progress[key];
  }

  function peekProgress(id) { return normalizeProgress(data.progress[String(id)] || {}); }

  function bindNavigation() {
    document.addEventListener("click", event => {
      const nav = event.target.closest("[data-nav]");
      if (!nav) return;
      navigate(nav.dataset.nav);
    });
  }

  function navigate(view, options = {}) {
    const target = document.querySelector(`[data-view="${view}"]`);
    if (!target) return;
    activeView = view;
    document.querySelectorAll(".app-view").forEach(section => {
      const active = section.dataset.view === view;
      section.hidden = !active;
      section.classList.toggle("is-active", active);
    });
    document.querySelectorAll("[data-nav]").forEach(button => {
      const active = button.dataset.nav === view;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
    });
    if (view === "home") renderAllDashboard();
    if (view === "bank") renderBank();
    if (view === "settings") renderSettingsLists();
    if (view === "mock") updateMockSourcePreview();
    if (!options.preserveScroll) window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    dom.mainContent.focus({ preventScroll: true });
  }

  function bindHome() {
    document.querySelectorAll("[data-quick]").forEach(button => button.addEventListener("click", () => handleQuickAction(button.dataset.quick)));
  }

  function handleQuickAction(action) {
    if (action === "mock-all") { lastMockSetup.source = "all"; dom.mockSourceSelect.value = "all"; navigate("mock"); updateMockSourcePreview(); return; }
    if (action === "mock-bad") { lastMockSetup.source = "bad"; dom.mockSourceSelect.value = "bad"; navigate("mock"); updateMockSourcePreview(); return; }
    const presets = {
      "random-study": { mode: "normal", order: "random", rating: ALL },
      "weighted-study": { mode: "normal", order: "weighted", rating: ALL },
      "bad-study": { mode: "normal", order: "random", rating: "bad" },
      "unsure-study": { mode: "normal", order: "random", rating: "unsure" },
      "unanswered-study": { mode: "normal", order: "random", rating: "unanswered" },
      "memorize": { mode: "memorize", order: "random", rating: ALL },
      "precedent": { mode: "precedent", order: "random", rating: ALL, precedentOnly: true },
      "favorites": { mode: "normal", order: "random", rating: ALL, favoriteOnly: true }
    };
    const preset = presets[action];
    if (!preset) return;
    resetStudyConfig(false);
    Object.assign(study.config, preset);
    syncStudyControlsFromConfig();
    startStudyRound();
    navigate("study");
  }

  function renderAllDashboard() {
    renderSummary();
    renderQuickCounts();
    renderLectureProgress();
    renderRecentActivity();
  }

  function stats() {
    const result = { total: QUESTIONS.length, unanswered: 0, bad: 0, unsure: 0, good: 0, mastered: 0, favorite: 0, notes: 0, totalReviews: 0, today: 0, week: 0, streak: 0 };
    QUESTIONS.forEach(q => {
      const p = peekProgress(q.id);
      if (!p.rating) result.unanswered++;
      else result[p.rating]++;
      if (p.mastered) result.mastered++;
      if (p.favorite) result.favorite++;
      if (p.note.trim()) result.notes++;
      result.totalReviews += p.totalReviews;
    });
    const todayKey = dateKey(Date.now());
    const weekStart = startOfWeek(Date.now());
    result.today = new Set(data.activity.filter(item => dateKey(item.ts) === todayKey).map(item => Number(item.id))).size;
    result.week = new Set(data.activity.filter(item => item.ts >= weekStart).map(item => Number(item.id))).size;
    result.streak = calculateStudyStreak();
    return result;
  }

  function renderSummary() {
    const s = stats();
    clear(dom.summaryCards);
    [
      ["未回答", s.unanswered, "primary"], ["ダメ", s.bad, "bad"], ["微妙", s.unsure, "unsure"],
      ["理解した", s.good, "good"], ["習得済み", s.mastered, "good"], ["総回答", s.totalReviews, "primary"],
      ["今日解いた", s.today, "primary"], ["今週解いた", s.week, "primary"], ["連続学習", `${s.streak}日`, "good"]
    ].forEach(([label, value, tone]) => {
      const card = el("div", "summary-card"); card.dataset.tone = tone;
      card.append(el("span", "", label), el("strong", "", String(value)));
      dom.summaryCards.append(card);
    });
    const percent = s.total ? Math.round(s.mastered / s.total * 100) : 0;
    dom.masteryPercent.textContent = `${percent}%`;
    dom.masteryCount.textContent = `${s.mastered} / ${s.total}問`;
    dom.masteryBar.style.width = `${percent}%`;
    const track = dom.masteryBar.parentElement;
    track.setAttribute("aria-valuenow", String(percent));
    const last = [...data.activity].sort((a, b) => b.ts - a.ts)[0];
    dom.lastStudyLabel.textContent = last ? `最終学習：${formatDateTime(last.ts)}` : "まだ学習記録がありません";
  }

  function renderQuickCounts() {
    const s = stats();
    const precedent = QUESTIONS.filter(isPrecedent).length;
    document.querySelectorAll("[data-count]").forEach(node => {
      const key = node.dataset.count;
      const value = key === "weak" ? s.bad + s.unsure : key === "precedent" ? precedent : s[key] || 0;
      node.textContent = `${value}問`;
    });
  }

  function renderLectureProgress() {
    clear(dom.lectureProgressList);
    getLectures().forEach(lecture => {
      const pool = QUESTIONS.filter(q => q.lecture === lecture);
      const mastered = pool.filter(q => peekProgress(q.id).mastered).length;
      const percent = pool.length ? Math.round(mastered / pool.length * 100) : 0;
      const button = el("button", "lecture-progress-item"); button.type = "button";
      const label = el("strong", "", lecture);
      const track = el("div", "mini-progress"); const fill = el("span"); fill.style.width = `${percent}%`; track.append(fill);
      const count = el("small", "", `${mastered} / ${pool.length}`);
      button.append(label, track, count);
      button.addEventListener("click", () => {
        resetStudyConfig(false); study.config.lecture = lecture; syncStudyControlsFromConfig(); startStudyRound(); navigate("study");
      });
      dom.lectureProgressList.append(button);
    });
  }

  function renderRecentActivity() {
    clear(dom.recentActivity);
    const recent = [...data.activity].sort((a, b) => b.ts - a.ts).slice(0, 8);
    dom.recentActivity.classList.toggle("empty-inline", !recent.length);
    if (!recent.length) { dom.recentActivity.textContent = "まだ学習履歴がありません。"; return; }
    recent.forEach(item => {
      const q = questionById.get(Number(item.id)); if (!q) return;
      const row = el("div", "activity-item");
      const main = el("div", "activity-item__main");
      main.append(el("strong", "", `問${q.id}・${ratingLabel(item.rating)}`), el("small", "", q.question));
      row.append(main, el("small", "muted-text", formatRelative(item.ts)));
      row.addEventListener("click", () => openQuestionInStudy(q.id));
      dom.recentActivity.append(row);
    });
  }

  function bindStudy() {
    qs("applyStudyFiltersButton").addEventListener("click", () => { readStudyControls(); startStudyRound(); });
    qs("resetStudyFiltersButton").addEventListener("click", () => { resetStudyConfig(); startStudyRound(); });
    qs("emptyResetButton").addEventListener("click", () => { resetStudyConfig(); startStudyRound(); });
    qs("reshuffleButton").addEventListener("click", () => { startStudyRound(); showToast("出題順を組み直しました。", "success"); });
    qs("shareStudyButton").addEventListener("click", () => shareStudyState());
    qs("directQuestionShareButton").addEventListener("click", () => shareCurrentQuestion());
    dom.favoriteButton.addEventListener("click", toggleFavorite);
    dom.previousQuestionButton.addEventListener("click", previousQuestion);
    dom.nextQuestionButton.addEventListener("click", nextQuestion);
    dom.showAnswerButton.addEventListener("click", advanceAnswerStage);
    qs("clearEssayButton").addEventListener("click", clearCurrentEssay);
    qs("deleteNoteButton").addEventListener("click", deleteCurrentNote);
    dom.essayInput.addEventListener("input", debounce(saveCurrentEssay, 350));
    dom.noteInput.addEventListener("input", debounce(saveCurrentNote, 350));
    dom.writingChecklist.addEventListener("change", saveChecklist);
    document.querySelectorAll("#answerArea [data-rating]").forEach(button => button.addEventListener("click", () => setRating(currentQuestionId(), button.dataset.rating, "study")));
    [dom.studyLectureSelect, dom.studyModeSelect].forEach(select => select.addEventListener("change", () => {
      if (select === dom.studyLectureSelect) populateCategorySelect(dom.studyCategorySelect, dom.studyLectureSelect.value, dom.studyCategorySelect.value);
      if (select === dom.studyModeSelect && select.value === "precedent") dom.studyPrecedentOnly.checked = true;
      updateFilteredCountPreview();
    }));
    [dom.studyCategorySelect, dom.studyRatingSelect, dom.studyMemorizeTypeSelect, dom.studyOrderSelect, dom.studyImportantOnly, dom.studyPrecedentOnly, dom.studyFavoriteOnly, dom.studyMemoOnly, dom.studyIdMin, dom.studyIdMax]
      .forEach(control => control.addEventListener("change", updateFilteredCountPreview));
    dom.studySearchInput.addEventListener("input", debounce(updateFilteredCountPreview, 180));
  }

  function readStudyControls() {
    Object.assign(study.config, {
      mode: dom.studyModeSelect.value,
      order: dom.studyOrderSelect.value,
      lecture: dom.studyLectureSelect.value,
      category: dom.studyCategorySelect.value,
      rating: dom.studyRatingSelect.value,
      memorizeType: dom.studyMemorizeTypeSelect.value,
      idMin: dom.studyIdMin.value,
      idMax: dom.studyIdMax.value,
      search: dom.studySearchInput.value.trim(),
      importantOnly: dom.studyImportantOnly.checked,
      precedentOnly: dom.studyPrecedentOnly.checked,
      favoriteOnly: dom.studyFavoriteOnly.checked,
      memoOnly: dom.studyMemoOnly.checked,
      customIds: study.config.customIds
    });
  }

  function syncStudyControlsFromConfig() {
    dom.studyModeSelect.value = study.config.mode;
    dom.studyOrderSelect.value = study.config.order;
    dom.studyLectureSelect.value = study.config.lecture;
    populateCategorySelect(dom.studyCategorySelect, study.config.lecture, study.config.category);
    dom.studyRatingSelect.value = study.config.rating;
    dom.studyMemorizeTypeSelect.value = study.config.memorizeType || ALL;
    dom.studyIdMin.value = study.config.idMin;
    dom.studyIdMax.value = study.config.idMax;
    dom.studySearchInput.value = study.config.search;
    dom.studyImportantOnly.checked = study.config.importantOnly;
    dom.studyPrecedentOnly.checked = study.config.precedentOnly;
    dom.studyFavoriteOnly.checked = study.config.favoriteOnly;
    dom.studyMemoOnly.checked = study.config.memoOnly;
    updateFilteredCountPreview();
  }

  function resetStudyConfig(sync = true) {
    study.config = { mode: "normal", order: "random", lecture: ALL, category: ALL, rating: ALL, memorizeType: ALL, idMin: "", idMax: "", search: "", importantOnly: false, precedentOnly: false, favoriteOnly: false, memoOnly: false, customIds: null };
    if (sync) syncStudyControlsFromConfig();
  }

  function getFilteredQuestions(config = study.config) {
    const search = normalizeText(config.search || "");
    const min = Number(config.idMin) || 0;
    const max = Number(config.idMax) || Infinity;
    const customSet = Array.isArray(config.customIds) ? new Set(config.customIds.map(Number)) : null;
    return QUESTIONS.filter(q => {
      const p = peekProgress(q.id);
      if (customSet && !customSet.has(Number(q.id))) return false;
      if (config.lecture !== ALL && q.lecture !== config.lecture) return false;
      if (config.category !== ALL && q.category !== config.category) return false;
      if (Number(q.id) < min || Number(q.id) > max) return false;
      if (config.importantOnly && !isImportant(q)) return false;
      if ((config.precedentOnly || config.mode === "precedent") && !isPrecedent(q)) return false;
      if (config.favoriteOnly && !p.favorite) return false;
      if (config.memoOnly && !p.note.trim()) return false;
      if (!matchesRating(p, config.rating)) return false;
      if (!matchesMemorizeType(q, config.memorizeType)) return false;
      if (search && !questionSearchText(q).includes(search)) return false;
      return true;
    });
  }

  function matchesRating(p, filter) {
    if (!filter || filter === ALL) return true;
    if (filter === "unanswered") return !p.rating;
    if (filter === "weak") return p.rating === "bad" || p.rating === "unsure";
    if (filter === "mastered") return p.mastered;
    if (filter === "unmastered") return !p.mastered;
    return p.rating === filter;
  }

  function updateFilteredCountPreview() {
    const temp = { ...study.config,
      mode: dom.studyModeSelect.value, order: dom.studyOrderSelect.value,
      lecture: dom.studyLectureSelect.value, category: dom.studyCategorySelect.value,
      rating: dom.studyRatingSelect.value, memorizeType: dom.studyMemorizeTypeSelect.value, idMin: dom.studyIdMin.value, idMax: dom.studyIdMax.value,
      search: dom.studySearchInput.value.trim(), importantOnly: dom.studyImportantOnly.checked,
      precedentOnly: dom.studyPrecedentOnly.checked, favoriteOnly: dom.studyFavoriteOnly.checked,
      memoOnly: dom.studyMemoOnly.checked
    };
    dom.filteredCountBadge.textContent = `${getFilteredQuestions(temp).length}問`;
  }

  function startStudyRound(options = {}) {
    const pool = getFilteredQuestions();
    study.previousId = study.deck[study.pointer] || null;
    study.deck = orderQuestions(pool, study.config.order).map(q => Number(q.id));
    if (study.previousId && study.deck.length > 1 && study.deck[0] === study.previousId) {
      [study.deck[0], study.deck[1]] = [study.deck[1], study.deck[0]];
    }
    study.pointer = 0;
    study.round = options.keepRound ? study.round + 1 : 1;
    study.answerStage = 0;
    dom.studyEmptyState.hidden = Boolean(study.deck.length);
    dom.studyCard.hidden = !study.deck.length;
    if (!study.deck.length) {
      dom.studyContextLabel.textContent = "該当する問題がありません";
      return;
    }
    renderStudyQuestion();
  }

  function orderQuestions(pool, order) {
    const array = pool.slice();
    if (order === "random") return fisherYates(array);
    if (order === "weighted") return weightedShuffle(array);
    if (order === "id-asc") return array.sort((a, b) => a.id - b.id);
    if (order === "id-desc") return array.sort((a, b) => b.id - a.id);
    if (order === "lecture") return array.sort((a, b) => lectureNumber(a.lecture) - lectureNumber(b.lecture) || a.id - b.id);
    if (order === "weakness") return array.sort((a, b) => weaknessScore(b.id) - weaknessScore(a.id) || a.id - b.id);
    if (order === "unanswered") return array.sort((a, b) => Number(Boolean(peekProgress(a.id).rating)) - Number(Boolean(peekProgress(b.id).rating)) || a.id - b.id);
    if (order === "favorite") return array.sort((a, b) => Number(peekProgress(b.id).favorite) - Number(peekProgress(a.id).favorite) || a.id - b.id);
    return array;
  }

  function weightedShuffle(pool) {
    return pool.map(q => {
      const p = peekProgress(q.id);
      const weight = p.rating === "bad" ? 5 : p.rating === "unsure" ? 3 : !p.rating ? 2 : p.mastered ? .5 : 1;
      return { q, key: -Math.log(Math.max(Math.random(), 1e-9)) / weight };
    }).sort((a, b) => a.key - b.key).map(item => item.q);
  }

  function weaknessScore(id) {
    const p = peekProgress(id);
    return p.rating === "bad" ? 50 + p.badCount : p.rating === "unsure" ? 30 + p.unsureCount : !p.rating ? 20 : p.mastered ? 0 : 10;
  }

  function currentQuestionId() { return study.deck[study.pointer] || null; }
  function currentQuestion() { return questionById.get(currentQuestionId()) || null; }

  function renderStudyQuestion() {
    const q = currentQuestion(); if (!q) return;
    const p = getProgress(q.id);
    study.answerStage = 0;
    clear(dom.studyMeta);
    addMeta(dom.studyMeta, `問${q.id}`, "meta-chip--id");
    addMeta(dom.studyMeta, q.lecture);
    addMeta(dom.studyMeta, q.caseName);
    addMeta(dom.studyMeta, q.category);
    if (isImportant(q)) addMeta(dom.studyMeta, "★重要", "meta-chip--important");
    if (p.rating) addMeta(dom.studyMeta, ratingLabel(p.rating), `meta-chip--rating-${p.rating}`);
    if (p.mastered) addMeta(dom.studyMeta, "習得済み", "meta-chip--rating-good");
    dom.studyQuestionText.textContent = q.question;
    dom.studyProgressText.textContent = `${study.pointer + 1} / ${study.deck.length}問`;
    dom.studyRoundText.textContent = `第${study.round}周`;
    dom.studyProgressBar.style.width = `${((study.pointer + 1) / study.deck.length) * 100}%`;
    dom.studyContextLabel.textContent = studyContextLabel();
    dom.favoriteButton.setAttribute("aria-pressed", String(p.favorite));
    dom.favoriteButton.textContent = p.favorite ? "★ お気に入り済み" : "☆ お気に入り";
    dom.essayInput.value = p.essay;
    dom.noteInput.value = p.note;
    dom.essaySaveStatus.textContent = "端末内に自動保存";
    dom.noteSaveStatus.textContent = "端末内に保存";
    renderChecklist(p);
    renderRatingState(p.rating);
    dom.answerArea.hidden = true;
    dom.answerSections.replaceChildren();
    dom.essayComparison.hidden = true;
    dom.essayComposer.hidden = study.config.mode !== "essay";
    dom.memorizeFront.hidden = study.config.mode !== "memorize";
    dom.stageControls.replaceChildren();
    setModeInstruction();
    setAnswerButtonState();
    dom.previousQuestionButton.disabled = study.pointer === 0;
    dom.nextQuestionButton.disabled = false;
    window.scrollTo({ top: Math.max(0, dom.studyCard.offsetTop - 85), behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  function studyContextLabel() {
    const pieces = [modeLabel(study.config.mode), `${study.deck.length}問`];
    if (study.config.lecture !== ALL) pieces.push(study.config.lecture);
    if (study.config.rating !== ALL) pieces.push(ratingFilterLabel(study.config.rating));
    if (study.config.customIds) pieces.push("選択問題セット");
    return pieces.join("・");
  }

  function setModeInstruction() {
    const messages = {
      normal: "事例を読み、条文・規範・あてはめ・結論を考えてから答えを開いてください。",
      article: "まず対応条文を特定してください。条文を確認した後に論点と模範解答を開きます。",
      conclusion: "結論だけでなく、なぜその結論になるかを説明してから答えを開いてください。",
      essay: "自分の答案を書いた後、「模範解答と比較」を押してください。入力内容はこの端末内だけに保存されます。",
      code: "実際に六法を引いてください。六法の引き方 → 対応条文 → 模範解答の順に開きます。",
      memorize: "問題から暗記事項を思い出し、カードの裏面を確認してください。",
      precedent: "判例の事案・判断枠組み・結論を意識して答えてください。"
    };
    dom.modeInstruction.textContent = messages[study.config.mode] || messages.normal;
  }

  function maxAnswerStage() {
    if (study.config.mode === "article") return 2;
    if (study.config.mode === "code") return 3;
    return 1;
  }

  function setAnswerButtonState() {
    const mode = study.config.mode;
    const labels = {
      article: ["対応条文を見る", "論点・模範解答を見る", "答えを隠す"],
      code: ["六法の引き方を見る", "対応条文を見る", "論点・模範解答を見る", "答えを隠す"]
    };
    if (study.answerStage === 0) {
      dom.showAnswerButton.textContent = mode === "essay" ? "模範解答と比較" : mode === "memorize" ? "暗記事項を見る" : (labels[mode]?.[0] || "答えを見る");
      dom.showAnswerButton.setAttribute("aria-expanded", "false");
    } else if (study.answerStage >= maxAnswerStage()) {
      dom.showAnswerButton.textContent = "答えを隠す";
      dom.showAnswerButton.setAttribute("aria-expanded", "true");
    } else {
      dom.showAnswerButton.textContent = labels[mode]?.[study.answerStage] || "続きを見る";
      dom.showAnswerButton.setAttribute("aria-expanded", "true");
    }
  }

  function advanceAnswerStage() {
    if (!currentQuestion()) return;
    const max = maxAnswerStage();
    if (study.answerStage >= max) {
      study.answerStage = 0;
      dom.answerArea.hidden = true;
      setAnswerButtonState();
      return;
    }
    study.answerStage++;
    renderAnswerStage();
    setAnswerButtonState();
  }

  function renderAnswerStage() {
    const q = currentQuestion(); if (!q) return;
    dom.answerArea.hidden = false;
    dom.answerSections.replaceChildren();
    dom.essayComparison.hidden = true;
    const mode = study.config.mode;
    if (mode === "article" && study.answerStage === 1) {
      appendAnswerSection("対応条文", q.article, "article");
      return;
    }
    if (mode === "code") {
      if (study.answerStage >= 1) appendAnswerSection("六法の引き方", q.codeGuide, "guide");
      if (study.answerStage >= 2) appendAnswerSection("対応条文", q.article, "article");
      if (study.answerStage < 3) return;
      appendAnswerSection("論点・根拠", q.issue, "issue");
      appendAnswerSection("模範解答", q.answer, "model");
      appendAnswerSection("これだけ暗記", q.memorize, "memorize");
      return;
    }
    if (mode === "essay") {
      dom.essayComparison.hidden = false;
      dom.essayPreview.textContent = dom.essayInput.value.trim() || "（答案未入力）";
      dom.essayModelAnswer.textContent = q.answer;
      appendAnswerSection("対応条文", q.article, "article");
      appendAnswerSection("論点・根拠", q.issue, "issue");
      appendAnswerSection("六法の引き方", q.codeGuide, "guide");
      appendAnswerSection("これだけ暗記", q.memorize, "memorize");
      return;
    }
    if (mode === "memorize") {
      appendAnswerSection("これだけ暗記", q.memorize, "memorize");
      appendAnswerSection("対応条文", q.article, "article");
      return;
    }
    appendAnswerSection("対応条文", q.article, "article");
    appendAnswerSection("論点・根拠", q.issue, "issue");
    appendAnswerSection("模範解答", q.answer, "model");
    appendAnswerSection("六法の引き方", q.codeGuide, "guide");
    appendAnswerSection("これだけ暗記", q.memorize, "memorize");
  }

  function appendAnswerSection(title, text, tone) {
    const section = el("section", `answer-section answer-section--${tone}`);
    section.append(el("h3", "", title), el("div", "answer-text", text || "登録なし"));
    if (tone === "article") {
      const url = validHttpUrl(currentQuestion()?.articleUrl);
      if (url) {
        const link = el("a", "article-link", "条文ページを新しいタブで開く ↗");
        link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer";
        section.append(link);
      }
    }
    dom.answerSections.append(section);
  }

  function previousQuestion() {
    if (study.pointer <= 0) return;
    study.pointer--;
    renderStudyQuestion();
  }

  function nextQuestion() {
    if (!study.deck.length) return;
    if (study.pointer < study.deck.length - 1) {
      study.pointer++;
      renderStudyQuestion();
      return;
    }
    showToast("一周完了。もう一度シャッフルします。", "success");
    startStudyRound({ keepRound: true });
  }

  function openQuestionInStudy(id) {
    resetStudyConfig(false);
    study.config.customIds = [Number(id)];
    syncStudyControlsFromConfig();
    startStudyRound();
    navigate("study");
  }

  function startStudyWithIds(ids, label = "選択問題") {
    const valid = [...new Set(ids.map(Number))].filter(id => questionById.has(id));
    if (!valid.length) { showToast("対象問題がありません。", "error"); return; }
    resetStudyConfig(false);
    study.config.customIds = valid;
    syncStudyControlsFromConfig();
    startStudyRound();
    dom.studyContextLabel.textContent = `${label}・${valid.length}問`;
    navigate("study");
  }

  function toggleFavorite() {
    const id = currentQuestionId(); if (!id) return;
    const p = getProgress(id); p.favorite = !p.favorite; saveData();
    renderStudyQuestion(); renderAllDashboard();
    showToast(p.favorite ? "お気に入りに追加しました。" : "お気に入りを解除しました。", "success");
  }

  function setRating(id, rating, context = "study") {
    if (!id || !["bad", "unsure", "good"].includes(rating)) return;
    const p = getProgress(id);
    const now = Date.now();
    p.rating = rating;
    p[`${rating}Count`] += 1;
    p.totalReviews += 1;
    p.firstAnswered = p.firstAnswered || now;
    p.lastAnswered = now;
    p.goodStreak = rating === "good" ? p.goodStreak + 1 : 0;
    p.mastered = p.goodStreak >= 3;
    p.ratingHistory.push({ rating, ts: now, context });
    p.ratingHistory = p.ratingHistory.slice(-MAX_RATING_HISTORY);
    data.activity.push({ ts: now, id: Number(id), rating, mode: context === "mock" ? "mock" : study.config.mode, context });
    data.activity = data.activity.slice(-MAX_ACTIVITY);
    saveData();
    if (context === "study") {
      renderRatingState(rating);
      renderAllDashboard();
      const message = p.mastered ? "3回連続で「理解した」になり、習得済みにしました。" : `${ratingLabel(rating)}として記録しました。`;
      showToast(message, "success");
    }
  }

  function renderRatingState(rating) {
    document.querySelectorAll("#answerArea [data-rating]").forEach(button => button.classList.toggle("is-selected", button.dataset.rating === rating));
    const p = currentQuestionId() ? peekProgress(currentQuestionId()) : normalizeProgress();
    dom.ratingStatus.textContent = rating
      ? `現在：${ratingLabel(rating)}　回答${p.totalReviews}回　連続理解${p.goodStreak}回${p.mastered ? "　・習得済み" : ""}`
      : "未評価";
  }

  function renderChecklist(p) {
    dom.writingChecklist.querySelectorAll("[data-check]").forEach(input => { input.checked = Boolean(p.checklist[input.dataset.check]); });
    updateChecklistSummary();
  }

  function saveChecklist() {
    const id = currentQuestionId(); if (!id) return;
    const p = getProgress(id);
    dom.writingChecklist.querySelectorAll("[data-check]").forEach(input => { p.checklist[input.dataset.check] = input.checked; });
    saveData(); updateChecklistSummary();
  }

  function updateChecklistSummary() {
    const checked = [...dom.writingChecklist.querySelectorAll("[data-check]")].filter(input => input.checked).length;
    dom.checklistSummary.textContent = `${checked} / 4項目を確認`;
  }

  function saveCurrentEssay() {
    const id = currentQuestionId(); if (!id) return;
    getProgress(id).essay = dom.essayInput.value; saveData();
    dom.essaySaveStatus.textContent = `保存済み ${formatTime(Date.now())}`;
  }

  async function clearCurrentEssay() {
    if (!currentQuestionId() || !dom.essayInput.value) return;
    if (!await confirmDialog("この問題の自分の答案を削除しますか？", "答案を削除")) return;
    dom.essayInput.value = ""; getProgress(currentQuestionId()).essay = ""; saveData();
    dom.essaySaveStatus.textContent = "削除しました";
  }

  function saveCurrentNote() {
    const id = currentQuestionId(); if (!id) return;
    getProgress(id).note = dom.noteInput.value; saveData();
    dom.noteSaveStatus.textContent = `保存済み ${formatTime(Date.now())}`;
  }

  async function deleteCurrentNote() {
    if (!currentQuestionId() || !dom.noteInput.value) return;
    if (!await confirmDialog("この問題のメモを削除しますか？", "メモを削除")) return;
    dom.noteInput.value = ""; getProgress(currentQuestionId()).note = ""; saveData();
    dom.noteSaveStatus.textContent = "削除しました";
  }

  function bindMock() {
    dom.mockSourceSelect.addEventListener("change", () => { lastMockSetup.source = dom.mockSourceSelect.value; updateMockSourcePreview(); });
    dom.mockCountSelect.addEventListener("change", () => { lastMockSetup.count = dom.mockCountSelect.value; updateMockSourcePreview(); });
    dom.mockCustomSetSelect.addEventListener("change", () => { lastMockSetup.customSetId = dom.mockCustomSetSelect.value; updateMockSourcePreview(); });
    document.querySelectorAll("[data-mock-preset]").forEach(button => button.addEventListener("click", () => { dom.mockSourceSelect.value = button.dataset.mockPreset; updateMockSourcePreview(); }));
    dom.startMockButton.addEventListener("click", () => startMockExam());
    dom.resumeMockButton.addEventListener("click", resumeMockExam);
    dom.mockAnswerInput.addEventListener("input", debounce(saveMockAnswer, 250));
    dom.mockReviewCheckbox.addEventListener("change", saveMockReviewFlag);
    dom.mockPreviousButton.addEventListener("click", () => moveMock(-1));
    dom.mockNextButton.addEventListener("click", () => moveMock(1));
    qs("mockNavigatorButton").addEventListener("click", openMockNavigator);
    qs("closeMockNavigator").addEventListener("click", () => dom.mockNavigatorDialog.close());
    qs("abortMockButton").addEventListener("click", abortMockExam);
    dom.submitMockButton.addEventListener("click", submitMockExam);
    dom.finishMockReviewButton.addEventListener("click", finishMockReview);
    qs("reviewWeakAfterMockButton").addEventListener("click", () => {
      const ids = lastMockResult ? lastMockResult.items.filter(x => x.rating === "bad" || x.rating === "unsure").map(x => x.id) : [];
      startStudyWithIds(ids, "模試の苦手問題");
    });
    qs("retryMockButton").addEventListener("click", () => { if (lastMockResult) { dom.mockSourceSelect.value = lastMockResult.source; dom.mockCountSelect.value = lastMockResult.requestedCount; resetMockViews(); startMockExam(lastMockResult.ids); } });
    qs("newMockButton").addEventListener("click", () => resetMockViews());
  }

  function getMockSourceQuestions() {
    const customSetId = dom.mockCustomSetSelect.value;
    if (customSetId) {
      const set = data.customSets.find(s => s.id === customSetId);
      return set ? set.questionIds.map(id => questionById.get(Number(id))).filter(Boolean) : [];
    }
    const source = dom.mockSourceSelect.value;
    if (source === "all") return QUESTIONS.slice();
    if (source === "bad") return QUESTIONS.filter(q => peekProgress(q.id).rating === "bad");
    if (source === "unsure") return QUESTIONS.filter(q => peekProgress(q.id).rating === "unsure");
    if (source === "weak") return QUESTIONS.filter(q => ["bad", "unsure"].includes(peekProgress(q.id).rating));
    if (source === "unanswered") return QUESTIONS.filter(q => !peekProgress(q.id).rating);
    if (source === "favorite") return QUESTIONS.filter(q => peekProgress(q.id).favorite);
    if (source === "important") return QUESTIONS.filter(isImportant);
    if (source === "precedent") return QUESTIONS.filter(isPrecedent);
    if (source === "current") return getFilteredQuestions();
    if (source === "selected") return [...bankSelection].map(id => questionById.get(Number(id))).filter(Boolean);
    return QUESTIONS.slice();
  }

  function updateMockSourcePreview() {
    populateCustomSetSelect(dom.mockCustomSetSelect, dom.mockCustomSetSelect.value || lastMockSetup.customSetId);
    const pool = getMockSourceQuestions();
    dom.mockSourceCount.textContent = `対象：${pool.length}問`;
    const requested = dom.mockCountSelect.value;
    const actual = requested === "all" ? pool.length : Math.min(Number(requested), pool.length);
    dom.mockSourceMessage.textContent = pool.length ? `${actual}問をランダム出題します。` : mockEmptyMessage(dom.mockSourceSelect.value);
    dom.startMockButton.disabled = pool.length === 0;
  }

  function mockEmptyMessage(source) {
    if (source === "bad") return "「ダメ」と評価された問題がまだありません。";
    if (source === "unsure") return "「微妙」と評価された問題がまだありません。";
    if (source === "favorite") return "お気に入りの問題がありません。";
    if (source === "selected") return "問題一覧で問題を選択してください。";
    return "対象問題がありません。";
  }

  async function startMockExam(forcedIds = null) {
    const pool = forcedIds ? forcedIds.map(id => questionById.get(Number(id))).filter(Boolean) : getMockSourceQuestions();
    if (!pool.length) { showToast(mockEmptyMessage(dom.mockSourceSelect.value), "error"); return; }
    if (activeMock && !forcedIds) {
      const replace = await confirmDialog("進行中の模擬試験があります。新しい試験を開始すると上書きされます。", "新しい模擬試験を開始");
      if (!replace) return;
    }
    const countSetting = forcedIds ? String(forcedIds.length) : dom.mockCountSelect.value;
    const count = countSetting === "all" ? pool.length : Math.min(Number(countSetting), pool.length);
    const selected = forcedIds ? pool : fisherYates(pool).slice(0, count);
    activeMock = {
      schemaVersion: 1,
      id: `mock-${Date.now()}`,
      source: dom.mockSourceSelect.value,
      sourceLabel: dom.mockCustomSetSelect.value ? customSetName(dom.mockCustomSetSelect.value) : mockSourceLabel(dom.mockSourceSelect.value),
      requestedCount: countSetting,
      ids: selected.map(q => Number(q.id)),
      index: 0,
      answers: {}, review: {}, ratings: {}, checklists: {},
      startedAt: Date.now(), submittedAt: null
    };
    saveActiveMock();
    showMockSession();
  }

  function resumeMockExam() { if (activeMock) showMockSession(); }

  function showMockSession() {
    dom.mockSetup.hidden = true; dom.mockReview.hidden = true; dom.mockResult.hidden = true; dom.mockSession.hidden = false;
    renderMockQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderMockQuestion() {
    if (!activeMock) return;
    const id = activeMock.ids[activeMock.index]; const q = questionById.get(Number(id)); if (!q) return;
    clear(dom.mockMeta); addMeta(dom.mockMeta, `問${q.id}`, "meta-chip--id"); addMeta(dom.mockMeta, q.lecture); addMeta(dom.mockMeta, q.caseName); addMeta(dom.mockMeta, q.category);
    dom.mockSessionTitle.textContent = activeMock.sourceLabel;
    dom.mockSessionProgress.textContent = `${activeMock.index + 1} / ${activeMock.ids.length}`;
    dom.mockQuestionText.textContent = q.question;
    dom.mockAnswerInput.value = activeMock.answers[id] || "";
    dom.mockReviewCheckbox.checked = Boolean(activeMock.review[id]);
    dom.mockPreviousButton.disabled = activeMock.index === 0;
    dom.mockNextButton.disabled = activeMock.index === activeMock.ids.length - 1;
  }

  function saveMockAnswer() {
    if (!activeMock) return;
    const id = activeMock.ids[activeMock.index]; activeMock.answers[id] = dom.mockAnswerInput.value; saveActiveMock();
  }
  function saveMockReviewFlag() { if (!activeMock) return; activeMock.review[activeMock.ids[activeMock.index]] = dom.mockReviewCheckbox.checked; saveActiveMock(); }
  function moveMock(delta) { if (!activeMock) return; saveMockAnswer(); activeMock.index = Math.max(0, Math.min(activeMock.index + delta, activeMock.ids.length - 1)); saveActiveMock(); renderMockQuestion(); }

  function openMockNavigator() {
    if (!activeMock) return;
    clear(dom.mockNavigatorGrid);
    activeMock.ids.forEach((id, index) => {
      const button = el("button", "mock-nav-button", String(index + 1)); button.type = "button";
      if (index === activeMock.index) button.classList.add("is-current");
      if ((activeMock.answers[id] || "").trim()) button.classList.add("is-answered");
      if (activeMock.review[id]) button.classList.add("is-review");
      const states = [];
      if ((activeMock.answers[id] || "").trim()) states.push("回答済み"); else states.push("未回答");
      if (activeMock.review[id]) states.push("見直し");
      button.setAttribute("aria-label", `第${index + 1}問・${states.join("・")}`);
      button.addEventListener("click", () => { saveMockAnswer(); activeMock.index = index; saveActiveMock(); dom.mockNavigatorDialog.close(); renderMockQuestion(); });
      dom.mockNavigatorGrid.append(button);
    });
    dom.mockNavigatorDialog.showModal();
  }

  async function abortMockExam() {
    if (!activeMock) return;
    const keep = await choiceDialog("模擬試験をどうしますか？", "模擬試験を中断", [
      { value: "keep", label: "保存して中断", className: "button--soft" },
      { value: "discard", label: "破棄する", className: "button--danger" },
      { value: "cancel", label: "戻る", className: "button--ghost" }
    ]);
    if (keep === "keep") { saveMockAnswer(); saveActiveMock(); resetMockViews(); showToast("模擬試験を保存しました。", "success"); }
    if (keep === "discard") { activeMock = null; saveActiveMock(); resetMockViews(); updateResumeMockButton(); }
  }

  async function submitMockExam() {
    if (!activeMock) return;
    saveMockAnswer();
    const unanswered = activeMock.ids.filter(id => !(activeMock.answers[id] || "").trim()).length;
    const message = unanswered ? `未回答が${unanswered}問あります。提出して自己採点へ進みますか？` : "提出して自己採点へ進みますか？";
    if (!await confirmDialog(message, "模擬試験を提出")) return;
    activeMock.submittedAt = Date.now(); activeMock.index = 0; mockReviewIndex = 0; saveActiveMock(); showMockReview();
  }

  function showMockReview() {
    dom.mockSetup.hidden = true; dom.mockSession.hidden = true; dom.mockResult.hidden = true; dom.mockReview.hidden = false;
    renderMockReviewItem(); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderMockReviewItem() {
    if (!activeMock) return;
    const id = activeMock.ids[mockReviewIndex]; const q = questionById.get(Number(id)); if (!q) return;
    dom.mockReviewProgress.textContent = `${mockReviewIndex + 1} / ${activeMock.ids.length}`;
    clear(dom.mockReviewItems);
    const item = el("article", "mock-review-item");
    const header = el("div", "mock-review-item__header");
    const metas = el("div", "meta-list"); addMeta(metas, `問${q.id}`, "meta-chip--id"); addMeta(metas, q.lecture); addMeta(metas, q.caseName);
    header.append(metas, el("span", "count-pill", activeMock.review[id] ? "見直し指定" : "自己採点"));
    item.append(header, el("div", "question-text", q.question));
    const compare = el("div", "comparison-grid");
    const mine = makeAnswerSection("自分の答案", (activeMock.answers[id] || "").trim() || "（未回答）", "article");
    const model = makeAnswerSection("模範解答", q.answer, "model"); compare.append(mine, model); item.append(compare);
    item.append(makeAnswerSection("対応条文", q.article, "article", q.articleUrl), makeAnswerSection("論点・根拠", q.issue, "issue"), makeAnswerSection("六法の引き方", q.codeGuide, "guide"), makeAnswerSection("これだけ暗記", q.memorize, "memorize"));
    const checklist = el("section", "self-check-panel"); checklist.append(el("h3", "", "論述チェック"));
    const checkGrid = el("div", "checklist-grid");
    [["issue", "問題の所在を書いた"], ["rule", "条文・規範を書いた"], ["apply", "事実をあてはめた"], ["conclusion", "結論を書いた"]].forEach(([key, label]) => {
      const l = el("label"); const input = document.createElement("input"); input.type = "checkbox"; input.checked = Boolean(activeMock.checklists[id]?.[key]);
      input.addEventListener("change", () => { activeMock.checklists[id] = activeMock.checklists[id] || {}; activeMock.checklists[id][key] = input.checked; saveActiveMock(); });
      l.append(input, el("span", "", label)); checkGrid.append(l);
    });
    checklist.append(checkGrid); item.append(checklist);
    const ratingPanel = el("section", "rating-panel");
    const intro = el("div"); intro.append(el("h3", "", "自己評価"), el("p", "", "模範解答と比べて判断してください。")); ratingPanel.append(intro);
    const buttons = el("div", "rating-buttons");
    [["bad", "×", "ダメ", "解けなかった"], ["unsure", "△", "微妙", "一部曖昧"], ["good", "○", "理解した", "根拠まで説明可能"]].forEach(([rating, mark, title, sub]) => {
      const b = el("button", `rating-button rating-button--${rating}`); b.type = "button"; if (activeMock.ratings[id] === rating) b.classList.add("is-selected");
      b.append(el("span", "", mark), el("strong", "", title), el("small", "", sub));
      b.addEventListener("click", () => { activeMock.ratings[id] = rating; saveActiveMock(); renderMockReviewItem(); });
      buttons.append(b);
    });
    ratingPanel.append(buttons); item.append(ratingPanel);
    const controls = el("div", "question-controls");
    const prev = el("button", "button button--ghost", "← 前の問題"); prev.type = "button"; prev.disabled = mockReviewIndex === 0;
    const status = el("span", "button button--ghost", activeMock.ratings[id] ? ratingLabel(activeMock.ratings[id]) : "未評価"); status.setAttribute("aria-live", "polite");
    const next = el("button", "button button--soft", mockReviewIndex === activeMock.ids.length - 1 ? "最後の問題" : "次の問題 →"); next.type = "button"; next.disabled = mockReviewIndex === activeMock.ids.length - 1;
    prev.addEventListener("click", () => { mockReviewIndex--; renderMockReviewItem(); window.scrollTo({ top: 0, behavior: "smooth" }); });
    next.addEventListener("click", () => { mockReviewIndex++; renderMockReviewItem(); window.scrollTo({ top: 0, behavior: "smooth" }); });
    controls.append(prev, status, next); item.append(controls);
    dom.mockReviewItems.append(item);
  }

  async function finishMockReview() {
    if (!activeMock) return;
    const ungraded = activeMock.ids.filter(id => !activeMock.ratings[id]).length;
    if (ungraded && !await confirmDialog(`${ungraded}問が未評価です。このまま結果を確定しますか？`, "自己採点を確定")) return;
    activeMock.ids.forEach(id => { if (activeMock.ratings[id]) setRating(id, activeMock.ratings[id], "mock"); });
    const items = activeMock.ids.map(id => ({ id, rating: activeMock.ratings[id] || null }));
    const result = {
      id: activeMock.id, ts: Date.now(), startedAt: activeMock.startedAt, source: activeMock.source,
      sourceLabel: activeMock.sourceLabel, requestedCount: activeMock.requestedCount,
      ids: activeMock.ids.slice(), items,
      bad: items.filter(x => x.rating === "bad").length,
      unsure: items.filter(x => x.rating === "unsure").length,
      good: items.filter(x => x.rating === "good").length,
      ungraded: items.filter(x => !x.rating).length
    };
    data.mockHistory.unshift(result); data.mockHistory = data.mockHistory.slice(0, 100); saveData();
    lastMockResult = result; activeMock = null; saveActiveMock(); renderMockResult(result); updateResumeMockButton(); renderAllDashboard(); renderSettingsLists();
  }

  function renderMockResult(result) {
    dom.mockSetup.hidden = true; dom.mockSession.hidden = true; dom.mockReview.hidden = true; dom.mockResult.hidden = false;
    clear(dom.mockResultSummary); clear(dom.mockResultLists);
    dom.mockResultSummary.append(el("p", "eyebrow", "RESULT"), el("h2", "", `${result.ids.length}問の自己採点が完了しました`), el("p", "", `${result.sourceLabel}・${formatDateTime(result.ts)}`));
    const grid = el("div", "result-score-grid");
    [["ダメ", result.bad], ["微妙", result.unsure], ["理解した", result.good], ["未評価", result.ungraded]].forEach(([label, value]) => { const box = el("div", "result-score"); box.append(el("span", "", label), el("strong", "", String(value))); grid.append(box); });
    dom.mockResultSummary.append(grid);
    [["ダメだった問題", "bad"], ["微妙だった問題", "unsure"]].forEach(([title, rating]) => {
      const box = el("section", "result-list"); box.append(el("h3", "", title)); const ids = result.items.filter(x => x.rating === rating).map(x => x.id);
      if (!ids.length) box.append(el("p", "muted-text", "該当なし")); else { const ul = document.createElement("ul"); ids.forEach(id => { const q = questionById.get(id); const li = document.createElement("li"); const b = el("button", "text-button", `問${id} ${truncate(q?.question || "", 46)}`); b.type = "button"; b.addEventListener("click", () => openQuestionInStudy(id)); li.append(b); ul.append(li); }); box.append(ul); }
      dom.mockResultLists.append(box);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetMockViews() { dom.mockSetup.hidden = false; dom.mockSession.hidden = true; dom.mockReview.hidden = true; dom.mockResult.hidden = true; updateMockSourcePreview(); updateResumeMockButton(); }
  function updateResumeMockButton() { dom.resumeMockButton.hidden = !activeMock; if (activeMock) dom.resumeMockButton.textContent = `前回の模擬試験を再開（${activeMock.index + 1}/${activeMock.ids.length}）`; }

  function bindBank() {
    dom.bankSearchInput.addEventListener("input", debounce(() => { bankPage = 1; renderBank(); }, 180));
    [dom.bankLectureSelect, dom.bankCategorySelect, dom.bankRatingSelect, dom.bankSortSelect, dom.bankFavoriteOnly, dom.bankMemoOnly, dom.bankImportantOnly, dom.bankPrecedentOnly].forEach(control => control.addEventListener("change", () => {
      if (control === dom.bankLectureSelect) populateCategorySelect(dom.bankCategorySelect, dom.bankLectureSelect.value, ALL);
      bankPage = 1; renderBank();
    }));
    dom.bankPreviousPage.addEventListener("click", () => { if (bankPage > 1) { bankPage--; renderBank(); window.scrollTo({ top: 0, behavior: "smooth" }); } });
    dom.bankNextPage.addEventListener("click", () => { const pages = Math.max(1, Math.ceil(currentBankResults.length / BANK_PAGE_SIZE)); if (bankPage < pages) { bankPage++; renderBank(); window.scrollTo({ top: 0, behavior: "smooth" }); } });
    qs("clearBankSelectionButton").addEventListener("click", () => { bankSelection.clear(); editingSetId = null; renderBank(); });
    qs("studySelectedButton").addEventListener("click", () => startStudyWithIds([...bankSelection], "選択問題"));
    qs("mockSelectedButton").addEventListener("click", () => { if (!bankSelection.size) return; dom.mockSourceSelect.value = "selected"; navigate("mock"); updateMockSourcePreview(); });
    qs("saveSelectedSetButton").addEventListener("click", saveSelectedSet);
    qs("shareSelectedButton").addEventListener("click", () => shareQuestionSet([...bankSelection]));
  }

  function getBankResults() {
    const search = normalizeText(dom.bankSearchInput.value.trim());
    const lecture = dom.bankLectureSelect.value;
    const category = dom.bankCategorySelect.value;
    const rating = dom.bankRatingSelect.value;
    const results = QUESTIONS.filter(q => {
      const p = peekProgress(q.id);
      if (lecture !== ALL && q.lecture !== lecture) return false;
      if (category !== ALL && q.category !== category) return false;
      if (!matchesRating(p, rating)) return false;
      if (dom.bankFavoriteOnly.checked && !p.favorite) return false;
      if (dom.bankMemoOnly.checked && !p.note.trim()) return false;
      if (dom.bankImportantOnly.checked && !isImportant(q)) return false;
      if (dom.bankPrecedentOnly.checked && !isPrecedent(q)) return false;
      if (search && !questionSearchText(q).includes(search)) return false;
      return true;
    });
    const sort = dom.bankSortSelect.value;
    results.sort((a, b) => {
      if (sort === "id-desc") return b.id - a.id;
      if (sort === "weakness") return weaknessScore(b.id) - weaknessScore(a.id) || a.id - b.id;
      if (sort === "last") return (peekProgress(b.id).lastAnswered || 0) - (peekProgress(a.id).lastAnswered || 0) || a.id - b.id;
      if (sort === "reviews") return peekProgress(b.id).totalReviews - peekProgress(a.id).totalReviews || a.id - b.id;
      return a.id - b.id;
    });
    return results;
  }

  function renderBank() {
    currentBankResults = getBankResults();
    const pages = Math.max(1, Math.ceil(currentBankResults.length / BANK_PAGE_SIZE)); bankPage = Math.min(bankPage, pages);
    const pageItems = currentBankResults.slice((bankPage - 1) * BANK_PAGE_SIZE, bankPage * BANK_PAGE_SIZE);
    dom.bankCountLabel.textContent = `${currentBankResults.length}問（全${QUESTIONS.length}問）`;
    dom.bankPageLabel.textContent = `${bankPage} / ${pages}`;
    dom.bankPreviousPage.disabled = bankPage <= 1; dom.bankNextPage.disabled = bankPage >= pages;
    clear(dom.bankList);
    if (!pageItems.length) { dom.bankList.append(el("div", "empty-state", "該当する問題がありません。")); }
    pageItems.forEach(q => dom.bankList.append(createBankItem(q)));
    renderSelectionBar();
  }

  function createBankItem(q) {
    const p = peekProgress(q.id);
    const row = el("article", "bank-item");
    const select = document.createElement("input"); select.type = "checkbox"; select.className = "bank-item__select"; select.checked = bankSelection.has(Number(q.id)); select.setAttribute("aria-label", `問${q.id}を選択`);
    select.addEventListener("change", () => { if (select.checked) bankSelection.add(Number(q.id)); else bankSelection.delete(Number(q.id)); renderSelectionBar(); });
    const main = el("button", "bank-item__main"); main.type = "button"; main.setAttribute("aria-label", `問${q.id}を開く`);
    const meta = el("div", "bank-item__meta"); addMeta(meta, `問${q.id}`, "meta-chip--id"); addMeta(meta, q.lecture); addMeta(meta, q.caseName);
    if (p.rating) addMeta(meta, ratingLabel(p.rating), `meta-chip--rating-${p.rating}`); if (p.mastered) addMeta(meta, "習得済み", "meta-chip--rating-good"); if (p.note.trim()) addMeta(meta, "メモあり");
    main.append(meta, el("p", "bank-item__question", q.question)); main.addEventListener("click", () => openQuestionInStudy(q.id));
    const statsBox = el("div", "bank-item__stats"); const fav = el("button", `bank-item__favorite${p.favorite ? " is-active" : ""}`, p.favorite ? "★" : "☆"); fav.type = "button"; fav.setAttribute("aria-label", p.favorite ? "お気に入り解除" : "お気に入り追加");
    fav.addEventListener("click", () => { getProgress(q.id).favorite = !p.favorite; saveData(); renderBank(); renderAllDashboard(); });
    statsBox.append(fav, el("small", "", `${p.totalReviews}回`)); row.append(select, main, statsBox); return row;
  }

  function renderSelectionBar() {
    dom.selectionBar.hidden = bankSelection.size === 0;
    dom.selectionCount.textContent = String(bankSelection.size);
    const saveButton = qs("saveSelectedSetButton");
    if (saveButton) saveButton.textContent = editingSetId ? "この内容でセットを更新" : "問題セットとして保存";
  }

  async function saveSelectedSet() {
    if (!bankSelection.size) return;
    if (editingSetId) {
      const set = data.customSets.find(item => item.id === editingSetId);
      if (!set) { editingSetId = null; renderSelectionBar(); return; }
      set.questionIds = [...bankSelection].sort((a, b) => a - b);
      set.updatedAt = Date.now();
      saveData(); renderSettingsLists(); updateMockSourcePreview(); renderSelectionBar();
      showToast(`「${set.name}」を${set.questionIds.length}問で更新しました。`, "success");
      return;
    }
    const name = await promptDialog("問題セット名を入力してください。", "問題セットを保存", `問題セット ${data.customSets.length + 1}`);
    if (!name) return;
    data.customSets.push({ id: `set-${Date.now()}`, name: name.slice(0, 80), questionIds: [...bankSelection].sort((a, b) => a - b), createdAt: Date.now() });
    saveData(); renderSettingsLists(); updateMockSourcePreview(); showToast("問題セットを保存しました。", "success");
  }

  function bindSettings() {
    dom.themeSelect.addEventListener("change", () => { data.settings.theme = dom.themeSelect.value; saveData(); applySettings(); });
    dom.compactModeCheckbox.addEventListener("change", () => { data.settings.compact = dom.compactModeCheckbox.checked; saveData(); applySettings(); });
    qs("themeQuickButton").addEventListener("click", cycleTheme);
    qs("exportDataButton").addEventListener("click", exportData);
    qs("importDataInput").addEventListener("change", importDataFile);
    document.querySelectorAll("[data-reset]").forEach(button => button.addEventListener("click", () => resetDataPart(button.dataset.reset)));
    dom.installPwaButton.addEventListener("click", installPwa);
    qs("pwaHelpButton").addEventListener("click", showPwaHelp);
    qs("helpButton").addEventListener("click", showHelp);
  }

  function applySettings() {
    document.documentElement.dataset.theme = data.settings.theme || "system";
    document.body.classList.toggle("is-compact", Boolean(data.settings.compact));
    if (dom.themeSelect) dom.themeSelect.value = data.settings.theme || "system";
    if (dom.compactModeCheckbox) dom.compactModeCheckbox.checked = Boolean(data.settings.compact);
    updateThemeColor();
  }

  function cycleTheme() {
    const options = ["system", "light", "dark"];
    data.settings.theme = options[(options.indexOf(data.settings.theme) + 1) % options.length];
    saveData(); applySettings(); showToast(`表示：${themeLabel(data.settings.theme)}`, "success");
  }

  function updateThemeColor() {
    const dark = data.settings.theme === "dark" || (data.settings.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#101820" : "#173f5f");
  }

  function renderSettingsLists() { renderCustomSets(); renderMockHistory(); populateCustomSetSelect(dom.mockCustomSetSelect, dom.mockCustomSetSelect?.value); }

  function renderCustomSets() {
    clear(dom.customSetsList); dom.customSetsList.classList.toggle("empty-inline", !data.customSets.length);
    if (!data.customSets.length) { dom.customSetsList.textContent = "まだ問題セットはありません。"; return; }
    data.customSets.forEach(set => {
      const row = el("div", "custom-set-item"); const main = el("div", "custom-set-item__main"); main.append(el("strong", "", set.name), el("small", "", `${set.questionIds.length}問・${formatDate(set.createdAt)}`));
      const actions = el("div", "custom-set-item__actions");
      [["学習", () => startStudyWithIds(set.questionIds, set.name)], ["模試", () => { dom.mockCustomSetSelect.value = set.id; navigate("mock"); updateMockSourcePreview(); }], ["一覧で編集", () => editSetQuestions(set)], ["共有", () => shareQuestionSet(set.questionIds)], ["名前変更", () => renameSet(set)], ["削除", () => deleteSet(set)]].forEach(([label, handler]) => { const b = el("button", "tool-button", label); b.type = "button"; b.addEventListener("click", handler); actions.append(b); });
      row.append(main, actions); dom.customSetsList.append(row);
    });
  }

  function editSetQuestions(set) {
    bankSelection = new Set(set.questionIds.map(Number));
    editingSetId = set.id;
    bankPage = 1;
    navigate("bank");
    renderBank();
    showToast(`「${set.name}」を編集中です。チェックを変更して更新してください。`, "success", 6000);
  }
  async function renameSet(set) { const name = await promptDialog("新しい問題セット名を入力してください。", "名前を変更", set.name); if (!name) return; set.name = name.slice(0, 80); saveData(); renderSettingsLists(); }
  async function deleteSet(set) { if (!await confirmDialog(`「${set.name}」を削除しますか？`, "問題セットを削除")) return; data.customSets = data.customSets.filter(s => s.id !== set.id); saveData(); renderSettingsLists(); updateMockSourcePreview(); }

  function renderMockHistory() {
    clear(dom.mockHistoryList); dom.mockHistoryList.classList.toggle("empty-inline", !data.mockHistory.length);
    if (!data.mockHistory.length) { dom.mockHistoryList.textContent = "まだ模擬試験履歴はありません。"; return; }
    data.mockHistory.slice(0, 20).forEach(history => {
      const row = el("div", "history-item"); const main = el("div", "history-item__main"); main.append(el("strong", "", `${history.sourceLabel || "模擬試験"}・${history.ids.length}問`), el("small", "", `${formatDateTime(history.ts)}　ダメ${history.bad}／微妙${history.unsure}／理解${history.good}`));
      const button = el("button", "tool-button", "同じ問題で学習"); button.type = "button"; button.addEventListener("click", () => startStudyWithIds(history.ids, "模試履歴"));
      row.append(main, button); dom.mockHistoryList.append(row);
    });
  }

  function exportData() {
    const payload = { exportedAt: new Date().toISOString(), app: "law-quiz", schemaVersion: SCHEMA_VERSION, data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `law-quiz-backup-${dateKey(Date.now())}.json`; document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showToast("バックアップを書き出しました。", "success");
  }

  async function importDataFile(event) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || parsed.app !== "law-quiz" || !parsed.data || typeof parsed.data !== "object") throw new Error("形式が一致しません");
      const mode = await choiceDialog("既存データを上書きしますか、それとも結合しますか？", "バックアップを読み込む", [
        { value: "overwrite", label: "上書き", className: "button--danger" }, { value: "merge", label: "結合", className: "button--primary" }, { value: "cancel", label: "キャンセル", className: "button--ghost" }
      ]);
      if (mode === "cancel" || !mode) return;
      const imported = migrateData(parsed.data);
      data = mode === "overwrite" ? imported : mergeData(data, imported);
      saveData(); applySettings(); renderAllDashboard(); renderSettingsLists(); renderBank(); startStudyRound(); showToast("バックアップを読み込みました。", "success");
    } catch (error) { console.warn(error); showToast("このJSONは読み込めません。正しいバックアップファイルを選んでください。", "error", 7000); }
  }

  function mergeData(current, incoming) {
    const merged = migrateData(current);
    Object.entries(incoming.progress || {}).forEach(([id, imported]) => {
      const existing = normalizeProgress(merged.progress[id] || {}); const next = normalizeProgress(imported);
      merged.progress[id] = (next.lastAnswered || 0) >= (existing.lastAnswered || 0) ? { ...existing, ...next, favorite: existing.favorite || next.favorite, note: next.note || existing.note, essay: next.essay || existing.essay } : { ...next, ...existing, favorite: existing.favorite || next.favorite, note: existing.note || next.note, essay: existing.essay || next.essay };
    });
    merged.activity = [...(merged.activity || []), ...(incoming.activity || [])].sort((a, b) => a.ts - b.ts).slice(-MAX_ACTIVITY);
    const historyMap = new Map([...(merged.mockHistory || []), ...(incoming.mockHistory || [])].map(h => [h.id, h])); merged.mockHistory = [...historyMap.values()].sort((a, b) => b.ts - a.ts).slice(0, 100);
    const setMap = new Map([...(merged.customSets || []), ...(incoming.customSets || [])].map(s => [s.id, s])); merged.customSets = [...setMap.values()];
    return merged;
  }

  async function resetDataPart(part) {
    const labels = { ratings: "すべての評価・学習履歴", notes: "すべてのメモ", favorites: "すべてのお気に入り", essays: "すべての自分の答案", mock: "模擬試験履歴", all: "すべての学習データ" };
    if (!await confirmDialog(`${labels[part]}を削除します。この操作は元に戻せません。`, "データをリセット")) return;
    if (part === "all") data = DEFAULT_DATA();
    else if (part === "mock") data.mockHistory = [];
    else {
      Object.keys(data.progress).forEach(id => {
        const p = getProgress(id);
        if (part === "ratings") Object.assign(p, { rating: null, badCount: 0, unsureCount: 0, goodCount: 0, firstAnswered: null, lastAnswered: null, totalReviews: 0, goodStreak: 0, mastered: false, ratingHistory: [] });
        if (part === "notes") p.note = "";
        if (part === "favorites") p.favorite = false;
        if (part === "essays") p.essay = "";
      });
      if (part === "ratings") data.activity = [];
    }
    saveData(); applySettings(); renderAllDashboard(); renderSettingsLists(); renderBank(); startStudyRound(); showToast("データを削除しました。", "success");
  }

  function openGlobalSearch() { dom.searchDialog.showModal(); setTimeout(() => dom.globalSearchInput.focus(), 30); renderGlobalSearch(); }
  function renderGlobalSearch() {
    const query = normalizeText(dom.globalSearchInput.value.trim()); const results = query ? QUESTIONS.filter(q => questionSearchText(q).includes(query)).slice(0, 50) : [];
    dom.globalSearchCount.textContent = query ? `${results.length}${results.length === 50 ? "+" : ""}件` : "問題文・条文・論点・模範解答を検索できます。";
    clear(dom.globalSearchResults);
    results.forEach(q => { const button = el("button", "search-result"); button.type = "button"; button.append(el("strong", "", `問${q.id}・${q.lecture}・${q.caseName}`), el("small", "", q.question)); button.addEventListener("click", () => { dom.searchDialog.close(); openQuestionInStudy(q.id); }); dom.globalSearchResults.append(button); });
  }

  function bindKeyboard() {
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") { document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close()); return; }
      if (isTypingTarget(event.target) || document.querySelector("dialog[open]")) return;
      if (event.key === "/") { event.preventDefault(); openGlobalSearch(); return; }
      if (activeView !== "study" || dom.studyCard.hidden) return;
      if (event.code === "Space") { event.preventDefault(); advanceAnswerStage(); }
      else if (event.key === "ArrowRight" || event.key === "Enter") { event.preventDefault(); nextQuestion(); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); previousQuestion(); }
      else if (event.key.toLowerCase() === "r") { event.preventDefault(); startStudyRound(); }
      else if (event.key.toLowerCase() === "f") { event.preventDefault(); toggleFavorite(); }
      else if (["1", "2", "3"].includes(event.key) && !dom.answerArea.hidden) { event.preventDefault(); setRating(currentQuestionId(), event.key === "1" ? "bad" : event.key === "2" ? "unsure" : "good", "study"); }
    });
  }

  function bindSwipe() {
    let startX = 0, startY = 0, target = null;
    dom.studyCard.addEventListener("touchstart", event => { const touch = event.changedTouches[0]; startX = touch.clientX; startY = touch.clientY; target = event.target; }, { passive: true });
    dom.studyCard.addEventListener("touchend", event => {
      if (isTypingTarget(target)) return;
      const touch = event.changedTouches[0]; const dx = touch.clientX - startX; const dy = touch.clientY - startY;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
      if (dx < 0) nextQuestion(); else previousQuestion();
    }, { passive: true });
  }

  function applyUrlState() {
    const params = new URLSearchParams(location.search);
    const qid = Number(params.get("q"));
    const set = (params.get("set") || "").split(",").map(Number).filter(id => questionById.has(id));
    const mode = params.get("mode"); const lecture = params.get("lecture"); const category = params.get("category");
    if (qid && questionById.has(qid)) { openQuestionInStudy(qid); return; }
    if (set.length) { startStudyWithIds(set, "共有問題セット"); return; }
    if (mode && ["normal", "article", "conclusion", "essay", "code", "memorize", "precedent"].includes(mode)) study.config.mode = mode;
    if (lecture && getLectures().includes(lecture)) study.config.lecture = lecture;
    if (category) study.config.category = category;
    if (params.get("important") === "1") study.config.importantOnly = true;
    if (params.get("precedent") === "1") study.config.precedentOnly = true;
    if ([...params.keys()].length) { syncStudyControlsFromConfig(); startStudyRound(); navigate("study", { preserveScroll: true }); }
  }

  function shareStudyState() {
    const url = new URL(location.href); url.search = "";
    if (study.config.mode !== "normal") url.searchParams.set("mode", study.config.mode);
    if (study.config.lecture !== ALL) url.searchParams.set("lecture", study.config.lecture);
    if (study.config.category !== ALL) url.searchParams.set("category", study.config.category);
    if (study.config.importantOnly) url.searchParams.set("important", "1");
    if (study.config.precedentOnly) url.searchParams.set("precedent", "1");
    if (study.config.customIds?.length) url.searchParams.set("set", study.config.customIds.join(","));
    shareUrl(url.toString(), "民法ⅠA 学習セット");
  }
  function shareCurrentQuestion() { const id = currentQuestionId(); if (!id) return; const url = new URL(location.href); url.search = ""; url.searchParams.set("q", String(id)); shareUrl(url.toString(), `民法ⅠA 問${id}`); }
  function shareQuestionSet(ids) { if (!ids.length) return; const url = new URL(location.href); url.search = ""; url.searchParams.set("set", ids.join(",")); shareUrl(url.toString(), "民法ⅠA 問題セット"); }

  async function shareUrl(url, title) {
    try {
      if (navigator.share && location.protocol !== "file:") await navigator.share({ title, url });
      else { await navigator.clipboard.writeText(url); showToast("共有URLをコピーしました。", "success"); }
    } catch (error) { if (error.name !== "AbortError") showToast("URLをコピーできませんでした。", "error"); }
  }

  function registerPwa() {
    window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredInstallPrompt = event; dom.installPwaButton.hidden = false; });
    window.addEventListener("appinstalled", () => { deferredInstallPrompt = null; dom.installPwaButton.hidden = true; showToast("アプリとしてインストールしました。", "success"); });
    if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register("service-worker.js").then(registration => {
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => { if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdateToast(registration); });
      });
    }).catch(error => console.warn("Service Worker登録失敗（本体機能には影響しません）", error));
  }

  async function installPwa() { if (!deferredInstallPrompt) { showPwaHelp(); return; } deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; dom.installPwaButton.hidden = true; }
  function showUpdateToast(registration) { showToast("新しいバージョンがあります。", "success", 0, { label: "更新", action: () => { registration.waiting?.postMessage({ type: "SKIP_WAITING" }); location.reload(); } }); }
  function showPwaHelp() { infoDialog("Android／Edge・Chrome：ブラウザメニューから「アプリをインストール」または「ホーム画面に追加」を選びます。\n\niPhone Safari：共有ボタン →「ホーム画面に追加」を選びます。\n\nPWAとオフライン利用はGitHub PagesなどHTTPSで公開した後に有効になります。", "ホーム画面への追加"); }
  function showHelp() { infoDialog("【学習】答えを考えてから開き、ダメ・微妙・理解したで自己評価します。「理解した」が3回連続すると習得済みになります。\n\n【模擬試験】答案を書いて提出後、模範解答と比較して自己採点します。時間制限はありません。\n\n【保存】評価・答案・メモは現在のブラウザだけに保存され、外部送信されません。PCとスマホの自動同期はないため、設定のJSONバックアップを使って移してください。ブラウザのデータ削除で記録が消える場合があります。\n\n【キー操作】Space＝答え、←→＝前後、1/2/3＝評価、F＝お気に入り、/＝検索。", "使い方・プライバシー"); }

  function populateAllSelects() {
    populateLectureSelect(dom.studyLectureSelect); populateCategorySelect(dom.studyCategorySelect, ALL);
    populateLectureSelect(dom.bankLectureSelect); populateCategorySelect(dom.bankCategorySelect, ALL);
    populateCustomSetSelect(dom.mockCustomSetSelect);
    syncStudyControlsFromConfig();
  }
  function populateLectureSelect(select) { if (!select) return; const current = select.value || ALL; clear(select); select.append(option(ALL, "すべての授業回")); getLectures().forEach(lecture => select.append(option(lecture, lecture))); select.value = [...select.options].some(o => o.value === current) ? current : ALL; }
  function populateCategorySelect(select, lecture = ALL, preferred = ALL) { if (!select) return; const pool = lecture === ALL ? QUESTIONS : QUESTIONS.filter(q => q.lecture === lecture); const categories = [...new Set(pool.map(q => q.category).filter(Boolean))]; clear(select); select.append(option(ALL, "すべての分野")); categories.forEach(category => select.append(option(category, category))); select.value = categories.includes(preferred) ? preferred : ALL; }
  function populateCustomSetSelect(select, preferred = "") { if (!select) return; clear(select); select.append(option("", "使用しない")); data.customSets.forEach(set => select.append(option(set.id, `${set.name}（${set.questionIds.length}問）`))); if ([...select.options].some(o => o.value === preferred)) select.value = preferred; }
  function getLectures() { return [...new Set(QUESTIONS.map(q => q.lecture).filter(Boolean))].sort((a, b) => lectureNumber(a) - lectureNumber(b)); }

  function bindDialogs() {
    qs("globalSearchButton").addEventListener("click", openGlobalSearch);
    qs("closeSearchDialog").addEventListener("click", () => dom.searchDialog.close());
    dom.globalSearchInput.addEventListener("input", debounce(renderGlobalSearch, 150));
  }

  function showToast(message, tone = "", duration = 3600, action = null) {
    if (!dom.toastRegion) return;
    const toast = el("div", `toast${tone ? ` toast--${tone}` : ""}`); toast.setAttribute("role", tone === "error" ? "alert" : "status");
    toast.append(el("span", "", message));
    if (action) { const button = el("button", "", action.label); button.type = "button"; button.addEventListener("click", () => { action.action(); toast.remove(); }); toast.append(button); }
    dom.toastRegion.append(toast);
    if (duration > 0) setTimeout(() => toast.remove(), duration);
  }

  function clearDialog() { clear(dom.dialogBody); clear(dom.dialogActions); }
  function confirmDialog(message, title = "確認") { return choiceDialog(message, title, [{ value: "yes", label: "実行する", className: "button--primary" }, { value: "no", label: "キャンセル", className: "button--ghost" }]).then(v => v === "yes"); }
  function infoDialog(message, title = "お知らせ") { return choiceDialog(message, title, [{ value: "ok", label: "閉じる", className: "button--primary" }]); }
  function promptDialog(message, title, defaultValue = "") {
    return new Promise(resolve => {
      clearDialog(); dom.dialogTitle.textContent = title; dom.dialogBody.append(el("p", "", message));
      const input = document.createElement("input"); input.type = "text"; input.value = defaultValue; input.maxLength = 80; input.className = "dialog-input"; input.style.cssText = "width:100%;padding:10px;border:1px solid var(--line-strong);border-radius:9px;background:var(--surface-2);"; dom.dialogBody.append(input);
      const cancel = el("button", "button button--ghost", "キャンセル"); cancel.type = "button"; const ok = el("button", "button button--primary", "保存"); ok.type = "button";
      let settled = false;
      const finish = value => { if (settled) return; settled = true; if (dom.appDialog.open) dom.appDialog.close(); resolve(value); };
      const onClose = () => { dom.appDialog.removeEventListener("close", onClose); finish(null); };
      dom.appDialog.addEventListener("close", onClose, { once: true });
      cancel.addEventListener("click", () => finish(null)); ok.addEventListener("click", () => finish(input.value.trim() || null)); input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); finish(input.value.trim() || null); } });
      dom.dialogActions.append(cancel, ok); dom.appDialog.showModal(); setTimeout(() => { input.focus(); input.select(); }, 30);
    });
  }
  function choiceDialog(message, title, actions) {
    return new Promise(resolve => {
      clearDialog(); dom.dialogTitle.textContent = title; const p = el("p"); p.style.whiteSpace = "pre-wrap"; p.textContent = message; dom.dialogBody.append(p);
      actions.forEach(action => { const button = el("button", `button ${action.className || "button--ghost"}`, action.label); button.type = "button"; button.addEventListener("click", () => { dom.appDialog.close(); resolve(action.value); }, { once: true }); dom.dialogActions.append(button); });
      const onClose = () => { dom.appDialog.removeEventListener("close", onClose); resolve(actions.at(-1)?.value || null); };
      dom.appDialog.addEventListener("close", onClose, { once: true }); dom.appDialog.showModal();
    });
  }

  function el(tag, className = "", text = null) { const node = document.createElement(tag); if (className) node.className = className; if (text !== null && text !== undefined) node.textContent = String(text); return node; }
  function clear(node) { if (node) node.replaceChildren(); }
  function option(value, label) { const o = document.createElement("option"); o.value = value; o.textContent = label; return o; }
  function addMeta(container, text, className = "") { if (!text) return; container.append(el("span", `meta-chip${className ? ` ${className}` : ""}`, text)); }
  function makeAnswerSection(title, text, tone, articleUrl = "") {
    const section = el("section", `answer-section answer-section--${tone}`);
    section.append(el("h3", "", title), el("div", "answer-text", text || "登録なし"));
    const url = tone === "article" ? validHttpUrl(articleUrl) : null;
    if (url) {
      const link = el("a", "article-link", "条文ページを新しいタブで開く ↗");
      link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer"; section.append(link);
    }
    return section;
  }
  function fisherYates(items) { const a = items.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function debounce(fn, delay) { let timer; return function (...args) { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, args), delay); }; }
  function normalizeText(value) { return String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, ""); }
  function questionSearchText(q) { return normalizeText([q.id, q.lecture, q.caseName, q.category, q.question, q.article, q.issue, q.answer, q.codeGuide, q.memorize].join(" ")); }
  function truncate(text, length) { const value = String(text || ""); return value.length > length ? `${value.slice(0, length)}…` : value; }
  function isImportant(q) { return String(q.memorize || "").includes("★"); }
  function isPrecedent(q) { return isImportant(q) || String(q.issue || "").includes("判例") || String(q.caseName || "").includes("事件") || String(q.answer || "").includes("判例"); }
  function lectureNumber(lecture) { const m = String(lecture || "").match(/第(\d+)回/); return m ? Number(m[1]) : 999; }
  function memorizeType(q) {
    const text = String(q.memorize || "");
    if (isImportant(q)) return "important";
    if (/判例|事件/.test(text)) return "precedent";
    if (/対比/.test(text)) return "contrast";
    if (/暗記不要/.test(text)) return "no-memorize";
    if (/\d/.test(text)) return "number";
    return "other";
  }
  function matchesMemorizeType(q, filter) {
    if (!filter || filter === ALL) return true;
    if (filter === "number") return /\d/.test(String(q.memorize || ""));
    if (filter === "precedent") return /判例|事件/.test(String(q.memorize || ""));
    if (filter === "contrast") return /対比/.test(String(q.memorize || ""));
    if (filter === "no-memorize") return /暗記不要/.test(String(q.memorize || ""));
    if (filter === "important") return isImportant(q);
    return memorizeType(q) === "other";
  }
  function startOfWeek(ts) {
    const d = new Date(ts); d.setHours(0, 0, 0, 0);
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return d.getTime();
  }
  function calculateStudyStreak() {
    const days = new Set(data.activity.map(item => dateKey(item.ts)));
    if (!days.size) return 0;
    const cursor = new Date(); cursor.setHours(0, 0, 0, 0);
    if (!days.has(dateKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (days.has(dateKey(cursor.getTime()))) { streak++; cursor.setDate(cursor.getDate() - 1); }
    return streak;
  }

  function ratingLabel(rating) { return ({ bad: "ダメ", unsure: "微妙", good: "理解した" })[rating] || "未評価"; }
  function ratingFilterLabel(filter) { return ({ unanswered: "未回答", bad: "ダメ", unsure: "微妙", weak: "ダメ＋微妙", good: "理解した", mastered: "習得済み", unmastered: "未習得" })[filter] || "すべて"; }
  function modeLabel(mode) { return ({ normal: "通常演習", article: "条文当て", conclusion: "結論を考える", essay: "フル答案", code: "六法検索", memorize: "暗記カード", precedent: "判例問題" })[mode] || "学習"; }
  function mockSourceLabel(source) { return ({ all: "全問題", bad: "ダメだけ", unsure: "微妙だけ", weak: "ダメ＋微妙", unanswered: "未回答", favorite: "お気に入り", important: "★重要", precedent: "判例問題", current: "現在の学習条件", selected: "選択問題" })[source] || "模擬試験"; }
  function customSetName(id) { return data.customSets.find(s => s.id === id)?.name || "問題セット"; }
  function themeLabel(theme) { return ({ system: "端末設定に合わせる", light: "ライト", dark: "ダーク" })[theme] || theme; }
  function validHttpUrl(value) {
    if (!value) return null;
    try { const url = new URL(String(value), location.href); return ["http:", "https:"].includes(url.protocol) ? url.href : null; }
    catch (_) { return null; }
  }
  function isTypingTarget(target) { return target && (target.matches?.("input, textarea, select, [contenteditable='true']") || target.closest?.("input, textarea, select, [contenteditable='true']")); }
  function prefersReducedMotion() { return matchMedia("(prefers-reduced-motion: reduce)").matches; }
  function formatTime(ts) { return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(new Date(ts)); }
  function formatDate(ts) { return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts)); }
  function formatDateTime(ts) { return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(ts)); }
  function dateKey(ts) { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
  function formatRelative(ts) { const diff = Date.now() - ts; if (diff < 60000) return "たった今"; if (diff < 3600000) return `${Math.floor(diff / 60000)}分前`; if (diff < 86400000) return `${Math.floor(diff / 3600000)}時間前`; return `${Math.floor(diff / 86400000)}日前`; }

  // 今日・今週・連続学習日数はダッシュボード補助用。必要時にコンソールから参照可能。
  window.lawQuizDebug = {
    version: APP_VERSION,
    questionCount: QUESTIONS.length,
    stats,
    exportData,
    getData: () => structuredClone(data)
  };
})();
