'use strict';

/* ================= Константы ================= */
const STORE_KEY = 'habit-tracker.v1';
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAYS_FULL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const ALARM_WINDOW_MIN = 30;   // будильник звонит, если приложение открыли в течение 30 мин после времени
const SNOOZE_MIN = 10;

/* ================= Хранилище ================= */
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.habits)) return { habits: s.habits, checks: s.checks || {}, fired: s.fired || {} };
  } catch (e) { /* нет доступа или битые данные */ }
  return { habits: [], checks: {}, fired: {} };
}
const state = loadState();
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Не удалось сохранить данные в браузере'); }
}

/* ================= Даты ================= */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const dayIdx = d => (d.getDay() + 6) % 7;                 // 0 = понедельник
const weekStart = d => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -dayIdx(d));
const sameDay = (a, b) => ymd(a) === ymd(b);
const fmtDate = d => `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;

/* ================= Логика привычек ================= */
const getHabit = id => state.habits.find(h => h.id === id);
const isDone = (h, d) => !!(state.checks[h.id] && state.checks[h.id][ymd(d)]);

function setDone(h, d, value) {
  const map = state.checks[h.id] || (state.checks[h.id] = {});
  if (value) map[ymd(d)] = true; else delete map[ymd(d)];
  save();
}
const toggle = (h, d) => setDone(h, d, !isDone(h, d));

const weekPlan = h => (h.mode === 'days' ? h.days.length : h.times);

function weekDone(h, d) {
  const s = weekStart(d);
  let n = 0;
  for (let i = 0; i < 7; i++) if (isDone(h, addDays(s, i))) n++;
  return n;
}

// Запланирована ли привычка на день
function isScheduled(h, d) {
  if (h.mode === 'days') return h.days.includes(dayIdx(d));
  return isDone(h, d) || weekDone(h, d) < h.times;
}

// Текущая серия
function streak(h) {
  const t = today();
  if (h.mode === 'days') {
    if (!h.days.length) return 0;
    let n = 0, d = t;
    if (!isDone(h, d)) d = addDays(d, -1);                // сегодняшний день ещё не закончился
    for (let i = 0; i < 400; i++, d = addDays(d, -1)) {
      if (!h.days.includes(dayIdx(d))) continue;
      if (isDone(h, d)) n++; else break;
    }
    return n;
  }
  let n = 0, w = weekStart(t);
  if (weekDone(h, w) < h.times) w = addDays(w, -7);       // текущая неделя ещё идёт
  for (let i = 0; i < 60; i++, w = addDays(w, -7)) {
    if (weekDone(h, w) >= h.times) n++; else break;
  }
  return n;
}

// Лучшая серия (в днях или неделях)
function bestStreak(h) {
  const keys = Object.keys(state.checks[h.id] || {}).sort();
  if (!keys.length) return 0;
  const start = parseYmd(keys[0]), t = today();
  let best = 0, cur = 0;
  if (h.mode === 'days') {
    for (let d = start; d <= t; d = addDays(d, 1)) {
      if (!h.days.includes(dayIdx(d))) continue;
      if (isDone(h, d)) { cur++; best = Math.max(best, cur); }
      else if (!sameDay(d, t)) cur = 0;
    }
  } else {
    for (let w = weekStart(start); w <= t; w = addDays(w, 7)) {
      if (weekDone(h, w) >= h.times) { cur++; best = Math.max(best, cur); }
      else if (!sameDay(w, weekStart(t))) cur = 0;
    }
  }
  return best;
}

const totalDone = h => Object.keys(state.checks[h.id] || {}).length;

function freqText(h) {
  if (h.mode === 'days') {
    if (h.days.length === 7) return 'каждый день';
    return h.days.slice().sort().map(i => DAYS[i]).join(', ');
  }
  return `${h.times} ${plural(h.times, 'раз', 'раза', 'раз')} в неделю`;
}
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ================= Интерфейс ================= */
const $ = sel => document.querySelector(sel);
const view = $('#view');
const ui = { tab: 'today', date: today(), week: weekStart(today()), calHabit: null, calMonth: new Date(today().getFullYear(), today().getMonth(), 1), statsMode: 'week', statsDate: today(), chartSel: null };

function setTab(tab) {
  if (tab === 'add') { openEditor(null); return; }
  ui.tab = tab;
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  render();
  window.scrollTo(0, 0);
}
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));

function render() {
  ({ today: renderToday, week: renderWeek, calendar: renderCalendar, stats: renderStats, settings: renderSettings })[ui.tab]();
}

function emptyState() {
  return `<div class="empty"><div class="big-emoji">🌱</div>
    <p>Пока нет ни одной привычки.</p>
    <button class="btn btn-primary" data-act="add">＋ Добавить привычку</button></div>`;
}

/* ----- Сегодня ----- */
function habitCard(h, d) {
  const done = isDone(h, d);
  const wd = weekDone(h, d), plan = weekPlan(h);
  const pct = plan ? Math.min(100, Math.round(wd / plan * 100)) : 0;
  const st = streak(h);
  return `<div class="card ${done ? 'done' : ''}">
    <button class="check ${done ? 'on' : ''}" data-act="toggle" data-id="${h.id}" aria-pressed="${done}" aria-label="Отметить: ${esc(h.name)}">✓</button>
    <button class="card-body" data-act="edit" data-id="${h.id}">
      <div class="card-name">${esc(h.name)}</div>
      <div class="card-meta">
        <span>Неделя: ${wd} из ${plan}</span>
        <span>${esc(freqText(h))}</span>
        ${st ? `<span>🔥 ${st}</span>` : ''}
        ${h.reminder && h.reminder.time ? `<span>${h.reminder.alarm ? '⏰' : '🕒'} ${h.reminder.time}</span>` : ''}
      </div>
      <div class="bar ${wd >= plan ? 'full' : ''}"><i style="width:${pct}%"></i></div>
    </button>
  </div>`;
}

function renderToday() {
  const d = ui.date, isToday = sameDay(d, today());
  const title = isToday ? 'Сегодня' : DAYS_FULL[dayIdx(d)][0].toUpperCase() + DAYS_FULL[dayIdx(d)].slice(1);
  let html = `<div class="head">
      <button class="nav-btn" data-act="day" data-n="-1" aria-label="Предыдущий день">‹</button>
      <div class="title"><h1>${title}</h1><small>${fmtDate(d)}, ${DAYS_FULL[dayIdx(d)]}</small>
        ${isToday ? '' : '<button class="pill" data-act="day" data-n="0">Вернуться к сегодня</button>'}</div>
      <button class="nav-btn" data-act="day" data-n="1" aria-label="Следующий день">›</button>
    </div>`;
  if (!state.habits.length) { view.innerHTML = html + emptyState(); return; }
  const planned = state.habits.filter(h => isScheduled(h, d));
  const extra = state.habits.filter(h => !isScheduled(h, d));
  const doneCount = planned.filter(h => isDone(h, d)).length;
  html += `<h3>По плану · ${doneCount} из ${planned.length}</h3>`;
  html += planned.length ? planned.map(h => habitCard(h, d)).join('') : '<p class="muted">На этот день ничего не запланировано.</p>';
  if (extra.length) html += `<h3>Дополнительно</h3>` + extra.map(h => habitCard(h, d)).join('');
  view.innerHTML = html;
}

/* ----- Неделя ----- */
function renderWeek() {
  const s = ui.week, e = addDays(s, 6), t = today();
  let html = `<div class="head">
      <button class="nav-btn" data-act="week" data-n="-1" aria-label="Предыдущая неделя">‹</button>
      <div class="title"><h1>Неделя</h1><small>${fmtDate(s)} — ${fmtDate(e)}</small>
        ${sameDay(s, weekStart(t)) ? '' : '<button class="pill" data-act="week" data-n="0">Текущая неделя</button>'}</div>
      <button class="nav-btn" data-act="week" data-n="1" aria-label="Следующая неделя">›</button>
    </div>`;
  if (!state.habits.length) { view.innerHTML = html + emptyState(); return; }
  html += `<div class="grid-wrap"><table class="week"><thead><tr><th></th>`;
  for (let i = 0; i < 7; i++) {
    const d = addDays(s, i);
    html += `<th class="${sameDay(d, t) ? 'today-col' : ''}">${DAYS[i]}<br>${d.getDate()}</th>`;
  }
  html += `<th></th></tr></thead><tbody>`;
  let totalDoneW = 0, totalPlanW = 0;
  for (const h of state.habits) {
    const wd = weekDone(h, s), plan = weekPlan(h);
    totalDoneW += Math.min(wd, plan); totalPlanW += plan;
    html += `<tr><td class="hname" title="${esc(h.name)}">${esc(h.name)}</td>`;
    for (let i = 0; i < 7; i++) {
      const d = addDays(s, i), on = isDone(h, d);
      const plannedDay = h.mode === 'days' && h.days.includes(i);
      html += `<td><button class="cell ${on ? 'on' : ''} ${plannedDay ? 'plan' : ''} ${sameDay(d, t) ? 'today' : ''}"
        data-act="cell" data-id="${h.id}" data-date="${ymd(d)}" aria-label="${esc(h.name)}, ${DAYS[i]} ${d.getDate()}">✓</button></td>`;
    }
    html += `<td class="score ${wd >= plan ? 'met' : ''}">${wd}/${plan}</td></tr>`;
  }
  html += `</tbody></table></div>
    <div class="legend"><span><i style="background:var(--ok)"></i>выполнено</span><span><i style="border:1.5px solid var(--accent)"></i>запланированный день</span></div>
    <div class="summary"><b>${totalDoneW} из ${totalPlanW}</b><div class="muted">выполнено по плану за неделю${totalPlanW ? ` · ${Math.round(totalDoneW / totalPlanW * 100)}%` : ''}</div></div>`;
  view.innerHTML = html;
}

/* ----- Календарь ----- */
function renderCalendar() {
  if (!state.habits.length) { view.innerHTML = '<h1>Календарь</h1>' + emptyState(); return; }
  if (!getHabit(ui.calHabit)) ui.calHabit = state.habits[0].id;
  const h = getHabit(ui.calHabit), m = ui.calMonth, t = today();
  let html = `<h1>Календарь</h1><div class="chips" style="margin-top:12px">` +
    state.habits.map(x => `<button class="chip ${x.id === h.id ? 'on' : ''}" data-act="calhabit" data-id="${x.id}">${esc(x.name)}</button>`).join('') +
    `</div><div class="head" style="margin-top:16px">
      <button class="nav-btn" data-act="month" data-n="-1" aria-label="Предыдущий месяц">‹</button>
      <div class="title"><h2>${MONTHS[m.getMonth()]} ${m.getFullYear()}</h2></div>
      <button class="nav-btn" data-act="month" data-n="1" aria-label="Следующий месяц">›</button>
    </div><div class="month">` + DAYS.map(x => `<div class="dow">${x}</div>`).join('');
  const first = new Date(m.getFullYear(), m.getMonth(), 1);
  const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  for (let i = 0; i < dayIdx(first); i++) html += '<span class="day out"></span>';
  let monthDone = 0;
  for (let n = 1; n <= daysInMonth; n++) {
    const d = new Date(m.getFullYear(), m.getMonth(), n), on = isDone(h, d);
    if (on) monthDone++;
    const plannedDay = h.mode === 'days' && h.days.includes(dayIdx(d));
    html += `<button class="day ${on ? 'on' : ''} ${plannedDay ? 'plan' : ''} ${sameDay(d, t) ? 'today' : ''} ${d > t ? 'future' : ''}"
      data-act="cell" data-id="${h.id}" data-date="${ymd(d)}">${n}</button>`;
  }
  const unit = h.mode === 'days' ? 'дн.' : 'нед.';
  html += `</div><div class="stats">
      <div class="stat"><b>${monthDone}</b><span>выполнено за месяц</span></div>
      <div class="stat"><b>${totalDone(h)}</b><span>всего выполнений</span></div>
      <div class="stat"><b>🔥 ${streak(h)}</b><span>текущая серия, ${unit}</span></div>
      <div class="stat"><b>${bestStreak(h)}</b><span>лучшая серия, ${unit}</span></div>
    </div><p class="muted" style="font-size:13px;margin-top:12px">План: ${esc(freqText(h))}. Нажмите на день, чтобы поставить или снять отметку.</p>`;
  view.innerHTML = html;
}

/* ----- Статистика ----- */
// Итог по привычке за период [from, to] (включительно).
// done — выполнено в счёт плана, left — ещё можно успеть, missed — пропущено.
function statsRange(h, from, to) {
  const t = today(), created = parseYmd(h.createdAt || ymd(t));
  const r = { plan: 0, done: 0, left: 0, missed: 0 };
  if (h.mode === 'days') {
    let doneOnPlan = 0, extra = 0, missedRaw = 0;
    for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
      const planned = h.days.includes(dayIdx(d)) && d >= created;
      const on = isDone(h, d);
      if (planned) { r.plan++; if (on) doneOnPlan++; else if (d < t) missedRaw++; }
      else if (on) extra++;
    }
    r.done = Math.min(doneOnPlan + extra, r.plan);       // лишние дни засчитываются в план
    r.missed = Math.min(missedRaw, r.plan - r.done);
    r.left = r.plan - r.done - r.missed;
  } else {
    // недели, чей понедельник попадает в период
    for (let w = weekStart(from); w <= to; w = addDays(w, 7)) {
      if (w < from || addDays(w, 6) < created) continue;
      const d = Math.min(weekDone(h, w), h.times);
      r.plan += h.times; r.done += d;
      if (addDays(w, 7) <= t) r.missed += h.times - d; else r.left += h.times - d;
    }
  }
  return r;
}
function statsPeriod() {
  const d = ui.statsDate;
  if (ui.statsMode === 'week') { const s = weekStart(d); return { from: s, to: addDays(s, 6) }; }
  return { from: new Date(d.getFullYear(), d.getMonth(), 1), to: new Date(d.getFullYear(), d.getMonth() + 1, 0) };
}
function sumStats(list) {
  return list.reduce((a, r) => ({ plan: a.plan + r.plan, done: a.done + r.done, left: a.left + r.left, missed: a.missed + r.missed }), { plan: 0, done: 0, left: 0, missed: 0 });
}
const pctOf = r => (r.plan ? Math.round(r.done / r.plan * 100) : 0);

function renderStats() {
  const { from, to } = statsPeriod(), t = today();
  const isWeek = ui.statsMode === 'week';
  const current = isWeek ? sameDay(from, weekStart(t)) : (from.getMonth() === t.getMonth() && from.getFullYear() === t.getFullYear());
  const title = isWeek ? `${fmtDate(from)} — ${fmtDate(to)}` : `${MONTHS[from.getMonth()]} ${from.getFullYear()}`;
  let html = `<h1>Статистика</h1>
    <div class="seg seg-btns" style="margin-top:12px">
      <button class="${isWeek ? 'on' : ''}" data-act="smode" data-n="week">Неделя</button>
      <button class="${!isWeek ? 'on' : ''}" data-act="smode" data-n="month">Месяц</button>
    </div>
    <div class="head" style="margin-top:12px">
      <button class="nav-btn" data-act="speriod" data-n="-1" aria-label="Предыдущий период">‹</button>
      <div class="title"><h2>${title}</h2>
        ${current ? '' : `<button class="pill" data-act="speriod" data-n="0">${isWeek ? 'Текущая неделя' : 'Текущий месяц'}</button>`}</div>
      <button class="nav-btn" data-act="speriod" data-n="1" aria-label="Следующий период">›</button>
    </div>`;
  if (!state.habits.length) { view.innerHTML = html + emptyState(); return; }

  const rows = state.habits.map(h => ({ h, r: statsRange(h, from, to) }));
  const tot = sumStats(rows.map(x => x.r));
  const p = pctOf(tot);
  html += `<div class="tiles">
      <div class="tile t-done"><span class="ico">✅</span><b>${tot.done}</b><span>выполнено</span></div>
      <div class="tile t-left"><span class="ico">⏳</span><b>${tot.left}</b><span>осталось</span></div>
      <div class="tile t-miss"><span class="ico">❌</span><b>${tot.missed}</b><span>пропущено</span></div>
    </div>
    <div class="summary"><div class="sum-row"><b>${p}%</b><span class="muted">плана выполнено · ${tot.done} из ${tot.plan}</span></div>
      <div class="stack" role="img" aria-label="Выполнено ${tot.done}, осталось ${tot.left}, пропущено ${tot.missed}">
        ${tot.plan ? `<i class="s-done" style="flex:${tot.done}"></i><i class="s-left" style="flex:${tot.left}"></i><i class="s-miss" style="flex:${tot.missed}"></i>` : ''}
      </div></div>`;

  html += `<h3>По привычкам</h3><div class="panel tbl-panel"><table class="stbl">
    <thead><tr><th>Привычка</th><th title="Выполнено">✅</th><th title="Осталось">⏳</th><th title="Пропущено">❌</th><th>План</th></tr></thead><tbody>` +
    rows.map(({ h, r }) => `<tr><td class="hname">${esc(h.name)}<small>${esc(freqText(h))}</small></td>
      <td class="n-done">${r.done}</td><td>${r.left}</td><td class="${r.missed ? 'n-miss' : ''}">${r.missed}</td>
      <td><b>${pctOf(r)}%</b><small>${r.done}/${r.plan}</small></td></tr>`).join('') +
    `</tbody></table></div>`;

  // График: % выполнения плана за 8 недель, заканчивая неделей выбранного периода (но не позже текущей)
  const endRef = to < t ? to : t;
  const lastW = weekStart(endRef);
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const w = addDays(lastW, -7 * i);
    const r = sumStats(state.habits.map(h => statsRange(h, w, addDays(w, 6))));
    weeks.push({ w, r, p: r.plan ? pctOf(r) : null });
  }
  if (ui.chartSel == null || ui.chartSel > 7) ui.chartSel = 7;
  const sel = weeks[ui.chartSel];
  html += `<h3>Последние 8 недель</h3><div class="panel chart-panel">
    <div class="chart-cap">${sel.p == null ? 'Нет плана' : `<b>${sel.p}%</b> · ${sel.r.done} из ${sel.r.plan}`}
      <span class="muted">· ${fmtDate(sel.w)} — ${fmtDate(addDays(sel.w, 6))}</span></div>
    <div class="chart" role="img" aria-label="Процент выполнения плана по неделям">
      <div class="gridline" style="bottom:100%"><span>100%</span></div>
      <div class="gridline" style="bottom:50%"><span>50%</span></div>
      ${weeks.map((x, i) => `<button class="bar-col ${i === ui.chartSel ? 'sel' : ''}" data-act="chartsel" data-n="${i}"
          aria-label="${fmtDate(x.w)}: ${x.p == null ? 'нет плана' : x.p + '%'}">
          <i class="b ${sameDay(x.w, weekStart(t)) ? 'cur' : ''}" style="height:${x.p == null ? 0 : Math.max(x.p, 2)}%"></i>
        </button>`).join('')}
    </div>
    <div class="chart-x">${weeks.map(x => `<span>${x.w.getDate()}.${pad(x.w.getMonth() + 1)}</span>`).join('')}</div>
    <p class="muted" style="font-size:12px;margin:8px 0 0">Подпись — понедельник недели. Нажмите на столбик, чтобы увидеть цифры.</p>
  </div>`;
  view.innerHTML = html;
}

/* ----- Настройки ----- */
function renderSettings() {
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const permText = { granted: '<span class="status-ok">разрешены</span>', denied: '<span class="status-bad">запрещены в настройках браузера</span>', default: 'не запрошены', unsupported: '<span class="status-bad">не поддерживаются этим браузером</span>' }[perm];
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  view.innerHTML = `<h1>Настройки</h1>
    <div class="panel"><h2>Уведомления</h2>
      <p>Статус: ${permText}. Если вы переключились на другую вкладку или приложение, но браузер ещё работает, вместе с будильником придёт системное уведомление.</p>
      ${perm === 'default' ? '<button class="btn btn-primary" data-act="perm">Разрешить уведомления</button>' : ''}
      <button class="btn" data-act="testalarm">Проверить будильник</button>
    </div>
    <div class="panel"><h2>Как работают напоминания</h2>
      <p><b>⏰ Будильник</b> звонит, когда приложение открыто на экране или свёрнуто, но браузер его ещё не закрыл. Если телефон заблокирован надолго, браузер может приостановить страницу.</p>
      <p><b>📅 Google Calendar</b> напоминает всегда, даже если приложение закрыто. Для надёжности включите оба варианта.</p>
    </div>
    <div class="panel"><h2>Установить на экран «Домой»</h2>
      ${standalone ? '<p class="status-ok">Приложение уже установлено.</p>' : `
      <ol><li><b>iPhone (Safari):</b> кнопка «Поделиться» → «На экран „Домой“».</li>
      <li><b>Android (Chrome):</b> меню ⋮ → «Добавить на главный экран» / «Установить приложение».</li></ol>`}
    </div>
    <div class="panel"><h2>Резервная копия</h2>
      <p>Данные хранятся только в этом браузере. Сохраните копию в файл, чтобы не потерять их или перенести на другой телефон.</p>
      <button class="btn" data-act="export">Сохранить в файл</button>
      <button class="btn" data-act="import">Загрузить из файла</button>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
    </div>
    <p class="muted" style="font-size:13px;text-align:center">Привычек: ${state.habits.length}</p>`;
  $('#importFile').addEventListener('change', importData);
}

/* ----- Обработка нажатий ----- */
view.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const { act, id, n, date } = b.dataset;
  const h = id && getHabit(id);
  switch (act) {
    case 'add': openEditor(null); break;
    case 'toggle': toggle(h, ui.date); if (navigator.vibrate) navigator.vibrate(15); render(); break;
    case 'edit': openEditor(h); break;
    case 'cell': toggle(h, parseYmd(date)); render(); break;
    case 'day': ui.date = +n === 0 ? today() : addDays(ui.date, +n); render(); break;
    case 'week': ui.week = +n === 0 ? weekStart(today()) : addDays(ui.week, 7 * n); render(); break;
    case 'month': ui.calMonth = new Date(ui.calMonth.getFullYear(), ui.calMonth.getMonth() + +n, 1); render(); break;
    case 'calhabit': ui.calHabit = id; render(); break;
    case 'smode': ui.statsMode = n; ui.chartSel = null; render(); break;
    case 'speriod':
      if (+n === 0) ui.statsDate = today();
      else if (ui.statsMode === 'week') ui.statsDate = addDays(ui.statsDate, 7 * n);
      else ui.statsDate = new Date(ui.statsDate.getFullYear(), ui.statsDate.getMonth() + +n, 1);
      ui.chartSel = null; render(); break;
    case 'chartsel': ui.chartSel = +n; render(); break;
    case 'perm': requestNotifications().then(render); break;
    case 'testalarm': showAlarm({ id: '__test', name: 'Проверка будильника', reminder: { time: `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}` } }); break;
    case 'export': exportData(); break;
    case 'import': $('#importFile').click(); break;
  }
});

/* ================= Редактор привычки ================= */
const form = $('#habitForm');
const sheet = $('#sheet');
let editing = null;          // редактируемая привычка или null для новой
let draftTimes = 3;
let draftDays = [];

$('#dayChips').innerHTML = DAYS.map((d, i) => `<button type="button" class="chip" data-day="${i}">${d}</button>`).join('');
$('#dayChips').addEventListener('click', e => {
  const b = e.target.closest('[data-day]'); if (!b) return;
  const i = +b.dataset.day;
  draftDays = draftDays.includes(i) ? draftDays.filter(x => x !== i) : [...draftDays, i].sort();
  syncForm();
});
$('#tMinus').addEventListener('click', () => { draftTimes = Math.max(1, draftTimes - 1); syncForm(); });
$('#tPlus').addEventListener('click', () => { draftTimes = Math.min(7, draftTimes + 1); syncForm(); });
form.mode.forEach(r => r.addEventListener('change', syncForm));
let prevTime = '';
$('#fTime').addEventListener('input', () => {
  if (!prevTime && $('#fTime').value) $('#fAlarm').checked = true;   // время указали впервые — включаем будильник
  prevTime = $('#fTime').value;
  syncForm();
});
$('#clearTime').addEventListener('click', () => { $('#fTime').value = ''; syncForm(); });
sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('[data-close]')) closeEditor(); });

function syncForm() {
  const mode = form.mode.value;
  $('#weeklyBox').hidden = mode !== 'weekly';
  $('#daysBox').hidden = mode !== 'days';
  $('#tVal').textContent = draftTimes;
  document.querySelectorAll('#dayChips .chip').forEach(c => c.classList.toggle('on', draftDays.includes(+c.dataset.day)));
  $('#reminderBox').hidden = !$('#fTime').value;
  $('#clearTime').hidden = !$('#fTime').value;
}

function openEditor(h) {
  editing = h;
  $('#sheetTitle').textContent = h ? 'Редактировать' : 'Новая привычка';
  $('#fName').value = h ? h.name : '';
  form.mode.value = h ? h.mode : 'weekly';
  draftTimes = h && h.mode === 'weekly' ? h.times : 3;
  draftDays = h && h.mode === 'days' ? h.days.slice() : [0, 2, 4];
  $('#fTime').value = h && h.reminder ? h.reminder.time || '' : '';
  $('#fAlarm').checked = h ? !!(h.reminder && h.reminder.alarm) : true;
  prevTime = $('#fTime').value;
  $('#deleteBtn').hidden = !h;
  $('#formError').hidden = true;
  syncForm();
  sheet.hidden = false;
  if (!h) setTimeout(() => $('#fName').focus(), 50);
}
function closeEditor() { sheet.hidden = true; editing = null; }

// Собрать привычку из формы (для сохранения и для ссылок в календарь)
function readForm() {
  const name = $('#fName').value.trim();
  const mode = form.mode.value;
  if (!name) return { error: 'Введите название привычки' };
  if (mode === 'days' && !draftDays.length) return { error: 'Выберите хотя бы один день недели' };
  const time = $('#fTime').value;
  return {
    habit: {
      id: editing ? editing.id : 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name, mode,
      times: mode === 'weekly' ? draftTimes : null,
      days: mode === 'days' ? draftDays.slice() : [],
      reminder: { time, alarm: !!time && $('#fAlarm').checked },
      createdAt: editing ? editing.createdAt : ymd(today()),
    },
  };
}
function showError(msg) { const p = $('#formError'); p.textContent = msg; p.hidden = false; }

form.addEventListener('submit', e => {
  e.preventDefault();
  const { habit, error } = readForm();
  if (error) { showError(error); return; }
  const i = state.habits.findIndex(x => x.id === habit.id);
  if (i >= 0) state.habits[i] = habit; else state.habits.push(habit);
  save();
  closeEditor();
  toast(i >= 0 ? 'Сохранено' : 'Привычка добавлена');
  if (habit.reminder.alarm) unlockAudio();
  render();
});

$('#deleteBtn').addEventListener('click', () => {
  if (!editing || !confirm(`Удалить привычку «${editing.name}» и все её отметки?`)) return;
  state.habits = state.habits.filter(x => x.id !== editing.id);
  delete state.checks[editing.id];
  save();
  closeEditor();
  toast('Привычка удалена');
  render();
});

$('#gcalBtn').addEventListener('click', () => {
  const { habit, error } = readForm();
  if (error) { showError(error); return; }
  window.open(googleCalendarUrl(habit), '_blank', 'noopener');
});
$('#icsBtn').addEventListener('click', () => {
  const { habit, error } = readForm();
  if (error) { showError(error); return; }
  downloadFile(`${habit.name}.ics`, buildIcs(habit), 'text/calendar');
});

/* ================= Календарь: Google и .ics ================= */
function firstOccurrence(h) {
  const t = today();
  if (h.mode !== 'days') return t;
  for (let i = 0; i < 7; i++) { const d = addDays(t, i); if (h.days.includes(dayIdx(d))) return d; }
  return t;
}
const rrule = h => (h.mode === 'days'
  ? `RRULE:FREQ=WEEKLY;BYDAY=${h.days.slice().sort().map(i => BYDAY[i]).join(',')}`
  : 'RRULE:FREQ=DAILY');
const calStamp = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
function eventTimes(h) {
  const [hh, mm] = h.reminder.time.split(':').map(Number);
  const start = firstOccurrence(h); start.setHours(hh, mm, 0, 0);
  return { start, end: new Date(start.getTime() + 15 * 60000) };
}
function eventDetails(h) {
  return `Привычка: ${h.name}\nПлан: ${freqText(h)}\nОтметьте выполнение в трекере привычек${location.protocol.startsWith('http') ? ': ' + location.href.split('#')[0] : '.'}`;
}

function googleCalendarUrl(h) {
  const { start, end } = eventTimes(h);
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: h.name,
    dates: `${calStamp(start)}/${calStamp(end)}`,
    details: eventDetails(h),
    recur: rrule(h),
  });
  try { p.set('ctz', Intl.DateTimeFormat().resolvedOptions().timeZone); } catch (e) { /* без часового пояса */ }
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}

function buildIcs(h) {
  const { start, end } = eventTimes(h);
  const icsText = s => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => '\\' + m);
  const now = new Date();
  const utc = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Habit Tracker//RU', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${h.id}-${Date.now()}@habit-tracker`,
    `DTSTAMP:${utc}`,
    `DTSTART:${calStamp(start)}`,
    `DTEND:${calStamp(end)}`,
    rrule(h),
    `SUMMARY:${icsText(h.name)}`,
    `DESCRIPTION:${icsText(eventDetails(h))}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(h.name)}`, 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}

