/* ============================================================
 * ai.js — 激励语生成模块
 * ① 有 API Key：调用 OpenAI 兼容的 Chat Completions 接口（默认智谱 GLM-4.7-Flash）
 * ② 无 Key / 请求失败：降级到内置模板库，保证闹钟播报永不落空
 *
 * Prompt 设计（已设定好）：
 *   - 固定开场：「早安，今天是 X年X月X日 星期X。」
 *   - 随后 50-100 字正文
 *   - 播报风格每次随机不同：元气激励 / 温柔陪伴 / 热血燃向 /
 *     幽默轻松 / 哲思启发 / 新闻播报 —— 多种多样，不单调
 *   - 整体语气跟随情绪模式（活力/温柔/激昂）
 * 依赖：Config
 * ============================================================ */
(function (global) {
  'use strict';

  /* 多样播报风格（每次随机挑选一种；按情绪模式分组，保证语气统一）
   * 全部以「人生感悟式」为底色：短句排比、讲道理，不描写具体场景。
   * 特殊值 'QUOTE' = 名言激励：从 QUOTES 随机引用一条向上的名言展开 */
  const STYLES = {
    gentle: [
      '温柔陪伴：像家人轻声说几句暖心的话，不描写场景，不叮嘱做事',
      '人生感悟：凝练的哲思短句，谈努力、平凡、时间与选择',
      '哲思启发：像老朋友随口一句点醒，让人会心点头',
      '治愈陪伴：语气像阳光里的懒猫，让人感到安心与松弛',
      '禅意如风：短句留白、轻描淡写，像清晨微风拂过心头',
      'QUOTE',
    ],
    energetic: [
      '元气打气：简短有力地说几句提气的话，让人笑着爬起来',
      '幽默逗趣：像损友开个玩笑逗你笑，轻松开场',
      '直白打气：不绕弯子，几句痛快话点燃今天',
      '电竞开团：像游戏开局语音喊话"冲了冲了"，又燃又上头',
      '运动号子：像晨跑领队喊节奏，一二三，燃起来',
      'QUOTE',
    ],
    passionate: [
      '热血燃向：铿锵有力的几句话，像挚友拍着你肩膀为你助威',
      '元气打气：简短有力地说几句提气的话',
      '哲思启发：像老朋友随口一句点醒，让人会心点头',
      '军号燃向：短促有力、句句带劲，像冲锋号在耳边响起',
      '大演说家：梦想宣言式排比，像站在讲台上向全场宣布今天必胜',
      'QUOTE',
    ],
  };

  /* 向上的名人名言库（只收积极、激励、不消极的经典句子，供名言风格引用） */
  const QUOTES = [
    { text: '长风破浪会有时，直挂云帆济沧海', author: '李白' },
    { text: '欲穷千里目，更上一层楼', author: '王之涣' },
    { text: '世上无难事，只要肯登攀', author: '毛泽东' },
    { text: '不积跬步，无以至千里；不积小流，无以成江海', author: '荀子' },
    { text: '天行健，君子以自强不息', author: '《周易》' },
    { text: '宝剑锋从磨砺出，梅花香自苦寒来', author: '《警世贤文》' },
    { text: '既然选择了远方，便只顾风雨兼程', author: '汪国真' },
    { text: '海阔凭鱼跃，天高任鸟飞', author: '《古今贤文》' },
    { text: '少年易老学难成，一寸光阴不可轻', author: '朱熹' },
    { text: '路虽远，行则将至；事虽难，做则必成', author: '古语' },
  ];

  function pickQuote() {
    return QUOTES[Math.floor(Math.random() * QUOTES.length)];
  }

  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  function todayText() {
    const now = new Date();
    return now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 星期' + WEEK[now.getDay()];
  }

  /* 按当前时间自动匹配问候语（不再固定"早安"） */
  function greetingText() {
    const h = new Date().getHours();
    if (h >= 5 && h < 9) return '早安';
    if (h >= 9 && h < 12) return '早上好';
    if (h >= 12 && h < 14) return '午安';
    if (h >= 14 && h < 18) return '下午好';
    if (h >= 18 && h < 23) return '晚上好';
    return '夜深了'; // 23:00 - 5:00
  }

  function buildSystemPrompt(emotionKey, userName) {
    const emo = Config.EMOTIONS[emotionKey] || Config.EMOTIONS.energetic;
    const stylePool = STYLES[emotionKey] || STYLES.energetic;
    let style = stylePool[Math.floor(Math.random() * stylePool.length)];
    // 名言激励风格：随机引用一条向上的名言，并限定围绕它展开
    if (style === 'QUOTE') {
      const q = pickQuote();
      style = '名言激励：正文第一句先说出这句名言「' + q.text + '」——' + q.author
        + '，然后用你自己的话围绕它展开几句鼓励，让名言更有力量';
    }
    const opening = userName
      ? '开场第一句必须是："' + greetingText() + '，' + userName + '，今天是' + todayText() + '。"'
      : '开场第一句必须是："' + greetingText() + '，今天是' + todayText() + '。"';
    return '你是一个温暖亲切的电台主持人，正在主持今天的播报。'
      + opening
      + '随后说一段 50-100 个汉字的中文正文（正文不要再重复日期）。'
      + '【内容要求】以激励、给人力量为主，必须是纯粹的鼓励话语；'
      + '【基调要求】全文必须积极向上、充满希望与正能量，振奋鼓舞，让人听完精神一振、心情明亮；'
      + '严禁任何消极、低落、丧气、疲惫、哀怨、沉重的表达（如"累了就歇""不必强求""接受普通""慢慢熬"等），也严禁描写艰难、压力、焦虑的感受；'
      + '不要出现任何与AI、模型、程序、本电台系统自身相关的表述（例如"我是AI""我能帮你生成""本电台"等），也不要出现"我想做什么"。'
      + '【句式要求】以人生感悟式为主：短句、排比、讲道理（参考："人生没有重来，只有后来。生活也没有如果，只有结果……"）；'
      + '不要描写具体的日常场景或物品（如早餐、街道、天气、公交站、水煮蛋等），不要拟人化形容事物（如"水煮蛋在唱歌""太阳很慷慨"），不要描述自己正在做什么。'
      + '【亲近感是最高要求】你是在对"你"这一个人说话，像认识多年的老朋友、像家人，'
      + '而不是对一群听众广播：'
      + '① 不要"朋友们""各位听众"这类群体称呼，直接用"你"；'
      + '② 不要堆砌华丽比喻和宏大辞藻，语言平实；'
      + '③ 像在耳边轻声说话，让人听完心里一暖。'
      + '今日播报风格（每次随机不同）：' + style + '。'
      + '整体语气要求：' + emo.promptHint + '。'
      + '不要标题、不要引号、不要任何解释，直接输出正文。';
  }

  async function callChatApi(settings) {
    const url = settings.baseUrl.replace(/\/+$/, '') + '/chat/completions';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + settings.apiKey,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: 'system', content: buildSystemPrompt(settings.emotion, settings.userName) },
          { role: 'user', content: '现在到了播报时间，开始今天的播报。' },
        ],
        temperature: 1.0,
        max_tokens: 300,
      }),
    });

    if (!res.ok) {
      let detail = String(res.status);
      try {
        const body = await res.json();
        if (body && body.error) detail = body.error.message || String(body.error);
      } catch (e) { /* 响应体不是 JSON，忽略 */ }
      throw new Error('AI 接口请求失败（' + detail + '）');
    }

    const data = await res.json();
    const text = data && data.choices && data.choices[0]
      && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('AI 接口响应格式异常');
    return text.trim();
  }

  /* 内置模板库（离线 / 无 Key / 失败时使用），结构同 Prompt 设定：
   * 「早安，…今天是…。」+ 人生感悟式正文（短句排比、讲道理、不描写场景） */
  const FALLBACK = {
    energetic: [
      '昨天没做完的事，今天继续就好。你比你以为的更棒，别让小小的犹豫，挡住大大的可能。一步一步来，你想要的生活，正在向你靠近。',
      '起来啦！今天又是全新的一天。别怕，昨天没做完的事，今天继续就好，你比你以为的更棒。新的可能正在敲门，开门的人是你自己。',
      '给自己一个笑脸。今天不管遇到什么，都记得有我这句话垫底：你值得一切好事，慢慢来，我陪你。把今天的日子过好，明天自然会来。',
      '古人说，欲穷千里目，更上一层楼。今天的你，又站在了新的台阶上。别低头看脚下的坎，抬头看远处的光，往上走，风景会越来越好看。',
      '古人说，路虽远，行则将至；事虽难，做则必成。昨天再难也已经翻篇，今天再远也一步步走。你只管出发，路会自己在你脚下铺开。',
    ],
    gentle: [
      '生活不会一直平坦，但也没有过不去的坎。每一次努力都在让你变强，你走过的每一步，都算数。好日子是干出来的，更是盼出来的。',
      '真正的温柔，是看得见生活的光，还愿意向前走。今天不用急着证明什么，你好好过，日子就会好好待你。把心放宽，把脚步走稳，好运正在路上。',
      '人生是一场长跑，不争一时快慢。把心安顿好，把日子过顺，该来的美好，都在路上。不慌不忙，才是最好的节奏；不紧不慢，才能走到最后。',
      '天行健，君子以自强不息。古人早就告诉我们，日子再寻常，也挡不住一颗想变好的心。今天不必轰轰烈烈，细水长流，也是一种了不起。',
      '古人说，不积跬步，无以至千里。今天的每一个小坚持，都在悄悄垒起你的远方。别着急，慢慢来，你在路上，就已经很美。',
    ],
    passionate: [
      '起来！今天不是平凡的一天，是你把梦想往前推一步的日子。别犹豫，别回头，天大的事一件一件来，我在这儿看着你，冲就完了！',
      '闹钟响的那一刻，你已经在赢了。把今天当成战场，你就是主角，谁都不能挡住你发光。深呼吸，握紧拳头，准备好了吗？出发！',
      '新的一天，新的可能。别让昨天的疲惫拖住你，今天的你，值得全力以赴。往前跑，我在终点等你！汗水不会骗人，努力终有回响。',
      '长风破浪会有时，直挂云帆济沧海！这是古人的豪情，也是你今天的样子。扬起你的帆，把心中的浪踩在脚下，这一程，你定能乘风而行！',
      '古人说，宝剑锋从磨砺出，梅花香自苦寒来。每一次咬牙，都在磨你的锋芒。今天别退缩，你吃的苦，都会变成明天笑的光。',
    ],
  };

  function getFallback(emotionKey, userName) {
    const pool = FALLBACK[emotionKey] || FALLBACK.energetic;
    const passage = pool[Math.floor(Math.random() * pool.length)];
    const opening = userName
      ? greetingText() + '，' + userName + '，今天是' + todayText() + '。'
      : greetingText() + '，今天是' + todayText() + '。';
    return opening + passage;
  }

  /**
   * 生成激励语
   * @returns {Promise<{text: string, source: 'ai'|'template'}>}
   *   source: 'ai' = 在线生成成功；'template' = 使用内置模板（无 Key 或请求失败）
   */
  async function generateMotivation(settings) {
    if (!settings.apiKey) {
      return { text: getFallback(settings.emotion, settings.userName), source: 'template' };
    }
    try {
      return { text: await callChatApi(settings), source: 'ai' };
    } catch (err) {
      console.warn('[ai] 在线生成失败，降级到内置模板：', err.message);
      return { text: getFallback(settings.emotion, settings.userName), source: 'template' };
    }
  }

  global.AI = { generateMotivation: generateMotivation };
})(window);
