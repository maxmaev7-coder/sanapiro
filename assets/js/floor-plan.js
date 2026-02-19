/* Интерактивная карта зала (SVG) с точным расположением столиков по этажам.
   Важно: координаты и структура взяты из старого виджета (как просили),
   но визуальный стиль теперь полностью управляется CSS, чтобы совпадать
   со стилистикой сайта.
*/

(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Данные о столиках по этажам (точное расположение из старого виджета)
  // Примечание: намеренно без статических busy-флагов — занятость задаём из API/виджета.
  const FLOOR_PLANS = {
    1: {
      name: '1 этаж',
      tables: [
        // БАР (верхний левый; оригинал: x=27, y=60, 164×62 в пространстве 600×467)
        { id: 'BAR', x: 27, y: 51, width: 164, height: 53, type: 'bar', label: 'БАР' },
        // 13 VIP (верхний; оригинал: left=237, top=54, cap=10)
        { id: '13', x: 237, y: 46, width: 80, height: 65, type: 'vip', label: '13 VIP', capacity: 10 },
        // Столы 7-9 (верхний правый; оригинал: top=62, cap=2)
        { id: '7', x: 421, y: 53, width: 44, height: 46, type: 'square', label: '7', capacity: 2 },
        { id: '8', x: 483, y: 53, width: 44, height: 46, type: 'square', label: '8', capacity: 2 },
        { id: '9', x: 547, y: 53, width: 44, height: 46, type: 'square', label: '9', capacity: 2 },

        // Столы 10-12 (средний ряд; оригинал: top=165, cap=2)
        { id: '10', x: 190, y: 141, width: 44, height: 46, type: 'square', label: '10', capacity: 2 },
        { id: '11', x: 284, y: 141, width: 44, height: 46, type: 'square', label: '11', capacity: 2 },
        { id: '12', x: 384, y: 141, width: 44, height: 46, type: 'square', label: '12', capacity: 2 },
        // ДИВАНЫ (оригинал: x=27, y=255, 573×30)
        { id: 'SOFAS', x: 27, y: 218, width: 573, height: 26, type: 'sofas', label: 'ДИВАНЫ' },

        // Столы 6, 5, 4 (оригинал: top=300, cap=4)
        { id: '6', x: 115, y: 257, width: 65, height: 55, type: 'rect', label: '6', capacity: 4 },
        { id: '5', x: 308, y: 257, width: 65, height: 55, type: 'rect', label: '5', capacity: 4 },
        { id: '4', x: 473, y: 257, width: 65, height: 55, type: 'rect', label: '4', capacity: 4 },

        // Столы 3, 2, 1 (нижний ряд; оригинал: top=400, cap=4)
        { id: '3', x: 182, y: 343, width: 65, height: 55, type: 'rect', label: '3', capacity: 4 },
        { id: '2', x: 307, y: 343, width: 65, height: 55, type: 'rect', label: '2', capacity: 4 },
        { id: '1', x: 431, y: 343, width: 65, height: 55, type: 'rect', label: '1', capacity: 4 },
      ],
    },
    2: {
      name: '2 этаж',
      tables: [
        // Верхний ряд слева: столы 1-2 (оригинал: top=49, cap=7 в пространстве 760×584)
        { id: '1', x: 46, y: 34, width: 66, height: 57, type: 'rect', label: '1', capacity: 7 },
        { id: '2', x: 135, y: 34, width: 66, height: 57, type: 'rect', label: '2', capacity: 7 },
        // Стол 8 (круглый, оригинал: left=283, top=77, cap=8)
        { id: '8', x: 223, y: 53, width: 66, height: 57, type: 'circle', label: '8', capacity: 8 },

        // Верхний ряд справа: столы 9-12 (оригинал: top=92-100)
        { id: '9', x: 314, y: 63, width: 52, height: 46, type: 'rect', label: '9', capacity: 4 },
        { id: '10', x: 391, y: 63, width: 52, height: 46, type: 'rect', label: '10', capacity: 4 },
        { id: '11', x: 469, y: 63, width: 52, height: 46, type: 'rect', label: '11', capacity: 4 },
        { id: '12', x: 550, y: 69, width: 40, height: 40, type: 'square', label: '12', capacity: 2 },

        // Правый столбец: столы 13-15 (оригинал: left=690, вертикально)
        { id: '13', x: 544, y: 129, width: 52, height: 46, type: 'rect', label: '13', capacity: 4 },
        { id: '14', x: 544, y: 199, width: 52, height: 46, type: 'rect', label: '14', capacity: 4 },
        { id: '15', x: 544, y: 269, width: 52, height: 46, type: 'rect', label: '15', capacity: 4 },

        // Средний ряд: столы 18-19 (оригинал: top=241)
        { id: '18', x: 373, y: 165, width: 52, height: 46, type: 'rect', label: '18', capacity: 4 },
        { id: '19', x: 455, y: 165, width: 52, height: 46, type: 'rect', label: '19', capacity: 4 },

        // Столы 17, 20 (оригинал: top=393)
        { id: '17', x: 376, y: 269, width: 52, height: 46, type: 'rect', label: '17', capacity: 4 },
        { id: '20', x: 458, y: 269, width: 52, height: 46, type: 'rect', label: '20', capacity: 4 },

        // Нижний ряд: столы 3-7 (оригинал: top=370, cap=4)
        { id: '3', x: 25, y: 253, width: 52, height: 46, type: 'rect', label: '3', capacity: 4 },
        { id: '4', x: 91, y: 253, width: 52, height: 46, type: 'rect', label: '4', capacity: 4 },
        { id: '5', x: 155, y: 253, width: 52, height: 46, type: 'rect', label: '5', capacity: 4 },
        { id: '6', x: 221, y: 253, width: 52, height: 46, type: 'rect', label: '6', capacity: 4 },
        { id: '7', x: 286, y: 253, width: 52, height: 46, type: 'rect', label: '7', capacity: 4 },

        // Стол 16 (оригинал: left=514, top=500, cap=6)
        { id: '16', x: 406, y: 343, width: 68, height: 56, type: 'rect', label: '16', capacity: 6 },
        // БАР (оригинал: x=109, y=506, 287×78)
        { id: 'BAR', x: 86, y: 347, width: 226, height: 53, type: 'bar', label: 'БАР' },
      ],
    },
    3: {
      name: '3 этаж',
      tables: [
        // Верхний ряд: столы 2-7 (оригинал: top=50 в пространстве 682×545)
        { id: '2', x: 54, y: 37, width: 55, height: 50, type: 'rect', label: '2', capacity: 4 },
        { id: '3', x: 131, y: 33, width: 70, height: 58, type: 'rect', label: '3', capacity: 5 },
        { id: '4', x: 230, y: 37, width: 55, height: 50, type: 'rect', label: '4', capacity: 4 },
        { id: '5', x: 309, y: 33, width: 70, height: 58, type: 'rect', label: '5', capacity: 5 },
        { id: '6', x: 404, y: 33, width: 70, height: 58, type: 'rect', label: '6', capacity: 6 },
        { id: '7', x: 515, y: 33, width: 70, height: 58, type: 'rect', label: '7', capacity: 6 },

        // Второй ряд: столы 8-9 (оригинал: top=155, правее)
        { id: '8', x: 417, y: 114, width: 55, height: 50, type: 'rect', label: '8', capacity: 4 },
        { id: '9', x: 529, y: 114, width: 55, height: 50, type: 'rect', label: '9', capacity: 4 },

        // Стол 1 (большой, слева внизу; оригинал: left=45, top=337)
        { id: '1', x: 40, y: 247, width: 68, height: 58, type: 'rect', label: '1', capacity: 8 },

        // Гардероб (вертикальный; оригинал: x=220, y=297, 65×136)
        { id: 'WARDROBE', x: 194, y: 218, width: 57, height: 100, type: 'wardrobe', label: 'гардероб' },

        // VIP (нижний левый; оригинал: left=194, top=485)
        { id: 'VIP', x: 171, y: 356, width: 68, height: 40, type: 'vip', label: 'VIP', capacity: 8 },

        // БАР (нижний правый, широкий; оригинал: x=395, y=467, 287×78)
        { id: 'BAR', x: 347, y: 343, width: 252, height: 57, type: 'bar', label: 'БАР' },
      ],
    },
  };

  class FloorPlan {
    /**
     * @param {HTMLElement} container
     * @param {(tableInfo: {id:string,label:string,floor:number,capacity:number|null,key:string}|null) => void} onTableSelect
     * @param {{ initialFloor?: number }} [options]
     */
    constructor(container, onTableSelect, options = {}) {
      this.container = container;
      this.onTableSelect = onTableSelect;
      this.currentFloor = Number(options.initialFloor) || 2;

      // selectedKey: `${floor}:${id}` — так избегаем конфликтов, потому что номера столов повторяются на этажах
      this.selectedKey = null;

      /** @type {Set<string>} */
      this.busyTables = new Set();

      this.scale = 1;
      this.init();
    }

    key(floor, id) {
      return `${floor}:${id}`;
    }

    getFloorData(floor = this.currentFloor) {
      return FLOOR_PLANS[floor];
    }

    getTableById(tableId, floor = this.currentFloor) {
      const floorData = this.getFloorData(floor);
      if (!floorData) return null;
      return floorData.tables.find((t) => t.id === tableId) || null;
    }

    init() {
      this.render();
      this.setupEventListeners();
    }

    render() {
      const floorData = this.getFloorData(this.currentFloor);
      if (!floorData) {
        console.error(`Данные для этажа ${this.currentFloor} не найдены`);
        this.container.innerHTML =
          '<div style="padding: 40px; text-align: center; color: var(--muted);">Ошибка: данные этажа не найдены</div>';
        return;
      }

      const svgWidth = 600;
      const svgHeight = 400;

      this.container.innerHTML = `
        <div class="floor-plan">
          <div class="floor-plan__toolbar">
            <div class="floor-plan__legend" aria-label="Легенда">
              <span class="floor-plan__legend-item"><span class="floor-plan__legend-swatch is-free" aria-hidden="true"></span>Свободно</span>
              <span class="floor-plan__legend-item"><span class="floor-plan__legend-swatch is-busy" aria-hidden="true"></span>Занято</span>
              <span class="floor-plan__legend-item"><span class="floor-plan__legend-swatch is-selected" aria-hidden="true"></span>Выбрано</span>
            </div>
            <div class="floor-plan__zoom">
              <button class="floor-plan__zoom-btn" data-zoom-out type="button" aria-label="Уменьшить">−</button>
              <button class="floor-plan__zoom-btn" data-zoom-in type="button" aria-label="Увеличить">+</button>
            </div>
          </div>

          <div class="floor-plan__canvas" aria-label="Карта столов">
            <div class="floor-plan__canvas-inner" data-floor-plan-inner style="transform: scale(${this.scale});">
              <svg
                width="${svgWidth}"
                height="${svgHeight}"
                viewBox="0 0 ${svgWidth} ${svgHeight}"
                class="floor-plan__svg"
                role="img"
                aria-label="${escapeHtml(floorData.name)}"
              >
                <defs>
                  <filter id="fpShadow" x="-30%" y="-30%" width="160%" height="160%">
                    <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="rgba(0,0,0,.16)" />
                  </filter>
                </defs>
                ${this.renderTables(floorData)}
              </svg>
            </div>
          </div>

          <div class="floor-plan__floors" role="tablist" aria-label="Этажи">
            <button class="floor-plan__floor-btn ${this.currentFloor === 1 ? 'is-active' : ''}" data-floor="1" type="button" role="tab" aria-selected="${this.currentFloor === 1}">
              1 этаж
            </button>
            <button class="floor-plan__floor-btn ${this.currentFloor === 2 ? 'is-active' : ''}" data-floor="2" type="button" role="tab" aria-selected="${this.currentFloor === 2}">
              2 этаж
            </button>
            <button class="floor-plan__floor-btn ${this.currentFloor === 3 ? 'is-active' : ''}" data-floor="3" type="button" role="tab" aria-selected="${this.currentFloor === 3}">
              3 этаж
            </button>
          </div>

          <div class="floor-plan__selected" data-selected-info>
            ${this.renderSelectedInfo()}
          </div>
        </div>
      `;
    }

    renderSelectedInfo() {
      if (!this.selectedKey) {
        return 'Выберите стол на плане <span class="small">(цвета — по легенде)</span>';
      }

      const [floorStr, tableId] = this.selectedKey.split(':');
      const floor = Number(floorStr);
      const table = this.getTableById(tableId, floor);
      if (!table) return 'Выберите стол на плане';

      const capacity = table.capacity ? ` · до <b>${table.capacity}</b> гостей` : '';
      return `Стол <b>${escapeHtml(table.label)}</b> · ${floor} этаж${capacity}`;
    }

    renderTables(floorData) {
      const floor = this.currentFloor;

      return floorData.tables
        .map((table) => {
          const isSpecial = ['bar', 'sofas', 'wardrobe'].includes(table.type);
          const isVip = table.type === 'vip';

          const tableKey = this.key(floor, table.id);
          const isSelected = this.selectedKey === tableKey;
          const isBusy = this.busyTables.has(tableKey);

          const selectable = !isSpecial && !isBusy;

          const classes = ['table-shape'];
          if (isSpecial) {
            classes.push('table-shape--special');
            classes.push(`is-${table.type}`);
          } else {
            classes.push('table-shape--table');
          }
          if (isVip) classes.push('is-vip');
          if (isBusy) classes.push('is-busy');
          if (isSelected) classes.push('is-selected');

          const cx = table.x + table.width / 2;
          const cy = table.y + table.height / 2;

          const titleParts = [];
          if (!isSpecial) titleParts.push(`Стол ${table.label}`);
          if (table.capacity) titleParts.push(`${table.capacity} мест`);
          if (!isSpecial) titleParts.push(isBusy ? 'занят' : 'свободен');
          const title = titleParts.filter(Boolean).join(' • ');

          const ariaLabel = title || table.label;

          const commonAttrs = `
            class="${classes.join(' ')}"
            data-table="${escapeHtml(table.id)}"
            data-floor="${floor}"
            ${selectable ? 'role="button" tabindex="0"' : 'role="img" tabindex="-1"'}
            aria-label="${escapeHtml(ariaLabel)}"
            ${!selectable ? 'aria-disabled="true"' : ''}
          `;

          if (table.type === 'circle') {
            return `
              <g ${commonAttrs}>
                <title>${escapeHtml(title)}</title>
                <circle
                  class="table-shape__body"
                  cx="${cx}"
                  cy="${cy}"
                  r="${table.width / 2}"
                />
                <text
                  class="table-shape__label"
                  x="${cx}"
                  y="${cy + 5}"
                  text-anchor="middle"
                >${escapeHtml(table.label)}</text>
              </g>
            `;
          }

          const rx = isSpecial ? 10 : 12;
          return `
            <g ${commonAttrs}>
              <title>${escapeHtml(title)}</title>
              <rect
                class="table-shape__body"
                x="${table.x}"
                y="${table.y}"
                width="${table.width}"
                height="${table.height}"
                rx="${rx}"
              />
              <text
                class="table-shape__label ${isSpecial ? 'is-contrast' : ''}"
                x="${cx}"
                y="${cy + 5}"
                text-anchor="middle"
                ${table.type === 'wardrobe' ? `transform="rotate(-90, ${cx}, ${cy})"` : ''}
              >${escapeHtml(table.label)}</text>
            </g>
          `;
        })
        .join('');
    }

    setupEventListeners() {
      // Переключение этажей
      $$('[data-floor]', this.container).forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const floor = parseInt(e.currentTarget.getAttribute('data-floor'), 10);
          this.switchFloor(floor);
        });
      });

      // Клики по столам
      $$('[data-table]', this.container).forEach((tableEl) => {
        tableEl.addEventListener('click', (e) => {
          const tableId = e.currentTarget.getAttribute('data-table');
          const floor = parseInt(e.currentTarget.getAttribute('data-floor') || String(this.currentFloor), 10);
          this.selectTable(tableId, floor);
        });

        tableEl.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          const tableId = e.currentTarget.getAttribute('data-table');
          const floor = parseInt(e.currentTarget.getAttribute('data-floor') || String(this.currentFloor), 10);
          this.selectTable(tableId, floor);
        });
      });

      // Зум
      const inner = $('[data-floor-plan-inner]', this.container);
      const applyScale = () => {
        if (!inner) return;
        inner.style.transform = `scale(${this.scale})`;
      };
      applyScale();

      $('[data-zoom-in]', this.container)?.addEventListener('click', () => {
        this.scale = Math.min(this.scale + 0.1, 2);
        applyScale();
      });

      $('[data-zoom-out]', this.container)?.addEventListener('click', () => {
        this.scale = Math.max(this.scale - 0.1, 0.6);
        applyScale();
      });
    }

    switchFloor(floor) {
      if (floor === this.currentFloor) return;

      this.currentFloor = floor;
      this.selectedKey = null;

      this.render();
      this.setupEventListeners();

      if (this.onTableSelect) this.onTableSelect(null);
      if (this.onFloorSwitch) this.onFloorSwitch(floor);
    }

    selectTable(tableId, floor = this.currentFloor) {
      const table = this.getTableById(tableId, floor);
      if (!table) return;

      // Специальные элементы на плане не выбираем
      if (['bar', 'sofas', 'wardrobe'].includes(table.type)) return;

      const tableKey = this.key(floor, tableId);

      if (this.busyTables.has(tableKey)) {
        window.SanapiroToast?.push('Стол занят', `Стол ${table.label} сейчас недоступен.`);
        return;
      }

      // Переключение выбора
      if (this.selectedKey === tableKey) {
        this.selectedKey = null;
      } else {
        this.selectedKey = tableKey;
      }

      this.render();
      this.setupEventListeners();

      if (this.onTableSelect) {
        if (!this.selectedKey) {
          this.onTableSelect(null);
        } else {
          this.onTableSelect({
            id: String(table.id),
            label: String(table.label),
            capacity: table.capacity ? Number(table.capacity) : null,
            floor: Number(floor),
            key: tableKey,
          });
        }
      }
    }

    getSelectedTable() {
      if (!this.selectedKey) return null;
      const [floorStr, id] = this.selectedKey.split(':');
      const floor = Number(floorStr);
      const table = this.getTableById(id, floor);
      if (!table) return null;
      return {
        id: String(table.id),
        label: String(table.label),
        capacity: table.capacity ? Number(table.capacity) : null,
        floor,
        key: this.selectedKey,
      };
    }

    clearSelection() {
      this.selectedKey = null;
      this.render();
      this.setupEventListeners();
      if (this.onTableSelect) this.onTableSelect(null);
    }

    /**
     * Устанавливает занятые столы.
     * Поддерживаем два формата:
     * 1) ['1','2','3'] + floor (вторым аргументом)
     * 2) [{ floor: 2, id: '7' }, ...]
     */
    setBusyTables(tables = [], floor = this.currentFloor) {
      const next = new Set(this.busyTables);

      // Сначала очистим busy для указанного этажа
      for (const key of Array.from(next)) {
        if (String(key).startsWith(`${floor}:`)) next.delete(key);
      }

      // Затем добавим новые
      for (const t of tables) {
        if (!t) continue;

        if (typeof t === 'string' || typeof t === 'number') {
          next.add(this.key(floor, String(t)));
          continue;
        }

        if (typeof t === 'object' && t.id != null && t.floor != null) {
          next.add(this.key(Number(t.floor), String(t.id)));
        }
      }

      this.busyTables = next;
      this.render();
      this.setupEventListeners();
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  // Экспорт для использования в booking-widget.js
  window.FloorPlan = FloorPlan;
  window.FLOOR_PLANS = FLOOR_PLANS;
})();