/* ================= Будильник ================= */
let audioCtx = null;
let beepTimer = null;
let alarmHabit = null;
const snoozes = {};          // id привычки → время повторного звонка (мс)

function audioReady() { return audioCtx && audioCtx.state === 'running'; }
function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state !== 'running') audioCtx.resume().then(updateBanner, () => {});
    // короткий беззвучный сигнал — нужен iOS, чтобы окончательно разблокировать звук
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    g.gain.value = 0; o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.01);
  } catch (e) { /* звук недоступен */ }
  updateBanner();
}
['pointerdown', 'touchend', 'keydown'].forEach(ev => document.addEventListener(ev, unlockAudio, { passive: true }));

function updateBanner() {
  const needs = state.habits.some(h => h.reminder && h.reminder.alarm);
  $('#soundBanner').hidden = !needs || audioReady();
}

function beep() {
  if (!audioReady()) return;
  const t0 = audioCtx.currentTime;
  [0, 0.25, 0.5].forEach((dt, i) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.value = i === 2 ? 1175 : 880;
    g.gain.setValueAtTime(0.0001, t0 + dt);
    g.gain.exponentialRampToValueAtTime(0.25, t0 + dt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.2);
    o.connect(g).connect(audioCtx.destination);
    o.start(t0 + dt); o.stop(t0 + dt + 0.22);
  });
}

