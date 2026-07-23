// 라이트너 박스 스케줄링 로직
window.DET = window.DET || {};

(function () {
  const BOX_INTERVALS_DAYS = [0, 1, 3, 7, 14];
  const MAX_BOX = BOX_INTERVALS_DAYS.length; // 5
  const MISTAKE_NOTE_GRADUATE_STREAK = 3; // 연속 정답 n회 시 오답노트 졸업

  function todayStr(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }

  function addDays(dateStr, days) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + days);
    return todayStr(d);
  }

  function isDue(nextReviewStr, referenceStr = todayStr()) {
    return nextReviewStr <= referenceStr;
  }

  // 정답/오답에 따른 다음 박스 레벨과 다음 복습일 계산
  function applyAnswer(progress, correct, referenceStr = todayStr()) {
    const next = { ...progress };
    if (correct) {
      next.box = Math.min(next.box + 1, MAX_BOX);
      next.correctStreak = (next.correctStreak || 0) + 1;
      next.nextReview = addDays(referenceStr, BOX_INTERVALS_DAYS[next.box - 1]);
      if (next.inMistakeNote && next.correctStreak >= MISTAKE_NOTE_GRADUATE_STREAK) {
        next.inMistakeNote = false;
      }
    } else {
      next.box = 1;
      next.correctStreak = 0;
      next.wrongCount = (next.wrongCount || 0) + 1;
      next.inMistakeNote = true;
      next.nextReview = referenceStr; // 즉시 재복습 대상
    }
    next.lastSeen = referenceStr;
    return next;
  }

  // 복습 대기열 정렬: 박스 레벨 낮은 순 -> 오답 횟수 많은 순
  function sortReviewQueue(entries) {
    return [...entries].sort((a, b) => {
      if (a.progress.box !== b.progress.box) return a.progress.box - b.progress.box;
      return (b.progress.wrongCount || 0) - (a.progress.wrongCount || 0);
    });
  }

  window.DET.srs = {
    BOX_INTERVALS_DAYS,
    MAX_BOX,
    MISTAKE_NOTE_GRADUATE_STREAK,
    todayStr,
    addDays,
    isDue,
    applyAnswer,
    sortReviewQueue,
  };
})();
