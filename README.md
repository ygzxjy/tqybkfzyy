# ⛅ Weather · 天气预报网页应用

一个**零依赖、即开即用**的天气预报网页应用。基于原生 HTML5 + CSS3 + JavaScript (ES6+) 实现，界面采用玻璃拟态 + 动态天气背景，支持城市搜索、实时天气、24 小时逐时、5 天预报、浏览器定位和本地历史记录。

![preview](./preview.png)

---

## ✨ 功能特性

| # | 功能 | 说明 |
|---|------|------|
| 1 | **城市搜索** | 输入框 + 回车键 + 搜索按钮三种方式触发；输入时实时显示候选城市；非空校验 |
| 2 | **实时天气** | 当前温度、天气状况、最高/最低、湿度、风速风向、体感、紫外线、能见度 |
| 3 | **未来预报** | 5 天天气预报（最高/最低 + 温度区间条），24 小时逐时预报 |
| 4 | **浏览器定位** ⭐加分项 | `navigator.geolocation` 自动获取当前位置，反向地理编码得到城市名 |
| 5 | **数据持久化** ⭐加分项 | `localStorage` 保存最近 5 个城市 + 上次查看的城市，刷新自动恢复 |
| 6 | **动态背景** | 根据天气 + 昼夜切换渐变色，并叠加云层 / 星空 / 雨滴 / 雪花动画 |
| 7 | **响应式设计** | 桌面端和移动端自适应，玻璃拟态卡片 |

---

## 🛠️ 技术栈

- **HTML5** — 语义化标签（`<header>`、`<main>`、`<section>`、`<footer>`）
- **CSS3** — Flexbox / Grid 布局、`backdrop-filter` 玻璃拟态、CSS 动画、CSS 变量
- **JavaScript (ES6+)** — `async/await`、箭头函数、解构赋值、模板字符串、IIFE
- **Fetch API** — 替代旧的 `XMLHttpRequest`，Promise 风格的网络请求
- **第三方天气 API** — [Open-Meteo](https://open-meteo.com/)（**无需 API Key**，免费且支持全球）

---

## 📁 项目结构

```
weather-app/
├── index.html      # HTML 结构（语义化）
├── styles.css      # 样式（玻璃拟态 + 响应式 + 动画）
├── app.js          # 核心逻辑（搜索 / 渲染 / 定位 / 持久化）
└── README.md       # 项目说明
```

---

## 🚀 本地运行

无需任何依赖，直接静态服务即可：

```bash
# 方式一：Python 自带 HTTP 服务器
cd weather-app
python3 -m http.server 8000

# 方式二：Node.js
npx serve .

# 然后浏览器打开 http://localhost:8000
```

> ⚠️ **不能用 `file://` 直接打开**——浏览器会拦截 fetch 请求，必须通过 HTTP 服务。

---

## 🔑 关键技术与代码说明

### 1. 第三方天气 API：为什么选 Open-Meteo

题目推荐了 OpenWeatherMap、和风天气、心知天气等，但**这些都需要注册账号、申请 API Key**。本项目选用了 [Open-Meteo](https://open-meteo.com/)，原因：

- **完全免费、无需 Key**，开箱即用
- 数据准确，覆盖全球任意经纬度
- 同时提供**地理编码**（城市名→经纬度）和**天气预报**两个端点
- 支持中文返回

涉及的两个端点：

```text
# 1) 地理编码（城市 → 经纬度）
GET https://geocoding-api.open-meteo.com/v1/search?name=北京&count=8&language=zh&format=json

# 2) 天气预报（经纬度 → 数据）
GET https://api.open-meteo.com/v1/forecast?latitude=39.9&longitude=116.4
    &current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,...
    &hourly=temperature_2m,weather_code,precipitation_probability
    &daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max
    &timezone=auto
```

天气状态用 **WMO Code** 返回（0-99 整数），本项目在 `weatherMap` 对象里把 code 映射成中文描述和 emoji 图标（`app.js`）：

```js
const weatherMap = {
  0:  { desc: '晴朗',     icon: '☀️', type: 'sunny'  },
  2:  { desc: '局部多云', icon: '⛅',  type: 'cloudy' },
  61: { desc: '小雨',     icon: '🌧️', type: 'rain'   },
  71: { desc: '小雪',     icon: '🌨️', type: 'snow'   },
  // ... 共 28 个映射
};
```

### 2. 异步数据流：`async/await` + `fetch`

全程使用现代异步写法，避免回调地狱（`app.js` → `handleSearch`）：

```js
const handleSearch = async (rawName) => {
  const name = (rawName || els.cityInput.value || '').trim();
  if (!name) return showError('请输入城市名称');

  showLoader(true);
  try {
    const results = await geocodeCity(name);     // ① 地理编码
    if (!results.length) return showError(`未找到城市：${name}`);
    const target = results[0];
    await loadWeather(target.latitude, target.longitude, target.name); // ② 拿天气
    addRecent(target.name);                      // ③ 记入历史
    setLastCity(target.name);
  } catch (e) {
    showError('网络异常，请稍后再试');
  } finally {
    showLoader(false);
  }
};
```

### 3. 三种搜索触发方式 + 输入校验

```js
els.searchBtn.addEventListener('click', () => handleSearch());
els.cityInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); handleSearch(); }
});
els.cityInput.addEventListener('input', handleInputSuggest); // 实时候选
```

非空校验在 `handleSearch` 第一行 `.trim()` 后判断。

### 4. 实时输入建议（候选词）

输入时用 `setTimeout` 做 300ms 防抖，调地理编码 API 返回前 5 个结果，以 chip 形式展示，点击即可查询（`app.js` → `handleInputSuggest`）。

### 5. 浏览器定位（加分项）

```js
navigator.geolocation.getCurrentPosition(
  async (pos) => {
    const { latitude, longitude } = pos.coords;
    // 反向地理编码：经纬度 → 城市名
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}&language=zh&count=1`
    );
    const data = await res.json();
    const label = data.results?.[0]?.name || '当前位置';
    await loadWeather(latitude, longitude, label);
  },
  (err) => showError('您拒绝了定位权限'),
  { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
);
```

- 用 `getCurrentPosition` 拿经纬度
- 用 Open-Meteo 的 `/reverse` 端点反向查城市名
- 区分 `code === 1/2/3` 给出具体错误提示

### 6. localStorage 持久化（加分项）

```js
const STORAGE_KEYS = {
  lastCity: 'weather:lastCity',   // 上次查看的城市
  recents: 'weather:recents',     // 最近 5 个城市（数组）
};

