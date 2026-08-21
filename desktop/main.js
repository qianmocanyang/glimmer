/* ============================================================
 * main.js — 曦语 Glimmer 桌面版（Electron）
 * 与网页版共用同一套前端资源（../index.html 及其 js/css）。
 * 「像 app 一样」的关键行为：
 *  ① backgroundThrottling:false —— 窗口最小化/隐藏时页面定时器
 *     不被节流，闹钟依然准点触发
 *  ② 关闭窗口 = 最小化到系统托盘，程序继续后台运行，到点自动播报
 *  ③ 单实例：重复启动会唤起已有窗口
 *  ④ 开机自启动（openAtLogin）+ 开机静默启动（不弹窗驻托盘）
 *  ⑤ 开机延时播报：开机自启后约 1 分钟，通知渲染进程自动播报一次
 *  ⑥ 桌面歌词悬浮窗（lyrics.html）：透明置顶、点击穿透，播报时像音乐
 *     播放器歌词一样显示在屏幕中上偏顶位置，未播报时显示时钟
 * 用法：cd desktop && npm install && npm start
 * ============================================================ */
'use strict';

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen } = require('electron');
const path = require('path');
const { execFile } = require('child_process');

/* 网页资源根目录：开发模式在 desktop/ 上一级；打包后 main.js 与 index.html 同处 app 包根 */
const WEB_ROOT = app.isPackaged ? __dirname : path.join(__dirname, '..');

/* 开机自启后延时自动播报（毫秒）：约 1 分钟 */
const BOOT_PLAY_DELAY_MS = 60 * 1000;

/* GPU 渲染：默认启用硬件加速以保证桌面歌词悬浮窗的 transparent 真正生效
 * (transparent 窗口底层依赖 WS_EX_LAYERED，必须 GPU 合成才能分层)。
 * 如机器显卡驱动存在黑屏问题，可启动前设 ELECTRON_DISABLE_GPU=1
 * 临时回退（Windows 通知卡顿/歌词窗恢复白底）。 */
if (!process.env.ELECTRON_DISABLE_GPU) {
  // 默认启用硬件加速
} else {
  app.disableHardwareAcceleration();
}

/* Windows 通知归属：设置 AppUserModelID，使系统通知来源显示应用名（曦语）
 * 而非页面 URL（如 127.0.0.1:8123）。 */
app.setAppUserModelId('xyz.goutao.morningradio');

let win = null;
let tray = null;
let lyricWin = null;   // 桌面歌词悬浮窗
let quitting = false;
let bootPlayTimer = null;

/* ---------- 桌面层挂载（koffi 调 user32） ----------
 * 时钟模式：SetParent 到桌面 Progman，让歌词窗像壁纸一样固定在桌面层，
 * 任何应用窗口都不会覆盖它；播报歌词时解除挂载并置顶悬浮。 */
let _findW = null;
let _setP = null;
try {
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  _findW = user32.func('void* __stdcall FindWindowW(const char16_t* cls, const char16_t* name)');
  _setP = user32.func('void* __stdcall SetParent(void* child, void* parent)');
} catch (e) {
  console.warn('[lyric] 桌面层挂载不可用（koffi 加载失败），时钟将使用普通窗口层级', e && e.message);
}

/* 将歌词窗挂到桌面层（壁纸之上、应用窗口之下） */
function attachToDesktop(win) {
  if (!_findW || !_setP || !win || win.isDestroyed()) return false;
  try {
    const progman = _findW('Progman', null);
    if (!progman) return false;
    _setP(win.getNativeWindowHandle(), progman);
    return true;
  } catch (e) {
    return false;
  }
}

/* 解除桌面层挂载（恢复普通顶层窗口） */
function detachFromDesktop(win) {
  if (!_setP || !win || win.isDestroyed()) return;
  try {
    _setP(win.getNativeWindowHandle(), null);
  } catch (e) { /* 忽略 */ }
}

/* 32x32 琥珀色圆点图标（BGRA 原始像素生成，避免外部图标文件） */
function makeIcon(size) {
  try {
    const cx = (size - 1) / 2, cy = (size - 1) / 2, r = size * 0.34;
    const buf = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d > r) continue;
        const edge = d > r - 2 ? 0.55 : 1.0; // 简单抗锯齿
        const idx = (y * size + x) * 4;
        buf[idx] = 77;        // B
        buf[idx + 1] = 184;   // G
        buf[idx + 2] = 255;   // R（琥珀色）
        buf[idx + 3] = Math.round(255 * edge); // A
      }
    }
    return nativeImage.createFromBitmap(buf, { width: size, height: size });
  } catch (e) {
    return null;
  }
}

