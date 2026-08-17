/* ============================================================
 * app.js — 应用装配与播报流程编排
 * 流程：闹钟触发 / 手动试听 → 提示音+系统通知 → AI 生成激励语
 *       → 上屏 → 引擎路由情绪化朗读（MiniMax→Edge→系统语音）
 * 后台可靠性：闹钟开启后即使页面最小化/切后台，Worker 心跳仍会
 *             准点触发；回到页面时还会补触发（宽限窗口内）
 * 依赖：Config、AI、TTS、Sounds、AlarmClock、UI
 * ============================================================ */
(function () {
  'use strict';

  let settings = Config.loadSettings();
  let sessionRunning = false;

  const alarm = new AlarmClock(onAlarmFire);

  /* ---------- 用户设置变更 ---------- */
  function onUserChange(patch) {
    settings = Config.saveSettings(patch);
    Sounds.warmUp(); // 用户手势：预热音频（浏览器自动播放策略）
    TTS.resetFailures(); // 设置变更后允许重试引擎

    if (patch.alarmEnabled !== undefined) {
      if (settings.alarmEnabled) {
        alarm.enable();
        UI.updateNextFire('下次播报 ' + alarm.nextFireText() + ' · 后台监测中');
        requestNotifyPermission();
      } else {
        alarm.disable();
        UI.updateNextFire('闹钟未开启');
      }
    }
    if (patch.alarmTimes !== undefined) {
      alarm.setTimes(settings.alarmTimes);
      UI.renderAlarmTimes(settings.alarmTimes);
      if (settings.alarmEnabled) UI.updateNextFire('下次播报 ' + alarm.nextFireText() + ' · 后台监测中');
    }
    // 桌面版：开机自启动设置同步到系统
    if (patch.launchOnBoot !== undefined && window.radioDesktop) {
      window.radioDesktop.setLaunchOnBoot(settings.launchOnBoot);
    }
  }

  function requestNotifyPermission() {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch (e) { /* 忽略 */ }
  }

  function notify(title, body) {
    try {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      new Notification(title, { body: body });
    } catch (e) { /* 忽略 */ }
  }

  /* ---------- 闹钟触发 ---------- */
  function onAlarmFire() {
    console.log('[alarm] 触发！开始晨间播报');
    runSession();
  }

  /* ---------- 完整播报流程：提示音 → 生成 → 上屏 → 朗读 ---------- */
  async function runSession() {
    if (sessionRunning) return;
    sessionRunning = true;

    TTS.stop();
    Sounds.warmUp();
    Sounds.chime();                               // ① 电台门铃
    if (settings.bgmEnabled) {
      Sounds.playBgm(); // ② 背景音乐垫底（1.mp3 / 2.mp3 随机一首）
    }
    notify('曦语 · ON AIR', '现在开始播报今日激励语 ☀'); // ③ 系统通知
    UI.setState('generating');
    UI.showHint(''); // 清除上一次会话的提示
    UI.showSubtitle('');

    // ④ AI 生成激励语（无 Key / 失败时自动降级到内置模板）
    const result = await AI.generateMotivation(settings);
    UI.showSubtitle(result.text);

    // ⑤ 请求语音合成（等待引擎返回）；音频就绪后才播放并同步字幕，
    //    避免「文字先全部出现、语音还没开始」的错位
    UI.setState('speaking');
    UI.showHint('正在合成语音…');
    TTS.speak(result.text, settings, {
      onready: function (duration) {
        // 降级提示（播报照常继续）+ 清除"合成中"提示
        UI.showHint((result.source !== 'ai' && settings.apiKey) ? '在线生成失败，已使用内置模板' : '');
        UI.showCaption(result.text, duration); // 与语音节奏同步逐段浮现
      },
      onstart: function () {
        UI.setState('speaking');
      },
      onend: function () {
        Sounds.stopBgm(); // 播报结束，背景音乐淡出
        UI.hideCaption();
        UI.setState('done');
        sessionRunning = false;
      },
      onerror: function (e) {
        console.warn('[tts] 朗读失败：', e);
        Sounds.stopBgm();
        UI.hideCaption();
        UI.setState('error');
        sessionRunning = false;
      },
    });
  }

  function stopSession() {
    TTS.stop();
    Sounds.stopBgm();
    UI.hideCaption();
    sessionRunning = false;
    UI.setState('idle');
    UI.showHint('');
    UI.showSubtitle('设定闹钟时间，到点后电台会为你送上 AI 激励语 ☀');
  }

  /* ---------- 启动 ---------- */
  function boot() {
    // 页面从后台恢复可见时补触发（浏览器节流/休眠可能导致漏响）
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) alarm.catchUp();
    });
    window.addEventListener('focus', function () { alarm.catchUp(); });

    // PWA：注册 Service Worker（仅 http/https 环境生效，file:// 与 Electron 下自动忽略）
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').catch(function () { /* 忽略 */ });
      });
    }

    // 桌面版：开机自启动状态同步 + 开机延时播报触发
    if (window.radioDesktop) {
      window.radioDesktop.getLaunchOnBoot().then(function (s) {
        if (s) UI.setLaunchUI(s.openAtLogin);
      });
      window.radioDesktop.onPlayNow(function () {
        // 开机自启后主进程延时通知：到达即播报（开关=开机自启动，同时启用开机 1 分钟自动播放）
        console.log('[desktop] 开机延时播报触发');
        runSession();
      });
    }

    UI.init(settings, {
      onChange: onUserChange,
      onPreview: runSession,
      onStop: stopSession,
    });

    // 闹钟装配
    alarm.setTimes(settings.alarmTimes || ['07:30']);
    if (settings.alarmEnabled) {
      alarm.enable();
      UI.updateNextFire('下次播报 ' + alarm.nextFireText() + ' · 后台监测中');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