function showAlarm(h) {
  alarmHabit = h;
  $('#alarmTime').textContent = h.reminder.time;
  $('#alarmName').textContent = h.name;
  $('#alarmSub').textContent = h.id === '__test' ? 'Так будет выглядеть напоминание'
    : `Неделя: ${weekDone(h, today())} из ${weekPlan(h)}`;
  $('#alarmDone').hidden = h.id === '__test';
  $('#alarmSnooze').hidden = h.id === '__test';
  $('#alarm').hidden = false;
  clearInterval(beepTimer);
  let ticks = 0;
  beep();
  beepTimer = setInterval(() => {
    beep();
    if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
    if (++ticks > 120) stopAlarm();              // звонит не дольше ~2 минут
  }, 1000);
  if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
  if (h.id !== '__test') notify(h);
}
function stopAlarm() {
  clearInterval(beepTimer); beepTimer = null;
  if (navigator.vibrate) navigator.vibrate(0);
  $('#alarm').hidden = true;
  alarmHabit = null;
}
$('#alarmDone').addEventListener('click', () => {
  const h = alarmHabit && getHabit(alarmHabit.id);
  if (h) { setDone(h, today(), true); toast(`«${h.name}» — выполнено!`); }
  stopAlarm(); render();
});
$('#alarmSnooze').addEventListener('click', () => {
  if (alarmHabit) snoozes[alarmHabit.id] = Date.now() + SNOOZE_MIN * 60000;
  toast(`Напомню через ${SNOOZE_MIN} минут`);
  stopAlarm();
});
$('#alarmClose').addEventListener('click', stopAlarm);

