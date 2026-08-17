/* ============================================================
 * tts.js — 语音合成（唯一引擎：MiniMax 情感大模型）
 * 每次调用都明确指定：音色 voice_id（用户选择）+ 情绪 emotion +
 * 语速 speed（情绪模式映射）。音频经 WebAudio 播放。
 * 依赖：Config、Sounds、MiniMaxTTS
 * ============================================================ */
(function (global) {
  'use strict';

  /**
   * 朗读文本
   * @param {string} text
   * @param {object} settings（minimaxKey / minimaxVoice / emotion）
   * @param {{onready?: Function, onstart?: Function, onend?: Function, onerror?: Function}} handlers
   *   onready(duration)：音频已合成并解码（时长秒），供字幕与语音同步
   */
  async function speak(text, settings, handlers) {
    const h = handlers || {};
    try {
      const buf = await MiniMaxTTS.synth(settings, text);
      const meta = await Sounds.prepareBuffer(buf);
      if (h.onready) h.onready(meta.duration);
      await Sounds.playBuffer(buf, settings.emotion, h.onstart, meta.buffer);
      if (h.onend) h.onend();
    } catch (err) {
      console.warn('[tts] MiniMax 朗读失败：', err.message);
      if (h.onerror) h.onerror(err);
    }
  }

  function stop() {
    Sounds.stopPlayback();
  }

  /* 重置引擎失败状态（设置变更后允许重试）。
   * 当前实现无内部失败计数，保留空实现以兼容 app.js 的调用。 */
  function resetFailures() { /* no-op */ }

  global.TTS = {
    speak: speak,
    stop: stop,
    resetFailures: resetFailures,
  };
})(window);
