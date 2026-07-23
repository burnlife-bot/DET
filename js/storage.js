// localStorage 래퍼 - 학습 진도, 오답노트, 박스 레벨 관리
window.DET = window.DET || {};

(function () {
  const { todayStr, applyAnswer } = window.DET.srs;
  const STORAGE_KEY = "det_vocab_progress_v1";
  let onChangeHandler = null;

  function setOnChange(fn) {
    onChangeHandler = fn;
  }

  function defaultState() {
    return {
      words: {}, // id -> { box, nextReview, correctStreak, wrongCount, learned, inMistakeNote, lastSeen }
      meta: {
        nextNewWordIndex: 0,
        streakDays: 0,
        lastStudyDate: null,
        updatedAt: 0,
      },
    };
  }

  function defaultWordProgress() {
    return {
      box: 0,
      nextReview: null,
      correctStreak: 0,
      wrongCount: 0,
      learned: false,
      inMistakeNote: false,
      lastSeen: null,
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return {
        words: parsed.words || {},
        meta: { ...defaultState().meta, ...(parsed.meta || {}) },
      };
    } catch (e) {
      console.error("상태 로드 실패, 초기화합니다.", e);
      return defaultState();
    }
  }

  function saveState(state) {
    state.meta.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (onChangeHandler) onChangeHandler(state);
  }

  // 클라우드에서 받아온 상태를 그대로 로컬에 반영 (updatedAt 재기록 없이)
  function adoptState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getWordProgress(state, id) {
    return state.words[id] || defaultWordProgress();
  }

  // 오늘 첫 접속이면 스트릭 갱신
  function touchStreak(state) {
    const today = todayStr();
    const { lastStudyDate, streakDays } = state.meta;
    if (lastStudyDate === today) return state;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = todayStr(yesterday);
    const newStreak = lastStudyDate === yesterdayStr ? streakDays + 1 : 1;
    state.meta.streakDays = newStreak;
    state.meta.lastStudyDate = today;
    saveState(state);
    return state;
  }

  // 다음 신규 학습 배치(기본 10개) 가져오기
  function getNextNewBatch(state, allWords, batchSize = 10) {
    const start = state.meta.nextNewWordIndex;
    return allWords.slice(start, start + batchSize);
  }

  // 배치 학습 완료 처리: 단어들을 box 1, 즉시 복습 대상으로 등록하고 포인터 이동
  function commitLearnedBatch(state, wordIds) {
    const today = todayStr();
    wordIds.forEach((id) => {
      const existing = state.words[id] || defaultWordProgress();
      state.words[id] = {
        ...existing,
        learned: true,
        box: 1,
        nextReview: today,
        lastSeen: today,
      };
    });
    state.meta.nextNewWordIndex += wordIds.length;
    saveState(state);
    return state;
  }

  // 퀴즈 채점 결과 반영
  function recordAnswer(state, id, correct) {
    const existing = state.words[id] || defaultWordProgress();
    state.words[id] = applyAnswer({ ...existing, learned: true }, correct);
    saveState(state);
    return state;
  }

  // 오늘 복습해야 할 학습 완료 단어 id 목록
  function getDueWordIds(state, referenceStr = todayStr()) {
    return Object.entries(state.words)
      .filter(([, p]) => p.learned && p.nextReview && p.nextReview <= referenceStr)
      .map(([id]) => id);
  }

  // 오답노트에 남아있는 단어 id 목록
  function getMistakeNoteWordIds(state) {
    return Object.entries(state.words)
      .filter(([, p]) => p.inMistakeNote)
      .map(([id]) => id);
  }

  function getStats(state, totalWordCount) {
    const learnedCount = Object.values(state.words).filter((p) => p.learned).length;
    const dueCount = getDueWordIds(state).length;
    const mistakeCount = getMistakeNoteWordIds(state).length;
    return {
      totalWordCount,
      learnedCount,
      dueCount,
      mistakeCount,
      streakDays: state.meta.streakDays,
      remainingNewCount: Math.max(totalWordCount - state.meta.nextNewWordIndex, 0),
    };
  }

  window.DET.storage = {
    loadState,
    saveState,
    adoptState,
    setOnChange,
    getWordProgress,
    touchStreak,
    getNextNewBatch,
    commitLearnedBatch,
    recordAnswer,
    getDueWordIds,
    getMistakeNoteWordIds,
    getStats,
  };
})();