// Нужно ли сегодня напоминать об этой привычке
function needsReminderToday(h) {
  const t = today();
  if (isDone(h, t)) return false;
  if (h.mode === 'days') return h.days.includes(dayIdx(t));
  return weekDone(h, t) < h.times;
}

function checkAlarms() {
  if (!$('#alarm').hidden) return;
  const now = new Date(), t = today(), nowMin = now.getHours() * 60 + now.getMinutes();
  for (const h of state.habits) {
    if (!h.reminder || !h.reminder.alarm || !h.reminder.time) continue;
    // отложенный будильник
    if (snoozes[h.id] && Date.now() >= snoozes[h.id]) {
      delete snoozes[h.id];
      if (needsReminderToday(h)) { showAlarm(h); return; }
    }
    const key = `${ymd(t)}|${h.id}`;
    if (state.fired[key]) continue;
    const [hh, mm] = h.reminder.time.split(':').map(Number);
    const diff = nowMin - (hh * 60 + mm);
    if (diff < 0 || diff > ALARM_WINDOW_MIN) continue;
    if (!needsReminderToday(h)) continue;
    state.fired[key] = 1;
    pruneFired();
    save();
    showAlarm(h);
    return;
  }
}
function pruneFired() {
  const keep = ymd(addDays(today(), -2));
  for (const k of Object.keys(state.fired)) if (k.slice(0, 10) < keep) delete state.fired[k];
}

