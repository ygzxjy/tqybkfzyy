/* ===========================
   Weather App v8 · 极致版
   新增：3D 视差 · 命令面板(Cmd+K) · 设置抽屉 · 今日 vs 昨日
   =========================== */

(() => {
  'use strict';

  // ---------- Settings ----------
  const K = {
    last: 'wx:lastCity',
    recents: 'wx:recents',
    cities: 'wx:cities',     // 多城市 dashboard
    unit: 'wx:unit',         // 'c' | 'f'
    anim: 'wx:anim',         // boolean
    parallax: 'wx:parallax', // boolean
    sound: 'wx:sound',       // boolean
    refresh: 'wx:refresh',   // 秒数，0 = 关闭
  };
  const MAX_CITIES = 6;
  // 首次进入预热：默认热门城市
  const DEFAULT_CITIES = [
    { name: '北京', lat: 116.40, lon: 39.90 },
    { name: '上海', lat: 121.47, lon: 31.23 },
    { name: '广州', lat: 113.26, lon: 23.13 },
    { name: '深圳', lat: 114.06, lon: 22.54 },
    { name: '杭州', lat: 120.16, lon: 30.27 },
  ];
  const getCities = () => {
    try { return JSON.parse(localStorage.getItem(K.cities) || '[]'); }
    catch { return []; }
  };
  const setCities = (l) => localStorage.setItem(K.cities, JSON.stringify(l));
  const upsertCity = (city) => {
    const list = getCities().filter(c => c.name !== city.name);
    list.unshift(city);
    setCities(list.slice(0, MAX_CITIES));
    renderCities();
  };
  const removeCity = (name) => {
    setCities(getCities().filter(c => c.name !== name));
    renderCities();
  };
  const Settings = {
    get unit() { return localStorage.getItem(K.unit) || 'c'; },
    set unit(v) { localStorage.setItem(K.unit, v); },
    get anim() { return localStorage.getItem(K.anim) !== 'false'; },
    set anim(v) { localStorage.setItem(K.anim, String(v)); },
    get parallax() { return localStorage.getItem(K.parallax) !== 'false'; },
    set parallax(v) { localStorage.setItem(K.parallax, String(v)); },
    get sound() { return localStorage.getItem(K.sound) === 'true'; },
    set sound(v) { localStorage.setItem(K.sound, String(v)); },
    get refresh() { return parseInt(localStorage.getItem(K.refresh) || '300', 10); },
    set refresh(v) { localStorage.setItem(K.refresh, String(v)); },
  };
  const MAX_RECENTS = 6;
  const getLast = () => localStorage.getItem(K.last);
  const setLast = (c) => localStorage.setItem(K.last, c);
  const getRecents = () => { try { return JSON.parse(localStorage.getItem(K.recents) || '[]'); } catch { return []; } };
  const setRecents = (l) => localStorage.setItem(K.recents, JSON.stringify(l));
  const pushRecent = (city) => {
    const list = getRecents().filter(c => c.toLowerCase() !== city.toLowerCase());
    list.unshift(city);
    setRecents(list.slice(0, MAX_RECENTS));
    renderRecents();
  };

  // 智能拆分多部分名字：'顺德区·佛山市' → ['顺德区', '佛山市']；'佛山' → ['佛山']
  const splitCityParts = (label) => {
    if (!label || !label.includes('·')) return [label];
    return label.split('·').map(s => s.trim()).filter(Boolean);
  };
  // 多个名字都推入 recents（去重保留顺序）
  const pushMultiRecents = (names) => {
    const list = getRecents();
    const lower = new Set(list.map(c => c.toLowerCase()));
    const newOnes = names.filter(n => !lower.has(n.toLowerCase()));
    if (newOnes.length) {
      setRecents([...newOnes.reverse(), ...list].slice(0, MAX_RECENTS));
      renderRecents();
    }
  };

  // 关键词模式：智能提取城市名 + 天数偏移
  // 输入 "北京明天天气" → { city: "北京", dayOffset: 1 }
  const extractQuery = (input) => {
    let q = (input || '').trim();
    if (!q) return { city: '', dayOffset: 0, variations: [] };
    let dayOffset = 0;
    if (/大后天/.test(q)) dayOffset = 3;
    else if (/后天/.test(q)) dayOffset = 2;
    else if (/明天|明日/.test(q)) dayOffset = 1;
    else if (/今天|今日|今/.test(q)) dayOffset = 0;
    const stopWords = [
      '天气', '气温', '温度', '气侯', '气候', '怎么', '怎么样', '样', '如何',
      '热不热', '冷不冷', '热吗', '冷吗', '热么', '冷么', '会冷', '会热',
      '下雨吗', '下雪吗', '下雨么', '下雪么', '会不会下', '有没有雨',
      '多少度', '几度', '高不高', '低不低', '好吗', '好不好', '如何呢',
      '吗', '啊', '吧', '呢', '呀', '哇', '哦', '哈', '请问', '想知道', '查一下',
      '查询', '看看', '告诉', '查', '看', '现在', '此时', '当前',
    ];
    let city = q;
    for (const w of stopWords) city = city.split(w).join(' ');
    city = city.replace(/\s+/g, ' ').trim();

    // 生成搜索变体列表（从“湛江雷州” 这种拼在一起的变出多种尝试）
    const variations = [city];
    if (city && !city.endsWith('市') && !city.endsWith('县') && !city.endsWith('区')) {
      variations.push(city + '市');
    }
    if (city.includes('市')) {
      const parts = city.split('市').filter(Boolean).map(p => p + '市');
      variations.push(...parts);
    }
    // 4-6 字符无“市” → 拆为两半（湛江雷州 → 湛江市 + 雷州市）
    if (city.length >= 4 && city.length <= 8 && !city.includes('市')) {
      for (let i = 2; i <= city.length - 2; i++) {
        const left = city.slice(0, i) + '市';
        const right = city.slice(i) + '市';
        if (!variations.includes(left)) variations.push(left);
        if (!variations.includes(right)) variations.push(right);
      }
    }
    return { city, dayOffset, variations };
  };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const els = {
    cityInput: $('cityInput'),
    searchBtn: $('searchBtn'),
    locBtn: $('locBtn'),
    cmdBtn: $('cmdBtn'),
    settingsBtn: $('settingsBtn'),
    suggestions: $('suggestions'),
    recent: $('recent'),
    error: $('error'),
    errorText: $('errorText'),
    skeleton: $('skeleton'),
    content: $('content'),
    brandMark: $('brandMark'),
    app: $('app'),
    parallaxLayer: $('parallaxLayer'),
    bgMesh: $('bgMesh'),
    insightIcon: $('insightIcon'),
    insightText: $('insightText'),
    cityName: $('cityName'),
    updateTime: $('updateTime'),
    refreshBtn: $('refreshBtn'),
    heroIcon: $('heroIcon'),
    heroCard: $('heroCard'),
    currentTemp: $('currentTemp'),
    weatherDesc: $('weatherDesc'),
    tempMax: $('tempMax'),
    tempMin: $('tempMin'),
    feelsQuick: $('feelsQuick'),
    tempUnit: $('tempUnit'),
    sunrise: $('sunrise'),
    sunset: $('sunset'),
    sunOrb: $('sunOrb'),
    arcFillPath: $('arcFillPath'),
    tempChart: $('tempChart'),
    chartAxis: $('chartAxis'),
    humidity: $('humidity'),
    humidityBar: $('humidityBar'),
    wind: $('wind'),
    windDir: $('windDir'),
    windArrow: $('windArrow'),
    feelsLike: $('feelsLike'),
    feelsDiff: $('feelsDiff'),
    uv: $('uv'),
    uvHint: $('uvHint'),
    visibility: $('visibility'),
    visHint: $('visHint'),
    pressure: $('pressure'),
    aqiCard: $('aqiCard'),
    aqiNum: $('aqiNum'),
    aqiLabel: $('aqiLabel'),
    aqiPm25: $('aqiPm25'),
    aqiPm10: $('aqiPm10'),
    aqiO3: $('aqiO3'),
    aqiTip: $('aqiTip'),
    gaugeArc: $('gaugeArc'),
    gaugeNeedle: $('gaugeNeedle'),
    forecastList: $('forecastList'),
    bgStars: $('bgStars'),
    bgClouds: $('bgClouds'),
    bgRain: $('bgRain'),
    bgSnow: $('bgSnow'),
    // 多城市 + 预警
    cityList: $('cityList'),
    warnings: $('warnings'),
    moonInfo: $('moonInfo'),
    sunCountdown: $('sunCountdown'),
    // compare
    compareCard: $('compareCard'),
    compareTodayIcon: $('compareTodayIcon'),
    compareTodayTemp: $('compareTodayTemp'),
    compareYesterdayIcon: $('compareYesterdayIcon'),
    compareYesterdayTemp: $('compareYesterdayTemp'),
    compareArrow: $('compareArrow'),
    compareText: $('compareText'),
    // command palette
    cmdPalette: $('cmdPalette'),
    cmdBackdrop: $('cmdBackdrop'),
    cmdInput: $('cmdInput'),
    cmdResults: $('cmdResults'),
    // settings
    settingsDrawer: $('settingsDrawer'),
    settingsBackdrop: $('settingsBackdrop'),
    closeSettings: $('closeSettings'),
    unitToggle: $('unitToggle'),
    animSwitch: $('animSwitch'),
    parallaxSwitch: $('parallaxSwitch'),
    soundSwitch: $('soundSwitch'),
    refreshSelect: $('refreshSelect'),
  };

  // ---------- 工具 ----------
  const showError = (m) => { els.errorText.textContent = m; els.error.hidden = false; console.warn('[wx]', m); };
  const hideError = () => { els.error.hidden = true; els.errorText.textContent = ''; };
  const showSkeleton = (s) => { els.skeleton.hidden = !s; };
  const showContent = (s) => { els.content.hidden = !s; };
  const pad = (n) => String(n).padStart(2, '0');
  const fmtTime = (d) => `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const fmtHM = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  // 温度单位换算
  const toUnit = (c) => Settings.unit === 'f' ? c * 9 / 5 + 32 : c;
  const unitSuffix = () => Settings.unit === 'f' ? '°F' : '°C';
  const fmtTemp = (c, decimals = 0) => {
    const v = toUnit(c);
    return decimals > 0 ? v.toFixed(1) : Math.round(v);
  };

  // 数字滚动
  const animateNumber = (el, target, duration = 800, fmt) => {
    const start = parseFloat(el.dataset.current || '0');
    const t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const f = fmt || ((v) => Number.isInteger(target) ? Math.round(v) : v.toFixed(1));
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const v = start + (target - start) * ease(p);
      el.textContent = f(v);
      if (p < 1) requestAnimationFrame(tick);
      else el.dataset.current = String(target);
    };
    requestAnimationFrame(tick);
  };

  // ---------- 天气码 ----------
  const WX = {
    0:  { desc: '晴朗', icon: 'sunny', type: 'sunny' },
    1:  { desc: '大致晴朗', icon: 'sunny', type: 'sunny' },
    2:  { desc: '局部多云', icon: 'partly', type: 'partly' },
    3:  { desc: '阴天', icon: 'cloudy', type: 'cloudy' },
    45: { desc: '有雾', icon: 'fog', type: 'cloudy' },
    48: { desc: '雾凇', icon: 'fog', type: 'cloudy' },
    51: { desc: '小毛毛雨', icon: 'rain', type: 'rain' },
    53: { desc: '毛毛雨', icon: 'rain', type: 'rain' },
    55: { desc: '大毛毛雨', icon: 'rain', type: 'rain' },
    61: { desc: '小雨', icon: 'rain', type: 'rain' },
    63: { desc: '中雨', icon: 'rain', type: 'rain' },
    65: { desc: '大雨', icon: 'rain', type: 'rain' },
    71: { desc: '小雪', icon: 'snow', type: 'snow' },
    73: { desc: '中雪', icon: 'snow', type: 'snow' },
    75: { desc: '大雪', icon: 'snow', type: 'snow' },
    80: { desc: '小阵雨', icon: 'rain', type: 'rain' },
    81: { desc: '阵雨', icon: 'rain', type: 'rain' },
    82: { desc: '强阵雨', icon: 'thunder', type: 'rain' },
    95: { desc: '雷暴', icon: 'thunder', type: 'thunder' },
    96: { desc: '雷暴伴冰雹', icon: 'thunder', type: 'thunder' },
    99: { desc: '强雷暴伴冰雹', icon: 'thunder', type: 'thunder' },
  };
  const getWx = (code) => WX[code] || { desc: '未知', icon: 'cloudy', type: 'cloudy' };

  // ---------- 3D SVG 图标库 ----------
  const rid = (() => { let n = 0; return () => ++n; })();
  const ICON = {
    sunny: (size = 100) => {
      const a = rid(), b = rid();
      return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="wx-3d">
        <defs>
          <radialGradient id="sun-${a}"><stop offset="0%" stop-color="#fffce8"/><stop offset="40%" stop-color="#ffd93d"/><stop offset="100%" stop-color="#ff7a3c"/></radialGradient>
          <radialGradient id="sunHalo-${a}"><stop offset="0%" stop-color="rgba(255,217,61,0.4)"/><stop offset="100%" stop-color="rgba(255,217,61,0)"/></radialGradient>
        </defs>
        <circle cx="50" cy="50" r="35" fill="url(#sunHalo-${a})" class="pulse"/>
        <g class="rays" stroke="url(#sun-${b})" stroke-width="3" stroke-linecap="round" opacity="0.9">
          <line x1="50" y1="8" x2="50" y2="20"/><line x1="50" y1="80" x2="50" y2="92"/>
          <line x1="8" y1="50" x2="20" y2="50"/><line x1="80" y1="50" x2="92" y2="50"/>
          <line x1="20" y1="20" x2="29" y2="29"/><line x1="71" y1="71" x2="80" y2="80"/>
          <line x1="80" y1="20" x2="71" y2="29"/><line x1="29" y1="71" x2="20" y2="80"/>
        </g>
        <circle cx="50" cy="50" r="20" fill="url(#sun-${a})" class="core"/>
      </svg>`;
    },
    partly: (size = 100) => {
      const a = rid(), b = rid(), c = rid();
      return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="wx-3d">
        <defs>
          <radialGradient id="sun-p-${a}"><stop offset="0%" stop-color="#fffce8"/><stop offset="100%" stop-color="#ffaa3c"/></radialGradient>
          <linearGradient id="cloud-p-${b}" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#94a3b8"/></linearGradient>
        </defs>
        <g style="transform-origin: 32px 32px;" class="rays" stroke="#ffd93d" stroke-width="2.5" stroke-linecap="round">
          <line x1="32" y1="6" x2="32" y2="14"/><line x1="32" y1="50" x2="32" y2="58"/>
          <line x1="6" y1="32" x2="14" y2="32"/><line x1="50" y1="32" x2="58" y2="32"/>
          <line x1="14" y1="14" x2="20" y2="20"/><line x1="44" y1="44" x2="50" y2="50"/>
        </g>
        <circle cx="32" cy="32" r="13" fill="url(#sun-p-${c})" class="core"/>
        <g class="cloud-body">
          <ellipse cx="60" cy="65" rx="22" ry="13" fill="url(#cloud-p-${b})"/>
          <ellipse cx="76" cy="60" rx="18" ry="12" fill="url(#cloud-p-${b})"/>
          <ellipse cx="65" cy="72" rx="26" ry="14" fill="url(#cloud-p-${b})"/>
        </g>
      </svg>`;
    },
    cloudy: (size = 100) => {
      const a = rid();
      return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="wx-3d">
        <defs>
          <linearGradient id="cloud-c-${a}" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#64748b"/></linearGradient>
        </defs>
        <g class="cloud-body">
          <ellipse cx="32" cy="55" rx="22" ry="14" fill="url(#cloud-c-${a})"/>
          <ellipse cx="55" cy="48" rx="20" ry="13" fill="url(#cloud-c-${a})"/>
          <ellipse cx="70" cy="55" rx="22" ry="14" fill="url(#cloud-c-${a})"/>
          <ellipse cx="50" cy="62" rx="32" ry="14" fill="url(#cloud-c-${a})"/>
        </g>
      </svg>`;
    },
    fog: (size = 100) => {
      const a = rid();
      return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="wx-3d">
        <defs><linearGradient id="fog-${a}" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#94a3b8"/></linearGradient></defs>
        <g class="cloud-body" opacity="0.85">
          <ellipse cx="32" cy="42" rx="22" ry="13" fill="url(#fog-${a})" opacity="0.7"/>
          <ellipse cx="62" cy="38" rx="22" ry="13" fill="url(#fog-${a})" opacity="0.7"/>
        </g>
        <line x1="15" y1="62" x2="85" y2="62" stroke="#cbd5e0" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>
        <line x1="20" y1="72" x2="80" y2="72" stroke="#cbd5e0" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/>
        <line x1="25" y1="82" x2="75" y2="82" stroke="#cbd5e0" stroke-width="2.5" stroke-linecap="round" opacity="0.4"/>
      </svg>`;
    },
    rain: (size = 100) => {
      const a = rid(), b = rid();
      return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="wx-3d">
        <defs>
          <linearGradient id="cloud-r-${a}" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#94a3b8"/><stop offset="100%" stop-color="#475569"/></linearGradient>
          <linearGradient id="drop-${b}" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="rgba(120,180,255,0)"/><stop offset="100%" stop-color="rgba(120,180,255,0.95)"/></linearGradient>
        </defs>
        <g class="cloud-body">
          <ellipse cx="32" cy="40" rx="20" ry="13" fill="url(#cloud-r-${a})"/>
          <ellipse cx="55" cy="36" rx="18" ry="12" fill="url(#cloud-r-${a})"/>
          <ellipse cx="68" cy="42" rx="20" ry="12" fill="url(#cloud-r-${a})"/>
          <ellipse cx="50" cy="46" rx="30" ry="13" fill="url(#cloud-r-${a})"/>
        </g>
        <line class="drop" x1="32" y1="62" x2="29" y2="78" stroke="url(#drop-${b})" stroke-width="2.5" stroke-linecap="round" style="animation-delay:0s"/>
        <line class="drop" x1="44" y1="62" x2="41" y2="80" stroke="url(#drop-${b})" stroke-width="2.5" stroke-linecap="round" style="animation-delay:0.2s"/>
        <line class="drop" x1="56" y1="62" x2="53" y2="78" stroke="url(#drop-${b})" stroke-width="2.5" stroke-linecap="round" style="animation-delay:0.4s"/>
        <line class="drop" x1="68" y1="62" x2="65" y2="80" stroke="url(#drop-${b})" stroke-width="2.5" stroke-linecap="round" style="animation-delay:0.1s"/>
        <line class="drop" x1="38" y1="66" x2="35" y2="84" stroke="url(#drop-${b})" stroke-width="2.5" stroke-linecap="round" style="animation-delay:0.3s"/>
        <line class="drop" x1="62" y1="66" x2="59" y2="84" stroke="url(#drop-${b})" stroke-width="2.5" stroke-linecap="round" style="animation-delay:0.5s"/>
      </svg>`;
    },
    snow: (size = 100) => {
      const a = rid();
      return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="wx-3d">
        <defs><linearGradient id="cloud-s-${a}" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#e2e8f0"/><stop offset="100%" stop-color="#64748b"/></linearGradient></defs>
        <g class="cloud-body">
          <ellipse cx="32" cy="40" rx="20" ry="13" fill="url(#cloud-s-${a})"/>
          <ellipse cx="55" cy="36" rx="18" ry="12" fill="url(#cloud-s-${a})"/>
          <ellipse cx="68" cy="42" rx="20" ry="12" fill="url(#cloud-s-${a})"/>
          <ellipse cx="50" cy="46" rx="30" ry="13" fill="url(#cloud-s-${a})"/>
        </g>
        <g fill="white" stroke="rgba(180,210,255,0.4)" stroke-width="0.5">
          <circle class="flake" cx="30" cy="68" r="3" style="animation-delay:0s"/>
          <circle class="flake" cx="46" cy="74" r="2.5" style="animation-delay:0.5s"/>
          <circle class="flake" cx="60" cy="68" r="3" style="animation-delay:1s"/>
          <circle class="flake" cx="74" cy="76" r="2" style="animation-delay:1.5s"/>
        </g>
      </svg>`;
    },
    thunder: (size = 100) => {
      const a = rid();
      return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="wx-3d">
        <defs>
          <linearGradient id="cloud-t-${a}" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#475569"/><stop offset="100%" stop-color="#1e293b"/></linearGradient>
        </defs>
        <g class="cloud-body">
          <ellipse cx="32" cy="36" rx="20" ry="13" fill="url(#cloud-t-${a})"/>
          <ellipse cx="55" cy="32" rx="18" ry="12" fill="url(#cloud-t-${a})"/>
          <ellipse cx="68" cy="38" rx="20" ry="12" fill="url(#cloud-t-${a})"/>
          <ellipse cx="50" cy="42" rx="30" ry="13" fill="url(#cloud-t-${a})"/>
        </g>
        <path class="bolt" d="M 54 48 L 40 70 L 50 70 L 44 90 L 64 64 L 54 64 Z" fill="#ffd93d" stroke="#ff8800" stroke-width="0.5" stroke-linejoin="round"/>
      </svg>`;
    },
  };

  const brandLogo = () => {
    const a = rid();
    return `<svg viewBox="0 0 32 32" width="36" height="36">
      <defs>
        <linearGradient id="brand-wind-${a}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f093fb"/>
          <stop offset="100%" stop-color="#667eea"/>
        </linearGradient>
        <linearGradient id="brand-dot-${a}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fffce8"/>
          <stop offset="100%" stop-color="#ffd93d"/>
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill="none" stroke="url(#brand-wind-${a})" stroke-width="2" opacity="0.8"/>
      <path d="M 7 12 Q 14 9 22 12 Q 26 13 28 11" stroke="url(#brand-wind-${a})" stroke-width="2" fill="none" stroke-linecap="round" class="wx-rays"/>
      <path d="M 5 17 Q 12 14 20 17 Q 24 18 27 16" stroke="url(#brand-wind-${a})" stroke-width="2" fill="none" stroke-linecap="round" class="wx-rays"/>
      <path d="M 7 22 Q 14 19 22 22 Q 26 23 28 21" stroke="url(#brand-wind-${a})" stroke-width="2" fill="none" stroke-linecap="round" class="wx-rays"/>
      <circle cx="22" cy="9" r="2.5" fill="url(#brand-dot-${a})" class="wx-sun"/>
    </svg>`;
  };

  // ---------- 主题 ----------
  const THEMES = {
    sunny: { bg1: '#3a2d6b', bg2: '#5a3a8a', bg3: '#8b4a6a' },
    partly: { bg1: '#1e2a5e', bg2: '#3a4a7a', bg3: '#5a4a8a' },
    cloudy: { bg1: '#1e293b', bg2: '#334155', bg3: '#475569' },
    rain: { bg1: '#0f172a', bg2: '#1e3a5f', bg3: '#0c4a6e' },
    snow: { bg1: '#1e3a5f', bg2: '#475569', bg3: '#64748b' },
    thunder: { bg1: '#0a0a1a', bg2: '#1a1a3a', bg3: '#2d1b69' },
    night: { bg1: '#0a0e27', bg2: '#1a1a3a', bg3: '#2d1b69' },
  };
  const applyTheme = (type, isDay) => {
    const t = !isDay ? THEMES.night : (THEMES[type] || THEMES.cloudy);
    document.body.style.background = `linear-gradient(135deg, ${t.bg1} 0%, ${t.bg2} 50%, ${t.bg3} 100%)`;
    els.bgMesh.style.background = `radial-gradient(at 30% 20%, ${t.bg3}40 0%, transparent 50%),
                                    radial-gradient(at 70% 80%, ${t.bg2}60 0%, transparent 50%)`;
    els.bgClouds.classList.toggle('active', type === 'cloudy' || type === 'partly');
    els.bgStars.classList.toggle('active', !isDay);
    els.bgRain.classList.toggle('active', type === 'rain' || type === 'thunder');
    els.bgSnow.classList.toggle('active', type === 'snow');
  };

  const initBackground = () => {
    for (let i = 0; i < 6; i++) {
      const d = document.createElement('div');
      d.className = 'cloud-blob';
      d.style.width = `${200 + Math.random() * 200}px`;
      d.style.height = `${60 + Math.random() * 40}px`;
      d.style.top = `${Math.random() * 100}%`;
      d.style.animationDuration = `${30 + Math.random() * 30}s`;
      d.style.animationDelay = `${-Math.random() * 30}s`;
      els.bgClouds.appendChild(d);
    }
    for (let i = 0; i < 120; i++) {
      const s = document.createElement('div');
      s.className = 'star';
      s.style.left = `${Math.random() * 100}%`;
      s.style.top = `${Math.random() * 70}%`;
      s.style.width = `${1 + Math.random() * 2}px`;
      s.style.height = s.style.width;
      s.style.animationDelay = `${Math.random() * 3}s`;
      els.bgStars.appendChild(s);
    }
    for (let i = 0; i < 100; i++) {
      const r = document.createElement('div');
      r.className = 'raindrop';
      r.style.left = `${Math.random() * 100}%`;
      r.style.animationDuration = `${0.4 + Math.random() * 0.5}s`;
      r.style.animationDelay = `${Math.random() * 1}s`;
      els.bgRain.appendChild(r);
    }
    const fs = ['❄', '❅', '✻'];
    for (let i = 0; i < 60; i++) {
      const s = document.createElement('div');
      s.className = 'snowflake';
      s.textContent = fs[Math.floor(Math.random() * fs.length)];
      s.style.left = `${Math.random() * 100}%`;
      s.style.fontSize = `${8 + Math.random() * 10}px`;
      s.style.animationDuration = `${4 + Math.random() * 8}s`;
      s.style.animationDelay = `${Math.random() * 5}s`;
      els.bgSnow.appendChild(s);
    }
  };

  // ---------- API ----------
  const geocode = async (name, signal) => {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=8&language=zh&format=json`, { signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()).results || [];
  };
  const fetchWeather = async (lat, lon, signal) => {
    const p = new URLSearchParams({
      latitude: lat, longitude: lon,
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,visibility,pressure_msl,cloud_cover',
      hourly: 'temperature_2m,weather_code,precipitation_probability,precipitation',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max,sunrise,sunset',
      timezone: 'auto', forecast_days: 7,
    });
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?${p}`, { signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  const fetchYesterday = async (lat, lon, signal) => {
    // Open-Meteo archive API: 昨天数据
    const yesterday = new Date(Date.now() - 86400000);
    const dateStr = yesterday.toISOString().slice(0, 10);
    const p = new URLSearchParams({
      latitude: lat, longitude: lon,
      start_date: dateStr, end_date: dateStr,
      daily: 'weather_code,temperature_2m_max,temperature_2m_min',
      timezone: 'auto',
    });
    try {
      const r = await fetch(`https://archive-api.open-meteo.com/v1/archive?${p}`, { signal });
      if (!r.ok) return null;
      const data = await r.json();
      return {
        max: data.daily?.temperature_2m_max?.[0],
        min: data.daily?.temperature_2m_min?.[0],
        code: data.daily?.weather_code?.[0],
      };
    } catch { return null; }
  };
  const fetchAQI = async (lat, lon, signal) => {
    try {
      const p = new URLSearchParams({ latitude: lat, longitude: lon, current: 'us_aqi,pm10,pm2_5,ozone', timezone: 'auto' });
      const r = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${p}`, { signal });
      if (!r.ok) return null;
      return (await r.json()).current || null;
    } catch { return null; }
  };
  const reverseGeocode = async (lat, lon) => {
    try {
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`);
      if (!r.ok) return null;
      const d = await r.json();
      // 优先拼接最具体的位置：“区 · 市”，跟 iOS 原生天气对齐
      if (d.locality && d.city && d.locality !== d.city) return `${d.locality} · ${d.city}`;
      if (d.locality) return d.locality;
      if (d.city) return d.city;
      if (d.principalSubdivision) return d.principalSubdivision;
      return null;
    } catch { return null; }
  };

  // ---------- 渲染 ----------
  // 相对时间显示
  let lastUpdateAt = null;
  const relativeTime = (date) => {
    if (!date) return '—';
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 5) return '刚刚';
    if (diff < 60) return `${diff}秒前`;
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    return fmtTime(date);
  };
  const updateTimeText = () => {
    if (els.updateTime) els.updateTime.textContent = relativeTime(lastUpdateAt);
  };
  // 每秒更新一次相对时间
  setInterval(updateTimeText, 1000);

  const renderHero = (data, city) => {
    const { current, daily } = data;
    const info = getWx(current.weather_code);
    els.cityName.textContent = city;
    lastUpdateAt = new Date();
    updateTimeText();
    els.heroIcon.innerHTML = ICON[info.icon](96);
    els.weatherDesc.textContent = info.desc;
    els.tempUnit.textContent = Settings.unit === 'f' ? '°F' : '°';
    animateNumber(els.currentTemp, fmtTemp(current.temperature_2m));
    animateNumber(els.tempMax, fmtTemp(daily.temperature_2m_max[0]));
    animateNumber(els.tempMin, fmtTemp(daily.temperature_2m_min[0]));
    animateNumber(els.feelsQuick, fmtTemp(current.apparent_temperature));
    applyTheme(info.type, !!current.is_day);
  };

  const generateInsight = (data) => {
    const { current, daily, hourly } = data;
    const info = getWx(current.weather_code);
    const temp = current.temperature_2m;
    const max = daily.temperature_2m_max[0];
    const min = daily.temperature_2m_min[0];
    const feels = current.apparent_temperature;
    const uv = daily.uv_index_max?.[0] || 0;
    const rainProb = daily.precipitation_probability_max?.[0] || 0;
    const wind = current.wind_speed_10m;
    const isDay = current.is_day;
    const hour = new Date().getHours();
    const lines = [];
    if (info.type === 'rain' || info.type === 'thunder') lines.push(`今天有${info.desc}，记得带伞`);
    else if (info.type === 'snow') lines.push(`${info.desc}，注意保暖和路面湿滑`);
    else if (info.type === 'sunny' && uv >= 6) lines.push(`紫外线${uv.toFixed(0)}，${uv >= 8 ? '很强' : '较强'}，建议涂防晒霜`);
    else if (info.type === 'sunny' && temp >= 30) lines.push(`高温${fmtTemp(temp)}°，多喝水注意防暑`);
    else if (temp <= 0) lines.push(`气温${fmtTemp(temp)}°，出门注意保暖`);
    else if (wind >= 30) lines.push(`风较大（${wind.toFixed(0)} km/h），注意高空坠物`);
    else if (feels - temp >= 3) lines.push(`湿度较高，体感${fmtTemp(feels)}°比实际闷热`);
    else if (rainProb >= 50) lines.push(`今日降水概率${rainProb}%，出门备伞`);
    else if (!isDay) { if (hour >= 19) lines.push(`夜已深，注意休息`); else lines.push(`现在是夜晚，体感${fmtTemp(feels)}°`); }
    else { const diff = max - min; if (diff >= 10) lines.push(`今日温差${fmtTemp(diff)}°，注意增减衣物`); else lines.push(`${info.desc}，${fmtTemp(temp)}°，体感舒适`); }
    if (rainProb >= 70 && info.type !== 'rain') lines.push(`傍晚可能有雨`);
    return lines.slice(0, 2).join('，');
  };

  const renderInsight = (data) => {
    els.insightText.textContent = generateInsight(data);
    els.insightIcon.textContent = '✨';
  };

  // 对比昨日
  const renderCompare = (today, yesterday) => {
    if (!yesterday || yesterday.max == null) { els.compareCard.hidden = true; return; }
    els.compareCard.hidden = false;
    const tInfo = getWx(today.current.weather_code);
    const yInfo = getWx(yesterday.code);
    els.compareTodayIcon.innerHTML = ICON[tInfo.icon](36);
    els.compareYesterdayIcon.innerHTML = ICON[yInfo.icon](36);
    els.compareTodayTemp.textContent = `${fmtTemp(today.current.temperature_2m)}°`;
    els.compareYesterdayTemp.textContent = `${Math.round(yesterday.max)}° / ${Math.round(yesterday.min)}°`;

    const diff = today.current.temperature_2m - ((yesterday.max + yesterday.min) / 2);
    const absDiff = Math.abs(diff).toFixed(0);
    if (diff > 0.5) {
      els.compareArrow.textContent = '↑';
      els.compareArrow.style.color = '#ff7a5a';
      els.compareText.innerHTML = `今天比昨天<b class="up"> 高 ${absDiff}°</b>`;
    } else if (diff < -0.5) {
      els.compareArrow.textContent = '↓';
      els.compareArrow.style.color = '#4fc3f7';
      els.compareText.innerHTML = `今天比昨天<b class="down"> 低 ${absDiff}°</b>`;
    } else {
      els.compareArrow.textContent = '=';
      els.compareArrow.style.color = 'var(--text-faint)';
      els.compareText.textContent = '今天和昨天差不多';
    }
  };

  const renderSunArc = (data) => {
    const { daily } = data;
    els.sunrise.textContent = fmtHM(daily.sunrise[0]);
    els.sunset.textContent = fmtHM(daily.sunset[0]);
    const now = new Date();
    const sunrise = new Date(daily.sunrise[0]);
    const sunset = new Date(daily.sunset[0]);
    let t = (now - sunrise) / (sunset - sunrise);
    t = Math.max(0, Math.min(1, t));
    const p0 = { x: 20, y: 100 }, p1 = { x: 160, y: -20 }, p2 = { x: 300, y: 100 };
    const x = (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + t ** 2 * p2.x;
    const y = (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + t ** 2 * p2.y;
    els.sunOrb.setAttribute('transform', `translate(${x}, ${y})`);
    if (t > 0) {
      const fillD = `M 20 100 Q 160 -20 ${x} ${y} L ${x} 100 L 20 100 Z`;
      els.arcFillPath.setAttribute('d', fillD);
    }
  };

  const renderChart = (data) => {
    const { hourly } = data;
    const now = new Date();
    const idx = hourly.time.findIndex(t => {
      const d = new Date(t);
      return d.getHours() === now.getHours() && d.getDate() === now.getDate();
    });
    const start = idx >= 0 ? idx : 0;
    const points = [];
    for (let i = 0; i < 24; i++) {
      const i2 = start + i;
      if (i2 >= hourly.time.length) break;
      points.push({
        time: new Date(hourly.time[i2]),
        temp: hourly.temperature_2m[i2],
        rain: hourly.precipitation_probability[i2] || 0,
      });
    }
    if (!points.length) return;
    const W = 600, H = 140, padTop = 14, padBottom = 22, padX = 16;
    const chartW = W - padX * 2, chartH = H - padTop - padBottom;
    const temps = points.map(p => p.temp);
    const tMin = Math.min(...temps), tMax = Math.max(...temps);
    const tRange = (tMax - tMin) || 1;
    const x = (i) => padX + (i / (points.length - 1)) * chartW;
    const y = (t) => padTop + (1 - (t - tMin) / tRange) * chartH;

    const smoothPath = () => {
      if (points.length < 2) return '';
      let path = `M ${x(0)},${y(points[0].temp)}`;
      for (let i = 0; i < points.length - 1; i++) {
        const x1 = x(i), y1 = y(points[i].temp);
        const x2 = x(i + 1), y2 = y(points[i + 1].temp);
        const cpx = (x1 + x2) / 2;
        path += ` C ${cpx},${y1} ${cpx},${y2} ${x2},${y2}`;
      }
      return path;
    };
    const linePath = smoothPath();
    const areaPath = `${linePath} L ${x(points.length - 1)},${H - padBottom} L ${x(0)},${H - padBottom} Z`;
    const rainBars = points.map((p, i) => {
      if (p.rain < 10) return '';
      const h = (p.rain / 100) * (chartH * 0.35);
      return `<rect class="rain-bar" x="${x(i) - 6}" y="${H - padBottom - h}" width="12" height="${h}" rx="2"/>`;
    }).join('');
    const labels = points.map((p, i) => {
      if (i % 3 !== 0 && i !== points.length - 1) return '';
      const isNow = i === 0;
      const txt = isNow ? '现在' : `${pad(p.time.getHours())}:00`;
      return `<text class="chart-label" x="${x(i)}" y="${H - 4}">${txt}</text>`;
    }).join('');
    const nowTemp = points[0].temp;
    const nowLabel = `<text class="chart-label" x="${x(0)}" y="${y(nowTemp) - 10}" style="font-size:11px;font-weight:700;fill:#ffd93d">${fmtTemp(nowTemp)}°</text>`;
    els.tempChart.innerHTML = `
      <defs>
        <linearGradient id="tempLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#4fc3f7"/><stop offset="50%" stop-color="#ffd93d"/><stop offset="100%" stop-color="#ff7a5a"/>
        </linearGradient>
        <linearGradient id="tempAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="rgba(255,217,61,0.3)"/><stop offset="100%" stop-color="rgba(255,217,61,0)"/>
        </linearGradient>
      </defs>
      ${rainBars}
      <path class="temp-area" d="${areaPath}"/>
      <path class="temp-line" d="${linePath}"/>
      ${nowLabel}
      <circle class="chart-dot" cx="${x(0)}" cy="${y(nowTemp)}" r="4.5"/>
      ${labels}
    `;
  };

  const windDirText = (deg) => {
    if (deg == null) return '—';
    const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
    return dirs[Math.round(deg / 45) % 8];
  };
  const uvLevel = (uv) => {
    if (uv == null) return { text: '—', hint: '—' };
    if (uv < 3) return { text: uv.toFixed(1), hint: '弱' };
    if (uv < 6) return { text: uv.toFixed(1), hint: '中等' };
    if (uv < 8) return { text: uv.toFixed(1), hint: '强' };
    if (uv < 11) return { text: uv.toFixed(1), hint: '很强' };
    return { text: uv.toFixed(1), hint: '极强' };
  };
  const visLevel = (m) => {
    const km = m / 1000;
    let hint = '—';
    if (km >= 20) hint = '极佳';
    else if (km >= 10) hint = '良好';
    else if (km >= 5) hint = '一般';
    else hint = '较差';
    return { text: km < 1 ? `${m} m` : `${km.toFixed(1)} km`, hint };
  };

  const renderDetails = (data) => {
    const { current, daily } = data;
    const hum = current.relative_humidity_2m;
    animateNumber(els.humidity, hum, 600, (v) => `${Math.round(v)}%`);
    setTimeout(() => { els.humidityBar.style.width = `${hum}%`; }, 100);
    animateNumber(els.wind, current.wind_speed_10m, 600, (v) => v.toFixed(1));
    els.windDir.textContent = windDirText(current.wind_direction_10m) + '风';
    if (els.windArrow) els.windArrow.style.transform = `rotate(${current.wind_direction_10m || 0}deg)`;
    const fl = Math.round(toUnit(current.apparent_temperature));
    const flC = current.apparent_temperature;
    const diff = Math.round(flC - current.temperature_2m);
    animateNumber(els.feelsLike, fl, 600, (v) => `${Math.round(v)}°`);
    els.feelsDiff.textContent = diff === 0 ? '与实际一致' : (diff > 0 ? `比实际高 ${diff}°` : `比实际低 ${-diff}°`);
    const uv = uvLevel(daily.uv_index_max?.[0]);
    els.uv.textContent = uv.text;
    els.uvHint.textContent = uv.hint;
    const vis = visLevel(current.visibility || 0);
    els.visibility.textContent = vis.text;
    els.visHint.textContent = vis.hint;
    if (current.pressure_msl) animateNumber(els.pressure, current.pressure_msl, 600, (v) => Math.round(v));
  };

  const aqiLevel = (aqi) => {
    if (aqi == null) return { label: '—', color: '#888', percent: 0, tip: '' };
    if (aqi <= 50)  return { label: '优', color: '#4caf50', percent: aqi / 500 * 100, tip: '空气清新，可正常活动' };
    if (aqi <= 100) return { label: '良', color: '#cddc39', percent: aqi / 500 * 100, tip: '可接受，敏感人群注意' };
    if (aqi <= 150) return { label: '中等', color: '#ffc107', percent: aqi / 500 * 100, tip: '敏感人群应减少户外运动' };
    if (aqi <= 200) return { label: '差', color: '#ff9800', percent: aqi / 500 * 100, tip: '建议戴口罩，减少外出' };
    if (aqi <= 300) return { label: '极差', color: '#f44336', percent: aqi / 500 * 100, tip: '所有人应避免户外活动' };
    return { label: '危险', color: '#9c27b0', percent: 100, tip: '健康警告，留在室内' };
  };
  const renderAQI = (data) => {
    if (!data) { els.aqiCard.hidden = true; return; }
    els.aqiCard.hidden = false;
    const lv = aqiLevel(data.us_aqi);
    animateNumber(els.aqiNum, Math.round(data.us_aqi || 0));
    els.aqiLabel.textContent = lv.label;
    els.aqiLabel.style.color = lv.color;
    els.aqiPm25.textContent = data.pm2_5 != null ? `${data.pm2_5.toFixed(1)}` : '—';
    els.aqiPm10.textContent = data.pm10 != null ? `${data.pm10.toFixed(1)}` : '—';
    els.aqiO3.textContent = data.ozone != null ? `${data.ozone.toFixed(0)}` : '—';
    els.aqiTip.textContent = lv.tip;
    const offset = 251 * (1 - lv.percent / 100);
    setTimeout(() => { els.gaugeArc.style.strokeDashoffset = offset; }, 50);
    const angle = -90 + (lv.percent / 100) * 180;
    setTimeout(() => { els.gaugeNeedle.style.transform = `rotate(${angle}deg)`; }, 50);
  };

  const renderForecast = (data) => {
    const { daily } = data;
    const w = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const dayNames = ['今天', '明天', '后天', '大后天'];
    const today = new Date().getDate();
    const allMax = Math.max(...daily.temperature_2m_max);
    const allMin = Math.min(...daily.temperature_2m_min);
    const range = allMax - allMin || 1;
    els.forecastList.innerHTML = daily.time.slice(0, 7).map((date, i) => {
      const d = new Date(date);
      const isToday = d.getDate() === today;
      const info = getWx(daily.weather_code[i]);
      const high = daily.temperature_2m_max[i];
      const low = daily.temperature_2m_min[i];
      const left = ((low - allMin) / range) * 100;
      const width = ((high - low) / range) * 100;
      const rain = daily.precipitation_probability_max?.[i] || 0;
      const name = i < 4 ? dayNames[i] : `${w[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
      const highlight = i === currentDayOffset ? 'day-highlight' : '';
      return `
        <div class="day ${highlight}">
          <div class="day-name ${isToday ? 'day-name-today' : ''} ${highlight}">${name}</div>
          <div class="day-icon">${ICON[info.icon](26)}</div>
          <div class="day-temps">
            <span class="day-temp-low">${fmtTemp(low)}°</span>
            <div class="day-temp-bar"><div class="day-temp-bar-fill" style="left:${left}%;width:${width}%"></div></div>
            <span class="day-temp-high">${fmtTemp(high)}°</span>
          </div>
          <div class="day-rain">${rain > 0 ? rain + '%' : ''}</div>
        </div>
      `;
    }).join('');
  };

  const renderSuggestions = (results) => {
    if (!results.length) { els.suggestions.innerHTML = ''; return; }
    els.suggestions.innerHTML = results.map(r => {
      const sub = [r.admin1, r.country].filter(Boolean).join(' · ');
      return `<button class="chip" data-name="${r.name}">${r.name}${sub ? `<span class="chip-sub">${sub}</span>` : ''}</button>`;
    }).join('');
    els.suggestions.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => handleSearch(b.dataset.name)));
  };
  const renderRecents = () => {
    const list = getRecents();
    if (!list.length) { els.recent.innerHTML = ''; return; }
    els.recent.innerHTML = `<span class="recent-label">最近</span>` + list.map(c =>
      `<button class="chip" data-name="${c}">${c}</button>`
    ).join('');
    els.recent.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => handleSearch(b.dataset.name)));
  };

  // ---------- 多城市 Dashboard ----------
  const renderCities = () => {
    const list = getCities();
    const isCurrent = (c) => c.name === lastCity;
    const cards = list.map(c => {
      const info = c.code != null ? getWx(c.code) : null;
      const icon = info ? info.icon : 'cloudy';
      const temp = c.temp != null ? `${fmtTemp(c.temp)}°` : '—°';
      return `
        <div class="city-card ${isCurrent(c) ? 'active' : ''}" data-name="${c.name}">
          <div class="city-card-icon">${ICON[icon](28)}</div>
          <div class="city-card-info">
            <div class="city-card-name">${c.name}</div>
            <div class="city-card-temp">${temp}${c.max != null ? ` · ${fmtTemp(c.max)}°` : ''}</div>
          </div>
          <button class="city-card-remove" data-remove="${c.name}" title="移除">×</button>
        </div>
      `;
    }).join('');
    const addBtn = list.length < MAX_CITIES
      ? `<button class="city-card-add" id="addCityBtn">+ 添加城市</button>`
      : '';
    els.cityList.innerHTML = cards + addBtn;
    // 绑定
    els.cityList.querySelectorAll('.city-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-remove]')) return;
        handleSearch(card.dataset.name);
      });
    });
    els.cityList.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeCity(btn.dataset.remove);
      });
    });
    const addBtnEl = $('addCityBtn');
    if (addBtnEl) addBtnEl.addEventListener('click', () => els.cityInput.focus());
  };

  // ---------- 天气预警 ----------
  const deriveWarnings = (data) => {
    const { current, daily } = data;
    const list = [];
    const temp = current.temperature_2m;
    const max = daily.temperature_2m_max[0];
    const min = daily.temperature_2m_min[0];
    const code = current.weather_code;
    const wind = current.wind_speed_10m;
    const uv = daily.uv_index_max?.[0] || 0;
    const hum = current.relative_humidity_2m;
    const vis = (current.visibility || 0) / 1000;
    const isDay = current.is_day;

    if ([95, 96, 99].includes(code)) {
      list.push({ type: 'critical', icon: '⛈️', text: '雷暴预警：户外活动请注意安全' });
    } else if ([82].includes(code) || (code >= 65 && code <= 67)) {
      list.push({ type: 'warning', icon: '🌧️', text: '暴雨预警：出门请带伞，注意积水' });
    } else if (code === 75 || code === 86) {
      list.push({ type: 'warning', icon: '❄️', text: '大雪预警：路面积雪，请缓行' });
    } else if (max >= 35) {
      list.push({ type: 'critical', icon: '🔥', text: `高温预警：今日最高 ${fmtTemp(max)}°，注意防暑` });
    } else if (min <= -5) {
      list.push({ type: 'cold', icon: '🥶', text: `寒潮预警：今日最低 ${fmtTemp(min)}°，注意保暖` });
    } else if (wind >= 40) {
      list.push({ type: 'warning', icon: '💨', text: `大风预警：风速 ${wind.toFixed(0)} km/h，远离广告牌` });
    } else if (wind >= 25) {
      list.push({ type: 'info', icon: '🌬️', text: `大风提醒：今日风力较大，${wind.toFixed(0)} km/h` });
    } else if (uv >= 8 && isDay) {
      list.push({ type: 'warning', icon: '☀️', text: `紫外线强（${uv.toFixed(0)}）：请涂防晒霜、戴帽子` });
    } else if (uv >= 6 && isDay) {
      list.push({ type: 'info', icon: '🌤️', text: `紫外线中等（${uv.toFixed(0)}）：建议防晒` });
    } else if (hum >= 90 && temp >= 25) {
      list.push({ type: 'info', icon: '💧', text: '空气潮湿闷热，建议穿透气衣物' });
    } else if (vis < 1) {
      list.push({ type: 'warning', icon: '🌫️', text: '能见度低，开车请开雾灯、减速' });
    } else if (vis < 3) {
      list.push({ type: 'info', icon: '🌫️', text: '能见度一般，敏感人群注意' });
    }
    return list;
  };

  const renderWarnings = (data) => {
    const warnings = deriveWarnings(data);
    if (!warnings.length) { els.warnings.hidden = true; els.warnings.innerHTML = ''; return; }
    els.warnings.hidden = false;
    els.warnings.innerHTML = warnings.map(w => `
      <div class="warning-item ${w.type}">
        <div class="warning-icon">${w.icon}</div>
        <div class="warning-text">${w.text}</div>
        <button class="warning-close" title="知道了">×</button>
      </div>
    `).join('');
    els.warnings.querySelectorAll('.warning-item').forEach(item => {
      item.querySelector('.warning-close').addEventListener('click', (e) => {
        e.stopPropagation();
        item.style.transition = 'all 0.3s';
        item.style.opacity = '0';
        item.style.transform = 'translateX(20px)';
        setTimeout(() => {
          if (els.warnings.querySelectorAll('.warning-item').length === 1) {
            els.warnings.hidden = true;
            els.warnings.innerHTML = '';
          } else {
            item.remove();
          }
        }, 300);
      });
    });
  };

  // ---------- 生活指数 ----------
  const lifeEls = {
    card: $('lifeCard'),
    grid: $('lifeGrid'),
  };
  const deriveLife = (data) => {
    const { current, daily, hourly } = data;
    const temp = current.temperature_2m;
    const max = daily.temperature_2m_max[0];
    const min = daily.temperature_2m_min[0];
    const code = current.weather_code;
    const wind = current.wind_speed_10m;
    const hum = current.relative_humidity_2m;
    const uv = daily.uv_index_max?.[0] || 0;
    const vis = (current.visibility || 0) / 1000;
    const rainProb = daily.precipitation_probability_max?.[0] || 0;
    const feels = current.apparent_temperature;
    const isDay = current.is_day;

    // 穿衣
    let clothing = { level: 'good', name: '薄外套', tip: '建议长袖+外套' };
    if (max >= 30) clothing = { level: 'hot', name: '清凉', tip: '短袖+防晒' };
    else if (max >= 25) clothing = { level: 'good', name: '短袖', tip: '夏季着装' };
    else if (max >= 18) clothing = { level: 'good', name: '薄外套', tip: '长袖+薄外套' };
    else if (max >= 10) clothing = { level: 'fair', name: '毛衣', tip: '毛衣+外套' };
    else if (max >= 0) clothing = { level: 'fair', name: '厚外套', tip: '毛衣+厚外套' };
    else clothing = { level: 'cold', name: '羽绒服', tip: '羽绒服+围巾' };

    // 紫外线
    let uvIdx = { level: 'good', name: '弱', tip: '无需防护' };
    if (uv >= 11) uvIdx = { level: 'poor', name: '极强', tip: '避免外出' };
    else if (uv >= 8) uvIdx = { level: 'poor', name: '很强', tip: '全面防护' };
    else if (uv >= 6) uvIdx = { level: 'fair', name: '强', tip: '涂防晒' };
    else if (uv >= 3) uvIdx = { level: 'fair', name: '中等', tip: '建议防晒' };

    // 运动
    let sport = { level: 'good', name: '适宜', tip: '适合户外' };
    if ([95, 96, 99].includes(code) || wind >= 35) sport = { level: 'poor', name: '不适宜', tip: '建议室内' };
    else if ([65, 67, 82].includes(code) || wind >= 25) sport = { level: 'fair', name: '一般', tip: '避免剧烈' };
    else if (temp >= 33 || temp <= 0) sport = { level: 'fair', name: '一般', tip: '调整强度' };

    // 洗车
    let car = { level: 'good', name: '适宜', tip: '放心洗' };
    if (rainProb >= 60) car = { level: 'poor', name: '不适宜', tip: '近期有雨' };
    else if (rainProb >= 30) car = { level: 'fair', name: '较不适宜', tip: '可能有雨' };

    // 钓鱼
    let fish = { level: 'good', name: '适宜', tip: '好时机' };
    if (wind >= 30) fish = { level: 'poor', name: '不适宜', tip: '风浪大' };
    else if (wind >= 20) fish = { level: 'fair', name: '一般', tip: '风稍大' };
    else if (code >= 95) fish = { level: 'poor', name: '不适宜', tip: '雷雨' };
    else if (temp >= 33) fish = { level: 'fair', name: '一般', tip: '鱼不活跃' };

    // 过敏
    let allergy = { level: 'good', name: '低发', tip: '过敏风险低' };
    if (hum >= 80 && wind >= 15) allergy = { level: 'poor', name: '高发', tip: '敏感人群注意' };
    else if (hum >= 70) allergy = { level: 'fair', name: '中等', tip: '注意防护' };

    return [
      { icon: '👕', label: '穿衣', value: clothing.name, level: clothing.level, tip: clothing.tip },
      { icon: '☀️', label: '紫外线', value: uvIdx.name, level: uvIdx.level, tip: uvIdx.tip },
      { icon: '🏃', label: '运动', value: sport.name, level: sport.level, tip: sport.tip },
      { icon: '🚗', label: '洗车', value: car.name, level: car.level, tip: car.tip },
      { icon: '🎣', label: '钓鱼', value: fish.name, level: fish.level, tip: fish.tip },
      { icon: '🌿', label: '过敏', value: allergy.name, level: allergy.level, tip: allergy.tip },
    ];
  };
  const LIFE_ICONS = {
    '穿衣': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7l4-3 2 2a3 3 0 0 0 4 0l2-2 4 3-2 3 1.5 11h-15L6 10z"/></svg>',
    '紫外线': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
    '运动': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="14" cy="4" r="2"/><path d="M6 20l3-6 4 1 3 5M9 14l-3-2 2-3 5 1 3 3M11 8l5-2"/></svg>',
    '洗车': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l2-6h14l2 6v6H3z"/><circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/><path d="M5 13h14"/></svg>',
    '钓鱼': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v8a7 7 0 0 0 14 0V8"/><path d="M19 5h3M5 21l5-9M19 8l3 0"/></svg>',
    '过敏': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22V8M12 8a3 3 0 1 0-3-3M12 8a3 3 0 1 1 3-3M12 14a2 2 0 1 0-2-2M12 14a2 2 0 1 1 2-2"/></svg>',
  };
  const renderLife = (data) => {
    const list = deriveLife(data);
    if (!list.length) { lifeEls.card.hidden = true; return; }
    lifeEls.card.hidden = false;
    lifeEls.grid.innerHTML = list.map(item => `
      <div class="life-cell">
        <div class="life-icon">${LIFE_ICONS[item.label] || ''}</div>
        <div class="life-name">${item.label}</div>
        <div class="life-level ${item.level}">${item.value}</div>
      </div>
    `).join('');
  };

  // ---------- 月相 ----------
  const getMoonPhase = (date) => {
    const synodic = 29.530588853;
    const ref = new Date('2000-01-06T18:14:00Z');
    const days = (date - ref) / 86400000;
    const phase = ((days % synodic) + synodic) % synodic;
    if (phase < 1.84566) return { name: '新月', icon: '🌑' };
    if (phase < 5.53699) return { name: '蛾眉月', icon: '🌒' };
    if (phase < 9.22831) return { name: '上弦月', icon: '🌓' };
    if (phase < 12.91963) return { name: '盈凸月', icon: '🌔' };
    if (phase < 16.61096) return { name: '满月', icon: '🌕' };
    if (phase < 20.30228) return { name: '亏凸月', icon: '🌖' };
    if (phase < 23.99361) return { name: '下弦月', icon: '🌗' };
    if (phase < 27.68493) return { name: '残月', icon: '🌘' };
    return { name: '新月', icon: '🌑' };
  };

  // ---------- 日出日落倒计时 ----------
  const updateSunCountdown = () => {
    const sunEl = $('sunCountdown');
    const moonEl = $('moonInfo');
    if (!sunEl) return;
    // 月相（每分钟更新一次就够）
    if (moonEl) {
      const m = getMoonPhase(new Date());
      moonEl.textContent = `${m.icon} ${m.name}`;
    }
    // 日出日落倒计时（每秒）
    const sunriseEl = $('sunrise');
    const sunsetEl = $('sunset');
    if (!sunriseEl || !sunsetEl) return;
    const sunriseText = sunriseEl.textContent.trim();
    const sunsetText = sunsetEl.textContent.trim();
    if (!/^\d{2}:\d{2}$/.test(sunriseText) || !/^\d{2}:\d{2}$/.test(sunsetText)) {
      sunEl.textContent = '—';
      return;
    }
    const now = new Date();
    const [srH, srM] = sunriseText.split(':').map(Number);
    const [ssH, ssM] = sunsetText.split(':').map(Number);
    const sunrise = new Date(now.getFullYear(), now.getMonth(), now.getDate(), srH, srM);
    const sunset = new Date(now.getFullYear(), now.getMonth(), now.getDate(), ssH, ssM);
    // 下一个日出/日落
    let target, label;
    if (now < sunrise) { target = sunrise; label = '日出'; }
    else if (now < sunset) { target = sunset; label = '日落'; }
    else { target = new Date(sunrise.getTime() + 86400000); label = '日出'; }
    const diff = Math.floor((target - now) / 1000);
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    if (h > 0) sunEl.textContent = `距${label} ${h}h${m}m`;
    else if (m > 0) sunEl.textContent = `距${label} ${m}m${s}s`;
    else sunEl.textContent = `${label}中`;
  };

  // ---------- 3D 视差 + 鼠标光斑 ----------
  let parallaxEnabled = Settings.parallax;
  let mouseTarget = { x: 0, y: 0 };
  let mouseCurrent = { x: 0, y: 0 };
  let parallaxFrame = null;
  const cursorGlow = $('cursorGlow');
  let cursorTarget = { x: -9999, y: -9999 };
  let cursorCurrent = { x: -9999, y: -9999 };

  const onMouseMove = (e) => {
    if (parallaxEnabled) {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      mouseTarget.x = (e.clientX - cx) / cx;
      mouseTarget.y = (e.clientY - cy) / cy;
    }
    document.body.classList.add('has-cursor');
    cursorTarget.x = e.clientX;
    cursorTarget.y = e.clientY;
  };
  const onMouseLeave = () => {
    mouseTarget.x = 0;
    mouseTarget.y = 0;
    document.body.classList.remove('has-cursor');
  };
  const animateParallax = () => {
    mouseCurrent.x += (mouseTarget.x - mouseCurrent.x) * 0.08;
    mouseCurrent.y += (mouseTarget.y - mouseCurrent.y) * 0.08;
    cursorCurrent.x += (cursorTarget.x - cursorCurrent.x) * 0.1;
    cursorCurrent.y += (cursorTarget.y - cursorCurrent.y) * 0.1;
    if (parallaxEnabled) {
      const tx = mouseCurrent.x * 30;
      const ty = mouseCurrent.y * 30;
      els.parallaxLayer.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
      if (els.heroIcon) {
        const rx = -mouseCurrent.y * 8;
        const ry = mouseCurrent.x * 8;
        els.heroIcon.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg)`;
      }
    }
    if (cursorGlow && cursorCurrent.x > -9000) {
      cursorGlow.style.transform = `translate3d(${cursorCurrent.x}px, ${cursorCurrent.y}px, 0) translate(-50%, -50%)`;
    }
    parallaxFrame = requestAnimationFrame(animateParallax);
  };

  const initParallax = () => {
    if (!parallaxFrame) parallaxFrame = requestAnimationFrame(animateParallax);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseleave', onMouseLeave);
  };

  // 漂浮粒子（按你给的参考实现）
  const initParticles = () => {
    const layer = document.querySelector('.bg-layer');
    if (!layer) return;
    for (let i = 0; i < 40; i++) {
      const p = document.createElement('div');
      p.className = 'float-particle';
      const size = Math.random() * 5 + 2;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.left = `${Math.random() * 100}%`;
      p.style.opacity = `${0.3 + Math.random() * 0.5}`;
      p.style.animationDuration = `${Math.random() * 10 + 15}s`;
      p.style.animationDelay = `${Math.random() * 15}s`;
      layer.appendChild(p);
    }
  };

  // ---------- 命令面板 ----------
  let cmdState = { results: [], activeIndex: 0 };

  const renderCmdResults = (items) => {
    if (!items.length) {
      els.cmdResults.innerHTML = '<div class="cmd-empty">没有匹配结果</div>';
      return;
    }
    const sections = [];
    if (items.recent?.length) {
      sections.push(`<div class="cmd-section">最近</div>` +
        items.recent.map((r, i) => `<div class="cmd-item" data-idx="${i}" data-name="${r}">
          <div class="cmd-item-icon">🕐</div>
          <div class="cmd-item-text">${r}</div>
          <div class="cmd-item-kbd">↵</div>
        </div>`).join(''));
    }
    if (items.suggest?.length) {
      sections.push(`<div class="cmd-section">建议</div>` +
        items.suggest.map((r, i) => `<div class="cmd-item" data-idx="${i + (items.recent?.length || 0)}" data-name="${r.name}" data-lat="${r.latitude}" data-lon="${r.longitude}">
          <div class="cmd-item-icon">📍</div>
          <div class="cmd-item-text">${r.name}<div class="cmd-item-sub">${[r.admin1, r.country].filter(Boolean).join(' · ')}</div></div>
          <div class="cmd-item-kbd">↵</div>
        </div>`).join(''));
    }
    els.cmdResults.innerHTML = sections.join('') || '<div class="cmd-empty">输入城市名开始搜索</div>';
    bindCmdItems();
  };

  const bindCmdItems = () => {
    els.cmdResults.querySelectorAll('.cmd-item').forEach((item) => {
      item.addEventListener('click', () => {
        const name = item.dataset.name;
        if (name) { closeCmd(); handleSearch(name); }
      });
    });
  };

  const openCmd = () => {
    els.cmdPalette.hidden = false;
    els.cmdInput.value = '';
    cmdState = { results: { recent: getRecents(), suggest: [] }, activeIndex: 0 };
    renderCmdResults(cmdState.results);
    setTimeout(() => els.cmdInput.focus(), 50);
  };
  const closeCmd = () => { els.cmdPalette.hidden = true; };

  const initCmd = () => {
    els.cmdBtn.addEventListener('click', openCmd);
    els.cmdBackdrop.addEventListener('click', closeCmd);
    els.cmdInput.addEventListener('input', async (e) => {
      const q = e.target.value.trim();
      if (q.length < 1) {
        cmdState.results = { recent: getRecents(), suggest: [] };
        renderCmdResults(cmdState.results);
        return;
      }
      try {
        const r = await geocode(q);
        cmdState.results = { recent: [], suggest: r.slice(0, 6) };
        renderCmdResults(cmdState.results);
      } catch {
        cmdState.results = { recent: [], suggest: [] };
        renderCmdResults(cmdState.results);
      }
    });
    els.cmdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = els.cmdResults.querySelector('.cmd-item');
        if (first) first.click();
      } else if (e.key === 'Escape') {
        closeCmd();
      }
    });
    // 全局 Cmd+K
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (els.cmdPalette.hidden) openCmd();
        else closeCmd();
      } else if (e.key === 'Escape' && !els.cmdPalette.hidden) {
        closeCmd();
      }
    });
  };

  // ---------- 设置 ----------
  const openSettings = () => { els.settingsDrawer.hidden = false; };
  const closeSettings = () => { els.settingsDrawer.hidden = true; };

  const applyAnimSetting = () => {
    document.body.classList.toggle('no-anim', !Settings.anim);
  };

  const initSettings = () => {
    els.settingsBtn.addEventListener('click', openSettings);
    els.closeSettings.addEventListener('click', closeSettings);
    els.settingsBackdrop.addEventListener('click', closeSettings);

    // 初始化 UI
    els.unitToggle.querySelectorAll('.opt').forEach(b => {
      b.classList.toggle('active', b.dataset.unit === Settings.unit);
      b.addEventListener('click', () => {
        Settings.unit = b.dataset.unit;
        els.unitToggle.querySelectorAll('.opt').forEach(x => x.classList.toggle('active', x.dataset.unit === Settings.unit));
        // 重新渲染当前数据（如果有）
        if (lastData) renderAll(lastData, lastCity);
      });
    });

    [els.animSwitch, els.parallaxSwitch, els.soundSwitch].forEach(sw => {
      const key = sw.id === 'animSwitch' ? 'anim' : sw.id === 'parallaxSwitch' ? 'parallax' : 'sound';
      sw.dataset.on = String(Settings[key]);
      sw.addEventListener('click', () => {
        Settings[key] = !Settings[key];
        sw.dataset.on = String(Settings[key]);
        if (key === 'anim') applyAnimSetting();
        if (key === 'parallax') {
          parallaxEnabled = Settings.parallax;
          if (!parallaxEnabled) {
            els.parallaxLayer.style.transform = '';
            if (els.heroIcon) els.heroIcon.style.transform = '';
          }
        }
      });
    });

    // 自动刷新间隔
    const refreshSelect = $('refreshSelect');
    if (refreshSelect) {
      refreshSelect.value = String(Settings.refresh);
      refreshSelect.addEventListener('change', () => {
        Settings.refresh = parseInt(refreshSelect.value, 10);
        if (window.__restartAutoRefresh) window.__restartAutoRefresh();
      });
    }
  };

  // ---------- 业务流 ----------
  let currentController = null;
  let isTransitioning = false;
  let lastData = null, lastCity = null, lastLat = null, lastLon = null;
  let currentDayOffset = 0;  // 高亮哪一天（0=今天）
  let autoRefreshTimer = null;

  // 刷新当前城市数据（静默刷新）
  const refreshData = async () => {
    if (lastLat == null || lastLon == null) return;
    if (currentController) currentController.abort();
    const controller = new AbortController();
    currentController = controller;
    const dot = document.querySelector('.time-dot');
    if (els.refreshBtn) els.refreshBtn.classList.add('refreshing');
    if (dot) dot.classList.add('refreshing');
    try {
      const [weather, aqi, yesterday] = await Promise.all([
        fetchWeather(lastLat, lastLon, controller.signal),
        fetchAQI(lastLat, lastLon, controller.signal),
        fetchYesterday(lastLat, lastLon, controller.signal).catch(() => null),
      ]);
      if (controller.signal.aborted) return;
      lastData = weather;
      showContent(true);
      requestAnimationFrame(() => {
        renderAll(weather, lastCity);
        renderAQI(aqi);
        renderCompare(weather, yesterday);
      });
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.warn('auto refresh failed:', e);
    } finally {
      if (els.refreshBtn) els.refreshBtn.classList.remove('refreshing');
      if (dot) dot.classList.remove('refreshing');
    }
  };

  const transitionOut = () => new Promise((resolve) => {
    if (els.content.hidden) return resolve();
    els.content.classList.add('transitioning');
    setTimeout(() => {
      els.content.classList.remove('transitioning');
      resolve();
    }, 280);
  });

  const renderAll = (weather, city) => {
    renderInsight(weather);
    renderHero(weather, city);
    renderSunArc(weather);
    renderDetails(weather);
    renderChart(weather);
    renderForecast(weather);
  };

  const handleSearch = async (rawName) => {
    const input = rawName || els.cityInput.value || '';
    // 关键词模式：智能提取城市名 + 天数偏移 + 变体列表
    const { city: name, dayOffset, variations } = extractQuery(input);
    currentDayOffset = dayOffset;
    if (!name) { showError('请输入城市名称'); return; }
    hideError();
    if (currentController) currentController.abort();
    const controller = new AbortController();
    currentController = controller;
    if (isTransitioning) return;
    isTransitioning = true;
    await transitionOut();
    showSkeleton(true);
    showContent(false);
    let target = null, results = null;
    try {
      // 试每一个变体（多部分拼起来的时候）
      for (const v of variations) {
        if (controller.signal.aborted) return;
        try {
          const r = await geocode(v, controller.signal);
          if (controller.signal.aborted) return;
          if (r.length) { results = r; target = r[0]; break; }
        } catch (e) { if (e.name === 'AbortError') throw e; }
      }
      if (!target) { showError(`未找到城市：${name}`); showSkeleton(false); return; }
      // 并行：天气 + AQI + 昨日对比
      const [weather, aqi, yesterday] = await Promise.all([
        fetchWeather(target.latitude, target.longitude, controller.signal),
        fetchAQI(target.latitude, target.longitude, controller.signal),
        fetchYesterday(target.latitude, target.longitude, controller.signal).catch(() => null),
      ]);
      if (controller.signal.aborted) return;
      lastData = weather; lastCity = target.name; lastLat = target.latitude; lastLon = target.longitude;
      // 加到多城市 Dashboard（带上预报信息）
      try {
        upsertCity({
          name: target.name,
          lat: target.latitude,
          lon: target.longitude,
          temp: current.temperature_2m,
          max: daily.temperature_2m_max[0],
          code: current.weather_code,
          ts: Date.now(),
        });
      } catch (e) { console.warn('upsertCity:', e); }
      showContent(true);
      requestAnimationFrame(() => {
        renderAll(weather, target.name);
        renderAQI(aqi);
        renderCompare(weather, yesterday);
        renderWarnings(weather);
        renderLife(weather);
        updateSunCountdown();
        renderCities();
      });
      hideError();
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.error(e);
      showError(`请求失败：${e.message || '请稍后再试'}`);
    } finally {
      if (currentController === controller) { showSkeleton(false); isTransitioning = false; }
    }
    if (target) {
      try { pushRecent(target.name); } catch (e) { console.warn(e); }
      try { setLast(target.name); } catch (e) { console.warn(e); }
      try { renderSuggestions(results.slice(1, 6)); } catch (e) { console.warn(e); }
    }
  };

  const handleLocate = () => {
    if (!navigator.geolocation) { showError('浏览器不支持定位'); return; }
    hideError();
    if (currentController) currentController.abort();
    const controller = new AbortController();
    currentController = controller;
    (async () => {
      isTransitioning = true;
      await transitionOut();
      showSkeleton(true);
      showContent(false);
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          const fullLabel = (await reverseGeocode(latitude, longitude)) || `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`;
          // 只取城市名（最后一块）作为输入框默认
          const cityName = fullLabel.includes('·') ? fullLabel.split('·').pop().trim() : fullLabel;
          try {
            const [weather, aqi, yesterday] = await Promise.all([
              fetchWeather(latitude, longitude, controller.signal),
              fetchAQI(latitude, longitude, controller.signal),
              fetchYesterday(latitude, longitude, controller.signal).catch(() => null),
            ]);
            if (controller.signal.aborted) return;
            lastData = weather; lastCity = fullLabel; lastLat = latitude; lastLon = longitude;
            // 加到多城市 Dashboard
            try {
              upsertCity({
                name: cityName,
                lat: latitude,
                lon: longitude,
                temp: current.temperature_2m,
                max: daily.temperature_2m_max[0],
                code: current.weather_code,
                ts: Date.now(),
              });
            } catch (e) { console.warn('upsertCity:', e); }
            showContent(true);
            requestAnimationFrame(() => {
              renderAll(weather, fullLabel);
              renderAQI(aqi);
              renderCompare(weather, yesterday);
              renderWarnings(weather);
              renderLife(weather);
              updateSunCountdown();
              renderCities();
            });
            hideError();
          } catch (e) {
            if (e.name !== 'AbortError') showError(`获取天气失败：${e.message || ''}`);
          } finally {
            if (currentController === controller) { showSkeleton(false); isTransitioning = false; }
          }
          // 存历史的：拆分 '顺德区·佛山市' 为两个名字，两个都进 recents（都能点）
          if (!fullLabel.includes('°')) {
            const parts = splitCityParts(fullLabel);
            try { pushMultiRecents(parts); } catch (e) { console.warn(e); }
            try { setLast(cityName); } catch (e) { console.warn(e); }
            els.cityInput.value = cityName;
          }
        },
        (err) => {
          showSkeleton(false); isTransitioning = false;
          const m = err.code === 1 ? '您拒绝了定位权限' : err.code === 2 ? '位置不可用' : err.code === 3 ? '定位超时' : '定位失败';
          showError(m);
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    })();
  };

  let suggestTimer = null;
  const handleInputSuggest = () => {
    clearTimeout(suggestTimer);
    const input = els.cityInput.value.trim();
    if (input.length < 1) { renderSuggestions([]); return; }
    // 关键词剥离后再建议
    const { city: q } = extractQuery(input);
    if (q.length < 1) { renderSuggestions([]); return; }
    suggestTimer = setTimeout(async () => {
      try {
        const r = await geocode(q);
        renderSuggestions(r.slice(0, 5));
      } catch (e) { if (e.name !== 'AbortError') renderSuggestions([]); }
    }, 300);
  };

  const bindEvents = () => {
    els.searchBtn.addEventListener('click', () => handleSearch());
    els.cityInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } });
    els.cityInput.addEventListener('input', handleInputSuggest);
    els.locBtn.addEventListener('click', handleLocate);
    if (els.refreshBtn) els.refreshBtn.addEventListener('click', () => refreshData());
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) renderSuggestions([]); });
  };

  // ---------- 启动 ----------
  const init = () => {
    els.brandMark.innerHTML = brandLogo();
    initBackground();
    initParticles();
    bindEvents();
    initCmd();
    initSettings();
    initParallax();
    applyAnimSetting();

    try {
      if (getLast() === '当前位置') setLast('');
      const list = getRecents();
      const cleaned = list.filter(c => c !== '当前位置');
      if (cleaned.length !== list.length) setRecents(cleaned);
    } catch (e) { console.warn(e); }

    hideError();
    renderRecents();

    // 首次进入预热默认城市
    if (getCities().length === 0) {
      setCities(DEFAULT_CITIES.slice(0, 4));
    }
    renderCities();

    const last = getLast();
    if (last && last !== '当前位置') {
      els.cityInput.value = last;
      handleSearch(last);
    } else {
      els.cityInput.value = '北京';
      handleSearch('北京');
    }

    // 预加载默认城市的天气（后台静默）
    setTimeout(async () => {
      const list = getCities();
      let changed = false;
      for (const c of list) {
        if (c.temp != null) continue;
        try {
          const w = await fetchWeather(c.lat, c.lon);
          if (w && w.current) {
            c.temp = w.current.temperature_2m;
            c.max = w.daily.temperature_2m_max[0];
            c.code = w.current.weather_code;
            c.ts = Date.now();
            changed = true;
          }
        } catch (e) { /* 静默 */ }
      }
      if (changed) {
        setCities(list);
        renderCities();
      }
    }, 800);

    // 按设置中的间隔自动刷新（默认 5 分钟）
    const startAutoRefresh = () => {
      if (autoRefreshTimer) clearInterval(autoRefreshTimer);
      const sec = Settings.refresh;
      if (sec > 0) {
        autoRefreshTimer = setInterval(() => {
          if (!document.hidden) refreshData();
        }, sec * 1000);
      }
    };
    startAutoRefresh();
    // 变更后重启定时器
    window.__restartAutoRefresh = startAutoRefresh;

    // 每秒更新日出日落倒计时
    setInterval(updateSunCountdown, 1000);
  };

  console.log('%c[Weather App v8]%c 极致版 · 3D 视差 · Cmd+K · 昨日对比', 'color:#ffd93d;font-weight:bold', 'color:inherit');
  document.addEventListener('DOMContentLoaded', init);
})();
