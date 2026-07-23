// Web Speech API 래퍼 (브라우저 내장 TTS, 별도 비용 없음)
window.DET = window.DET || {};

(function () {
  function isTTSSupported() {
    return "speechSynthesis" in window;
  }

  function speak(text, opts = {}) {
    if (!isTTSSupported()) return false;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.rate = opts.rate || 0.92;
    window.speechSynthesis.speak(utter);
    return true;
  }

  window.DET.tts = { isTTSSupported, speak };
})();