// 保存
const addRecent = (city) => {
  const list = getRecents().filter(c => c.toLowerCase() !== city.toLowerCase());
  list.unshift(city);                 // 最新的放最前
  setRecents(list.slice(0, 5));       // 最多 5 个
};

// 恢复
const init = () => {
  const last = getLastCity();
  if (last) handleSearch(last);
};
```

刷新页面 / 重新打开会自动恢复上次的城市，并在搜索框下方显示"最近"chip 列表。

### 7. 玻璃拟态 + 动态背景（CSS）

`backdrop-filter: blur(24px)` + 半透明白色背景实现毛玻璃：

```css
.card {
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 18px;
}
```

天气 → 背景色映射通过 CSS 变量动态切换（`app.js` → `applyTheme`）：

```js
const themes = {
  sunny:  ['#ff8a3d', '#ff5f6d', '#ffc371'],
  cloudy: ['#4b6cb7', '#485563', '#7a8caa'],
  rain:   ['#2c3e50', '#4ca1af', '#2c3e50'],
  snow:   ['#83a4d4', '#b6fbff', '#e0eafc'],
};
root.style.setProperty('--bg-1', themes[weatherType][0]);
```

### 8. 响应式（移动端 / 桌面端）

通过 `@media (max-width: 480px)` 断点适配：
- 详情栅格从 3 列变 2 列
- 温度字号缩小
- 定位按钮收起文字只留图标

### 9. 无障碍 / 体验细节

- `prefers-reduced-motion: reduce` 媒体查询关闭动画
- 加载状态、错误状态用 `hidden` 属性统一管理
- 错误信息分类（网络/未找到/拒绝定位）

---

## 🧪 测试场景

- [x] 输入 `北京` 回车
- [x] 输入英文 `Shanghai` 回车
- [x] 输入 `tokyo` 看小写是否处理
- [x] 输入框为空时点搜索按钮
- [x] 点击"定位"按钮
- [x] 拒绝定位权限，验证错误提示
- [x] 刷新页面，验证自动恢复
- [x] 移动端窗口（Chrome DevTools 切到 iPhone）

---

## 📦 部署

### GitHub Pages
1. 推送到 GitHub
2. `Settings → Pages → Branch: main / root`
3. 等待 1-2 分钟，访问 `https://<用户名>.github.io/<仓库名>/`

### Vercel / Netlify
直接拖拽整个 `weather-app/` 目录到 dashboard 即可。

### 本地预览
```bash
cd weather-app
python3 -m http.server 8000
# 访问 http://localhost:8000
```

---

## 📝 备注

- 本项目仅作学习用途，UI/UX 参考了 Apple Weather 和各类现代天气 App。
- 数据来源于 [Open-Meteo](https://open-meteo.com/)，遵循其使用条款。
- 如果想换数据源（如和风天气），只需修改 `app.js` 中 `geocodeCity` 和 `fetchWeather` 两个函数即可，渲染层无需改动。
