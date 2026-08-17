/* ============================================================
 * config.js — 全局配置与设置持久化
 * 依赖：无
 * ============================================================ */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'morningRadio.settings.v7'; // v7：支持多个定时时间 alarmTimes

  const DEFAULT_SETTINGS = {
    alarmEnabled: false,   // 闹钟开关
    alarmTimes: ['07:30'], // 定时时间列表（多个 HH:MM，每个时间每天触发一次）
    emotion: 'energetic',  // 情绪模式：energetic | gentle | passionate（默认活力清晨）
    userName: '',          // 你的称呼（可选）：播报开头会叫你的名字，如"早安，谭雅，今天…"
    /* ---- 声音（唯一引擎：MiniMax 情感语音，音色可选） ---- */
    minimaxKey: '', // ⚠️ 你的 MiniMax API Key：在设置面板「声音」中填写，或直接替换此默认值（示例见 README）
    minimaxVoice: 'Chinese (Mandarin)_Crisp_Girl', // 默认：清脆少女（青春灵动）
    /* ---- 背景音乐（1.mp3 / 2.mp3 随机一首，音量固定） ---- */
    bgmEnabled: true,        // 播报时播放背景音乐（1.mp3/2.mp3 随机，音量固定）
    /* ---- 桌面版：开机自启动（开机后约 1 分钟自动播报，网页版忽略） ---- */
    launchOnBoot: false,     // 一个开关同时控制：随系统启动 + 开机 1 分钟后自动播放
    /* ---- AI 文案生成（智谱 BigModel，OpenAI 兼容，永久免费）
     * glm-4-flash：实测稳定；glm-4.7-flash：能力更强但早高峰易报 1305 访问量过大 */
    apiKey: '', // ⚠️ 你的智谱 BigModel API Key：在设置面板「AI 文案」中填写，或直接替换此默认值（示例见 README）
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
  };

  /* 情绪模式：同时驱动「AI 文案风格」「语音引擎参数」与「电台频率」
   * rate/pitch/volume → 浏览器系统语音；speed → MiniMax 语速；
   * minimaxEmotion → MiniMax 情绪参数（null = 让模型按文本自动匹配） */
  const EMOTIONS = {
    energetic: {
      label: '活力清晨',
      freq: 104.5,
      desc: '明快上扬',
      rate: 1.05, pitch: 1.15, volume: 1.0,
      speed: 1.05,
      minimaxEmotion: 'happy',
      promptHint: '明快、上扬、充满活力，像清晨电台主持人，用轻快的节奏把人叫醒',
    },
    gentle: {
      label: '温柔鼓励',
      freq: 92.1,
      desc: '舒缓温暖',
      rate: 0.92, pitch: 1.00, volume: 0.95,
      speed: 0.9,
      minimaxEmotion: null, // 让模型根据"温暖舒缓"的文案自动匹配语气
      promptHint: '温暖、舒缓、轻声细语地鼓励，像温柔的陪伴，让人安心',
    },
    passionate: {
      label: '激昂唤醒',
      freq: 106.8,
      desc: '高亢有力',
      rate: 1.10, pitch: 1.25, volume: 1.0,
      speed: 1.1,
      minimaxEmotion: 'fluent', // 生动、铿锵
      promptHint: '高亢、有力、铿锵激昂，像燃情的晨间号角，让人热血沸腾',
    },
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return Object.assign({}, DEFAULT_SETTINGS);
      return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
    } catch (e) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function saveSettings(patch) {
    const next = Object.assign({}, loadSettings(), patch);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) { /* 存储不可用时静默 */ }
    return next;
  }

  global.Config = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    EMOTIONS: EMOTIONS,
    loadSettings: loadSettings,
    saveSettings: saveSettings,
  };
})(window);
