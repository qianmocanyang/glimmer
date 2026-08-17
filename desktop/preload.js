/* ============================================================
 * preload.js — 渲染进程桥接（仅桌面版）
 * main.js 开启了 contextIsolation，渲染进程无法直接 require，
 * 通过 contextBridge 暴露最小化 API：
 *  - radioDesktop.onPlayNow(cb)   主进程通知「立即播报」（开机延时触发）
 *  - radioDesktop.getLaunchOnBoot() 读取开机自启动状态
 *  - radioDesktop.setLaunchOnBoot(v) 设置开机自启动
 *  - radioDesktop.sendLyric(payload) 主窗口向桌面歌词窗推送歌词/时钟
 *  - radioDesktop.onLyric(cb)      桌面歌词窗接收 lyrics.html 的歌词推送
 * ============================================================ */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('radioDesktop', {
  isDesktop: true,

  /* 主进程在开机延时到点后调用 → 渲染进程触发播报 */
  onPlayNow: function (cb) {
    ipcRenderer.on('radio:play-now', function () { cb(); });
  },

  getLaunchOnBoot: function () {
    return ipcRenderer.invoke('radio:get-launch');
  },

  setLaunchOnBoot: function (v) {
    return ipcRenderer.invoke('radio:set-launch', !!v);
  },

  /* 主窗口 → 桌面歌词悬浮窗 */
  sendLyric: function (payload) {
    ipcRenderer.send('radio:lyric', payload);
  },

  /* 桌面歌词悬浮窗 ← 主进程转发 */
  onLyric: function (cb) {
    ipcRenderer.on('lyric:data', function (_e, payload) { cb(payload); });
  },
});
