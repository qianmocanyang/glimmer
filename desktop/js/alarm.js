/* ============================================================
 * alarm.js — 闹钟调度器（多时间 · 后台可靠版）
 * 支持多个定时时间（times 数组），每个时间同一天只触发一次。
 * 策略：
 *  ① Web Worker 每秒发 tick（后台标签页主线程定时器会被节流，
 *     Worker 定时器通常仍按秒运行）；主线程 1s 定时器兜底
 *  ② 命中判定「目标时刻已过且仍在 2 分钟宽限窗口内」，避免后台节流漏响；
 *     时间过了很久（>2 分钟）不再补触发，防止重新打开页面时误播
 *  ③ catchUp()：页面从后台恢复可见时补触发（宽限窗口内）
 * 依赖：无
 * ============================================================ */
(function (global) {
  'use strict';

  const GRACE_MS = 2 * 60 * 1000; // 宽限窗口：目标时刻后 2 分钟内仍会触发

  class AlarmClock {
    constructor(onFire) {
      this.onFire = onFire || function () {};
      this.enabled = false;
      this.times = ['07:30'];      // 多个定时时间（HH:MM 数组）
      this.fired = {};             // { time: 已触发日期字符串 }，同一天不重复
      this._mainTimer = null;
      this._worker = null;
      this._tick = this._tick.bind(this);
    }

    setTimes(times) {
      this.times = Array.isArray(times) && times.length
        ? times.filter(function (t) { return /^\d{1,2}:\d{2}$/.test(t); })
        : ['07:30'];
      this.fired = {};
    }

    /* 兼容旧调用：单个时间 */
    setTime(t) {
      this.setTimes([t]);
    }

    enable() {
      this.enabled = true;
      this.fired = {};
      this._startTicker();
    }

    disable() {
      this.enabled = false;
      this._stopTicker();
    }

    _startTicker() {
      if (this._mainTimer) return;
      // ① Worker ticker：后台标签页不被节流（file:// 下 Chrome 禁止 Worker，捕获后走主线程）
      if (typeof Worker !== 'undefined') {
        try {
          this._worker = new Worker('js/ticker.worker.js');
          this._worker.onmessage = (function (e) {
            if (e.data === 'tick') this._tick();
          }).bind(this);
        } catch (err) {
          this._worker = null;
        }
      }
      // ② 主线程兜底
      this._mainTimer = setInterval(this._tick, 1000);
    }

    _stopTicker() {
      if (this._mainTimer) {
        clearInterval(this._mainTimer);
        this._mainTimer = null;
      }
      if (this._worker) {
        this._worker.terminate();
        this._worker = null;
      }
    }

    /* 某时间点今天的闹钟目标时刻 */
    _targetToday(timeStr) {
      const p = timeStr.split(':').map(Number);
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), p[0] || 0, p[1] || 0, 0, 0);
    }

    _tick() {
      if (!this.enabled) return;
      this._maybeFire();
    }

    _maybeFire() {
      const now = new Date();
      const today = now.toDateString();
      const self = this;
      this.times.forEach(function (t) {
        if (self.fired[t] === today) return; // 该时间今天已触发
        const diff = now - self._targetToday(t);
        if (diff >= 0 && diff <= GRACE_MS) {
          self.fired[t] = today;
          try { self.onFire(); } catch (e) { console.error('[alarm] 触发回调异常', e); }
        }
      });
    }

    /* 页面恢复可见时调用：宽限窗口内且未触发则立即触发 */
    catchUp() {
      if (!this.enabled) return;
      this._maybeFire();
    }

    /* 计算最近的下次触发时间（已过今天设定时间则顺延到明天） */
    nextFireText() {
      const now = new Date();
      const pad = function (n) { return String(n).padStart(2, '0'); };
      let best = null;
      this.times.forEach(function (t) {
        const p = t.split(':').map(Number);
        const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), p[0] || 0, p[1] || 0, 0, 0);
        if (next <= now) next.setDate(next.getDate() + 1);
        if (!best || next < best) best = next;
      });
      return best ? pad(best.getHours()) + ':' + pad(best.getMinutes()) : '--:--';
    }
  }

  global.AlarmClock = AlarmClock;
})(window);
