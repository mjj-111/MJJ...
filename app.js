/* ===== 和风天气 Web 应用（原生 JS） ===== */
const API_HOST = 'https://p44wcwvd7p.re.qweatherapi.com';
const API_KEY  = 'b8971e98f1684813aba7567874362671';

const $ = (id) => document.getElementById(id);

/* ---------- 工具 ---------- */
async function api(path, params = {}) {
  const url = new URL(`${API_HOST}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set('key', API_KEY);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.code !== '200') throw new Error(`接口返回 code=${data.code}`);
  return data;
}

function fmtHour(iso) {
  // "2026-10-29T12:00+08:00" -> "12:00"
  const m = iso.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : iso;
}
function fmtDate(iso) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${Number(m[2])}月${Number(m[3])}日`;
}
function weekday(iso) {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00');
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
}

let toastTimer = null;
function toast(msg, type = 'error') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast ${type === 'error' ? '' : 'info'}`;
  clearTimeout(toastTimer);
  if (type === 'info') toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

/* ---------- 城市搜索（防抖 + 下拉） ---------- */
const input = $('searchInput');
const suggestList = $('suggestList');
let debounceTimer = null;

input.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const q = input.value.trim();
  if (!q) { suggestList.classList.add('hidden'); return; }
  debounceTimer = setTimeout(async () => {
    try {
      const data = await api('/geo/v2/city/lookup', { location: q, number: 8, lang: 'zh' });
      renderSuggest(data.location || []);
    } catch (e) {
      suggestList.classList.add('hidden');
    }
  }, 300);
});

function renderSuggest(list) {
  suggestList.innerHTML = '';
  if (!list.length) { suggestList.classList.add('hidden'); return; }
  list.forEach(city => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${city.name}</span><span class="sub">${city.adm1} · ${city.adm2}</span>`;
    li.addEventListener('click', () => {
      suggestList.classList.add('hidden');
      input.value = `${city.name}`;
      loadCity(city);
    });
    suggestList.appendChild(li);
  });
  suggestList.classList.remove('hidden');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-box')) suggestList.classList.add('hidden');
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const first = suggestList.querySelector('li');
    if (first) first.click();
  }
});

/* ---------- 定位 ---------- */
$('locateBtn').addEventListener('click', () => {
  if (!navigator.geolocation) { toast('当前浏览器不支持定位'); return; }
  $('locateBtn').disabled = true;
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const { longitude, latitude } = pos.coords;
      const data = await api('/geo/v2/city/lookup', {
        location: `${longitude.toFixed(2)},${latitude.toFixed(2)}`, lang: 'zh'
      });
      if (data.location && data.location.length) loadCity(data.location[0]);
      else toast('未能定位到附近城市');
    } catch (e) {
      toast('定位查询失败：' + e.message);
    } finally {
      $('locateBtn').disabled = false;
    }
  }, (err) => {
    $('locateBtn').disabled = false;
    toast('定位失败：' + (err.message || '请允许位置权限'), 'error');
  }, { timeout: 8000 });
});

/* ---------- 加载某城市全部数据 ---------- */
async function loadCity(city) {
  toast('正在加载 ' + city.name + ' 的天气…', 'info');
  try {
    const [now, hourly, daily] = await Promise.all([
      api('/v7/weather/now', { location: city.id, lang: 'zh' }),
      api('/v7/weather/24h', { location: city.id, lang: 'zh' }),
      api('/v7/weather/7d',  { location: city.id, lang: 'zh' }),
    ]);
    renderNow(city, now);
    renderHourly(hourly.hourly);
    renderDaily(daily.daily);
    $('toast').classList.add('hidden');
  } catch (e) {
    toast('加载失败：' + e.message);
  }
}

/* ---------- 渲染：当前天气 ---------- */
function renderNow(city, nowData) {
  const n = nowData.now;
  $('cityName').textContent = city.name;
  $('cityAdm').textContent = [city.adm1, city.country].filter(Boolean).join(' · ');
  $('obsTime').textContent = `更新于 ${fmtHour(nowData.updateTime)} · 观测时间 ${fmtHour(n.obsTime)}`;
  $('nowTemp').textContent = n.temp;
  $('nowText').textContent = n.text;
  $('nowIcon').className = `qi-${n.icon} now-icon`;
  $('feelsLike').textContent = `体感 ${n.feelsLike}°　${n.windDir} ${n.windScale} 级`;

  $('mWind').textContent = `${n.windDir} ${n.windScale}级`;
  $('mHumidity').textContent = `${n.humidity}%`;
  $('mPrecip').textContent = `${n.precip} mm`;
  $('mPressure').textContent = n.pressure;
  $('mVis').textContent = n.vis;
  $('mCloud').textContent = n.cloud === '-' ? '--' : n.cloud;
}

/* ---------- 渲染：24 小时 ---------- */
function renderHourly(hourly) {
  const strip = $('hourlyStrip');
  strip.innerHTML = '';
  hourly.slice(0, 24).forEach((h, i) => {
    const cell = document.createElement('div');
    cell.className = 'hour-cell' + (i === 0 ? ' now' : '');
    cell.innerHTML = `
      <span class="h">${i === 0 ? '现在' : fmtHour(h.fxTime)}</span>
      <i class="qi-${h.icon}"></i>
      <span class="t">${h.temp}°</span>
      <span class="h">${h.precip !== '0.0' && h.precip !== '0' ? h.precip + 'mm' : h.text}</span>`;
    strip.appendChild(cell);
  });
}

/* ---------- 渲染：7 天 ---------- */
function renderDaily(daily) {
  const wrap = $('dailyList');
  wrap.innerHTML = '';

  // 计算全部最高/最低温，用于温度条映射
  const temps = daily.flatMap(d => [Number(d.tempMin), Number(d.tempMax)]);
  const tMin = Math.min(...temps), tMax = Math.max(...temps);
  const range = Math.max(tMax - tMin, 1);

  daily.forEach((d, i) => {
    const row = document.createElement('div');
    row.className = 'daily-row';
    const left = (Number(d.tempMin) - tMin) / range * 100;
    const width = (Number(d.tempMax) - Number(d.tempMin)) / range * 100;
    row.innerHTML = `
      <span class="d">${i === 0 ? '今天' : weekday(d.fxDate)}<small>${fmtDate(d.fxDate)}</small></span>
      <i class="qi-${d.iconDay}"></i>
      <span class="txt">${d.textDay}${d.textDay !== d.textNight ? '转' + d.textNight : ''}</span>
      <span class="temp-bar">
        <span class="min">${d.tempMin}°</span>
        <span class="bar-track"><span class="bar-fill" style="margin-left:${left}%;width:${Math.max(width,4)}%"></span></span>
        <span class="max">${d.tempMax}°</span>
      </span>`;
    wrap.appendChild(row);
  });
}

/* ---------- 启动：默认加载北京 ---------- */
loadCity({ id: '101010100', name: '北京', adm1: '北京市', country: '中国' });