/* ================= Уведомления ================= */
async function requestNotifications() {
  if (!('Notification' in window)) { toast('Этот браузер не поддерживает уведомления'); return; }
  try {
    const r = await Notification.requestPermission();
    toast(r === 'granted' ? 'Уведомления разрешены' : 'Уведомления не разрешены');
  } catch (e) { toast('Не удалось запросить разрешение'); }
}
async function notify(h) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = { body: `Пора: ${h.name} (${h.reminder.time})`, tag: 'habit-' + h.id, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', requireInteraction: true, vibrate: [300, 150, 300] };
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) await reg.showNotification('⏰ ' + h.name, opts);
    else new Notification('⏰ ' + h.name, opts);
  } catch (e) { /* уведомление не показано */ }
}

/* ================= Экспорт / импорт ================= */
function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function exportData() {
  const data = { app: 'habit-tracker', version: 1, exportedAt: new Date().toISOString(), habits: state.habits, checks: state.checks };
  downloadFile(`habits-${ymd(today())}.json`, JSON.stringify(data, null, 2), 'application/json');
}
function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  file.text().then(txt => {
    const data = JSON.parse(txt);
    if (!Array.isArray(data.habits) || typeof data.checks !== 'object') throw new Error('format');
    if (!confirm(`Заменить текущие данные (${state.habits.length} привычек) данными из файла (${data.habits.length} привычек)?`)) return;
    state.habits = data.habits; state.checks = data.checks || {}; state.fired = {};
    save(); toast('Данные загружены'); render(); updateBanner();
  }).catch(() => toast('Не удалось прочитать файл'));
}

/* ================= Прочее ================= */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

// Смена дня в полночь, проверка будильников
let lastDay = ymd(today());
function tick() {
  const d = ymd(today());
  if (d !== lastDay) {
    if (sameDay(ui.date, parseYmd(lastDay))) ui.date = today();
    if (sameDay(ui.week, weekStart(parseYmd(lastDay)))) ui.week = weekStart(today());
    lastDay = d;
    render();
  }
  checkAlarms();
}
setInterval(tick, 10000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); render(); } });

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

setTab('today');
updateBanner();
tick();
