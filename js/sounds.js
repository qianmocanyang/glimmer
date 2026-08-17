/* ============================================================
 * sounds.js — 电台提示音 + 音频播放
 * ① chime()：闹钟触发时的双音门铃（WebAudio 合成，无需音频文件）
 * ② playBuffer()：播放网络 TTS 引擎返回的 MP3 音频（MiniMax/Edge）
 * 注意：浏览器自动播放策略要求 AudioContext 由用户手势创建，
 *       因此首次交互（开闹钟/试听/改设置）时调用 warmUp()。
 * 依赖：Config
 * ============================================================ */
(function (global) {
  'use strict';

  let ctx = null;
  let currentSource = null;
  let bgmSource = null;
  let bgmGain = null;
  let bgmCache = {};   // 解码缓存 { url: AudioBuffer }，避免每次播报重新下载/解码

  /* 背景音乐曲库（每次播报随机选一首）+ 固定音量（已取消用户自定义） */
  const BGM_LIST = ['1.mp3', '2.mp3', '3.mp3'];
  const BGM_VOLUME = 0.15;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') {
        try { ctx.resume(); } catch (e) { /* 忽略 */ }
      }
      return ctx;
    }
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (e) {
      return null;
    }
    return ctx;
  }

  /* 在用户手势中预热（幂等，可重复调用） */
  function warmUp() {
    ensure();
  }

  /* 双音门铃：880Hz → 1320Hz，正弦波渐入渐出 */
  function chime() {
    const ac = ensure();
    if (!ac) return;
    try {
      const now = ac.currentTime;
      [880, 1320].forEach(function (freq, i) {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t0 = now + i * 0.35;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start(t0);
        osc.stop(t0 + 1.2);
      });
    } catch (e) { /* 忽略 */ }
  }

  /**
   * 解码音频缓冲（供 TTS 层提前解码以获取时长，实现字幕与语音同步）
   * @returns {Promise<{buffer: AudioBuffer, duration: number}>}
   */
  async function prepareBuffer(arrayBuffer) {
    const ac = ensure();
    if (!ac) throw new Error('音频设备不可用');
    const audioBuf = await ac.decodeAudioData(arrayBuffer.slice(0)); // slice 复制避免缓冲区被 detach
    return { buffer: audioBuf, duration: audioBuf.duration };
  }

  /**
   * 播放音频缓冲（MP3 等），按情绪模式调整音量
   * @param {ArrayBuffer} arrayBuffer 音频数据
   * @param {string} emotionKey 情绪模式
   * @param {Function} [onstart] 开始播放时回调
   * @param {AudioBuffer} [predecoded] 已解码缓冲（prepareBuffer 的结果，避免重复解码）
   * @returns {Promise<void>} 播放结束或失败
   */
  async function playBuffer(arrayBuffer, emotionKey, onstart, predecoded) {
    const ac = ensure();
    if (!ac) throw new Error('音频设备不可用');
    const emo = Config.EMOTIONS[emotionKey] || Config.EMOTIONS.energetic;
    const audioBuf = predecoded || await ac.decodeAudioData(arrayBuffer.slice(0)); // slice 复制避免缓冲区被 detach
    return new Promise(function (resolve, reject) {
      const src = ac.createBufferSource();
      const gain = ac.createGain();
      gain.gain.value = emo.volume;
      src.buffer = audioBuf;
      src.connect(gain);
      gain.connect(ac.destination);
      currentSource = src;
      src.onended = function () {
        if (currentSource === src) currentSource = null;
        resolve();
      };
      src.onerror = function () {
        reject(new Error('音频播放失败'));
      };
      try {
        src.start();
        if (onstart) onstart();
      } catch (e) {
        reject(e);
      }
    });
  }

  /* 停止正在播放的音频（不停门铃，门铃很短无需处理） */
  function stopPlayback() {
    if (currentSource) {
      try { currentSource.stop(); } catch (e) { /* 忽略 */ }
      currentSource = null;
    }
  }

  /**
   * 播放背景音乐（循环，作为人声背景音垫底）
   * 每次播报从曲库随机选一首，音量固定（已取消用户自定义）。
   */
  async function playBgm() {
    const ac = ensure();
    if (!ac) return;
    stopBgm();
    try {
      const url = BGM_LIST[Math.floor(Math.random() * BGM_LIST.length)];
      if (!bgmCache[url]) {
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        bgmCache[url] = await ac.decodeAudioData(await res.arrayBuffer());
      }
      const src = ac.createBufferSource();
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0, ac.currentTime);
      gain.gain.linearRampToValueAtTime(BGM_VOLUME, ac.currentTime + 1.2); // 淡入
      src.buffer = bgmCache[url];
      src.loop = true;
      src.connect(gain);
      gain.connect(ac.destination);
      bgmSource = src;
      bgmGain = gain;
      src.start();
    } catch (e) {
      console.warn('[sounds] 背景音乐加载失败：', e.message);
    }
  }

  /* 停止背景音乐（0.8 秒淡出） */
  function stopBgm() {
    if (!bgmSource) return;
    try {
      const ac = ensure();
      if (ac && bgmGain) {
        bgmGain.gain.cancelScheduledValues(ac.currentTime);
        bgmGain.gain.setValueAtTime(bgmGain.gain.value, ac.currentTime);
        bgmGain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.8);
      }
      const src = bgmSource;
      setTimeout(function () { try { src.stop(); } catch (e) { /* 忽略 */ } }, 900);
    } catch (e) { /* 忽略 */ }
    bgmSource = null;
    bgmGain = null;
  }

  global.Sounds = {
    warmUp: warmUp,
    chime: chime,
    prepareBuffer: prepareBuffer,
    playBuffer: playBuffer,
    stopPlayback: stopPlayback,
    playBgm: playBgm,
    stopBgm: stopBgm,
  };
})(window);
