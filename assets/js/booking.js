/* Бронирование — интерактивный план зала + форма.
   Это демонстрационный frontend. Для реальной работы подключите backend / API.
*/

(function(){
  const cfg = {
    // Если заполнить — форма будет отправлять JSON на указанный адрес
    bookingEndpoint: "", // пример: "https://your-domain.tld/api/booking"
    busyRate: 0.22,       // доля занятых столов в демо-режиме
  };

  const tablesDataEl = document.getElementById('bookingTables');
  const tables = tablesDataEl ? JSON.parse(tablesDataEl.textContent) : [];

  const svg = document.querySelector('[data-plan-svg]');
  const infoPill = document.querySelector('[data-selected-pill]');
  const resetBtn = document.querySelector('[data-reset]');
  const form = document.querySelector('[data-booking-form]');
  const modal = document.querySelector('[data-modal]');
  const modalBody = document.querySelector('[data-modal-body]');
  const modalClose = document.querySelectorAll('[data-modal-close]');
  const dateInput = document.querySelector('[name="date"]');
  const timeSelect = document.querySelector('[name="time"]');
  const guestsInput = document.querySelector('[name="guests"]');
  const phoneInput = document.querySelector('[name="phone"]');

  let selectedId = null;

  // Populate time options (12:00 - 23:00, шаг 30 мин)
  if(timeSelect){
    const times = [];
    for(let h=12; h<=23; h++){
      times.push(`${String(h).padStart(2,'0')}:00`);
      if(h !== 23) times.push(`${String(h).padStart(2,'0')}:30`);
    }
    timeSelect.innerHTML = times.map(t => `<option value="${t}">${t}</option>`).join('');
  }

  // Set date min + default
  if(dateInput){
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth()+1).padStart(2,'0');
    const dd = String(today.getDate()).padStart(2,'0');
    const iso = `${yyyy}-${mm}-${dd}`;
    dateInput.min = iso;
    dateInput.value = iso;
  }

  // Default time nearest (rounded to 30 min) but not earlier than 12:00
  if(timeSelect){
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    let hh = Math.max(12, Math.min(23, h));
    let mm = (m < 15) ? 0 : (m < 45 ? 30 : 0);
    if(m >= 45) hh = Math.min(23, hh+1);
    const t = `${String(hh).padStart(2,'0')}:${mm===0?'00':'30'}`;
    const opt = [...timeSelect.options].find(o => o.value === t);
    if(opt) timeSelect.value = t;
  }

  function stableHash(str){
    // FNV-1a-ish
    let h = 2166136261;
    for(let i=0;i<str.length;i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    // to [0..1)
    return (h >>> 0) / 4294967296;
  }

  function isBusy(tableId, dateStr, timeStr){
    const s = stableHash(`${tableId}|${dateStr}|${timeStr}`);
    // чуть сильнее загруженность в прайм-тайм
    const prime = (timeStr >= "19:00" && timeStr <= "21:30") ? 0.08 : 0.0;
    return s < (cfg.busyRate + prime);
  }

  function getCurrentSlot(){
    const dateStr = dateInput?.value || '';
    const timeStr = timeSelect?.value || '';
    return {dateStr, timeStr};
  }

  function updateAvailability(){
    if(!svg) return;
    const {dateStr, timeStr} = getCurrentSlot();

    svg.querySelectorAll('[data-table]').forEach(el => {
      const id = el.getAttribute('data-table');
      const busy = isBusy(id, dateStr, timeStr);
      el.classList.toggle('is-busy', busy);
      if(busy && selectedId === id){
        selectedId = null;
      }
    });

    updateSelectedUI();
  }

  function updateSelectedUI(){
    if(!infoPill) return;
    if(!selectedId){
      infoPill.innerHTML = `Выберите стол на плане <span class="small">(зелёные — свободны)</span>`;
      return;
    }
    const t = tables.find(x => x.id === selectedId);
    const cap = t ? t.capacity : '—';
    infoPill.innerHTML = `Выбран стол <b>${selectedId}</b> · мест: <b>${cap}</b>`;
  }

  function bindTables(){
    if(!svg) return;
    svg.querySelectorAll('[data-table]').forEach(el => {
      el.classList.add('table-shape');
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-table');
        const {dateStr, timeStr} = getCurrentSlot();
        if(isBusy(id, dateStr, timeStr)){
          window.SanapiroToast?.push('Стол занят', 'Выберите другое время или стол.');
          return;
        }
        selectedId = id;
        svg.querySelectorAll('[data-table]').forEach(x => x.classList.toggle('is-selected', x.getAttribute('data-table') === selectedId));
        updateSelectedUI();
      });
    });
  }

  function openModal(title, bodyHtml){
    if(!modal) return;
    modal.querySelector('[data-modal-title]').textContent = title;
    if(modalBody) modalBody.innerHTML = bodyHtml;
    modal.classList.add('is-open');
  }
  function closeModal(){
    modal?.classList.remove('is-open');
  }
  modalClose.forEach(btn => btn.addEventListener('click', closeModal));
  modal?.addEventListener('click', (e) => {
    if(e.target === modal) closeModal();
  });

  if(resetBtn){
    resetBtn.addEventListener('click', () => {
      selectedId = null;
      svg?.querySelectorAll('[data-table]').forEach(x => x.classList.remove('is-selected'));
      updateSelectedUI();
    });
  }

  function normalizePhone(raw){
    const digits = String(raw || '').replace(/\D/g,'').slice(0, 11);
    // Поддержка 7/8 + 10 цифр
    let d = digits;
    if(d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1);
    if(d.length === 10) d = '7' + d;
    return d;
  }
  function formatRuPhone(digits11){
    const d = normalizePhone(digits11);
    if(d.length < 11) return String(digits11 || '');
    const a = d.slice(1,4);
    const b = d.slice(4,7);
    const c = d.slice(7,9);
    const e = d.slice(9,11);
    return `+7 (${a}) ${b}-${c}-${e}`;
  }
  if(phoneInput){
    phoneInput.addEventListener('input', () => {
      const cur = phoneInput.value;
      const d = normalizePhone(cur);
      phoneInput.value = formatRuPhone(d);
    });
  }

  async function submitBooking(data){
    if(cfg.bookingEndpoint){
      const res = await fetch(cfg.bookingEndpoint, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(data)
      });
      if(!res.ok){
        throw new Error('Ошибка отправки на сервер');
      }
      return await res.json().catch(() => ({ok:true}));
    }else{
      const key = 'sanapiro_bookings';
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      arr.unshift({ id: `B-${Date.now()}`, ...data });
      localStorage.setItem(key, JSON.stringify(arr.slice(0, 50)));
      return { ok: true, mode: 'local' };
    }
  }

  if(form){
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);

      const {dateStr, timeStr} = getCurrentSlot();
      const name = String(fd.get('name') || '').trim();
      const phone = formatRuPhone(fd.get('phone'));
      const guests = Number(fd.get('guests') || 0);
      const occasion = String(fd.get('occasion') || '').trim();
      const comment = String(fd.get('comment') || '').trim();
      const consent = fd.get('consent') === 'on';

      // Validation
      if(!selectedId){
        window.SanapiroToast?.push('Не выбран стол', 'Нажмите на стол на плане, чтобы выбрать его.');
        return;
      }
      if(!dateStr || !timeStr){
        window.SanapiroToast?.push('Дата/время', 'Укажите дату и время.');
        return;
      }
      if(!name){
        window.SanapiroToast?.push('Имя', 'Введите имя для брони.');
        return;
      }
      if(normalizePhone(phone).length < 11){
        window.SanapiroToast?.push('Телефон', 'Введите корректный номер телефона.');
        return;
      }
      if(!guests || guests < 1 || guests > 20){
        window.SanapiroToast?.push('Гости', 'Укажите количество гостей (1–20).');
        return;
      }
      if(!consent){
        window.SanapiroToast?.push('Согласие', 'Нужно согласие на обработку данных.');
        return;
      }

      // Busy-check just in case
      if(isBusy(selectedId, dateStr, timeStr)){
        window.SanapiroToast?.push('Стол только что заняли', 'Попробуйте другой стол или другое время.');
        updateAvailability();
        return;
      }

      const payload = {
        table: selectedId,
        date: dateStr,
        time: timeStr,
        guests,
        occasion,
        name,
        phone: normalizePhone(phone),
        comment,
        createdAt: new Date().toISOString()
      };

      try{
        const r = await submitBooking(payload);
        openModal('Заявка на бронь отправлена', `
          <div class="notice">
            <p style="margin:0 0 8px">
              Мы получили заявку. В демо-режиме бронь сохраняется локально в браузере (localStorage) — это удобно для прототипа.
            </p>
            <p style="margin:0">
              <b>Стол:</b> ${escapeHtml(payload.table)} · <b>Дата:</b> ${escapeHtml(payload.date)} · <b>Время:</b> ${escapeHtml(payload.time)}<br/>
              <b>Гостей:</b> ${payload.guests} · <b>Повод:</b> ${escapeHtml(payload.occasion || '—')}
            </p>
          </div>
          <hr class="hr"/>
          <div class="small">Данные (JSON), которые можно отправлять на API:</div>
          <pre style="white-space:pre-wrap; margin:10px 0 0; background: rgba(0,0,0,.20); padding: 12px; border-radius: 14px; border: 1px solid rgba(255,255,255,.10);">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
        `);
        form.reset();
        // restore date/time defaults
        if(dateInput){
          const today = new Date();
          const yyyy = today.getFullYear();
          const mm = String(today.getMonth()+1).padStart(2,'0');
          const dd = String(today.getDate()).padStart(2,'0');
          dateInput.value = `${yyyy}-${mm}-${dd}`;
        }
        if(guestsInput) guestsInput.value = 2;
        selectedId = null;
        svg?.querySelectorAll('[data-table]').forEach(x => x.classList.remove('is-selected'));
        updateAvailability();
      }catch(err){
        console.error(err);
        window.SanapiroToast?.push('Ошибка', 'Не удалось отправить заявку. Проверьте подключение и endpoint.');
      }
    });
  }

  function escapeHtml(str){
    return String(str)
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;');
  }

  // Init
  bindTables();
  updateAvailability();
  dateInput?.addEventListener('change', updateAvailability);
  timeSelect?.addEventListener('change', updateAvailability);
})();
