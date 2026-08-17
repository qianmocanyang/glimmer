/* ============================================================
 * voices.js — MiniMax 音色目录（唯一声音服务）
 * 精选电台/播音质感男声 + 青春灵动女声
 * 依赖：无
 * ============================================================ */
(function (global) {
  'use strict';

  /* MiniMax 系统音色（Speech 2.8 HD 情感大模型） */
  const MINIMAX_VOICES = [
    /* ---- 青春灵动女声 ---- */
    { id: 'Chinese (Mandarin)_Crisp_Girl', name: '清脆少女（灵动·推荐）' },
    { id: 'female-shaonv',                  name: '少女音（清新元气）' },
    { id: 'Chinese (Mandarin)_Warm_Girl',   name: '温暖少女（青春温柔）' },
    { id: 'Chinese (Mandarin)_Warm_Bestie', name: '温暖闺蜜（活泼亲切）' },
    { id: 'qiaopi_mengmei',                 name: '俏皮萌妹（机灵）' },
    { id: 'Chinese (Mandarin)_Sweet_Lady',  name: '甜美女声（软甜）' },
    /* ---- 播音质感（电台/主播） ---- */
    { id: 'Chinese (Mandarin)_Radio_Host',  name: '电台男主播（磁性）' },
    { id: 'Chinese (Mandarin)_News_Anchor', name: '新闻女主播（播音腔）' },
    { id: 'Chinese (Mandarin)_Male_Announcer', name: '播报男声（清晰权威）' },
    { id: 'Chinese (Mandarin)_Lyrical_Voice',  name: '抒情男声（磁性深沉）' },
    /* ---- 其他质感 ---- */
    { id: 'female-chengshu',                name: '成熟女声（温柔知性）' },
    { id: 'audiobook_female_1',             name: '有声书女声（情感起伏大）' },
  ];

  global.Voices = {
    MINIMAX_VOICES: MINIMAX_VOICES,
  };
})(window);
