/* booking.js — Интерактивный план зала + форма бронирования */
(function () {
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    /* ─── Данные о столах из JSON-блока в HTML ─── */
    const raw = $('#bookingTables');
    if (!raw) return;                       // если нет JSON — значит не та страница
    const tables = JSON.parse(raw.textContent);

    /* Псевдослучайная «занятость» (демо) — 30 % столов заняты */
    const busySet = new Set();
    tables.forEach(t => { if (Math.random() < 0.30) busySet.add(t.id); });

    /* ─── Раскраска столов ─── */
    const FREE = { fill: 'rgba(84,214,111,.20)', stroke: 'rgba(84,214,111,.70)' };
    const BUSY = { fill: 'rgba(255,78,78,.18)', stroke: 'rgba(255,78,78,.60)' };
    const SEL = { fill: 'rgba(255,196,46,.28)', stroke: 'rgba(255,196,46,.80)' };

    function paint(g, colors) {
        const shapes = $$(`:scope > rect, :scope > circle`, g);
        shapes.forEach(s => {
            s.setAttribute('fill', colors.fill);
            s.setAttribute('stroke', colors.stroke);
        });
    }

    /* ─── Инициализация SVG-столов ─── */
    let selected = null;                     // id выбранного стола (строка, напр. "T3")

    const svgGroups = {};                    // { T1: <g>, T2: <g>, … }
    $$('[data-table]').forEach(g => {
        const id = g.getAttribute('data-table');
        svgGroups[id] = g;
        g.style.cursor = busySet.has(id) ? 'not-allowed' : 'pointer';
        g.style.transition = 'opacity .2s';
        paint(g, busySet.has(id) ? BUSY : FREE);

        /* Клик по столику */
        g.addEventListener('click', () => {
            if (busySet.has(id)) {
                window.SanapiroToast?.push('Стол занят', `Стол ${id.replace('T', '')} сейчас недоступен.`);
                return;
            }
            select(id);
        });

        /* Hover-эффект */
        g.addEventListener('mouseenter', () => {
            if (!busySet.has(id) && selected !== id) g.style.opacity = '0.75';
        });
        g.addEventListener('mouseleave', () => {
            g.style.opacity = '1';
        });
    });

    /* ─── Пилюля (надпись) выбранного стола ─── */
    const pill = $('[data-selected-pill]');

    function select(id) {
        // Снимаем предыдущий
        if (selected && svgGroups[selected]) paint(svgGroups[selected], FREE);

        if (selected === id) {               // повторный клик — сброс
            selected = null;
            updatePill();
            return;
        }

        selected = id;
        paint(svgGroups[id], SEL);
        updatePill();
    }

    function updatePill() {
        if (!pill) return;
        if (!selected) {
            pill.innerHTML = 'Выберите стол на плане <span class="small">(зелёные — свободны)</span>';
            return;
        }
        const info = tables.find(t => t.id === selected);
        const num = selected.replace('T', '');
        const zone = info?.zone ? ` (${info.zone})` : '';
        const cap = info?.capacity ?? '?';
        pill.innerHTML = `Стол <b>${num}</b>${zone} · до ${cap} гостей`;
    }

    /* ─── Кнопка «Сброс» ─── */
    const resetBtn = $('[data-reset]');
    resetBtn?.addEventListener('click', () => {
        if (selected && svgGroups[selected]) paint(svgGroups[selected], FREE);
        selected = null;
        updatePill();
    });

    /* ─── Генерация слотов времени (12:00 – 22:00, шаг 30 мин) ─── */
    const timeSel = $('#time');
    if (timeSel && timeSel.children.length === 0) {
        for (let h = 12; h <= 22; h++) {
            for (let m = 0; m < 60; m += 30) {
                if (h === 22 && m > 0) break;
                const val = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                const opt = document.createElement('option');
                opt.value = val;
                opt.textContent = val;
                timeSel.appendChild(opt);
            }
        }
    }

    /* ─── Дата по умолчанию — сегодня ─── */
    const dateInput = $('#date');
    if (dateInput && !dateInput.value) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
        dateInput.min = `${yyyy}-${mm}-${dd}`;
    }

    /* ─── Отправка формы (демо) ─── */
    const form = $('[data-booking-form]');
    const modal = $('[data-modal]');
    const modalTitle = $('[data-modal-title]');
    const modalBody = $('[data-modal-body]');
    const modalCloseAll = $$('[data-modal-close]');

    function openModal(title, bodyHtml) {
        if (!modal) return;
        if (modalTitle) modalTitle.textContent = title;
        if (modalBody) modalBody.innerHTML = bodyHtml;
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.documentElement.style.overflow = 'hidden';
    }

    function closeModal() {
        if (!modal) return;
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.documentElement.style.overflow = '';
    }

    modalCloseAll.forEach(btn => btn.addEventListener('click', closeModal));
    modal?.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && modal?.classList.contains('is-open')) closeModal();
    });

    form?.addEventListener('submit', e => {
        e.preventDefault();

        if (!selected) {
            window.SanapiroToast?.push('Выберите стол', 'Пожалуйста, кликните на свободный стол на плане зала.');
            return;
        }

        const fd = new FormData(form);
        const info = tables.find(t => t.id === selected);
        const tableNum = selected.replace('T', '');

        const bodyHtml = `
      <table style="width:100%; border-collapse:collapse; text-align:left;">
        <tr><td style="padding:6px 8px; opacity:.7">Стол</td>  <td style="padding:6px 8px"><b>${tableNum}</b>${info?.zone ? ' (' + info.zone + ')' : ''}</td></tr>
        <tr><td style="padding:6px 8px; opacity:.7">Дата</td>  <td style="padding:6px 8px">${fd.get('date')}</td></tr>
        <tr><td style="padding:6px 8px; opacity:.7">Время</td> <td style="padding:6px 8px">${fd.get('time')}</td></tr>
        <tr><td style="padding:6px 8px; opacity:.7">Гостей</td><td style="padding:6px 8px">${fd.get('guests')}</td></tr>
        <tr><td style="padding:6px 8px; opacity:.7">Повод</td> <td style="padding:6px 8px">${fd.get('occasion') || '—'}</td></tr>
        <tr><td style="padding:6px 8px; opacity:.7">Имя</td>   <td style="padding:6px 8px">${fd.get('name')}</td></tr>
        <tr><td style="padding:6px 8px; opacity:.7">Телефон</td><td style="padding:6px 8px">${fd.get('phone')}</td></tr>
        ${fd.get('comment') ? `<tr><td style="padding:6px 8px; opacity:.7">Комментарий</td><td style="padding:6px 8px">${fd.get('comment')}</td></tr>` : ''}
      </table>
    `;

        openModal('Заявка отправлена ✓', bodyHtml);

        /* Помечаем стол как занятый */
        busySet.add(selected);
        paint(svgGroups[selected], BUSY);
        svgGroups[selected].style.cursor = 'not-allowed';
        selected = null;
        updatePill();
        form.reset();

        /* Возвращаем дату */
        if (dateInput) {
            const today = new Date();
            dateInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        }
    });

})();
