/* Общий JS для всех страниц:
   - мобильное меню
   - подсветка активной страницы
   - тосты
   - cookie-баннер
   - слайдер на главной
   - карусели (меню/галерея)
   - lightbox (всплывающее окно для фото)
*/

(function(){
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Мобильное меню
  const burger = $('[data-burger]');
  const nav = $('[data-nav]');
  if(burger && nav){
    burger.addEventListener('click', () => nav.classList.toggle('is-open'));
  }

  // Подсветка активной страницы
  const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  $$('[data-nav] a').forEach(a => {
    const href = (a.getAttribute('href') || '').toLowerCase();
    if(href === path){
      a.classList.add('is-active');
    }
  });

  // Плавный скролл для якорей (если будут)
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if(!a) return;
    const id = a.getAttribute('href');
    const el = document.querySelector(id);
    if(el){
      e.preventDefault();
      nav?.classList.remove('is-open');
      el.scrollIntoView({behavior:'smooth', block:'start'});
    }
  });

  // Тосты
  const toastRoot = $('[data-toast]');
  function escapeHtml(str){
    return String(str)
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;');
  }
  function pushToast(title, text){
    if(!toastRoot) return;
    const item = document.createElement('div');
    item.className = 'toast__item';
    item.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p>`;
    toastRoot.appendChild(item);
    setTimeout(() => item.remove(), 4200);
  }
  window.SanapiroToast = { push: pushToast };

  // Текущий год в футере
  const year = $('[data-year]');
  if(year) year.textContent = new Date().getFullYear();

  // Cookie-баннер (ненавязчивое всплывающее окно)
  const cookie = $('[data-cookie]');
  if(cookie){
    const key = 'sanapiro_cookie_ok';
    const accepted = localStorage.getItem(key) === '1';
    if(accepted){
      cookie.classList.add('is-hidden');
    }
    const btn = $('[data-cookie-accept]', cookie);
    btn?.addEventListener('click', () => {
      localStorage.setItem(key, '1');
      cookie.classList.add('is-hidden');
    });
  }

  

// Lazy background images (ускоряет первый заход: грузим картинки по мере появления)
function loadBg(el){
  if(!el) return;
  const src = el.getAttribute('data-bg');
  if(!src) return;
  if(el.dataset.bgLoaded === '1') return;

  const img = new Image();
  img.src = src;
  img.onload = () => {
    el.style.backgroundImage = `url('${src}')`;
    el.dataset.bgLoaded = '1';
  };
  img.onerror = () => {
    // даже если ошибка — попробуем применить как есть
    el.style.backgroundImage = `url('${src}')`;
    el.dataset.bgLoaded = '1';
  };
}

function initLazyBackgrounds(){
  const items = $$('[data-bg]').filter(el => el.getAttribute('data-bg-mode') !== 'hero');
  if(!items.length) return;

  if(!('IntersectionObserver' in window)){
    items.forEach(loadBg);
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(entry.isIntersecting){
        loadBg(entry.target);
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: '220px 0px', threshold: 0.01 });

  items.forEach(el => io.observe(el));
}

initLazyBackgrounds();

// Ненавязчивый прелоад фоновых картинок после первого экрана.
// Это помогает убрать ситуацию, когда при первом заходе изображения
// подгружаются с заметной задержкой в момент скролла.
function preloadBgInIdle(){
  const urls = new Set();
  $$('[data-bg]').forEach(el => {
    const src = el.getAttribute('data-bg');
    if(src) urls.add(src);
  });

  const list = Array.from(urls);
  if(!list.length) return;

  let i = 0;
  const pump = (deadline) => {
    while(i < list.length && (!deadline || deadline.timeRemaining() > 8)){
      const img = new Image();
      img.src = list[i++];
    }

    if(i < list.length){
      if('requestIdleCallback' in window){
        requestIdleCallback(pump, { timeout: 2000 });
      } else {
        setTimeout(pump, 250);
      }
    }
  };

  if('requestIdleCallback' in window){
    requestIdleCallback(pump, { timeout: 2000 });
  } else {
    setTimeout(pump, 1200);
  }
}

// запускаем после загрузки, чтобы не мешать первому экрану
window.addEventListener('load', preloadBgInIdle, { once: true });

// HERO слайдер (главная)
  const heroSlider = $('[data-hero-slider]');
  if(heroSlider){
    const slides = $$('[data-slide]', heroSlider);
    const dotsRoot = $('[data-hero-dots]', heroSlider);
    let idx = 0;
    let timer = null;

    function go(nextIdx){
  if(!slides.length) return;
  idx = (nextIdx + slides.length) % slides.length;

  // Активируем слайд
  slides.forEach((s, i) => s.classList.toggle('is-active', i === idx));

  // Подгружаем фон для текущего и следующего (чтобы переключение было без "пустоты")
  loadBg(slides[idx]);
  loadBg(slides[(idx + 1) % slides.length]);

  if(dotsRoot){
    $$('[data-hero-dot]', dotsRoot).forEach((d, i) => d.classList.toggle('is-active', i === idx));
  }
}


    function buildDots(){
      if(!dotsRoot) return;
      dotsRoot.innerHTML = slides.map((_, i) => {
        return `<button class="hero-dot" type="button" data-hero-dot="${i}" aria-label="Слайд ${i+1}"></button>`;
      }).join('');
      $$('[data-hero-dot]', dotsRoot).forEach(btn => {
        btn.addEventListener('click', () => {
          const i = Number(btn.getAttribute('data-hero-dot') || '0');
          go(i);
          restart();
        });
      });
    }

    function start(){
      if(timer) clearInterval(timer);
      timer = setInterval(() => go(idx + 1), 6500);
    }
    function stop(){
      if(timer) clearInterval(timer);
      timer = null;
    }
    function restart(){
      stop();
      start();
    }

    buildDots();
    go(0);
    start();

    // Пауза при взаимодействии
    heroSlider.addEventListener('mouseenter', stop);
    heroSlider.addEventListener('mouseleave', start);
    heroSlider.addEventListener('touchstart', stop, { passive: true });
    heroSlider.addEventListener('touchend', start);
  }

  // Карусели (меню PDF / галерея)
  $$('[data-carousel]').forEach(carousel => {
    const track = $('[data-carousel-track]', carousel);
    if(!track) return;
    const prev = $('[data-carousel-prev]', carousel);
    const next = $('[data-carousel-next]', carousel);

    const step = () => Math.max(280, Math.floor(track.clientWidth * 0.85));

    prev?.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
    next?.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));

    function update(){
      // включаем/выключаем кнопки, когда дошли до края
      const maxLeft = track.scrollWidth - track.clientWidth - 2;
      const left = track.scrollLeft;
      if(prev) prev.disabled = left <= 2;
      if(next) next.disabled = left >= maxLeft;
    }

    track.addEventListener('scroll', () => window.requestAnimationFrame(update));
    window.addEventListener('resize', update);
    update();
  });
// Lightbox для фото (всплывающее окно)
const lightbox = $('[data-lightbox-modal]');
if(lightbox){
  const img = $('[data-lightbox-img]', lightbox);
  const caption = $('[data-lightbox-caption]', lightbox);
  const closeBtn = $('[data-lightbox-close]', lightbox);

  function open(src, text){
    if(!img) return;
    img.src = src;

    if(caption){
      caption.textContent = text || '';
      caption.style.display = text ? 'block' : 'none';
    }

    lightbox.classList.add('is-open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
  }

  function close(){
    lightbox.classList.remove('is-open');
    lightbox.setAttribute('aria-hidden', 'true');

    if(img) img.removeAttribute('src');
    if(caption){
      caption.textContent = '';
      caption.style.display = 'none';
    }

    document.documentElement.style.overflow = '';
  }

  closeBtn?.addEventListener('click', close);
  lightbox.addEventListener('click', (e) => {
    if(e.target === lightbox) close();
  });
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && lightbox.classList.contains('is-open')) close();
  });

  // делегирование клика
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-lightbox]');
    if(!btn) return;
    const src = btn.getAttribute('data-lightbox');
    if(!src) return;

    const text = btn.getAttribute('data-caption') || '';
    e.preventDefault();
    open(src, text);
  });
}

})();
