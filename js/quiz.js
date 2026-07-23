// 문제 유형 생성 및 채점 로직
window.DET = window.DET || {};

(function () {
  const { speak, isTTSSupported } = window.DET.tts;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function sampleDistractors(pool, correctWord, count, keyFn, preferFn) {
    const seen = new Set([keyFn(correctWord)]);
    const preferred = preferFn ? shuffle(pool.filter((w) => w.id !== correctWord.id && preferFn(w))) : [];
    const rest = shuffle(pool.filter((w) => w.id !== correctWord.id));
    const result = [];
    for (const c of [...preferred, ...rest]) {
      const key = keyFn(c);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(c);
      if (result.length === count) break;
    }
    return result;
  }

  function highlightWord(sentence, word) {
    const re = new RegExp(`\\b(${escapeRegExp(word)})\\b`, "i");
    return escapeHtml(sentence).replace(re, "<b>$1</b>");
  }

  function wireOptionClicks(container, onSelect) {
    container.querySelectorAll(".quiz-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (container.dataset.answered === "true") return;
        container.querySelectorAll(".quiz-option").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        onSelect(btn);
      });
    });
  }

  function wireEnterSubmit(input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("btn-quiz-check").click();
      }
    });
  }

  /* ---------- 유형 1: 객관식 뜻 고르기 ---------- */
  function buildMcMeaning(word, pool) {
    const distractors = sampleDistractors(pool, word, 3, (w) => w.meaning_kr, (w) => w.category === word.category);
    const options = shuffle([word.meaning_kr, ...distractors.map((d) => d.meaning_kr)]);
    let selectedEl = null;
    return {
      type: "mc-meaning",
      modeLabel: "🔤 객관식 · 뜻 고르기",
      render(container) {
        container.innerHTML = `
          <p class="quiz-question">${escapeHtml(word.word)}</p>
          <p class="quiz-sub">${escapeHtml(word.pos)} · 알맞은 뜻을 고르세요</p>
          <div class="quiz-options">
            ${options.map((opt) => `<button type="button" class="quiz-option" data-value="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`).join("")}
          </div>`;
        wireOptionClicks(container, (btn) => (selectedEl = btn));
      },
      check(container) {
        container.dataset.answered = "true";
        const correct = !!selectedEl && selectedEl.dataset.value === word.meaning_kr;
        container.querySelectorAll(".quiz-option").forEach((btn) => {
          if (btn.dataset.value === word.meaning_kr) btn.classList.add("correct");
          else if (btn === selectedEl) btn.classList.add("incorrect");
        });
        return { correct, correctText: `${word.word} = ${word.meaning_kr}` };
      },
    };
  }

  /* ---------- 유형 2: 스펠링 입력 ---------- */
  function buildSpelling(word) {
    return {
      type: "spelling",
      modeLabel: "✍️ 스펠링 · 영어 단어 입력",
      render(container) {
        container.innerHTML = `
          <p class="quiz-question">${escapeHtml(word.meaning_kr)}</p>
          <p class="quiz-sub">${escapeHtml(word.pos)} · 알맞은 영어 단어를 입력하세요</p>
          <input type="text" class="quiz-input" id="quiz-text-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="영어 단어 입력" />`;
        const input = container.querySelector("#quiz-text-input");
        input.focus();
        wireEnterSubmit(input);
      },
      check(container) {
        container.dataset.answered = "true";
        const input = container.querySelector("#quiz-text-input");
        const val = (input.value || "").trim().toLowerCase();
        const correct = val === word.word.toLowerCase();
        input.disabled = true;
        input.classList.add(correct ? "correct" : "incorrect");
        if (!correct) input.value = word.word;
        return { correct, correctText: word.word };
      },
    };
  }

  /* ---------- 유형 3: 예문 빈칸 채우기 ---------- */
  function buildFillBlank(word, pool) {
    const distractors = sampleDistractors(pool, word, 3, (w) => w.word, (w) => w.pos === word.pos);
    const options = shuffle([word.word, ...distractors.map((d) => d.word)]);
    const re = new RegExp(`\\b${escapeRegExp(word.word)}\\b`, "i");
    const sentenceHtml = re.test(word.example_en)
      ? escapeHtml(word.example_en).replace(new RegExp(`\\b${escapeRegExp(word.word)}\\b`, "i"), '<span class="blank">_____</span>')
      : `${escapeHtml(word.example_en)} <span class="blank">_____</span>`;
    let selectedEl = null;
    return {
      type: "fill-blank",
      modeLabel: "📝 빈칸 채우기",
      render(container) {
        container.innerHTML = `
          <p class="quiz-question">${sentenceHtml}</p>
          <p class="quiz-sub">빈칸에 들어갈 단어를 고르세요</p>
          <div class="quiz-options">
            ${options.map((opt) => `<button type="button" class="quiz-option" data-value="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`).join("")}
          </div>`;
        wireOptionClicks(container, (btn) => (selectedEl = btn));
      },
      check(container) {
        container.dataset.answered = "true";
        const correct = !!selectedEl && selectedEl.dataset.value.toLowerCase() === word.word.toLowerCase();
        container.querySelectorAll(".quiz-option").forEach((btn) => {
          if (btn.dataset.value.toLowerCase() === word.word.toLowerCase()) btn.classList.add("correct");
          else if (btn === selectedEl) btn.classList.add("incorrect");
        });
        return { correct, correctText: `${word.word} = ${word.meaning_kr}` };
      },
    };
  }

  /* ---------- 유형 4: 듣기 → 뜻 고르기 ---------- */
  function buildListeningChoice(word, pool) {
    const distractors = sampleDistractors(pool, word, 3, (w) => w.meaning_kr, (w) => w.category === word.category);
    const options = shuffle([word.meaning_kr, ...distractors.map((d) => d.meaning_kr)]);
    let selectedEl = null;
    return {
      type: "listening-choice",
      modeLabel: "🎧 듣기 · 뜻 고르기",
      render(container) {
        container.innerHTML = `
          <p class="quiz-sub">발음을 듣고 알맞은 뜻을 고르세요</p>
          <button type="button" class="tts-btn small" id="quiz-replay">🔊 다시 듣기</button>
          <div class="quiz-options" style="margin-top:14px">
            ${options.map((opt) => `<button type="button" class="quiz-option" data-value="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`).join("")}
          </div>`;
        container.querySelector("#quiz-replay").addEventListener("click", () => speak(word.word));
        wireOptionClicks(container, (btn) => (selectedEl = btn));
        if (isTTSSupported()) speak(word.word);
      },
      check(container) {
        container.dataset.answered = "true";
        const correct = !!selectedEl && selectedEl.dataset.value === word.meaning_kr;
        container.querySelectorAll(".quiz-option").forEach((btn) => {
          if (btn.dataset.value === word.meaning_kr) btn.classList.add("correct");
          else if (btn === selectedEl) btn.classList.add("incorrect");
        });
        return { correct, correctText: `${word.word} = ${word.meaning_kr}` };
      },
    };
  }

  /* ---------- 유형 5: 듣기 → 스펠링 입력 ---------- */
  function buildListeningSpelling(word) {
    return {
      type: "listening-spelling",
      modeLabel: "🎧 듣기 · 철자 입력",
      render(container) {
        container.innerHTML = `
          <p class="quiz-sub">발음을 듣고 철자를 입력하세요</p>
          <button type="button" class="tts-btn small" id="quiz-replay">🔊 다시 듣기</button>
          <input type="text" class="quiz-input" id="quiz-text-input" style="margin-top:14px" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="들은 단어 입력" />`;
        container.querySelector("#quiz-replay").addEventListener("click", () => speak(word.word));
        const input = container.querySelector("#quiz-text-input");
        input.focus();
        wireEnterSubmit(input);
        if (isTTSSupported()) speak(word.word);
      },
      check(container) {
        container.dataset.answered = "true";
        const input = container.querySelector("#quiz-text-input");
        const val = (input.value || "").trim().toLowerCase();
        const correct = val === word.word.toLowerCase();
        input.disabled = true;
        input.classList.add(correct ? "correct" : "incorrect");
        if (!correct) input.value = word.word;
        return { correct, correctText: word.word };
      },
    };
  }

  function createQuestion(word, allWords) {
    const types = ["mc-meaning", "spelling", "fill-blank"];
    if (isTTSSupported()) types.push("listening-choice", "listening-spelling");
    const type = types[Math.floor(Math.random() * types.length)];
    switch (type) {
      case "spelling":
        return buildSpelling(word);
      case "fill-blank":
        return buildFillBlank(word, allWords);
      case "listening-choice":
        return buildListeningChoice(word, allWords);
      case "listening-spelling":
        return buildListeningSpelling(word);
      default:
        return buildMcMeaning(word, allWords);
    }
  }

  window.DET.quiz = { createQuestion, highlightWord };
})();
