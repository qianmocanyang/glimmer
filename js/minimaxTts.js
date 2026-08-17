/* ============================================================
 * minimaxTts.js — MiniMax Speech 2.8 HD 情感语音合成
 * 当前中文 TTS 情绪表现公认第一梯队（国际评测双榜第一）：
 *  - emotion 参数显式控制情绪（happy/sad/angry/...）
 *  - 模型还会根据文本内容自动匹配语气，活人感强
 * 鉴权：国际版(api.minimax.io)直接 Bearer API Key；
 *       国内版(api.minimaxi.com)若返回 401，自动改签 JWT(HS256)。
 * 返回：MP3 音频 ArrayBuffer（响应中 audio 为 hex 字符串，需解码）
 * 依赖：Config
 * ============================================================ */
(function (global) {
  'use strict';

  const ENDPOINT = 'https://api.minimaxi.com/v1/t2a_v2'; // 国内
  const ENDPOINT_INTL = 'https://api.minimax.io/v1/t2a_v2'; // 国际备用

  function b64url(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /* 生成 JWT：iss=API Key，HS256 用 API Key 作为密钥签名 */
  async function makeJwt(apiKey) {
    const enc = new TextEncoder();
    const header = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
    const now = Math.floor(Date.now() / 1000);
    const payload = b64url(enc.encode(JSON.stringify({
      iss: apiKey,
      exp: now + 86400,
      timestamp: now,
    })));
    const key = await crypto.subtle.importKey('raw', enc.encode(apiKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(header + '.' + payload)));
    return header + '.' + payload + '.' + b64url(sig);
  }

  function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
  }

  function buildBody(settings, text) {
    const emo = Config.EMOTIONS[settings.emotion] || Config.EMOTIONS.energetic;
    const voiceSetting = {
      voice_id: settings.minimaxVoice || 'female-chengshu',
      speed: emo.speed || 1,
      vol: 1,
      pitch: 0,
    };
    // emotion 为 null 时不传，让模型根据文本自动匹配语气
    if (emo.minimaxEmotion) voiceSetting.emotion = emo.minimaxEmotion;
    return {
      model: 'speech-2.8-hd',
      text: text,
      stream: false,
      voice_setting: voiceSetting,
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
    };
  }

  async function postJson(url, token, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = String(res.status);
      try {
        const j = await res.json();
        if (j && j.status_msg) msg = j.status_msg;
        else if (j && j.message) msg = j.message;
      } catch (e) { /* ignore */ }
      const err = new Error('MiniMax 请求失败（' + msg + '）');
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  /**
   * 合成语音
   * 鉴权顺序：国内版 Bearer → (401) 国内版 JWT → 国际版 Bearer
   * @returns {Promise<ArrayBuffer>} MP3 音频
   */
  async function synth(settings, text) {
    if (!settings.minimaxKey) throw new Error('未配置 MiniMax API Key');
    if (!global.crypto || !global.crypto.subtle) throw new Error('当前环境不支持加密（请用 http://127.0.0.1 或 https 访问）');

    const body = buildBody(settings, text);
    const errors = [];
    const tryHost = async function (url, token) {
      try {
        return extractAudio(await postJson(url, token, body));
      } catch (err) {
        errors.push(err);
        throw err;
      }
    };

    // ① 国内版：Bearer Key 直连（平台 Key 通常来自 platform.minimaxi.com）
    try {
      return await tryHost(ENDPOINT, settings.minimaxKey);
    } catch (err1) {
      // ② 国内版返回 401 → 改签 JWT 重试
      if (err1.status === 401) {
        try {
          return await tryHost(ENDPOINT, await makeJwt(settings.minimaxKey));
        } catch (e2) { /* 继续降级 */ }
      }
      // ③ 国际版（海外注册的 Key）
      try {
        return await tryHost(ENDPOINT_INTL, settings.minimaxKey);
      } catch (e3) { /* 继续 */ }
      throw errors[errors.length - 1];
    }
  }

  function extractAudio(json) {
    // MiniMax 错误体：{"base_resp":{"status_code":xxx,"status_msg":"..."}}
    const resp = json && (json.base_resp || json);
    if (resp && resp.status_code !== undefined && resp.status_code !== 0) {
      const err = new Error('MiniMax 错误：' + (resp.status_msg || resp.status_code));
      err.status = resp.status_code;
      throw err;
    }
    const hex = json && json.data && json.data.audio;
    if (!hex) throw new Error('MiniMax 响应缺少音频数据');
    return hexToBytes(hex).buffer;
  }

  global.MiniMaxTTS = { synth: synth };
})(window);
