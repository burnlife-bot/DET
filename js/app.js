// 뷰 라우팅 & 전체 흐름 제어
(function () {
  const {
    loadState,
    isCurrentDataset,
    adoptState,
    setOnChange,
    getNextNewBatch,
    commitLearnedBatch,
    recordAnswer,
    getDueWordIds,
    getMistakeNoteWordIds,
    touchStreak,
  } = window.DET.storage;
  const { sortReviewQueue } = window.DET.srs;
  const { renderDashboard } = window.DET.dashboard;
  const { createQuestion, highlightWord, escapeHtml } = window.DET.quiz;
  const { speak, isTTSSupported } = window.DET.tts;
  const sync = window.DET.sync;

  const REVIEW_SESSION_CAP = 20;
  const PUSH_DEBOUNCE_MS = 1500;

  let ALL_WORDS = [];
  let WORD_BY_ID = new Map();
  let state = null;
  let session = null;
  let pushTimer = null;

  async function init() {
    ALL_WORDS = window.DET_WORDS || [];
    WORD_BY_ID = new Map(ALL_WORDS.map((w) => [w.id, w]));

    setOnChange(schedulePush);

    state = loadState();
    state = touchStreak(state);

    if (!isTTSSupported()) {
      document.getElementById("learn-tts-word").style.display = "none";
      document.getElementById("learn-tts-example").style.display = "none";
    }

    await trySyncOnLoad();

    renderDashboard(state, ALL_WORDS.length);
    wireEvents();
    showView("dashboard");
  }

  /* ---------- 기기 간 동기화 ---------- */

  function schedulePush(s) {
    const code = sync.getSyncCode();
    if (!code) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      sync.pushState(code, s).catch((e) => console.warn("클라우드 업로드 실패", e));
    }, PUSH_DEBOUNCE_MS);
  }

  async function trySyncOnLoad() {
    const code = sync.getSyncCode();
    if (!code) return;
    try {
      const remote = await sync.pullState(code);
      if (isCurrentDataset(remote) && (!state.meta.updatedAt || remote.meta.updatedAt > state.meta.updatedAt)) {
        state = remote;
        adoptState(state);
      } else {
        schedulePush(state);
      }
    } catch (e) {
      console.warn("동기화 실패, 로컬 데이터로 계속합니다.", e);
    }
  }

  function renderSyncView() {
    const code = sync.getSyncCode();
    const statusEl = document.getElementById("sync-status");
    const displayWrap = document.getElementById("sync-code-display");
    const codeText = document.getElementById("sync-code-text");
    const disconnectBtn = document.getElementById("btn-disconnect-sync");
    if (code) {
      statusEl.textContent = "연결됨 — 이 코드를 다른 기기에도 입력하면 진도가 함께 동기화됩니다";
      displayWrap.classList.remove("hidden");
      codeText.textContent = code;
      disconnectBtn.classList.remove("hidden");
    } else {
      statusEl.textContent = "연결 안 됨 — 이 기기에만 진도가 저장됩니다";
      displayWrap.classList.add("hidden");
      disconnectBtn.classList.add("hidden");
    }
  }

  async function handleCreateSyncCode() {
    const tokenInput = document.getElementById("sync-token-input");
    const token = tokenInput.value.trim();
    if (!token) {
      alert("먼저 GitHub 토큰을 입력해주세요.");
      return;
    }
    const btn = document.getElementById("btn-create-sync-code");
    btn.disabled = true;
    btn.textContent = "생성 중...";
    try {
      const code = await sync.createSyncCode(token, state);
      sync.setSyncCode(code);
      tokenInput.value = "";
      renderSyncView();
      alert("새 동기화 코드가 생성되고 현재 진도가 업로드되었습니다. 다른 기기에서 이 코드를 입력하세요.");
    } catch (e) {
      alert("동기화 코드 생성에 실패했습니다: " + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "새 동기화 코드 만들기";
    }
  }

  async function handleConnectSyncCode() {
    const input = document.getElementById("sync-code-input");
    const code = input.value.trim();
    if (!code) return;
    const ok = confirm("이 기기의 학습 기록을 해당 코드의 클라우드 기록으로 교체합니다. 계속할까요?");
    if (!ok) return;

    const btn = document.getElementById("btn-connect-sync-code");
    btn.disabled = true;
    btn.textContent = "연결 중...";
    try {
      const remote = await sync.pullState(code);
      sync.setSyncCode(code);
      if (isCurrentDataset(remote)) {
        state = remote;
        adoptState(state);
      } else {
        await sync.pushState(code, state);
      }
      input.value = "";
      renderSyncView();
      renderDashboard(state, ALL_WORDS.length);
      alert("동기화 연결이 완료되었습니다.");
    } catch (e) {
      alert("연결에 실패했습니다: " + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "코드로 연결하기";
    }
  }

  function handleCopySyncCode() {
    const code = sync.getSyncCode();
    if (!code || !navigator.clipboard) return;
    navigator.clipboard.writeText(code).then(() => {
      const btn = document.getElementById("btn-copy-sync-code");
      const original = btn.textContent;
      btn.textContent = "복사됨!";
      setTimeout(() => (btn.textContent = original), 1500);
    });
  }

  function handleDisconnectSync() {
    const ok = confirm("동기화를 해제하면 이 기기는 더 이상 클라우드와 자동으로 동기화되지 않습니다. 계속할까요?");
    if (!ok) return;
    sync.clearSyncCode();
    renderSyncView();
  }

  function showView(name) {
    document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
    document.getElementById(`view-${name}`).classList.remove("hidden");
  }

  function updateProgress(prefix, index, total) {
    document.getElementById(`${prefix}-progress-bar`).style.width = `${(index / total) * 100}%`;
    document.getElementById(`${prefix}-progress-text`).textContent = `${index + 1} / ${total}`;
  }

  /* ---------- 신규 단어 학습 ---------- */

  function startLearn() {
    const batch = getNextNewBatch(state, ALL_WORDS, 10);
    if (batch.length === 0) return;
    session = { mode: "learn", words: batch, index: 0, results: [] };
    renderLearnCard();
    showView("learn");
  }

  function renderLearnCard() {
    const word = session.words[session.index];
    document.getElementById("learn-word").textContent = word.word;
    document.getElementById("learn-pos").textContent = [word.pron, word.pos].filter(Boolean).join("  ");
    document.getElementById("learn-meaning").textContent = word.meaning_kr;

    const noteEl = document.getElementById("learn-note");
    noteEl.textContent = word.note || "";
    noteEl.classList.toggle("hidden", !word.note);

    const hasExample = !!word.example_en;
    document.getElementById("learn-example-box").classList.toggle("hidden", !hasExample);
    if (hasExample) document.getElementById("learn-example").innerHTML = highlightWord(word.example_en, word.word);
    updateProgress("learn", session.index, session.words.length);
    document.getElementById("btn-learn-next").textContent =
      session.index === session.words.length - 1 ? "테스트 시작하기" : "다음 단어";
  }

  function handleLearnNext() {
    if (session.index < session.words.length - 1) {
      session.index++;
      renderLearnCard();
    } else {
      commitLearnedBatch(state, session.words.map((w) => w.id));
      startQuiz("post-learn", session.words);
    }
  }

  /* ---------- 퀴즈 (학습직후 / 오늘복습 / 오답노트 공용) ---------- */

  function startReview() {
    const dueIds = getDueWordIds(state);
    if (dueIds.length === 0) return;
    const entries = dueIds.map((id) => ({ id, progress: state.words[id] }));
    const words = sortReviewQueue(entries)
      .slice(0, REVIEW_SESSION_CAP)
      .map((e) => WORD_BY_ID.get(e.id))
      .filter(Boolean);
    startQuiz("review", words);
  }

  function startMistakes() {
    const ids = getMistakeNoteWordIds(state);
    if (ids.length === 0) return;
    const entries = ids.map((id) => ({ id, progress: state.words[id] }));
    const words = sortReviewQueue(entries)
      .slice(0, REVIEW_SESSION_CAP)
      .map((e) => WORD_BY_ID.get(e.id))
      .filter(Boolean);
    startQuiz("mistake", words);
  }

  function startQuiz(mode, words) {
    session = { mode, words, index: 0, results: [], currentQuestion: null };
    renderQuizQuestion();
    showView("quiz");
  }

  function renderQuizQuestion() {
    const word = session.words[session.index];
    const q = createQuestion(word, ALL_WORDS);
    session.currentQuestion = q;
    document.getElementById("quiz-mode-label").textContent = q.modeLabel;

    const card = document.getElementById("quiz-card");
    card.dataset.answered = "false";
    q.render(card);

    document.getElementById("quiz-feedback").classList.add("hidden");
    document.getElementById("btn-quiz-check").classList.remove("hidden");
    document.getElementById("btn-quiz-next").classList.add("hidden");
    updateProgress("quiz", session.index, session.words.length);
  }

  function handleQuizCheck() {
    const word = session.words[session.index];
    const card = document.getElementById("quiz-card");
    const result = session.currentQuestion.check(card);

    session.results.push({ id: word.id, correct: result.correct });
    state = recordAnswer(state, word.id, result.correct);

    const fb = document.getElementById("quiz-feedback");
    fb.classList.remove("hidden", "correct", "incorrect");
    fb.classList.add(result.correct ? "correct" : "incorrect");
    const extra = word.example_en ? highlightWord(word.example_en, word.word) : escapeHtml(word.note || "");
    const extraHtml = extra ? `<span class="fb-example">${extra}</span>` : "";
    fb.innerHTML = result.correct
      ? `정답입니다! ${extraHtml}`
      : `오답입니다. 정답: <b>${escapeHtml(result.correctText)}</b>${extraHtml}`;

    if (word.example_en && isTTSSupported()) {
      const ttsBtn = document.createElement("button");
      ttsBtn.type = "button";
      ttsBtn.className = "tts-btn small";
      ttsBtn.textContent = "🔊 예문 듣기";
      ttsBtn.addEventListener("click", () => speak(word.example_en));
      fb.appendChild(ttsBtn);
    }

    document.getElementById("btn-quiz-check").classList.add("hidden");
    const nextBtn = document.getElementById("btn-quiz-next");
    nextBtn.classList.remove("hidden");
    nextBtn.textContent = session.index === session.words.length - 1 ? "결과 보기" : "다음 문제";
  }

  function handleQuizNext() {
    session.index++;
    if (session.index >= session.words.length) {
      finishSession();
    } else {
      renderQuizQuestion();
    }
  }

  function finishSession() {
    const correct = session.results.filter((r) => r.correct).length;
    const wrong = session.results.filter((r) => !r.correct);

    const titleMap = {
      "post-learn": "학습 & 테스트 완료!",
      review: "오늘의 복습 완료!",
      mistake: "오답노트 복습 완료!",
    };
    document.getElementById("summary-title").textContent = titleMap[session.mode] || "완료!";
    document.getElementById("summary-correct").textContent = correct;
    document.getElementById("summary-wrong").textContent = wrong.length;

    const list = document.getElementById("summary-wrong-list");
    list.innerHTML =
      wrong.length === 0
        ? "<li>틀린 단어가 없습니다. 완벽해요! 🎉</li>"
        : wrong
            .map((r) => {
              const w = WORD_BY_ID.get(r.id);
              return `<li><b>${w.word}</b> — ${w.meaning_kr}</li>`;
            })
            .join("");

    showView("summary");
  }

  function goHome() {
    renderDashboard(state, ALL_WORDS.length);
    showView("dashboard");
  }

  /* ---------- 이벤트 바인딩 ---------- */

  function wireEvents() {
    document.getElementById("btn-start-learn").addEventListener("click", startLearn);
    document.getElementById("btn-start-review").addEventListener("click", startReview);
    document.getElementById("btn-start-mistakes").addEventListener("click", startMistakes);

    document.getElementById("btn-learn-next").addEventListener("click", handleLearnNext);
    document.getElementById("learn-tts-word").addEventListener("click", () => {
      speak(session.words[session.index].word);
    });
    document.getElementById("learn-tts-example").addEventListener("click", () => {
      speak(session.words[session.index].example_en);
    });

    document.getElementById("btn-quiz-check").addEventListener("click", handleQuizCheck);
    document.getElementById("btn-quiz-next").addEventListener("click", handleQuizNext);

    document.getElementById("btn-summary-home").addEventListener("click", goHome);

    document.getElementById("btn-open-sync").addEventListener("click", () => {
      renderSyncView();
      showView("sync");
    });
    document.getElementById("btn-sync-back").addEventListener("click", () => {
      renderDashboard(state, ALL_WORDS.length);
      showView("dashboard");
    });
    document.getElementById("btn-create-sync-code").addEventListener("click", handleCreateSyncCode);
    document.getElementById("btn-connect-sync-code").addEventListener("click", handleConnectSyncCode);
    document.getElementById("btn-copy-sync-code").addEventListener("click", handleCopySyncCode);
    document.getElementById("btn-disconnect-sync").addEventListener("click", handleDisconnectSync);
  }

  init();
})();
