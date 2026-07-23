// GitHub Gist 기반 기기 간 동기화 전송 모듈
// GitHub Pages 배포에 어차피 필요한 GitHub 계정을 재사용 -> 새 계정/서비스 가입 불필요.
// "동기화 코드" = (개인 액세스 토큰 + Gist ID)를 하나의 문자열로 인코딩한 값.
window.DET = window.DET || {};

(function () {
  const API_BASE = "https://api.github.com";
  const FILE_NAME = "progress.json";
  const SYNC_CODE_KEY = "det_sync_code";

  function encodeCode(token, gistId) {
    return btoa(unescape(encodeURIComponent(JSON.stringify({ t: token, g: gistId }))));
  }

  function decodeCode(code) {
    try {
      const obj = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
      if (!obj.t || !obj.g) return null;
      return { token: obj.t, gistId: obj.g };
    } catch (e) {
      return null;
    }
  }

  function getSyncCode() {
    return localStorage.getItem(SYNC_CODE_KEY) || null;
  }

  function setSyncCode(code) {
    localStorage.setItem(SYNC_CODE_KEY, code);
  }

  function clearSyncCode() {
    localStorage.removeItem(SYNC_CODE_KEY);
  }

  function authHeaders(token) {
    return {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    };
  }

  // 개인 액세스 토큰으로 새 비공개 Gist 생성 -> 동기화 코드 반환
  async function createSyncCode(token, initialState) {
    const res = await fetch(`${API_BASE}/gists`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        description: "DET 어휘 학습 진도 동기화 (비공개)",
        public: false,
        files: { [FILE_NAME]: { content: JSON.stringify(initialState) } },
      }),
    });
    if (!res.ok) throw new Error(`Gist 생성 실패 (${res.status}). 토큰 권한(gist)을 확인하세요.`);
    const data = await res.json();
    return encodeCode(token, data.id);
  }

  async function pushState(code, state) {
    const parsed = decodeCode(code);
    if (!parsed) throw new Error("동기화 코드가 올바르지 않습니다.");
    const res = await fetch(`${API_BASE}/gists/${parsed.gistId}`, {
      method: "PATCH",
      headers: authHeaders(parsed.token),
      body: JSON.stringify({ files: { [FILE_NAME]: { content: JSON.stringify(state) } } }),
    });
    if (!res.ok) throw new Error(`업로드 실패 (${res.status})`);
  }

  async function pullState(code) {
    const parsed = decodeCode(code);
    if (!parsed) throw new Error("동기화 코드가 올바르지 않습니다.");
    const res = await fetch(`${API_BASE}/gists/${parsed.gistId}`, {
      headers: authHeaders(parsed.token),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`다운로드 실패 (${res.status})`);
    const data = await res.json();
    const file = data.files && data.files[FILE_NAME];
    if (!file || !file.content) return null;
    try {
      return JSON.parse(file.content);
    } catch (e) {
      throw new Error("클라우드 데이터 형식이 올바르지 않습니다.");
    }
  }

  window.DET.sync = {
    getSyncCode,
    setSyncCode,
    clearSyncCode,
    createSyncCode,
    pushState,
    pullState,
  };
})();
