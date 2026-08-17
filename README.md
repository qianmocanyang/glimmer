# 曦语 Glimmer 📻

> 电台风格的 AI 激励闹钟：设定闹钟时间，到点后由 AI 生成一段 50–100 字的激励语，
> 再用带情绪的 AI 语音朗读出来。独立 Web App + 桌面版，**设定好参数后自动触发**，
> 像真正的 app 一样无需值守。

---

## ✨ 特性一览

- **准点自动播报**：支持多个定时时间，后台/最小化/标签页切后台都能准点触发（Web Worker 心跳 + 宽限补触发 + Electron 后台不节流）
- **AI 文案 + 情感语音**：智谱 BigModel（glm-4-flash，免费）生成文案 → MiniMax Speech 2.8 HD 情绪化朗读，男女多种音色可选
- **字幕与语音同步**：顶部字幕按句逐段浮现，与语音节奏同步（0.95 倍速，略领先不落后）
- **背景音乐**：内置 3 首自选 BGM 随机播放，播报结束自动淡出
- **开机自启**（桌面版）：随系统启动，约 1 分钟后自动播报；关闭窗口驻系统托盘继续后台值守
- **桌面歌词悬浮窗**（桌面版）：透明置顶歌词窗，播报时像音乐播放器桌面歌词逐句显示，平时显示琥珀渐变时钟，点击穿透不挡操作
- **PWA 支持**：手机浏览器可直接安装到桌面（manifest + Service Worker）

## 🚀 快速开始

### 网页版（最简单）

```bash
# 任选其一：直接双击 index.html 打开，或用内置静态服务器
node server.js   # 然后浏览器访问 http://localhost:8123
```

### 桌面版（Windows）

```bash
cd desktop
npm install
npm run dist    # 生成桌面/打包安装包（NSIS 安装版 + 便携版）
```

### ⚠️ 配置 API Key（必需）

本项目使用两个免费 AI 服务，**代码中不内置任何 Key**，请自行在设置面板填写：

