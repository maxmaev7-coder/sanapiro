/* Доставка — меню (данные в JSON в HTML) + корзина + оформление.
   Frontend-only. Для реальной работы нужен backend / платежи / интеграции.

   Обновление под задачу:
   - две кухни (Грузия / Европа)
   - меню ресторана вынесено в PDF на главной
   - все товары для заказа находятся здесь, в доставке
*/

(function () {
  const cfg = {
    orderEndpoint: "",           // пример: "https://your-domain.tld/api/order"
    minOrder: 1500,              // минимальная сумма для доставки
    freeDeliveryFrom: 2500,      // бесплатная доставка от
    deliveryFee: 250             // стоимость доставки, если не бесплатно
  };

  const menuEl = document.getElementById('menuData');
  const menuData = menuEl ? JSON.parse(menuEl.textContent) : { cuisines: [] };

  const cuisineTabsEl = document.querySelector('[data-cuisine-tabs]');
  const tabsEl = document.querySelector('[data-tabs]');
  const menuListEl = document.querySelector('[data-menu]');
  const cartItemsEl = document.querySelector('[data-cart-items]');
  const cartCountEl = document.querySelector('[data-cart-count]');
  const totalsEl = document.querySelector('[data-totals]');
  const checkoutForm = document.querySelector('[data-checkout-form]');

  const modal = document.querySelector('[data-modal]');
  const modalBody = document.querySelector('[data-modal-body]');
  const modalClose = document.querySelectorAll('[data-modal-close]');

  let activeCuisineId = menuData.cuisines?.[0]?.id || null;
  let activeCategoryId = (menuData.cuisines?.[0]?.categories?.[0]?.id) || null;
  let cart = loadCart();

  function money(n) {
    return new Intl.NumberFormat('ru-RU').format(Math.round(n));
  }

  function escapeHtml(str) {
    return String(str || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function loadCart() {
    try {
      return JSON.parse(localStorage.getItem('sanapiro_cart') || '{}');
    } catch (e) {
      return {};
    }
  }
  function saveCart() {
    localStorage.setItem('sanapiro_cart', JSON.stringify(cart));
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
    const a = d.slice(1, 4);
    const b = d.slice(4, 7);
    const c = d.slice(7, 9);
    const e = d.slice(9, 11);
    return `+7 (${a}) ${b}-${c}-${e}`;
  }

  function getActiveCuisine() {
    return (menuData.cuisines || []).find(c => c.id === activeCuisineId) || menuData.cuisines?.[0] || null;
  }

  function getActiveCategory() {
    const cuisine = getActiveCuisine();
    if (!cuisine) return null;
    return (cuisine.categories || []).find(cat => cat.id === activeCategoryId) || cuisine.categories?.[0] || null;
  }

  function getItemById(itemId) {
    for (const cuisine of (menuData.cuisines || [])) {
      for (const c of (cuisine.categories || [])) {
        const item = (c.items || []).find(i => i.id === itemId);
        if (item) return { cuisine, category: c, item };
      }
    }
    return null;
  }

  function cartLines() {
    const lines = [];
    for (const [id, qty] of Object.entries(cart)) {
      if (qty <= 0) continue;
      const found = getItemById(id);
      if (!found) continue;
      lines.push({
        id,
        qty,
        name: found.item.name,
        price: found.item.price,
        weight: found.item.weight || '',
        cuisine: found.cuisine?.title || '',
        category: found.category?.title || '',
        sum: found.item.price * qty
      });
    }
    return lines;
  }

  function calcTotals(currentMethod) {
    const lines = cartLines();
    const itemsSum = lines.reduce((a, x) => a + x.sum, 0);

    const method = currentMethod || document.querySelector('input[name="method"]:checked')?.value || 'delivery';
    let delivery = 0;

    if (method === 'delivery') {
      delivery = (itemsSum === 0) ? 0 : (itemsSum >= cfg.freeDeliveryFrom ? 0 : cfg.deliveryFee);
    }

    const total = itemsSum + delivery;
    return { lines, itemsSum, delivery, total, method };
  }

  function renderCuisineTabs() {
    if (!cuisineTabsEl) return;

    const cuisines = menuData.cuisines || [];
    if (!cuisines.length) {
      cuisineTabsEl.innerHTML = '';
      return;
    }

    cuisineTabsEl.innerHTML = cuisines.map(c => {
      const cls = c.id === activeCuisineId ? 'tab is-active' : 'tab';
      return `<button class="${cls}" data-cuisine="${escapeHtml(c.id)}" type="button">${escapeHtml(c.title)}</button>`;
    }).join('');

    cuisineTabsEl.querySelectorAll('[data-cuisine]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-cuisine');
        if (!id || id === activeCuisineId) return;
        activeCuisineId = id;

        // при смене кухни — первая категория
        const cuisine = getActiveCuisine();
        activeCategoryId = cuisine?.categories?.[0]?.id || null;

        renderCuisineTabs();
        renderCategoryTabs();
        renderMenu();
      });
    });
  }

  function renderCategoryTabs() {
    if (!tabsEl) return;
    const cuisine = getActiveCuisine();
    const categories = cuisine?.categories || [];

    if (!categories.length) {
      tabsEl.innerHTML = `<div class="notice">Категории не найдены.</div>`;
      return;
    }

    tabsEl.innerHTML = categories.map(c => {
      const cls = c.id === activeCategoryId ? 'tab is-active' : 'tab';
      return `<button class="${cls}" data-tab="${escapeHtml(c.id)}" type="button">${escapeHtml(c.title)}</button>`;
    }).join('');

    tabsEl.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCategoryId = btn.getAttribute('data-tab');
        renderCategoryTabs();
        renderMenu();
      });
    });
  }

  function renderMenu() {
    if (!menuListEl) return;

    const cat = getActiveCategory();
    if (!cat) {
      menuListEl.innerHTML = `<div class="notice">Меню не загружено.</div>`;
      return;
    }

    menuListEl.innerHTML = (cat.items || []).map(i => {
      return `
        <article class="item">
          <div class="item__top">
            <div class="thumb" aria-hidden="true"></div>
            <div style="min-width:0">
              <h3 class="item__name">${escapeHtml(i.name)}</h3>
              ${i.description ? `<p class="item__desc">${escapeHtml(i.description)}</p>` : `<p class="item__desc"></p>`}
              <div class="item__meta">
                ${i.weight ? `<span>${escapeHtml(i.weight)}</span>` : ''}
                ${i.tags?.length ? `<span>•</span><span>${escapeHtml(i.tags.join(' · '))}</span>` : ''}
              </div>
            </div>
          </div>
          <div style="display:flex; align-items:center; justify-content: space-between; gap: 12px;">
            <div class="price">${money(i.price)} ₽</div>
            <button class="btn btn--accent" type="button" data-add="${escapeHtml(i.id)}">
              <span class="icon" aria-hidden="true">＋</span> В корзину
            </button>
          </div>
        </article>
      `;
    }).join('');

    menuListEl.querySelectorAll('[data-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-add');
        if (!id) return;
        cart[id] = (cart[id] || 0) + 1;
        saveCart();
        renderCart();
        window.SanapiroToast?.push('Добавлено', 'Блюдо добавлено в корзину.');
      });
    });
  }

  function renderCart() {
    const method = document.querySelector('input[name="method"]:checked')?.value || 'delivery';
    const { lines, itemsSum, delivery, total } = calcTotals(method);

    const count = lines.reduce((a, x) => a + x.qty, 0);
    if (cartCountEl) cartCountEl.textContent = String(count);

    if (!cartItemsEl) return;

    if (lines.length === 0) {
      cartItemsEl.innerHTML = `<div class="notice">Корзина пустая. Выберите блюда из меню.</div>`;
    } else {
      cartItemsEl.innerHTML = lines.map(l => {
        const meta = [l.weight, l.category].filter(Boolean).join(' • ');
        return `
          <div class="cartline">
            <div>
              <p class="cartline__name">${escapeHtml(l.name)}</p>
              <p class="cartline__meta">${escapeHtml(meta)} • ${money(l.price)} ₽</p>
            </div>
            <div style="display:grid; gap: 6px; justify-items:end">
              <div class="qty">
                <button type="button" data-dec="${escapeHtml(l.id)}" aria-label="Уменьшить">−</button>
                <span>${l.qty}</span>
                <button type="button" data-inc="${escapeHtml(l.id)}" aria-label="Увеличить">+</button>
              </div>
              <div class="small">${money(l.sum)} ₽</div>
            </div>
          </div>
        `;
      }).join('');

      cartItemsEl.querySelectorAll('[data-dec]').forEach(b => b.addEventListener('click', () => {
        const id = b.getAttribute('data-dec');
        cart[id] = (cart[id] || 0) - 1;
        if (cart[id] <= 0) delete cart[id];
        saveCart();
        renderCart();
      }));
      cartItemsEl.querySelectorAll('[data-inc]').forEach(b => b.addEventListener('click', () => {
        const id = b.getAttribute('data-inc');
        cart[id] = (cart[id] || 0) + 1;
        saveCart();
        renderCart();
      }));
    }

    if (totalsEl) {
      let hint = '';
      if (method === 'delivery' && itemsSum < cfg.minOrder && itemsSum > 0) {
        hint = `<div class="small" style="color: rgba(255,92,122,.9)">Минимальная сумма доставки — ${money(cfg.minOrder)} ₽</div>`;
      } else if (method === 'delivery' && itemsSum >= cfg.freeDeliveryFrom) {
        hint = `<div class="small">Бесплатная доставка от ${money(cfg.freeDeliveryFrom)} ₽</div>`;
      }

      totalsEl.innerHTML = `
        <div class="total">
          <div>Блюда: <b>${money(itemsSum)} ₽</b></div>
          <div>Доставка: <b>${money(delivery)} ₽</b></div>
          <div style="font-size:16px">Итого: <b>${money(total)} ₽</b></div>
          ${hint}
        </div>
      `;
    }
  }

  function openModal(title, bodyHtml) {
    if (!modal) return;
    modal.querySelector('[data-modal-title]').textContent = title;
    if (modalBody) modalBody.innerHTML = bodyHtml;
    modal.classList.add('is-open');
  }
  function closeModal() {
    modal?.classList.remove('is-open');
  }
  modalClose.forEach(btn => btn.addEventListener('click', closeModal));
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Checkout
  if (checkoutForm) {
    // Показ/скрытие адреса при самовывозе
    const addressBlock = document.querySelector('[data-address-block]');
    function updateAddressVisibility() {
      const method = document.querySelector('input[name="method"]:checked')?.value || 'delivery';
      if (!addressBlock) return;
      addressBlock.style.display = method === 'delivery' ? '' : 'none';
      renderCart();
    }

    document.querySelectorAll('input[name="method"]').forEach(r => r.addEventListener('change', updateAddressVisibility));
    updateAddressVisibility();

    // Маска телефона (очень простая)
    const phoneInput = document.getElementById('cphone');
    if (phoneInput) {
      phoneInput.addEventListener('blur', () => {
        phoneInput.value = formatRuPhone(phoneInput.value);
      });
    }

    checkoutForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const method = document.querySelector('input[name="method"]:checked')?.value || 'delivery';
      const totals = calcTotals(method);

      if (method === 'delivery' && totals.itemsSum < cfg.minOrder) {
        openModal('Не хватает суммы', `<div class="notice">Минимальная сумма доставки — <b>${money(cfg.minOrder)} ₽</b>.</div>`);
        return;
      }

      const fd = new FormData(checkoutForm);
      const payload = {
        method,
        name: String(fd.get('name') || ''),
        phone: String(fd.get('phone') || ''),
        address: {
          street: String(fd.get('street') || ''),
          entrance: String(fd.get('entrance') || ''),
          floor: String(fd.get('floor') || ''),
          apt: String(fd.get('apt') || '')
        },
        pay: String(fd.get('pay') || 'card'),
        desiredTime: String(fd.get('desiredTime') || 'asap'),
        comment: String(fd.get('comment') || ''),
        order: {
          items: totals.lines.map(l => ({ id: l.id, name: l.name, qty: l.qty, price: l.price })),
          itemsSum: totals.itemsSum,
          delivery: totals.delivery,
          total: totals.total
        }
      };

      // Фронтенд-режим: показываем подтверждение
      if (!cfg.orderEndpoint) {
        openModal('Заказ принят', `
          <p class="p" style="margin:0">Мы получили заявку и свяжемся с вами для подтверждения.</p>
          <hr class="hr" style="margin: 14px 0" />
          <div class="small">Сумма: <b>${money(totals.total)} ₽</b></div>
        `);
        localStorage.removeItem('sanapiro_cart');
        cart = {};
        renderCart();
        cartModal?.classList.remove('is-open'); // Close cart modal
        return;
      }

      // Если нужен реальный эндпоинт
      try {
        const res = await fetch(cfg.orderEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error('Ошибка при отправке заказа');

        openModal('Заказ отправлен', `<p class="p" style="margin:0">Спасибо! Мы скоро свяжемся с вами.</p>`);
        localStorage.removeItem('sanapiro_cart');
        cart = {};
        renderCart();
        cartModal?.classList.remove('is-open'); // Close cart modal

      } catch (err) {
        openModal('Не удалось отправить', `<div class="notice">${escapeHtml(err?.message || 'Ошибка')}</div>`);
      }
    });
  }

  // Cart Modal Open Logic
  const cartModal = document.getElementById('cart-modal');
  const cartBtn = document.querySelector('a[href="#cart"]');
  if (cartBtn && cartModal) {
    cartBtn.addEventListener('click', (e) => {
      e.preventDefault();
      cartModal.classList.add('is-open');
    });
  }

  // Init
  renderCuisineTabs();
  renderCategoryTabs();
  renderMenu();
  renderCart();
})();
