// 대시보드 통계 렌더링
window.DET = window.DET || {};

(function () {
  const { getStats } = window.DET.storage;

  function renderDashboard(state, totalWordCount) {
    const stats = getStats(state, totalWordCount);

    document.getElementById("stat-progress").textContent = `${stats.learnedCount} / ${stats.totalWordCount}`;
    document.getElementById("stat-due").textContent = stats.dueCount;
    document.getElementById("stat-mistake").textContent = stats.mistakeCount;
    document.getElementById("stat-streak").textContent = `${stats.streakDays}일`;
    document.getElementById("streak-badge").textContent = `🔥 ${stats.streakDays}일 연속`;

    const learnBtn = document.getElementById("btn-start-learn");
    const reviewBtn = document.getElementById("btn-start-review");
    const mistakeBtn = document.getElementById("btn-start-mistakes");

    learnBtn.disabled = stats.remainingNewCount <= 0;
    document.getElementById("btn-learn-sub").textContent =
      stats.remainingNewCount <= 0
        ? "모든 단어를 학습했습니다"
        : `${Math.min(10, stats.remainingNewCount)}개의 새로운 단어 (남은 ${stats.remainingNewCount}개)`;

    reviewBtn.disabled = stats.dueCount === 0;
    document.getElementById("btn-review-sub").textContent =
      stats.dueCount === 0 ? "오늘 복습할 단어가 없습니다" : `${stats.dueCount}개 단어 복습 대기 중`;

    mistakeBtn.disabled = stats.mistakeCount === 0;
    document.getElementById("btn-mistakes-sub").textContent =
      stats.mistakeCount === 0 ? "오답노트가 비어 있습니다" : `${stats.mistakeCount}개 단어 반복 학습 필요`;

    return stats;
  }

  window.DET.dashboard = { renderDashboard };
})();
