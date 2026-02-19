/* Виджет бронирования столиков (подключён к API ReMarked)

  ID заведения (поинт): 548548
  API: https://app.remarked.ru/api/v1/ApiReservesWidget

  Данные о доступности столиков и слотах времени загружаются в реальном
  времени через ReMarked API (метод GetTimesWithTables).
*/

(function () {
  'use strict';

  // Локально используем прокси serve.py, на GitHub Pages — прямой API ReMarked.
  const REMARKED_API =
    location.hostname === '127.0.0.1' || location.hostname === 'localhost'
      ? '/api/remarked'
      : 'https://app.remarked.ru/api/v1/ApiReservesWidget';
  const POINT_ID = 548548;
  const REST_TIME_ZONE = 'Europe/Moscow';
  const RESERVE_DURATION_HOURS = 3;

  const ROOM_TO_FLOOR = {
    356803025: 1,
    356803024: 2,
    356803026: 3,
  };

  const FLOOR_TO_ROOM = {
    1: 356803025,
    2: 356803024,
    3: 356803026,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function formatDate(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function normalizePhone(raw) {
    const digits = String(raw || '').replace(/\D/g, '').slice(0, 11);
    let d = digits;
    if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1);
    if (d.length === 10) d = '7' + d;
    return d;
  }

  function formatRuPhone(digits11) {
    const d = normalizePhone(digits11);
    if (d.length < 11) return String(digits11 || '');
    return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
  }

  function pickNumber(val, fallback) {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  }

  function getTzDateParts(timestamp) {
    const parts = new Intl.DateTimeFormat('ru-RU', {
      timeZone: REST_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(timestamp * 1000));

    const pick = (type, fallback = '00') => parts.find((p) => p.type === type)?.value || fallback;

    return {
      year: Number(pick('year', '1970')),
      month: Number(pick('month')),
      day: Number(pick('day')),
      hours: Number(pick('hour')),
      minutes: Number(pick('minute')),
    };
  }

  function tsToDateKey(timestamp) {
    const { year, month, day } = getTzDateParts(timestamp);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function tsToTime(timestamp) {
    const { hours, minutes } = getTzDateParts(timestamp);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  // ── ReMarked API client ──────────────────────────────────────────────

  async function remarkedPost(body) {
    const resp = await fetch(REMARKED_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return resp.json();
  }

  async function getToken() {
    const data = await remarkedPost({
      method: 'GetToken',
      point: String(POINT_ID),
      request_id: String(Date.now()),
    });
    if (data.token) return data.token;
    throw new Error(data.message || 'Не удалось получить токен');
  }

  async function getTimesWithTables(token, date, guestsCount) {
    return remarkedPost({
      method: 'GetTimesWithTables',
      token,
      reserve_date: date,
      guests_count: guestsCount,
    });
  }

  // ── BookingWidget ────────────────────────────────────────────────────

  class BookingWidget {
    constructor(container) {
      this.container = container;

      this.config = {
        initialFloor: pickNumber(container.dataset.initialFloor, 2),
        maxDaysAhead: 60,
      };

      this.selectedDate = new Date();
      this.selectedDateStr = formatDate(this.selectedDate);
      this.selectedTime = null;
      this.selectedTimestamp = null;
      this.selectedTable = null;

      this.remarkedToken = null;
      /** Полный ответ GetTimesWithTables для текущей даты */
      this.remarkedData = null;
      /** { [timestamp]: { tableId: is_free } } */
      this.slotAvailability = {};
      /** { "floor:number": { min:number, max:number } } */
      this.tableCapacityByKey = {};
      /** Все уникальные слоты "HH:MM" с флагом available */
      this.timeSlots = [];
      /** Защита от гонок: применяем только самый свежий ответ API */
      this.loadSeq = 0;

      this.isLoading = false;
      this.floorPlan = null;

      this.init();
    }

    async init() {
      this.render();
      this.initFloorPlan();
      this.setupEventListeners();
      await this.loadSlotsForDate(this.selectedDateStr);
    }

    // ── UI ──────────────────────────────────────────────────────────────

    render() {
      const today = formatDate(new Date());
      const maxDate = new Date();
      maxDate.setDate(maxDate.getDate() + this.config.maxDaysAhead);
      const maxDateStr = formatDate(maxDate);

      this.container.innerHTML = `
        <div class="booking-widget">
          <div class="booking-widget__form">
            <h2 class="h2" style="margin-bottom: 24px; font-size: 20px;">Детали бронирования</h2>
            <div class="form">
              <div class="field">
                <label class="label" for="booking-name">Имя</label>
                <input type="text" id="booking-name" class="input" placeholder="Ваше имя" required />
              </div>

              <div class="field">
                <label class="label" for="booking-phone">Телефон</label>
                <input type="tel" id="booking-phone" class="input" placeholder="+7 (___) ___-__-__" inputmode="tel" required />
              </div>

              <div class="row">
                <div class="field">
                  <label class="label" for="booking-guests">Гостей</label>
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <button type="button" class="btn btn--ghost" id="guests-decrease" style="padding: 8px 16px;">−</button>
                    <input type="number" id="booking-guests" class="input" value="1" min="1" max="20" style="text-align: center; width: 80px;" required />
                    <button type="button" class="btn btn--ghost" id="guests-increase" style="padding: 8px 16px;">+</button>
                  </div>
                </div>

                <div class="field">
                  <label class="label" for="booking-date">Дата</label>
                  <input type="date" id="booking-date" class="input" min="${today}" max="${maxDateStr}" value="${today}" required />
                </div>
              </div>

              <div class="field">
                <label class="label">Свободное время</label>
                <div id="booking-time-slots" class="time-slots"></div>
              </div>

              <div class="field">
                <label class="label" for="booking-table">Стол</label>
                <div style="display: flex; gap: 10px; align-items: center;">
                  <input type="text" id="booking-table" class="input" placeholder="Выберите стол на карте" readonly />
                  <button type="button" class="btn btn--ghost" id="booking-table-clear" style="padding: 10px 14px;" aria-label="Сбросить выбор стола" disabled>×</button>
                </div>
                <div class="small" style="margin-top: 8px; opacity: 0.75;">
                  Нажмите на стол на карте. Если не выбирать — мы подберём лучший.
                </div>
              </div>

              <div class="field">
                <label class="label" for="booking-occasion">Повод</label>
                <select id="booking-occasion" class="input">
                  <option value="Без повода">Без повода</option>
                  <option value="День рождения">День рождения</option>
                  <option value="Свидание">Свидание</option>
                  <option value="Деловая встреча">Деловая встреча</option>
                  <option value="Семейный ужин">Семейный ужин</option>
                  <option value="Другое">Другое</option>
                </select>
              </div>

              <div class="field">
                <label class="label" for="booking-comment">Комментарий</label>
                <textarea id="booking-comment" class="textarea" placeholder="Пожелания по посадке, детский стул и т.д." rows="3"></textarea>
              </div>

              <div class="field">
                <label class="checkbox" style="margin-top: 8px;">
                  <input type="checkbox" id="booking-consent" required />
                  <span style="font-size: 13px;">Согласен(-сна) на обработку персональных данных и с <a href="assets/docs/soglasie-personalnye-dannye.doc" target="_blank" style="text-decoration: underline;">пользовательским соглашением</a>.</span>
                </label>
              </div>

              <button type="submit" class="btn btn--accent" id="booking-submit" style="width: 100%; margin-top: 8px;">
                <span id="booking-submit-text">Отправить заявку</span>
                <span id="booking-submit-loading" style="display: none;">Отправка...</span>
              </button>
            </div>
          </div>

          <div class="booking-widget__map">
            <div data-floor-plan style="min-height: 420px; display: flex; align-items: center; justify-content: center;">
              <div style="color: var(--muted);">Загрузка карты зала…</div>
            </div>
          </div>
        </div>
      `;
    }

    initFloorPlan() {
      const el = $('[data-floor-plan]', this.container);
      if (!el || typeof window.FloorPlan !== 'function') {
        if (el) el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted);">Ошибка: карта зала не загружена</div>';
        return;
      }
      try {
        this.floorPlan = new window.FloorPlan(
          el,
          (info) => this.onTableSelect(info),
          { initialFloor: this.config.initialFloor }
        );
        this.floorPlan.onFloorSwitch = () => this.updateBusyFromCache();
      } catch (e) {
        console.error('Ошибка инициализации карты зала:', e);
      }
    }

    onTableSelect(tableInfo) {
      this.selectedTable = tableInfo;
      const tableInput = $('#booking-table', this.container);
      const clearBtn = $('#booking-table-clear', this.container);
      if (tableInput) tableInput.value = tableInfo ? `${tableInfo.label} (этаж ${tableInfo.floor})` : '';
      if (clearBtn) clearBtn.disabled = !tableInfo;

      const guests = parseInt($('#booking-guests', this.container)?.value, 10) || 1;
      if (tableInfo && tableInfo.capacity && guests > tableInfo.capacity) {
        window.SanapiroToast?.push('Стол не подходит', `Стол ${tableInfo.label} рассчитан максимум на ${tableInfo.capacity} гостей.`);
        this.floorPlan?.clearSelection();
      }
    }

    setupEventListeners() {
      const dateInput = $('#booking-date', this.container);
      const phoneInput = $('#booking-phone', this.container);
      const form = $('.form', this.container);
      const guestsInput = $('#booking-guests', this.container);
      const guestsDecrease = $('#guests-decrease', this.container);
      const guestsIncrease = $('#guests-increase', this.container);
      const clearTableBtn = $('#booking-table-clear', this.container);

      const clampGuests = (val) => Math.max(1, Math.min(20, val));
      const updateGuests = (next) => {
        if (!guestsInput) return;
        guestsInput.value = String(clampGuests(next));
        if (this.selectedTable?.capacity && clampGuests(next) > this.selectedTable.capacity) {
          window.SanapiroToast?.push('Стол не подходит', `Стол ${this.selectedTable.label} рассчитан максимум на ${this.selectedTable.capacity} гостей.`);
          this.floorPlan?.clearSelection();
        }
        // Мгновенно обновляем блокировки по вместимости/текущему слоту,
        // затем подтягиваем свежие данные с API.
        this.updateBusyFromCache();
        this.loadSlotsForDate(this.selectedDateStr);
      };

      guestsDecrease?.addEventListener('click', () => updateGuests((parseInt(guestsInput?.value, 10) || 1) - 1));
      guestsIncrease?.addEventListener('click', () => updateGuests((parseInt(guestsInput?.value, 10) || 1) + 1));
      guestsInput?.addEventListener('change', () => updateGuests(parseInt(guestsInput.value, 10) || 1));

      dateInput?.addEventListener('change', (e) => {
        this.selectedDateStr = e.target.value;
        this.selectedDate = new Date(`${this.selectedDateStr}T00:00:00`);
        this.selectedTime = null;
        this.selectedTimestamp = null;
        this.floorPlan?.clearSelection();
        this.floorPlan?.setBusyTables([]);
        this.renderTimeSlots([]);
        this.loadSlotsForDate(this.selectedDateStr);
      });

      phoneInput?.addEventListener('input', (e) => {
        const digits = normalizePhone(e.target.value);
        if (digits.length >= 11) e.target.value = formatRuPhone(digits);
      });

      clearTableBtn?.addEventListener('click', () => this.floorPlan?.clearSelection());

      form?.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSubmit();
      });
    }

    // ── Data loading ────────────────────────────────────────────────────

    async ensureToken() {
      if (!this.remarkedToken) {
        this.remarkedToken = await getToken();
      }
      return this.remarkedToken;
    }

    async loadSlotsForDate(dateStr) {
      const container = $('#booking-time-slots', this.container);
      if (!container) return;

      const requestSeq = ++this.loadSeq;
      this.isLoading = true;
      container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted);">Загрузка…</div>';

      try {
        const token = await this.ensureToken();
        const guests = parseInt($('#booking-guests', this.container)?.value, 10) || 1;
        const safeDate = dateStr || this.selectedDateStr || formatDate(new Date());
        this.selectedDateStr = safeDate;
        const data = await getTimesWithTables(token, safeDate, guests);

        // Если уже ушёл более новый запрос — этот ответ игнорируем.
        if (requestSeq !== this.loadSeq) return;

        this.remarkedData = data;
        this.buildSlotAvailability(data);
        this.renderTimeSlots(this.timeSlots);
        this.updateBusyFromCache();
      } catch (e) {
        if (requestSeq !== this.loadSeq) return;
        console.error('Ошибка загрузки данных ReMarked:', e);
        this.remarkedToken = null;
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted);">Не удалось загрузить данные. Попробуйте обновить страницу.</div>';
      } finally {
        if (requestSeq === this.loadSeq) {
          this.isLoading = false;
        }
      }
    }

    /**
     * Разбирает ответ GetTimesWithTables и строит карту доступности:
     * slotAvailability[timestamp] = { "room:tableNumber": is_free }
     * timeSlots = [{ time: "HH:MM", timestamp, available }]
     */
    buildSlotAvailability(data) {
      const tables = data?.tables || {};
      const allTimestamps = new Set();
      const availability = {};
      const slotTimeByTs = {};
      const capacityByKey = {};

      for (const tid in tables) {
        const t = tables[tid];
        if (!t.time_slots) continue;
        const roomId = t.room_id;
        const floor = ROOM_TO_FLOOR[roomId];
        if (floor == null) continue;
        capacityByKey[`${floor}:${t.number}`] = {
          min: Number(t.min_capacity || 0),
          max: Number(t.max_capacity || 999),
        };

        for (const slot of t.time_slots) {
          const ts = slot.timestamp;
          allTimestamps.add(ts);
          if (!availability[ts]) availability[ts] = {};
          availability[ts][`${floor}:${t.number}`] = slot.is_free;
          if (!slotTimeByTs[ts] && slot.time) slotTimeByTs[ts] = String(slot.time);
        }
      }

      this.slotAvailability = availability;
      this.tableCapacityByKey = capacityByKey;

      const sorted = Array.from(allTimestamps).sort((a, b) => a - b);
      
      const selectedDateKey = this.selectedDateStr || formatDate(new Date());
      const todayLocalKey = formatDate(new Date());
      const selectedDay = new Date(`${selectedDateKey}T00:00:00`).getDay(); // 0=Sun ... 6=Sat
      const allow2230 = selectedDay === 5 || selectedDay === 6; // Friday/Saturday

      // Фильтруем слоты: только те, что попадают в выбранный день (в МСК)
      let filteredTimestamps = sorted.filter((ts) => tsToDateKey(ts) === selectedDateKey);
      
      // Фильтруем по времени работы:
      // обычно 12:00–22:00, а в пятницу и субботу дополнительно доступно 22:30.
      filteredTimestamps = filteredTimestamps.filter((ts) => {
        const fromApi = slotTimeByTs[ts] || tsToTime(ts);
        const [hStr, mStr] = fromApi.split(':');
        const hours = Number(hStr);
        const minutes = Number(mStr);
        
        // Только с 12:00 до 22:00
        if (hours < 12) return false;
        if (hours > 22) return false;
        if (hours === 22 && minutes > 0) {
          if (!(allow2230 && minutes === 30)) return false;
        }
        
        // Только интервалы по 30 минут (00 и 30)
        if (minutes !== 0 && minutes !== 30) return false;
        
        return true;
      });
      
      // Если выбрана сегодняшняя дата, можно бронировать минимум за 1 час.
      // Считаем по локальному "HH:mm" (как видит пользователь), чтобы убрать сдвиги.
      const isTodayLocal = selectedDateKey === todayLocalKey;
      if (isTodayLocal) {
        const now = new Date();
        const cutoffMinutes = now.getHours() * 60 + now.getMinutes() + 60;
        filteredTimestamps = filteredTimestamps.filter((ts) => {
          const fromApi = slotTimeByTs[ts] || tsToTime(ts);
          const [hStr, mStr] = fromApi.split(':');
          const minutes = Number(hStr) * 60 + Number(mStr);
          return minutes >= cutoffMinutes;
        });
      }

      const guests = parseInt($('#booking-guests', this.container)?.value, 10) || 1;
      const durationSteps = RESERVE_DURATION_HOURS * 4;

      this.timeSlots = filteredTimestamps.map((ts) => {
        const slotTables = availability[ts] || {};
        let anyFree = false;

        for (const key in slotTables) {
          // базовая доступность на текущий слот
          if (!slotTables[key]) continue;

          // фильтр по вместимости
          const cap = this.tableCapacityByKey[key];
          if (cap && (guests < cap.min || guests > cap.max)) continue;

          // проверяем доступность на всём окне длительности
          let freeForDuration = true;
          for (let i = 1; i <= durationSteps; i++) {
            const nextTs = ts + i * 900;
            const futureData = availability[nextTs];
            if (!futureData) continue;
            if (futureData[key] === false) {
              freeForDuration = false;
              break;
            }
          }

          if (freeForDuration) {
            anyFree = true;
            break;
          }
        }

        return { time: slotTimeByTs[ts] || tsToTime(ts), timestamp: ts, available: anyFree };
      });

      // Если выбранный ранее слот пропал после фильтрации — сбрасываем выбор времени
      if (this.selectedTimestamp && !this.timeSlots.some((s) => s.timestamp === this.selectedTimestamp)) {
        this.selectedTimestamp = null;
        this.selectedTime = null;
      }
    }

    /**
     * Обновляет занятость столиков на текущем этаже по выбранному времени.
     */
    updateBusyFromCache() {
      if (!this.floorPlan) return;

      const guests = parseInt($('#booking-guests', this.container)?.value, 10) || 1;
      const busySet = new Set();

      // 1) Блокировка по вместимости (как в оригинальном виджете ReMarked)
      for (const key in this.tableCapacityByKey) {
        const cap = this.tableCapacityByKey[key];
        if (!cap) continue;
        if (guests < cap.min || guests > cap.max) {
          busySet.add(key);
        }
      }

      if (!this.selectedTime || !this.selectedTimestamp) {
        this.floorPlan.busyTables = busySet;
        this.floorPlan.render();
        this.floorPlan.setupEventListeners();
        return;
      }

      const slot =
        this.timeSlots.find((s) => s.timestamp === this.selectedTimestamp) ||
        this.timeSlots.find((s) => s.time === this.selectedTime);
      if (!slot) {
        this.floorPlan.busyTables = busySet;
        this.floorPlan.render();
        this.floorPlan.setupEventListeners();
        return;
      }

      const ts = slot.timestamp;
      const slotData = this.slotAvailability[ts] || {};

      // 2) Блокировка по занятости на выбранный слот
      for (const key in slotData) {
        if (!slotData[key]) {
          busySet.add(key);
        }
      }

      // 3) Блокировка по длительности (как в оригинальном виджете):
      // если стол занят в любой 15-минутке в ближайшие 3 часа — тоже блокируем.
      const durationSteps = RESERVE_DURATION_HOURS * 4; // 4 * 15мин в час
      for (let i = 1; i <= durationSteps; i++) {
        const nextTs = ts + i * 900;
        const futureData = this.slotAvailability[nextTs];
        if (!futureData) continue;
        for (const key in futureData) {
          if (!futureData[key]) busySet.add(key);
        }
      }

      this.floorPlan.busyTables = busySet;
      this.floorPlan.render();
      this.floorPlan.setupEventListeners();

      const selected = this.floorPlan.getSelectedTable?.();
      if (selected && busySet.has(selected.key)) {
        this.floorPlan.clearSelection();
        window.SanapiroToast?.push('Стол недоступен', 'На выбранное время этот стол уже занят.');
      }
    }

    // ── Render time slots ───────────────────────────────────────────────

    renderTimeSlots(slots) {
      const container = $('#booking-time-slots', this.container);
      if (!container) return;

      const available = Array.isArray(slots) ? slots.filter((s) => s.available) : [];

      if (available.length === 0) {
        container.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--muted); font-size: 14px;">К сожалению, свободных столов не осталось</div>';
        return;
      }

      container.innerHTML = `
        <div class="time-slots__grid">
          ${available.map((slot) => `
            <button
              type="button"
              class="time-slot ${this.selectedTimestamp === slot.timestamp ? 'is-selected' : ''}"
              data-time="${slot.time}"
              data-ts="${slot.timestamp}"
            >${slot.time}</button>
          `).join('')}
        </div>
      `;

      $$('.time-slot', container).forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const time = e.currentTarget.getAttribute('data-time');
          const ts = Number(e.currentTarget.getAttribute('data-ts'));
          if (!time) return;

          if (this.selectedTimestamp === ts) {
            this.selectedTime = null;
            this.selectedTimestamp = null;
            e.currentTarget.classList.remove('is-selected');
          } else {
            $$('.time-slot', container).forEach((b) => b.classList.remove('is-selected'));
            this.selectedTime = time;
            this.selectedTimestamp = ts;
            e.currentTarget.classList.add('is-selected');
          }

          this.updateBusyFromCache();
        });
      });
    }

    // ── Submit ──────────────────────────────────────────────────────────

    async handleSubmit() {
      const form = $('.form', this.container);
      const submitBtn = $('#booking-submit', this.container);
      const submitText = $('#booking-submit-text', this.container);
      const submitLoading = $('#booking-submit-loading', this.container);

      if (this.isLoading) return;

      const date = $('#booking-date', this.container)?.value;
      const time = this.selectedTime;
      const guests = $('#booking-guests', this.container)?.value;
      const name = $('#booking-name', this.container)?.value?.trim();
      const phone = $('#booking-phone', this.container)?.value?.trim();
      const occasion = $('#booking-occasion', this.container)?.value?.trim();
      const comment = $('#booking-comment', this.container)?.value?.trim();
      const consent = $('#booking-consent', this.container)?.checked;

      if (!date || !time || !guests || !name || !phone || !consent) {
        window.SanapiroToast?.push('Заполните все поля', 'Пожалуйста, заполните все обязательные поля.');
        return;
      }

      const phoneDigits = normalizePhone(phone);
      if (phoneDigits.length < 11) {
        window.SanapiroToast?.push('Неверный телефон', 'Укажите корректный номер телефона.');
        return;
      }

      const slot =
        this.timeSlots.find((s) => s.timestamp === this.selectedTimestamp) ||
        this.timeSlots.find((s) => s.time === time);
      const tableIds = [];
      if (this.selectedTable) {
        const remarkedTableId = this.findRemarkedTableId(this.selectedTable);
        if (remarkedTableId) tableIds.push(remarkedTableId);
      }

      const reservationData = {
        point: POINT_ID,
        date,
        time,
        guests: parseInt(guests, 10),
        name,
        phone: phoneDigits,
        occasion: occasion || undefined,
        comment: comment || undefined,
        table_id: this.selectedTable?.id || undefined,
        table_label: this.selectedTable?.label || undefined,
        floor: this.selectedTable?.floor || undefined,
      };

      this.isLoading = true;
      submitBtn.disabled = true;
      submitText.style.display = 'none';
      submitLoading.style.display = 'inline';

      try {
        const token = await this.ensureToken();
        const sendData = {
          method: 'CreateReserve',
          token,
          reserve: {
            date,
            time: slot?.timestamp || 0,
            guests_count: parseInt(guests, 10),
            name,
            phone: phoneDigits,
            comment: [occasion, comment].filter(Boolean).join('. ') || '',
          },
        };
        if (tableIds.length > 0) sendData.reserve.table_ids = tableIds;

        const result = await remarkedPost(sendData);

        if (result.status === 'error') {
          throw new Error(result.message || 'Ошибка при бронировании');
        }

        this.showSuccess(result, reservationData);
        form.reset();

        this.selectedDate = new Date();
        this.selectedDateStr = formatDate(this.selectedDate);
        this.selectedTime = null;
        this.selectedTimestamp = null;
        this.selectedTable = null;

        $('#booking-date', this.container).value = formatDate(new Date());
        $('#booking-guests', this.container).value = '1';
        $('#booking-table', this.container).value = '';
        $('#booking-table-clear', this.container).disabled = true;

        this.floorPlan?.clearSelection();
        this.floorPlan?.setBusyTables([]);
        this.loadSlotsForDate(this.selectedDateStr);
      } catch (error) {
        window.SanapiroToast?.push(
          'Ошибка бронирования',
          error.message || 'Не удалось забронировать. Попробуйте позже.'
        );
      } finally {
        this.isLoading = false;
        submitBtn.disabled = false;
        submitText.style.display = 'inline';
        submitLoading.style.display = 'none';
      }
    }

    findRemarkedTableId(selectedTable) {
      if (!this.remarkedData?.tables) return null;
      const floor = selectedTable.floor;
      const roomId = FLOOR_TO_ROOM[floor];
      if (!roomId) return null;

      for (const tid in this.remarkedData.tables) {
        const t = this.remarkedData.tables[tid];
        if (t.room_id === roomId && String(t.number) === String(selectedTable.id)) {
          return t.id;
        }
      }
      return null;
    }

    showSuccess(result, data) {
      const modal = $('[data-modal]');
      const modalTitle = $('[data-modal-title]');
      const modalBody = $('[data-modal-body]');

      const tableRow = data.table_label
        ? `<tr><td style="padding:6px 8px; opacity:.7">Стол</td><td style="padding:6px 8px"><b>${escapeHtml(data.table_label)}</b>${data.floor ? ` <span style="opacity:.7">(этаж ${data.floor})</span>` : ''}</td></tr>`
        : '';

      if (!modal || !modalTitle || !modalBody) {
        window.SanapiroToast?.push('Заявка отправлена', 'Мы свяжемся с вами для подтверждения.');
        return;
      }

      modalTitle.textContent = 'Заявка отправлена ✓';
      modalBody.innerHTML = `
        <table style="width:100%; border-collapse:collapse; text-align:left;">
          ${tableRow}
          <tr><td style="padding:6px 8px; opacity:.7">Дата</td><td style="padding:6px 8px">${escapeHtml(data.date)}</td></tr>
          <tr><td style="padding:6px 8px; opacity:.7">Время</td><td style="padding:6px 8px">${escapeHtml(data.time)}</td></tr>
          <tr><td style="padding:6px 8px; opacity:.7">Гостей</td><td style="padding:6px 8px">${escapeHtml(data.guests)}</td></tr>
          ${data.occasion ? `<tr><td style="padding:6px 8px; opacity:.7">Повод</td><td style="padding:6px 8px">${escapeHtml(data.occasion)}</td></tr>` : ''}
          <tr><td style="padding:6px 8px; opacity:.7">Имя</td><td style="padding:6px 8px">${escapeHtml(data.name)}</td></tr>
          <tr><td style="padding:6px 8px; opacity:.7">Телефон</td><td style="padding:6px 8px">${formatRuPhone(data.phone)}</td></tr>
          ${data.comment ? `<tr><td style="padding:6px 8px; opacity:.7">Комментарий</td><td style="padding:6px 8px">${escapeHtml(data.comment)}</td></tr>` : ''}
        </table>
      `;

      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.documentElement.style.overflow = 'hidden';
    }
  }

  function initBookingWidget() {
    const el = $('[data-booking-widget]');
    if (!el) return;
    new BookingWidget(el);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBookingWidget);
  } else {
    initBookingWidget();
  }
})();