1. **AI 文案**（智谱 BigModel）：在 [open.bigmodel.cn](https://open.bigmodel.cn) 免费申请，设置面板「AI 文案」填入即可（或直接修改 `js/config.js` 中 `apiKey` 字段）
2. **语音合成**（MiniMax）：在 [platform.minimax.com](https://platform.minimax.com) 申请，设置面板「声音」填入 `minimaxKey`（或修改 `js/config.js`）

> 没有 Key 时应用也能运行：文案自动降级为内置模板库，语音降级为浏览器系统朗读（体验完整流程建议配置 Key）。

---

## 一、程序结构设计

### 1.1 模块划分

```
morning-radio/
├── index.html          # 电台界面骨架（机壳、调谐盘、喇叭、控制台、设置面板）
├── css/style.css       # 电台风格视觉：暖色木纹、喇叭网、均衡器动画
├── js/
│   ├── config.js       # 全局配置 + 设置持久化（localStorage）
│   ├── voices.js       # MiniMax 音色目录（8 款，设置面板可选）
│   ├── ai.js           # ① 激励语生成：DeepSeek(OpenAI 兼容) API + 内置模板降级
│   │                   #    Prompt 设定：早安+今日日期开场，风格随机多样
│   ├── tts.js          # ② 语音合成：唯一引擎 MiniMax（显式指定音色/情绪/语速）
│   ├── minimaxTts.js   # ③ MiniMax Speech 2.8 HD 调用（Bearer Key / JWT 双鉴权）
│   ├── sounds.js       # ④ 电台门铃 + 音频缓冲播放（WebAudio）
│   ├── ticker.worker.js# ⑤ 后台心跳 Worker：后台标签页定时器不被浏览器节流
│   ├── alarm.js        # ⑥ 闹钟调度器：Worker 心跳 + 宽限窗口 + 页面恢复补触发
│   ├── ui.js           # ⑦ 界面渲染：时钟、调谐盘指针、均衡器、字幕、面板交互
│   └── app.js          # ⑧ 应用装配：模块接线、播报流程编排、系统通知
├── desktop/
│   ├── main.js         # 桌面版（Electron）：关窗驻托盘、后台定时不节流、单实例
│   └── package.json    # npm start 启动
└── server.js           # 极简静态服务器（可选）：node server.js
```

### 1.2 各模块职责

| 模块 | 职责 | 对外接口 |
|---|---|---|
| `config.js` | 默认设置、情绪模式定义（文案风格 + 语音参数 + 电台频率）、设置读写 | `Config.loadSettings()` / `Config.saveSettings(patch)` / `Config.EMOTIONS` |
| `ai.js` | 调用聊天补全 API 生成激励语；失败/无 Key 时降级到内置模板库 | `AI.generateMotivation(settings) → {text, source}` |
| `tts.js` | 加载系统音色、自动挑选中文音色、按情绪模式设置 rate/pitch/volume 朗读 | `TTS.loadVoices()` / `TTS.speak(text, settings, handlers)` / `TTS.stop()` |
| `sounds.js` | WebAudio 合成门铃（闹钟触发提示音），用户手势预热 | `Sounds.warmUp()` / `Sounds.chime()` |
| `ticker.worker.js` | 每秒向主线程发 tick，规避后台标签页定时器节流 | `postMessage('tick')` |
| `alarm.js` | 闹钟开关、Worker/主线程双心跳、宽限窗口判定、同日防重复、补触发 | `new AlarmClock(onFire)` / `setTime` / `enable` / `disable` / `catchUp` / `nextFireText()` |
| `ui.js` | 所有 DOM 渲染与事件绑定，状态机（待机/生成中/播音中/完毕/异常） | `UI.init(settings, hooks, voices)` / `UI.setState()` / `UI.showSubtitle()` |
| `app.js` | 装配 + 编排「触发 → 提示音/通知 → 生成 → 朗读」完整流程 | 启动入口 |
| `desktop/main.js` | Electron 外壳：`backgroundThrottling:false` 保证隐藏窗口定时器不节流；关窗=驻托盘；单实例 | `npm start` |

### 1.3 数据流

```
用户设置（闹钟时间/情绪模式/音色/API Key）
        │  Config.saveSettings()
        ▼
   localStorage ──────────────► 下次启动 Config.loadSettings()
        │
闹钟触发（alarm.js：Worker 心跳 / 主线程心跳 / 页面恢复补触发）
        ▼
app.js runSession()
   ├─► Sounds.chime() + 系统通知（Notification API）
   ├─► ai.js.generateMotivation()  ──成功──►  AI 文本
   │        │ 无 Key 或网络失败
   │        ▼
   │   内置模板库（保证闹钟永远能响）
   ▼
ui.js：电台进入 ON AIR、均衡器动画、字幕显示文本
   ▼
tts.js：选音色 → 按情绪模式设 rate/pitch/volume → speechSynthesis 朗读
   ▼
朗读结束 → 状态回到待机，显示「早安」
```

### 1.4 闹钟后台触发机制（“像 app 一样自动触发”的核心）

| 场景 | 机制 | 效果 |
|---|---|---|
| 页面在前台 | 主线程 1s 心跳 | 准点触发 |
| 页面最小化/切后台 | **Web Worker** 1s 心跳（浏览器对后台标签页主线程定时器会节流到约 1 分钟/次，Worker 通常仍按秒运行）+ 主线程兜底 | 准点触发 |
| 宽限窗口 | 命中判定为「目标时刻已过且 ≤30 分钟」，而非精确秒相等 | 节流/调度抖动不漏响 |
| 系统休眠后唤醒 / 从后台切回 | `visibilitychange`/`focus` → `alarm.catchUp()` 补触发 | 30 分钟内未触发则立即补响 |
| 完全关闭浏览器 | 网页无法运行 | **使用桌面版**：窗口隐藏驻托盘，`backgroundThrottling:false` 定时器不节流，到点自动弹出播报 |

---

## 二、API 调用设计

### 2.1 选型

- **激励语生成**：OpenAI 兼容的 Chat Completions 接口，默认 DeepSeek（`deepseek-chat`，便宜且中文质量好），
  接口地址与模型名均可设置，可无缝换成 OpenAI / Moonshot / Qwen 等任何兼容服务。
- **语音合成**：优先使用浏览器内置 Web Speech API（免费、无需密钥、跨平台），详见第三节。

### 2.2 请求（激励语生成 · Prompt 已设定好）

```
POST {baseUrl}/chat/completions
Authorization: Bearer {apiKey}

{
  "model": "deepseek-chat",
  "messages": [
    { "role": "system", "content": "你是一个清晨电台主持人，正在主持早间播报。
        开场第一句必须是：\"早安，今天是{当前日期}。\"
        随后说一段 50-100 个汉字的中文正文（正文不要再重复日期）。
        今日播报风格（每次随机不同）：{元气激励 / 温柔陪伴 / 热血燃向 /
        幽默轻松 / 哲思启发 / 新闻播报 —— 六选一}
        整体语气要求：{当前情绪模式的语气提示}。
        口语化、有感染力、像真人主播在说话；不要标题、不要引号、不要任何解释，直接输出正文。" },
    { "role": "user", "content": "现在是早晨闹钟时间，开始今天的早间播报。" }
  ],
  "temperature": 1.0,
  "max_tokens": 300
}
```

**结构约定**：① 固定开场——设置了「你的称呼」时为「早安，{称呼}，今天是 X年X月X日 星期X。」，
未设置时为「早安，今天是 X年X月X日 星期X。」② 一段 50-100 字正文
③ **风格每次随机不同**且与情绪模式匹配（治愈：清醒语录/治愈语录/哲思/陪伴；活力：元气/幽默/闲聊；激昂：燃向/元气/哲思）
④ 语气跟随情绪模式。离线模板与在线生成遵循同一结构。

**内容要求**：以**激励、给人力量为主**，纯粹的鼓励话语；**禁止出现任何与 AI、模型、程序、
本电台系统自身相关的表述**（如"我是 AI""我能帮你生成""本电台"），也不要说"我想做什么"。

**句式要求（人生感悟式）**：短句、排比、讲道理（如"人生没有重来，只有后来。生活也没有如果，
只有结果……"）；**禁止描写具体日常场景或物品**（早餐、街道、天气、公交站等），
禁止拟人化形容事物（如"水煮蛋在唱歌""太阳很慷慨"），不描述自己正在做什么。

**亲近感是最高要求**（Prompt 中显式约束）：
- 只对"你"一个人说话，像老朋友、像家人，而非对听众广播（禁用"朋友们"等群体称呼）
- 不堆砌华丽比喻与宏大辞藻；生活化、口语化、有烟火气
- 可提具体小事：早餐、热茶、窗外天气、上班路上、昨晚的梦
- 像在耳边轻声说话，听完心里一暖

### 2.3 响应解析与错误处理

- 成功：`data.choices[0].message.content`（trim 后上屏 + 朗读）
- 非 2xx：解析 `error.message` 展示给用户，并**自动降级到内置模板库**，闹钟播报永不落空
- 无 API Key：直接走模板库（离线可用）
- Key 只存本机 `localStorage`，浏览器直连厂商接口，不经过任何第三方服务器

---

## 三、声音选择

### 3.1 唯一声音服务：MiniMax（音色可选）

声音统一走 **MiniMax Speech 2.8 HD 接口**（已内置 API Key），每次调用都**显式指定**：
`voice_id`（用户选择的音色）+ `emotion`（情绪模式）+ `speed`（语速）。

设置面板「② 声音」可选择音色（持久化保存）：

**青春灵动女声**（默认）：

| 音色 | ID | 质感 |
|---|---|---|
| 清脆少女（默认） | `Chinese (Mandarin)_Crisp_Girl` | 灵动、清脆、青春 |
| 少女音 | `female-shaonv` | 清新元气 |
| 温暖少女 | `Chinese (Mandarin)_Warm_Girl` | 青春温柔 |
| 温暖闺蜜 | `Chinese (Mandarin)_Warm_Bestie` | 活泼亲切 |
| 俏皮萌妹 | `qiaopi_mengmei` | 机灵俏皮 |
| 甜美女声 | `Chinese (Mandarin)_Sweet_Lady` | 软甜 |

**播音质感**：

| 音色 | ID | 质感 |
|---|---|---|
| 电台男主播 | `Chinese (Mandarin)_Radio_Host` | 磁性、流畅 |
| 新闻女主播 | `Chinese (Mandarin)_News_Anchor` | 专业播音腔 |
| 播报男声 | `Chinese (Mandarin)_Male_Announcer` | 清晰权威 |
| 抒情男声 | `Chinese (Mandarin)_Lyrical_Voice` | 磁性深沉 |

**其他**：成熟女声 `female-chengshu`（温柔知性）、有声书女声 `audiobook_female_1`（情感起伏大）

### 3.2 情绪 → 语音参数映射（“要有情绪”的核心实现）

| 情绪模式 | 电台频率 | MiniMax 参数 | 语气 |
|---|---|---|---|
| 温和治愈（默认） | FM 98.7 | emotion=calm, speed 0.85 | 治愈旁白：内敛共情、情绪松弛平静、语速平缓、停顿留思考空隙、轻声开导不煽情，适合早安人生感悟/治愈语录 |
| 活力清晨 | FM 104.5 | emotion=happy, speed 1.05 | 明快上扬，把人叫醒 |
| 温柔鼓励 | FM 92.1 | 自动匹配（不指定 emotion）, speed 0.9 | 舒缓温暖，轻声陪伴 |
| 激昂唤醒 | FM 106.8 | emotion=fluent, speed 1.1 | 高亢有力，热血沸腾 |

情绪模式同时作用于三处：**AI 生成提示词**（文案风格）+ **语音引擎参数**（朗读情绪/语速）+ **电台频率**（界面氛围）。
播报风格随机轮换但**与情绪模式匹配**：治愈/温柔模式只轮换治愈语录、哲思启发、温柔陪伴等安静风格，不会出现亢奋内容。

### 3.3 背景音乐（人声背景音）

播报时自动循环播放 `1.mp3` / `2.mp3`（用户自编歌曲，**每次播报随机选一首**）作为**人声背景音**垫底：
淡入 1.2 秒、播报结束淡出 0.8 秒。音量固定（默认 15%，人声清晰可辨），背景音乐默认开启。

---

## 四、使用说明

### 网页版

```bash
# 方式一：直接双击 index.html（模板模式 + 系统音色可用；在线 AI 可能受 file:// 的 CORS 限制）
# 方式二（推荐）：本地服务器，在线 AI 与所有功能完整可用
node server.js            # 默认 http://127.0.0.1:8123
```

1. 打开页面 → 设置面板（⚙）→ 填「你的称呼」（可选，如"谭雅"，播报开头会叫你的名字）
2. 填 DeepSeek API Key（可选，不填走内置模板）
3. 选择情绪模式（温和治愈 / 活力清晨 / 温柔鼓励 / 激昂唤醒）
4. 选择音色（② 声音，青春灵动女声/播音质感等 12 款）→ 点「试听」验证
5. 设定闹钟时间 → 打开闹钟开关 → **无需值守**：页面最小化/切后台也准点播报
   （门铃提示音 + 系统通知 + 「早安，{称呼}，今天是X月X日」+ AI 激励播报 + 自编歌曲背景音），随时可按「▶ 试听」完整走一遍流程

### 桌面版（像 app 一样：关掉窗口也会自动触发）

```bash
cd desktop
npm install        # 首次安装 Electron（约 100MB）
npm start          # 启动曦语
```

- 设置闹钟后**直接关闭窗口**：程序最小化到系统托盘（📻），后台继续监测
- 到点自动：弹出窗口 + 门铃 + 系统通知 + AI 语音播报
- 托盘右键 →「显示电台」找回窗口 /「退出」真正退出
- 重复启动只会唤起已有窗口（单实例）

### 已知限制

- **网页版**：完全关闭浏览器后无法触发（浏览器不允许网页后台常驻）——此场景请用桌面版
- **电脑休眠/睡眠**期间程序不运行，唤醒后 30 分钟宽限窗口内会立即补播
- Chrome 在部分系统上长时间待机后语音可能停顿（已知浏览器缺陷），本 App 播报短（<20 秒）影响很小
- 手机端后续可打包 PWA 或原生 App（思路一致：闹钟调度 + AI 生成 + 情绪 TTS）
