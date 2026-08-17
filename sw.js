/* ============================================================
 * sw.js — 曦语 Glimmer Service Worker（network-first 缓存策略）
 * 注册前提：http://localhost 或 https（手机端部署到服务器后生效，
 * 可"添加到主屏幕"变成 App 图标）。离线/弱网时回退缓存，
 * 保证闹钟播报页面始终可访问。
 * 依赖：无
 * ============================================================ */
'use strict';

const CACHE = 'morning-radio-v2'; // v2:重建缓存,清除旧版缓存导致的时间/设置异常
const CORE = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/voices.js',
  './js/ai.js',
  './js/tts.js',
  './js/sounds.js',
  './js/minimaxTts.js',
  './js/alarm.js',
  './js/ui.js',
  './js/app.js',
  './1.mp3',
  './2.mp3',
  './3.mp3',
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(CORE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(function (res) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      })
      .catch(function () { return caches.match(e.request); })
  );
});
