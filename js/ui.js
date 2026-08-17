/* ============================================================
 * ui.js — 电台界面渲染与交互
 * 职责：时钟、调谐盘指针、状态机（待机/生成中/播音中/完毕/异常）、
 *       字幕、均衡器、控制区与设置面板（情绪/API）的所有 DOM 操作
 * 声音：固定使用 MiniMax 成熟女声（唯一音色，见 config.js）
 * 依赖：Config、TTS
 * ============================================================ */
(function (global) {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const els = {};
  let onUserChange = null;
  let onPreview = null;
  let onStop = null;
  let persistentHint = ''; // 跨状态保留的提示（如“引擎降级”），下一次会话开始时清除

  const STATES = {
    idle:       { status: '待机 STANDBY', eq: false, live: false, hint: '' },
    generating: { status: '生成中 ON AIR', eq: true,  live: true,  hint: '正在为你生成今日激励语…' },
    speaking:   { status: '播音中 LIVE',   eq: true,  live: true,  hint: '' },
    done:       { status: '播报完毕',       eq: false, live: false, hint: '早安，新的一天加油！' },
    error:      { status: '信号异常',       eq: false, live: false, hint: '语音播放失败，请重试' },
  };

  function init(settings, hooks) {
    onUserChange = hooks.onChange;
    onPreview = hooks.onPreview;
    onStop = hooks.onStop;

    els.time = $('clockTime');
    els.date = $('clockDate');
    els.dialFreq = $('dialFreq');
    els.dialStatus = $('dialStatus');
    els.dialNeedle = $('dialNeedle');
    els.eq = $('eq');
    els.subtitle = $('subtitle');
    els.stageState = $('stageState');
    els.alarmToggle = $('alarmToggle');
    els.alarmTime = $('alarmTime');
    els.alarmTimes = $('alarmTimes');
    els.addTimeBtn = $('addTimeBtn');
    els.previewBtn = $('previewBtn');
    els.stopBtn = $('stopBtn');
    els.nextFire = $('nextFire');
    els.settingsBtn = $('settingsBtn');
    els.panel = $('panel');
    els.captionBar = $('captionBar');
    els.captionLines = $('captionLines');
    els.emotions = $('emotions');
    els.userName = $('userName');
    els.voiceSelect = $('voiceSelect');
    els.voiceTestBtn = $('voiceTestBtn');
    els.bootSection = $('bootSection');
    els.launchOnBoot = $('launchOnBoot');

    // 回填设置
    els.alarmTime.value = (settings.alarmTimes && settings.alarmTimes[0]) || '07:30';
    els.alarmToggle.checked = !!settings.alarmEnabled;
    els.userName.value = settings.userName || '';

    renderAlarmTimes(settings.alarmTimes);

    buildEmotions(settings.emotion);
    renderVoices(settings.minimaxVoice);
    els.launchOnBoot.checked = !!settings.launchOnBoot;
    setFreq(settings.emotion);

    // 桌面版专属设置（开机自启动等）：仅在 Electron 下显示
    if (global.radioDesktop) els.bootSection.hidden = false;

    // 事件绑定
    els.alarmToggle.addEventListener('change', function () {
      onUserChange && onUserChange({ alarmEnabled: els.alarmToggle.checked });
    });
    els.addTimeBtn.addEventListener('click', function () {
      const t = els.alarmTime.value;
      if (!t) return;
      const cur = currentTimes();
      if (cur.indexOf(t) >= 0) { flash(els.addTimeBtn, '已存在 ✓'); return; }
      onUserChange && onUserChange({ alarmTimes: cur.concat([t]) });
      flash(els.addTimeBtn, '已添加 ✓');
    });
    els.alarmTimes.addEventListener('click', function (e) {
      const x = e.target.closest('.chip-x');
      if (!x) return;
      const t = x.getAttribute('data-t');
      onUserChange && onUserChange({ alarmTimes: currentTimes().filter(function (v) { return v !== t; }) });
    });
    els.previewBtn.addEventListener('click', function () { onPreview && onPreview(); });
    els.stopBtn.addEventListener('click', function () { onStop && onStop(); });
    els.settingsBtn.addEventListener('click', function () {
      els.panel.hidden = !els.panel.hidden;
    });
    els.userName.addEventListener('change', function () {
      onUserChange && onUserChange({ userName: els.userName.value.trim() });
    });
    els.voiceTestBtn.addEventListener('click', function () {
      onPreview && onPreview(); // 用当前音色与情绪模式完整试听
    });
    els.voiceSelect.addEventListener('change', function () {
      onUserChange && onUserChange({ minimaxVoice: els.voiceSelect.value });
    });
    els.launchOnBoot.addEventListener('change', function () {
      onUserChange && onUserChange({ launchOnBoot: els.launchOnBoot.checked });
    });
    els.emotions.addEventListener('click', function (e) {
      const btn = e.target.closest('.emotion');
      if (!btn) return;
      const key = btn.dataset.emotion;
      onUserChange && onUserChange({ emotion: key });
      buildEmotions(key);
      setFreq(key);
    });

    setState('idle');
    startClock();
  }

  function flash(btn, text) {
    const old = btn.textContent;
    btn.textContent = text;
    setTimeout(function () { btn.textContent = old; }, 1200);
  }

  /* 定时时间列表（chips，可删除） */
  function renderAlarmTimes(times) {
    if (!els.alarmTimes) return;
    els.alarmTimes.innerHTML = '';
    const list = Array.isArray(times) ? times : [];
    if (!list.length) {
      const empty = document.createElement('span');
      empty.className = 'alarm-empty';
      empty.textContent = '未设置定时，请在下方面板添加';
      els.alarmTimes.appendChild(empty);
      return;
    }
    list.forEach(function (t) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = '<b>' + t + '</b><button type="button" class="chip-x" data-t="' + t + '" title="删除">×</button>';
      els.alarmTimes.appendChild(chip);
    });
  }

  /* 从当前界面 chips 读取时间列表（不依赖外部 settings 引用，避免旧数据） */
  function currentTimes() {
    const out = [];
    els.alarmTimes.querySelectorAll('.chip b').forEach(function (b) {
      const t = b.textContent;
      if (t && out.indexOf(t) < 0) out.push(t);
    });
    return out;
  }

  /* MiniMax 音色下拉框 */
  function renderVoices(selected) {
    els.voiceSelect.innerHTML = '';
    Voices.MINIMAX_VOICES.forEach(function (v) {
      const o = document.createElement('option');
      o.value = v.id;
      o.textContent = v.name;
      els.voiceSelect.appendChild(o);
    });
    els.voiceSelect.value = selected || 'Chinese (Mandarin)_Crisp_Girl';
  }

  /* 情绪模式按钮组 */
  function buildEmotions(selected) {
    els.emotions.innerHTML = '';
    Object.keys(Config.EMOTIONS).forEach(function (key) {
      const emo = Config.EMOTIONS[key];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'emotion' + (key === selected ? ' is-active' : '');
      b.dataset.emotion = key;
      b.innerHTML = '<b>' + emo.label + '</b><small>FM ' + emo.freq + ' · ' + emo.desc + '</small>';
      els.emotions.appendChild(b);
    });
  }

  /* 电台频率显示（随情绪模式变化） */
  function setFreq(emotionKey) {
    const emo = Config.EMOTIONS[emotionKey] || Config.EMOTIONS.energetic;
    els.dialFreq.textContent = 'FM ' + emo.freq;
  }

  /* 状态机 */
  function setState(state) {
    const s = STATES[state] || STATES.idle;
    els.dialStatus.textContent = s.status;
    els.dialStatus.classList.toggle('live', s.live);
    els.eq.classList.toggle('on', s.eq);
    const hint = s.hint || persistentHint;
    els.stageState.textContent = hint;
    els.stageState.classList.toggle('is-visible', !!hint);
  }

  function showSubtitle(text) {
    els.subtitle.textContent = text;
  }

  /* 持久化提示：不会被后续 setState 覆盖，传空串清除 */
  function showHint(text) {
    persistentHint = text || '';
    els.stageState.textContent = persistentHint;
    els.stageState.classList.toggle('is-visible', !!persistentHint);
  }

  function updateNextFire(text) {
    els.nextFire.textContent = text;
  }

  /* 顶部字幕横幅：按句切段，逐段浮现。
   * duration(秒) 由语音层在音频就绪后传入：每段间隔 = 段字数占比 × 语音时长 × 0.95
   * （字幕略快于语音，避免"语音已说、字幕未到"的落后感） */
  function showCaption(text, duration) {
    if (!els.captionBar || !text) return;
    els.captionLines.innerHTML = '';
    els.captionBar.hidden = false;
    const segs = String(text).split(/(?<=[。！？!?；;…])/);
    const total = String(text).length;
    let delay = 0;
    segs.forEach(function (s) {
      const t = s.trim();
      if (!t) return;
      const d = document.createElement('div');
      d.className = 'caption-line';
      d.textContent = t;
      els.captionLines.appendChild(d);
      (function (el, t0) {
        setTimeout(function () { el.classList.add('on'); }, t0);
      })(d, delay);
      delay += duration ? (t.length / total) * duration * 1000 * 0.95 : 1100;
    });
  }

  function hideCaption() {
    if (els.captionBar) {
      els.captionBar.hidden = true;
      els.captionLines.innerHTML = '';
    }
  }

  /* 桌面版：同步系统实际的开机自启动状态（用户可能在系统设置里改过） */
  function setLaunchUI(openAtLogin) {
    if (els.launchOnBoot) els.launchOnBoot.checked = !!openAtLogin;
  }

  /* 时钟 + 调谐盘指针（指针位置 = 当前分钟） */
  function startClock() {
    const WEEK = '日一二三四五六';
    const tick = function () {
      const now = new Date();
      const pad = function (n) { return String(n).padStart(2, '0'); };
      els.time.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
      els.date.textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日 · 星期' + WEEK[now.getDay()];
      const pct = Math.min(100, Math.max(0, (now.getMinutes() / 59) * 100));
      els.dialNeedle.style.left = pct + '%';
    };
    tick();
    setInterval(tick, 1000);
  }

  global.UI = {
    init: init,
    setState: setState,
    showSubtitle: showSubtitle,
    showHint: showHint,
    updateNextFire: updateNextFire,
    setFreq: setFreq,
    setLaunchUI: setLaunchUI,
    showCaption: showCaption,
    hideCaption: hideCaption,
    renderAlarmTimes: renderAlarmTimes,
  };
})(window);