function showWindow() {
  if (!win) return;
  win.show();
  win.focus();
}

/* ---------- 开机自启动 IPC（渲染进程经 preload 调用） ----------
 * 双保险：
 *  ① app.setLoginItemSettings()（官方 API，NSIS 安装版可靠）
 *  ② 手动写 HKCU\...\Run 注册表（便携版等官方 API 失效时的兜底）
 * 启动参数 --hidden：开机自启静默模式（不弹窗驻托盘 + 延时播报） */
const RUN_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const RUN_NAME = 'Glimmer';

function ps(script) {
  return new Promise(function (resolve) {
    execFile('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true },
      function (err, stdout) {
        resolve({ err: err, out: (stdout || '').trim() });
      });
  });
}

async function setRunAtLogin(enabled) {
  const exe = process.execPath;
  if (!app.isPackaged || !exe) return false;
  const esc = exe.replace(/'/g, "''");
  const cmd = enabled
    ? "Set-ItemProperty -Path '" + RUN_KEY + "' -Name '" + RUN_NAME + "' -Value '\"" + esc + "\" --hidden' -Force"
    : "Remove-ItemProperty -Path '" + RUN_KEY + "' -Name '" + RUN_NAME + "' -ErrorAction SilentlyContinue";
  const r = await ps(cmd);
  return !r.err;
}

async function getRunAtLogin() {
  const r = await ps("(Get-ItemProperty -Path '" + RUN_KEY + "' -Name '" + RUN_NAME + "' -ErrorAction SilentlyContinue).'" + RUN_NAME + "'");
  return !!r.out;
}

ipcMain.handle('radio:get-launch', async function () {
  try {
    let official = false;
    try { official = !!app.getLoginItemSettings().openAtLogin; } catch (e) { /* 忽略 */ }
    let regOn = false;
    try { regOn = await getRunAtLogin(); } catch (e) { /* 忽略 */ }
    let openedAtLogin = false;
    try {
      openedAtLogin = !!app.getLoginItemSettings().wasOpenedAtLogin || process.argv.indexOf('--hidden') >= 0;
    } catch (e) { openedAtLogin = process.argv.indexOf('--hidden') >= 0; }
    return { openAtLogin: official || regOn, openedAtLogin: openedAtLogin };
  } catch (e) {
    return { openAtLogin: false, openedAtLogin: false };
  }
});

ipcMain.handle('radio:set-launch', async function (evt, enabled) {
  try {
    // ① 官方 API（openAsHidden 配合显式 --hidden 参数，兼容性最佳）
    app.setLoginItemSettings({ openAtLogin: !!enabled, openAsHidden: true, args: ['--hidden'] });
    // ② 注册表兜底（便携版等场景）
    await setRunAtLogin(!!enabled);
    return true;
  } catch (e) {
    try { await setRunAtLogin(!!enabled); return true; } catch (e2) { return false; }
  }
});

/* 开机自启 → 延时通知渲染进程自动播报一次 */
function scheduleBootPlay() {
  if (bootPlayTimer) return;
  bootPlayTimer = setTimeout(function () {
    bootPlayTimer = null;
    if (win && !win.isDestroyed()) {
      win.webContents.send('radio:play-now');
    }
  }, BOOT_PLAY_DELAY_MS);
}

function createWindow(openedAtLogin) {
  win = new BrowserWindow({
    width: 420,
    height: 720,
    minWidth: 380,
    minHeight: 620,
    show: false, // 先不显示，由下方逻辑决定是否展示
    title: '曦语 · Glimmer',
    autoHideMenuBar: true,
    backgroundColor: '#1a120b',
    icon: makeIcon(64) || undefined,
    webPreferences: {
      backgroundThrottling: false, // 关键：隐藏/最小化时定时器不被节流
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile(path.join(__dirname, 'compact.html'));

  // 页面加载完成后再展示（避免白屏闪烁）；开机自启时保持静默驻托盘
  win.webContents.on('did-finish-load', function () {
    if (!openedAtLogin) {
      win.show();
    } else {
      scheduleBootPlay(); // 开机自启：延时 1 分钟自动播报
    }
  });

  // 关闭窗口 = 隐藏到托盘，闹钟继续后台运行；托盘菜单「退出」才真正退出
  win.on('close', function (e) {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function createTray() {
  tray = new Tray(makeIcon(32) || nativeImage.createEmpty());
  tray.setToolTip('曦语 Glimmer');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示曦语', click: showWindow },
    { type: 'separator' },
    { label: '退出', click: function () { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showWindow);
}

/* ---------- 桌面歌词悬浮窗 ----------
 * 无边框、透明、点击穿透、不进任务栏、不抢焦点。
 * 位置：屏幕中上偏顶（水平居中，垂直约屏幕高度的 10% 处起）。
 * 层级策略：
 *  - 时钟模式（未播报）：普通层级，只显示在桌面上，打开其他应用会被盖住
 *  - 歌词模式（播报中）：置顶悬浮，像音乐播放器桌面歌词一样浮在所有应用上
 * 播报时由渲染进程推送歌词文本（经 radio:lyric → lyric:data）。 */
function createLyricWindow() {
  try {
    const wa = screen.getPrimaryDisplay().workArea;
    const w = Math.min(920, Math.max(520, Math.round(wa.width * 0.55)));
    const h = 210;
    const x = Math.round(wa.x + (wa.width - w) / 2);
    const y = Math.round(wa.y + wa.height * 0.10);

    lyricWin = new BrowserWindow({
      x: x, y: y, width: w, height: h,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      paintWhenInitiallyHidden: true, // Windows 上 transparent 正确初始化的关键
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      // 不设 focusable:false —— transparent 窗口 + focusable:false 在 Windows 上
      // 是已知会让 WS_EX_LAYERED 失效、背景变白的组合 bug
      skipTaskbar: true,
      alwaysOnTop: false, // 默认时钟模式：普通层级，只显示在桌面
      hasShadow: false,
      fullscreenable: false,
      show: true, // 直接显示，让 Chromium 立即应用 WS_EX_LAYERED（hide 后再 show 会丢 layered）
      webPreferences: {
        backgroundThrottling: false,
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    });

    // 强制透明背景：构造后再设一次，避免 Windows 上 backgroundColor 被忽略
    try { lyricWin.setBackgroundColor('#00000000'); } catch (e) {}
    lyricWin.setIgnoreMouseEvents(true, { forward: true }); // 鼠标点击穿透到下层
    lyricWin.loadFile(path.join(__dirname, 'lyrics.html'));

    // 页面加载完成 + 透明通道就绪后再做一次「hide→show」强制重置 layered，
    // 解决「首次显示白底、播放后才透明」的问题；随后挂到桌面层（时钟模式）
    lyricWin.webContents.once('did-finish-load', function () {
      try { lyricWin.setBackgroundColor('rgba(0,0,0,0)'); } catch (e) {}
      // hide+show 强制 Chromium 重建 WS_EX_LAYERED（关键修复）
      setTimeout(function () {
        if (!lyricWin || lyricWin.isDestroyed()) return;
        try {
          lyricWin.setBackgroundColor('#00000000');
          lyricWin.hide();
          lyricWin.show();
        } catch (e) {}
        // 时钟模式：锁死在桌面层（像壁纸一样，任何应用不覆盖）
        attachToDesktop(lyricWin);
      }, 200);
    });
    lyricWin.on('closed', function () { lyricWin = null; });
  } catch (e) {
    console.error('[lyric] 创建歌词窗失败', e);
  }
}

/* 渲染进程推送歌词/时钟 → 转发给歌词窗，并按模式切换层级：
 * 时钟模式挂到桌面层（壁纸级，任何应用不覆盖）；歌词模式解除挂载并置顶悬浮 */
ipcMain.on('radio:lyric', function (_evt, payload) {
  if (!lyricWin || lyricWin.isDestroyed()) return;
  if (payload && payload.mode === 'clock') {
    attachToDesktop(lyricWin);
    lyricWin.setAlwaysOnTop(false);
  } else if (payload && payload.mode === 'caption') {
    detachFromDesktop(lyricWin);
    lyricWin.setAlwaysOnTop(true, 'screen-saver');
  }
  lyricWin.webContents.send('lyric:data', payload);
});

/* 单实例锁：重复启动时唤起已有窗口 */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(function () {
    // 判断本次是否由开机自启拉起（不弹窗、不打扰）
    // 注册表自启带 --hidden 参数；官方 API 自启用 wasOpenedAtLogin
    let openedAtLogin = process.argv.indexOf('--hidden') >= 0;
    try {
      openedAtLogin = openedAtLogin || !!(app.getLoginItemSettings().wasOpenedAtLogin);
    } catch (e) { /* 忽略 */ }

    createWindow(openedAtLogin);
    createLyricWindow(); // 桌面歌词悬浮窗
    createTray();
    app.on('activate', showWindow); // macOS Dock 点击
  });

  // 真正退出时销毁歌词窗
  app.on('before-quit', function () {
    if (lyricWin && !lyricWin.isDestroyed()) lyricWin.destroy();
    lyricWin = null;
  });

  // 所有窗口关闭时不退出（后台驻留托盘）
  app.on('window-all-closed', function () { /* 保持后台运行 */ });
}
