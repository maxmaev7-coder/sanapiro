class TableWidgetArea {
	constructor(widget, settings = {}) {
		this.widget = widget;
		this.t = this.widget.translate;
		this.options = widget.options;
		this.modal = widget.modal;
		this.token = widget.token();
		this.stateTables = {};
		this.stateActiveTables = {};
		this.dataTables = null;
		this._createdMaps = false;
		this._nameTables = {};
		this.settings = settings;
		this.max_tables = this.settings.max_tables ? this.settings.max_tables : null;
		this.excludeRooms = this.settings.excludeRooms ? this.settings.excludeRooms : [];
		this.reserveNotSelectedTables = this.settings.reserveNotSelectedTables ? this.settings.reserveNotSelectedTables : false;
		this.freeTablesByTimestamp = {};

		this.modal.addEventListener('update.token', () => {
			this._createdMaps = false;
			this.token = widget.token();
			this._createRoomMaps();
			this.stateActiveTables = {};
		});

		this.modal.querySelector('.remarked-primary-widget__date-select').addEventListener('change.date', async () => {
			if (!this.settings?.showContainerTablesWhenFieldsFilled) {
				this.modal.closest('.remarked-primary-widget__wrap').classList.add('remarked-primary-widget__wrap--tables');
			}

			if (this._createdMaps) {
				this._getStateTables();
			} else {
				await this._createRoomMaps();
			}
		});

		this.modal.addEventListener('update.times.before', async (e) => {
			if (this.settings?.resetActiveTablesOnEvent) {
				this.stateActiveTables = {};
				this._removeActiveTables();
			}
		});

		this.modal.addEventListener('update.slots', async (e) => {
			const slots = e.detail.slots;
			this.slots = slots;
			this.freeTablesByTimestamp = {};

			for (const slot of slots) {
				if (!slot.is_free) continue;
				const slotTables = slot?.tables_ids ? slot.tables_ids : [];
				if (slotTables.length <= 0) continue;

				const iterationCount = (slot.end_stamp - slot.start_stamp) / 900;

				for (let index = 0; index <= iterationCount; index++) {
					let timestamp = slot.start_stamp + (index * 900);
					this.freeTablesByTimestamp[timestamp] = {};

					for (const tableID of slotTables) {
						this.freeTablesByTimestamp[timestamp][tableID] = true;
					}
				}
			}
		});

		this.modal.addEventListener('update.guest', async (e) => {
			if (!this.settings?.showContainerTablesWhenFieldsFilled) {
				this.modal.closest('.remarked-primary-widget__wrap').classList.add('remarked-primary-widget__wrap--tables');
			}

			if (this._createdMaps) await this._getStateTables();

			if (this.options.defaultSelectedTime) {
				setTimeout(() => {
        			const itemTime = this.modal.querySelector('.remarked-primary-widget__times-item[data-temp="'+this.options.defaultSelectedTime+'"]');
        			if (itemTime) itemTime.click();
        		}, 0);
			}

			if (Object.keys(this.stateActiveTables).length) {
				const guestsCount = parseInt(this.modal.querySelector('[name="remarked-primary-widget__qty"]').value);
				let active = this.modal.querySelectorAll('.remarked-primary-widget__table--active');
				for (let i = 0; i < active.length; i++) {
					const table = active[i];
					const min_capacity = parseInt(table.getAttribute('data-min-capacity'));
					const max_capacity = parseInt(table.getAttribute('data-max-capacity'));
					const tableID = parseInt(table.getAttribute('data-table-id'));

					if ((min_capacity && max_capacity) && (min_capacity > guestsCount || guestsCount > max_capacity)) {
						if (this.stateActiveTables[tableID]) {
							delete this.stateActiveTables[tableID];
							table.classList.remove('remarked-primary-widget__table--active');
						}
					}

				}
			}

			if (this.settings?.resetActiveTablesOnEvent) {
				this.stateActiveTables = {};
				this._removeActiveTables();
			}

		});

		this.modal.addEventListener('send.reserve', async (e) => {
			let tables = Object.keys(this.stateActiveTables);
			let data = e.detail;
			let sendData = data;
			if (!this.reserveNotSelectedTables && tables.length == 0) {
				this._modal(this?.t?.selectedTables ?? 'ÐÑÐ±ÐµÑÐ¸ÑÐµ ÑÑÐ¾Ð»Ð¸ÐºÐ¸', '');
				this.modal.querySelector('.remarked-primary-widget__submit').setAttribute('data-disabled', 'false');
				this.widget.endPreloader();
			} else {
				if (this.settings.countEqualTable) {
					let table = tables[0];
					let capacity = +this.modal.querySelector('.remarked-primary-widget__table[data-table-id="' + table + '"]').getAttribute('data-capacity');
					let guestsCount = data.reserve.guests_count;
					if (guestsCount > capacity) {
						this._modal(this.t.errorTitle, this.settings.countEqualTableMessage);
						this.modal.querySelector('.remarked-primary-widget__submit').setAttribute('data-disabled', 'false');
						this.widget.endPreloader();
						return false;
					}
				}

				if (tables.length > 0) data.reserve.table_ids = tables;

				if (this.settings.beforeSendReserve) this.settings.beforeSendReserve(data, this.dataTables);

				let url = this.widget.remarkedReqUrl;
				await fetch(url, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(data),
				})
					.then((response) => {
						return response.json();
					})
					.then((data) => {
						if (data.status == "error") {
							this.modal.querySelector('.remarked-primary-widget__submit').setAttribute('data-disabled', 'false');
							this._modal(this.t.errorTitle, data.message);
							this.widget.endPreloader();
						} else {
							const thx = this;
							(async function () {
								thx.options.successCreateReserve(thx.modal);
								await thx.options.afterSendReserves(thx.modal, thx.token, sendData, data.reserve_id);
								thx.modal.closest('.remarked-primary-widget__wrap').classList.add('remarked-primary-widget--success');
								thx.modal.closest('.remarked-primary-widget__wrap').classList.remove('remarked-primary-widget__wrap--tables');
								thx.widget.endPreloader();
								if (data.form_url) {
									setTimeout(() => {
										window.location.href = data.form_url;
									}, 1000);
								}
							}());
						}
					});
			}
		});

		this.modal.addEventListener('widget.reset', () => {
			this.stateActiveTables = {};
			this._removeActiveTables();
			this.modal.closest('.remarked-primary-widget__wrap').classList.remove('remarked-primary-widget__wrap--tables');
		});

		this.modal.querySelector('.remarked-primary-widget__times-wrap').addEventListener('click', async (e) => {

			if (e.target.closest('.remarked-primary-widget__times-item')) {

				if (this.settings?.resetActiveTablesOnEvent) {
					this.stateActiveTables = {};
					this._removeActiveTables();
				}

				if (this.settings?.showContainerTablesWhenFieldsFilled) {
					this.modal.closest('.remarked-primary-widget__wrap').classList.add('remarked-primary-widget__wrap--tables');
				}

				let timestamp = e.target.closest('.remarked-primary-widget__times-item').getAttribute('data-timestamp');
				let stateTables = this.stateTables[timestamp] ? this.stateTables[timestamp] : {};

				if (Object.keys(this.stateTables).length === 0 && this.options.defaultSelectedTime) {
					await this._getStateTables();
					stateTables = this.stateTables[timestamp] ? this.stateTables[timestamp] : {};
				}

				let arrActiveTables = Object.keys(this.stateActiveTables);
				this._removeBusyTables();
				let error = [];
				for (const key in stateTables) {
					if (Object.hasOwnProperty.call(stateTables, key)) {
						const element = stateTables[key];

						let isFreeTable = false;
						if (!element) isFreeTable = true;

						if (!isFreeTable && this.freeTablesByTimestamp[timestamp]) {
							try {
								isFreeTable = !this.freeTablesByTimestamp[timestamp][key];
							} catch (error) {
								console.error(error);
							}
						}

						if (isFreeTable) {
							if (this.modal.querySelector('.remarked-primary-widget__table[data-table-id="' + key + '"]')) {
								this.modal.querySelector('.remarked-primary-widget__table[data-table-id="' + key + '"]').classList.add('remarked-primary-widget__table--busy');

								if (arrActiveTables.includes(key)) {
									delete this.stateActiveTables[key];
									this.modal.querySelector('.remarked-primary-widget__table[data-table-id="' + key + '"]').classList.remove('remarked-primary-widget__table--active');
									error.push(this._nameTables[key]);
								}

							}
						}

					}
				}

				if (this.settings.durationOptions) {
					if (this.modal.querySelector('.custom-switch__item.active')) {
						const durationHours = +this.modal.querySelector('.custom-switch__item.active').getAttribute('data-index');
						const durationHoursLength = durationHours * 4;
						let stamp = +timestamp;
						for (var i = 0; i < durationHoursLength; i++) {
							stamp += 900;
							let stateTables = this.stateTables[stamp] ? this.stateTables[stamp] : {};
							for (const key in stateTables) {
								if (Object.hasOwnProperty.call(stateTables, key)) {
									const element = stateTables[key];

									if (!element) {
										if (this.modal.querySelector('.remarked-primary-widget__table[data-table-id="' + key + '"]')) {
											this.modal.querySelector('.remarked-primary-widget__table[data-table-id="' + key + '"]').classList.add('remarked-primary-widget__table--busy');

											if (arrActiveTables.includes(key)) {
												delete this.stateActiveTables[key];
												this.modal.querySelector('.remarked-primary-widget__table[data-table-id="' + key + '"]').classList.remove('remarked-primary-widget__table--active');
												error.push(this._nameTables[key]);
											}

										}
									}

								}
							}
						}
					}
				}

				if (error.length > 0) {
					let text = error.length == 1 ? `${this.t.tableText}: ${error.join()} ${this.t.busyText}` : `${this.t.tablesText}: ${error.join()} ${this.t.busysText}`
					this._modal(this.t.errorTitle, text)
				}

				this._addBusyTablesCapacity();
			}
		});

		if (this.options.oneGuestOneTable) {
			const plusBtn = this.modal.querySelectorAll('.remarked-primary-widget__qtyplus');
			for (var i = 0; i < plusBtn.length; i++) plusBtn[i].style.display = 'none';

			const minusBtn = this.modal.querySelectorAll('.remarked-primary-widget__qtyminus');
			for (var i = 0; i < minusBtn.length; i++) minusBtn[i].style.display = 'none';
		}
	}

	async _getStateTables() {
		const data = await this.getDataTables();
		if (Object.keys(data).length == 0) return;

		const tables = data?.tables;
		if (!tables) return;

		this._removeBusyTables();

		this.stateTables = {};
		for (const key in tables) {
			if (Object.hasOwnProperty.call(tables, key)) {
				const element = tables[key];
				const { id, time_slots } = element;
				time_slots.forEach(item => {
					const { timestamp, is_free } = item;
					let obj = {};
					obj[id] = is_free;
					this.stateTables[timestamp] = { ...this.stateTables[timestamp], ...obj };
				});
			}
		}

		this._addBusyTablesCapacity();
	}

	_addBusyTablesCapacity() {
		let tables = this.modal.querySelectorAll('.remarked-primary-widget__table');

		let adultGuestsCount = this.modal.querySelector('#remarked-primary-widget__qty').value;
		let childrenCount = this.options.children ? this.modal.querySelector('#remarked-primary-widget__children-qty').value : 0;

		const guests_count = this.options.oneGuestOneTable ? 1 : Number(adultGuestsCount) + Number(childrenCount);

		for (let index = 0; index < tables.length; index++) {
			const table = tables[index];
			const min_capacity = parseInt(table.getAttribute('data-min-capacity'));
			const max_capacity = parseInt(table.getAttribute('data-max-capacity'));

			if (min_capacity <= guests_count && max_capacity >= guests_count) continue;
			table.classList.add('remarked-primary-widget__table--busy');
		}

		//useBundels
		if (this.settings?.useBundels) {
			this.bundels = null;
			const slots = this.slots;
			const activeEl = this.modal.querySelector('.remarked-primary-widget__times-item--active')
			if (activeEl) {
				const activeTime = activeEl.getAttribute('data-temp');
				for(const slot of slots) {
					const [date, time] = slot.start_datetime.split(' ');
					const [hh, mm] = time.split(':');
					const timeFormat = `${hh}:${mm}`;
					if(timeFormat !== activeTime) continue;
					if (Array.isArray(slot.table_bundles)) {
						if (slot.table_bundles.length <= 0) continue;

						const bundels = slot.table_bundles;
						this.bundels = bundels;

						for(const bundel of bundels) {
							for(const tableID of bundel) {
								const table = this.modal.querySelector('.remarked-primary-widget__table[data-table-id="'+tableID+'"]');
								if (!table) continue;
								if (table.classList.contains('remarked-primary-widget__table--busy')) table.classList.remove('remarked-primary-widget__table--busy');
							}
						}

					}

					break;
				}
			}
		}
		//useBundels
	}

	async getDataTables() {
		let adultGuestsCount = this.modal.querySelector('#remarked-primary-widget__qty').value;
		let childrenCount = this.options.children ? this.modal.querySelector('#remarked-primary-widget__children-qty').value : 0;

		this.widget.startPreloader();
		let token = this.widget.token();
		let guestsCount = Number(adultGuestsCount) + Number(childrenCount);
		let date = this.modal.querySelector('.remarked-primary-widget__date-select').value;
		if (date == '') {
			date = this._formatDate(new Date());
		} else {
			date = this.widget.dateReplacer(date);
		}

		if (this.options.oneGuestOneTable) guestsCount = 1;

		let dataTables = {};

		await fetch('https://app.remarked.ru/api/v1/ApiReservesWidget', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				method: 'GetTimesWithTables',
				token: token,
				reserve_date: date,
				guests_count: guestsCount,
			}),

		})
			.then((response) => {
				return response.json();
			})
			.then((data) => {
				dataTables = data;
			});
		this.widget.endPreloader();
		this.dataTables = dataTables;
		return dataTables;
	}

	async _createRoomMaps() {
		const data = await this.getDataTables();
		if (Object.keys(data).length == 0) return;

		const rooms = data?.rooms;
		if (!rooms) return;

		const tables = data?.tables;
		if (!tables) return;

		const interiors = data.interiors;

		this._createdMaps = true;
		this._nameTables = {};

		if (this.modal.querySelector('.remarked-primary-widget__tables')) {
			this.modal.querySelector('.remarked-primary-widget__tables').remove();
		}

		const wrapper = document.createElement('div');
		wrapper.classList.add('remarked-primary-widget__tables');

		const innerWidth = window.innerWidth;
		const mobileZoom = this.settings.mobileZoom ? this.settings.mobileZoom : 0.5;
		const desktopZoom = this.settings.desktopZoom ? this.settings.desktopZoom : 1;
		wrapper.innerHTML = `
			<input type="hidden" name="tables-widget" value="[]">
			<div class="remarked-primary-widget__zooms" data-zoom="${innerWidth < 600 ? mobileZoom : desktopZoom}">
				<div class="remarked-primary-widget__zoom" data-event="minus">-</div>
				<div class="remarked-primary-widget__zoom" data-event="plus">+</div>
			</div>
			<div class="remarked-primary-widget__map" style="zoom: ${innerWidth < 600 ? mobileZoom : desktopZoom};"></div>
			<div class="remarked-primary-widget__tables-buttons"></div>
		`;

		const zooms = wrapper.querySelectorAll('.remarked-primary-widget__zoom');
		for (var i = 0; i < zooms.length; i++) {
			zooms[i].addEventListener('click', function () {
				const activeZoom = +this.closest('.remarked-primary-widget__zooms').getAttribute('data-zoom');
				const event = this.getAttribute('data-event');
				let zoom = activeZoom;

				switch (event) {
					case 'minus':
						if (activeZoom > 0.5) zoom -= 0.1;
						break;
					case 'plus':
						if (activeZoom < 1.5) zoom += 0.1;
						break;
				}

				this.closest('.remarked-primary-widget__zooms').setAttribute('data-zoom', zoom.toFixed(1));
				wrapper.querySelector('.remarked-primary-widget__map').style.zoom = zoom.toFixed(1);
			})
		}

		let counterMap = 0;

		let customActiveRoom = 0;
		let addActive = false;
		if (parseInt(this.options.defaultRoomTabID) > 0 && this.options.defaultRoomTab === true) customActiveRoom = parseInt(this.options.defaultRoomTabID);

		for (const key in rooms) {
			if (Object.hasOwnProperty.call(rooms, key)) {
				const element = rooms[key];
				const { id, name } = element;

				if (this.excludeRooms.includes(id)) continue;

				const room = document.createElement('div');
				room.classList.add('remarked-primary-widget__room');
				room.setAttribute('id', 'r-room-' + id);

				const button = document.createElement('div');
				button.classList.add('remarked-primary-widget__tables-button');
				button.setAttribute('data-maps-id', '#r-room-' + id);
				button.textContent = name;
				button.addEventListener('click', (e) => this._handlerRoom(e));

				if (customActiveRoom > 0) {
					if (id == customActiveRoom) {
						room.classList.add('remarked-primary-widget__room--active');
						button.classList.add('remarked-primary-widget__tables-button--active');
						addActive = true;
					}
				} else {
					if (counterMap == 0) {
						room.classList.add('remarked-primary-widget__room--active');
						button.classList.add('remarked-primary-widget__tables-button--active');
						addActive = true;
					}
				}
				counterMap++;

				wrapper.querySelector('.remarked-primary-widget__map').append(room);
				wrapper.querySelector('.remarked-primary-widget__tables-buttons').append(button);
			}
		}

		if (!addActive) {
			const roomFirst = wrapper.querySelector('.remarked-primary-widget__room');
			const roomButtonFirst = wrapper.querySelector('.remarked-primary-widget__tables-button');
			if (roomFirst && roomButtonFirst) {
				roomFirst.classList.add('remarked-primary-widget__room--active');
				roomButtonFirst.classList.add('remarked-primary-widget__tables-button--active');
			}
		}

		if (interiors.length > 0) {
			interiors.forEach(item => {
				const interior = this._createInterior(item);
				const room_id = item.room_id;
				if (wrapper.querySelector(`.remarked-primary-widget__map #r-room-${room_id}`)) {
					wrapper.querySelector(`.remarked-primary-widget__map #r-room-${room_id}`).append(interior);
				}
			});
		}

		for (const key in tables) {
			if (Object.hasOwnProperty.call(tables, key)) {
				const element = tables[key];
				const { id, left, top, number, room_id, shape, capacity, time_slots, min_capacity, max_capacity, design_id, price } = element;
				if (+min_capacity === 0 && +max_capacity === 0) continue;
				if (this.excludeRooms.includes(room_id)) continue;

				let tableInfo = {
					id: id,
					left: left,
					top: top,
					number: number,
					shape: shape,
					capacity: capacity,
					min_capacity: min_capacity,
					max_capacity: max_capacity,
					design_id: design_id,
					price: price,
				}
				const svgTable = this._createTable(tableInfo, data);
				this._nameTables[id] = number;

				if (svgTable == false) continue;

				svgTable.addEventListener('click', (e) => {
					this._handlerTable(e);
				});
				wrapper.querySelector(`.remarked-primary-widget__map #r-room-${room_id}`).append(svgTable);

				time_slots.forEach(item => {
					const { timestamp, is_free } = item;
					let obj = {};
					obj[id] = is_free;
					this.stateTables[timestamp] = { ...this.stateTables[timestamp], ...obj };
				})
			}
		}

		this.modal.append(wrapper);
	}

	_createInterior(interior) {
		const { left_offset, top_offset, svg, id } = interior;
		const interiorHTML = document.createElement('div');
		interiorHTML.classList.add('remarked-primary-widget__interior');
		interiorHTML.getAttribute('data-interior-id', id);
		interiorHTML.innerHTML = svg;
		interiorHTML.style.left = left_offset + 'px';
		interiorHTML.style.top = top_offset + 'px';
		interiorHTML.style.position = 'absolute';
		return interiorHTML;
	}

	_createTable({ id, left, top, number, shape, capacity, min_capacity, max_capacity, design_id, price }, data) {
		if (!shape && !capacity) return false;

		if (shape === 'round' && capacity > 8) {
			capacity = 8;
		} else if (shape === 'square' && capacity > 10) {
			capacity = 10;
		}

		const table = document.createElement('div');
		table.classList.add('remarked-primary-widget__table');
		table.setAttribute('data-table-id', id);
		table.setAttribute('data-capacity', capacity);
		table.setAttribute('data-min-capacity', min_capacity);
		table.setAttribute('data-max-capacity', max_capacity);

		const svgTables = {
			round: {
				'1': '<svg width="53" height="54" viewBox="0 0 53 54" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M1.89807 34.5303L29.4201 34.5303C30.4684 34.5303 31.3182 33.0922 31.3182 31.3182L31.3182 21.6818C31.3182 19.9078 30.4684 18.4697 29.4201 18.4697L1.89807 18.4697C0.849792 18.4697 -4.44371e-06 19.9078 -4.5988e-06 21.6818L-5.44123e-06 31.3182C-5.59632e-06 33.0922 0.849791 34.5303 1.89807 34.5303Z" fill="#28C76F" fill-opacity="0.7"></path> <path d="M26.5 48.1818C38.4745 48.1818 48.1818 38.4745 48.1818 26.5C48.1818 14.5255 38.4745 4.81818 26.5 4.81818C14.5255 4.81818 4.81818 14.5255 4.81818 26.5C4.81818 38.4745 14.5255 48.1818 26.5 48.1818Z" fill="#28C76F"></path></svg>',
				'2': '<svg width="43" height="54" viewBox="0 0 43 54" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M29.8611 49.7685L29.8611 3.58333C29.8611 1.8242 28.4351 0.398148 26.6759 0.398148L17.1204 0.398148C15.3612 0.398148 13.9352 1.8242 13.9352 3.58333L13.9352 49.7685C13.9352 51.5276 15.3612 52.9537 17.1204 52.9537H26.6759C28.4351 52.9537 29.8611 51.5276 29.8611 49.7685Z" fill="#28C76F" fill-opacity="0.7"></path> <path d="M21.5 47.7778C33.3741 47.7778 43 38.1519 43 26.2778C43 14.4037 33.3741 4.77778 21.5 4.77778C9.62588 4.77778 0 14.4037 0 26.2778C0 38.1519 9.62588 47.7778 21.5 47.7778Z" fill="#28C76F"></path></svg>',
				'3': '<svg width="68" height="60" viewBox="0 0 68 60" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M45 49.7879V3.21212C45 1.43812 43.2091 0 41 0L29 0C26.7909 0 25 1.43812 25 3.21212L25 49.7879C25 51.5619 26.7909 53 29 53H41C43.2091 53 45 51.5619 45 49.7879Z" fill="#28C76F" fill-opacity="0.7"></path> <path d="M64.9816 40.1924L22.2846 14.4641C20.6584 13.4841 18.4157 14.2236 17.2755 16.1158L11.0821 26.394C9.94193 28.2862 10.336 30.6145 11.9623 31.5944L54.6593 57.3227C56.2855 58.3027 58.5282 57.5632 59.6683 55.671L65.8618 45.3928C67.0019 43.5006 66.6079 41.1723 64.9816 40.1924Z" fill="#28C76F" fill-opacity="0.7"></path> <path d="M13.6092 57.0767L52.9204 34.4284C54.4177 33.5657 54.7375 31.3147 53.6347 29.4005L47.6442 19.0027C46.5414 17.0885 44.4336 16.2361 42.9363 17.0987L3.62512 39.747C2.12781 40.6097 1.80801 42.8607 2.91082 44.7749L8.9013 55.1727C10.0041 57.0869 12.1119 57.9393 13.6092 57.0767Z" fill="#28C76F" fill-opacity="0.7"></path> <path d="M34 60C48.9117 60 61 47.9117 61 33C61 18.0883 48.9117 5.99999 34 5.99999C19.0883 5.99999 7.00003 18.0883 7.00003 33C7.00003 47.9117 19.0883 60 34 60Z" fill="#28C76F"></path></svg>',
				'4': '<svg width="66" height="67" viewBox="0 0 66 67" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M43.5 62.5L43.5 4.5C43.5 2.29086 41.7091 0.5 39.5 0.5L27.5 0.5C25.2909 0.5 23.5 2.29086 23.5 4.5L23.5 62.5C23.5 64.7091 25.2909 66.5 27.5 66.5H39.5C41.7091 66.5 43.5 64.7091 43.5 62.5Z" fill="#28C76F" fill-opacity="0.7"></path> <path d="M4 43L62 43C64.2091 43 66 41.2091 66 39L66 27C66 24.7909 64.2091 23 62 23L4 23C1.79086 23 1.59189e-06 24.7909 1.39876e-06 27L3.49691e-07 39C1.56562e-07 41.2091 1.79086 43 4 43Z" fill="#28C76F" fill-opacity="0.7"></path> <path class="desk-one__svg-table" d="M33 60C47.9117 60 60 47.9117 60 33C60 18.0883 47.9117 6 33 6C18.0883 6 6 18.0883 6 33C6 47.9117 18.0883 60 33 60Z" fill="#28C76F"></path></svg>',
				'5': '<svg width="88" height="83" viewBox="0 0 88 83" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M57 62.8571L57 3.14284C57 1.40709 55.2091 -1.52588e-05 53 -1.52588e-05L34 -1.52588e-05C31.7909 -1.52588e-05 30 1.40709 30 3.14284L30 62.8571C30 64.5929 31.7909 66 34 66H53C55.2091 66 57 64.5929 57 62.8571Z" fill="#28C76F" fill-opacity="0.7"></path><path d="M29.0088 80.0034L61.9533 37.8436C62.911 36.6181 62.2761 34.5219 60.5354 33.1617L45.5642 21.4629C43.8235 20.1027 41.636 19.9935 40.6784 21.2189L7.73392 63.3788C6.7763 64.6043 7.41113 66.7004 9.15184 68.0607L24.1231 79.7595C25.8638 81.1197 28.0512 81.2289 29.0088 80.0034Z" fill="#28C76F" fill-opacity="0.7"></path><path d="M80.8358 58.1926L35.7773 16.2096C34.4676 14.9893 32.185 15.3103 30.679 16.9265L17.7268 30.8276C16.2208 32.4439 16.0618 34.7434 17.3715 35.9638L62.43 77.9468C63.7398 79.1671 66.0224 78.8462 67.5283 77.2299L80.4806 63.3288C81.9865 61.7125 82.1456 59.413 80.8358 58.1926Z" fill="#28C76F" fill-opacity="0.7"></path><path d="M58.2686 32.9724L11.2308 16.8486C9.86348 16.3799 8.17437 17.6941 7.45803 19.7839L1.29705 37.7572C0.580709 39.847 1.1084 41.9211 2.47568 42.3897L49.5135 58.5135C50.8808 58.9822 52.5699 57.6681 53.2862 55.5783L59.4472 37.6049C60.1636 35.5151 59.6359 33.4411 58.2686 32.9724Z" fill="#28C76F" fill-opacity="0.7"></path><path d="M41.1116 58.9071L85.4155 37.4254C86.7033 36.801 86.966 34.6833 86.0021 32.6955L77.7126 15.5992C76.7488 13.6114 74.9235 12.5062 73.6357 13.1306L29.3318 34.6123C28.044 35.2367 27.7813 37.3543 28.7452 39.3421L37.0347 56.4384C37.9985 58.4262 39.8238 59.5315 41.1116 58.9071Z" fill="#28C76F" fill-opacity="0.7"></path><path d="M43 77C62.3299 77 78 61.3299 78 42C78 22.67 62.3299 6.99998 43 6.99998C23.67 6.99998 7.99996 22.67 7.99996 42C7.99996 61.3299 23.67 77 43 77Z" fill="#28C76F"></path></svg>',
				'6': '<svg width="87" height="84" viewBox="0 0 87 84" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M56.6646 80L56.6646 4C56.6646 1.79086 54.8737 0 52.6646 0L33.6646 0C31.4554 0 29.6646 1.79086 29.6646 4L29.6646 80C29.6646 82.2091 31.4554 84 33.6646 84H52.6646C54.8737 84 56.6646 82.2091 56.6646 80Z" fill="#28C76F" fill-opacity="0.7"></path><path d="M16.8698 72.5751L82.8556 34.8673C84.7736 33.7712 85.4399 31.3278 84.3439 29.4098L74.9169 12.9133C73.8209 10.9953 71.3774 10.3289 69.4594 11.425L3.47358 49.1327C1.55553 50.2288 0.889189 52.6722 1.98526 54.5903L11.4122 71.0867C12.5083 73.0048 14.9517 73.6711 16.8698 72.5751Z" fill="#28C76F" fill-opacity="0.7"></path><path d="M82.856 49.1299L16.8676 11.4268C14.9495 10.3308 12.5061 10.9973 11.4102 12.9155L1.98438 29.4126C0.888438 31.3307 1.55495 33.7741 3.47308 34.87L69.4615 72.5732C71.3796 73.6691 73.823 73.0026 74.9189 71.0845L84.3447 54.5874C85.4407 52.6693 84.7742 50.2259 82.856 49.1299Z" fill="#28C76F" fill-opacity="0.7"></path><path d="M42.6646 77C61.9945 77 77.6646 61.33 77.6646 42C77.6646 22.67 61.9945 7 42.6646 7C23.3346 7 7.66455 22.67 7.66455 42C7.66455 61.33 23.3346 77 42.6646 77Z" fill="#28C76F"></path></svg>',
				'7': '<svg width="84" height="84" viewBox="0 0 84 84" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M49.3354 80L49.3354 4C49.3354 1.79086 48.3405 0 47.1132 0L36.5577 0C35.3304 0 34.3354 1.79086 34.3354 4L34.3354 80C34.3354 82.2091 35.3304 84 36.5577 84H47.1132C48.3405 84 49.3354 82.2091 49.3354 80Z" fill="#28C76F" fill-opacity="0.7"></path><path d="M74.0088 63.5668L20.2687 9.82664C18.7066 8.26454 16.7367 7.70173 15.8689 8.56956L8.40501 16.0335C7.53718 16.9013 8.09999 18.8711 9.66209 20.4332L63.4022 74.1734C64.9643 75.7355 66.9341 76.2983 67.802 75.4304L75.2659 67.9665C76.1337 67.0987 75.5709 65.1289 74.0088 63.5668Z" fill="#28C76F" fill-opacity="0.7"></path><path d="M63.4022 9.82665L9.66209 63.5668C8.09999 65.1289 7.53718 67.0987 8.40501 67.9665L15.8689 75.4304C16.7367 76.2983 18.7066 75.7355 20.2687 74.1734L74.0088 20.4332C75.5709 18.8712 76.1337 16.9013 75.2659 16.0335L67.802 8.56957C66.9341 7.70174 64.9643 8.26455 63.4022 9.82665Z" fill="#28C76F" fill-opacity="0.7"></path><path d="M2.85714 50L57.1429 50C58.7208 50 60 49.0051 60 47.7778V37.2222C60 35.9949 58.7208 35 57.1429 35L2.85714 35C1.27919 35 0 35.9949 0 37.2222V47.7778C0 49.0051 1.27919 50 2.85714 50Z" fill="#28C76F" fill-opacity="0.7"></path><path d="M42 77C61.33 77 77 61.33 77 42C77 22.67 61.33 7 42 7C22.67 7 7 22.67 7 42C7 61.33 22.67 77 42 77Z" fill="#28C76F"></path>svg>',
				'8': '<svg width="84" height="84" viewBox="0 0 84 84" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M49.5 80L49.5 4C49.5 1.79086 48.5051 0 47.2778 0L36.7222 0C35.4949 0 34.5 1.79086 34.5 4L34.5 80C34.5 82.2091 35.4949 84 36.7222 84H47.2778C48.5051 84 49.5 82.2091 49.5 80Z" fill="#28C76F" fill-opacity="0.7"></path><path d="M74.1734 63.5668L20.4333 9.82664C18.8712 8.26454 16.9013 7.70173 16.0335 8.56956L8.56957 16.0335C7.70174 16.9013 8.26456 18.8711 9.82665 20.4332L63.5668 74.1734C65.1289 75.7355 67.0987 76.2983 67.9665 75.4304L75.4304 67.9665C76.2983 67.0987 75.7355 65.1289 74.1734 63.5668Z" fill="#28C76F" fill-opacity="0.7"></path><path d="M63.5667 9.82665L9.82663 63.5668C8.26453 65.1289 7.70172 67.0987 8.56955 67.9665L16.0335 75.4304C16.9013 76.2983 18.8711 75.7355 20.4332 74.1734L74.1733 20.4332C75.7354 18.8712 76.2983 16.9013 75.4304 16.0335L67.9665 8.56957C67.0987 7.70174 65.1288 8.26455 63.5667 9.82665Z" fill="#28C76F" fill-opacity="0.7"></path><path d="M4 49.5L80 49.5C82.2091 49.5 84 48.5051 84 47.2778V36.7222C84 35.4949 82.2091 34.5 80 34.5L4 34.5C1.79086 34.5 0 35.4949 0 36.7222V47.2778C0 48.5051 1.79086 49.5 4 49.5Z" fill="#28C76F" fill-opacity="0.7"></path><path d="M42.1646 77C61.4945 77 77.1646 61.33 77.1646 42C77.1646 22.67 61.4945 7 42.1646 7C22.8346 7 7.16455 22.67 7.16455 42C7.16455 61.33 22.8346 77 42.1646 77Z" fill="#28C76F"></path></svg>'
			},
			square: {
				'1': '<svg width="53" height="54" viewBox="0 0 53 54" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.89807 34.5303L29.4201 34.5303C30.4684 34.5303 31.3182 33.0922 31.3182 31.3182L31.3182 21.6818C31.3182 19.9078 30.4684 18.4697 29.4201 18.4697L1.89807 18.4697C0.849792 18.4697 -4.44371e-06 19.9078 -4.5988e-06 21.6818L-5.44123e-06 31.3182C-5.59632e-06 33.0922 0.849791 34.5303 1.89807 34.5303Z" fill="#28C76F" fill-opacity="0.7"></path><rect x="5" y="5" width="43" height="43" rx="5" fill="#28C76F"></rect></svg>',
				'2': '<svg width="43" height="54" viewBox="0 0 43 54" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M29.8611 49.7685L29.8611 3.58333C29.8611 1.8242 28.4351 0.398148 26.6759 0.398148L17.1204 0.398148C15.3612 0.398148 13.9352 1.8242 13.9352 3.58333L13.9352 49.7685C13.9352 51.5276 15.3612 52.9537 17.1204 52.9537H26.6759C28.4351 52.9537 29.8611 51.5276 29.8611 49.7685Z" fill="#28C76F" fill-opacity="0.7"></path><rect y="5" width="43" height="43" rx="5" fill="#28C76F"></rect></svg>',
				'3': '<svg width="66" height="67" viewBox="0 0 66 67" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M44 36.6364V2.36364C44 1.05824 42.2091 0 40 0L28 0C25.7909 0 24 1.05824 24 2.36364L24 36.6364C24 37.9418 25.7909 39 28 39H40C42.2091 39 44 37.9418 44 36.6364Z" fill="#28C76F" fill-opacity="0.7"></path><path d="M4 43L62 43C64.2091 43 66 41.2091 66 39L66 27C66 24.7909 64.2091 23 62 23L4 23C1.79086 23 1.59189e-06 24.7909 1.39876e-06 27L3.49691e-07 39C1.56562e-07 41.2091 1.79086 43 4 43Z" fill="#28C76F" fill-opacity="0.7"></path><rect x="7" y="7" width="53" height="53" rx="5" fill="#28C76F"></rect></svg>',
				'4': '<svg width="66" height="67" viewBox="0 0 66 67" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M43.5 62.5L43.5 4.5C43.5 2.29086 41.7091 0.5 39.5 0.5L27.5 0.5C25.2909 0.5 23.5 2.29086 23.5 4.5L23.5 62.5C23.5 64.7091 25.2909 66.5 27.5 66.5H39.5C41.7091 66.5 43.5 64.7091 43.5 62.5Z" fill="#28C76F" fill-opacity="0.7"></path><path d="M4 43L62 43C64.2091 43 66 41.2091 66 39L66 27C66 24.7909 64.2091 23 62 23L4 23C1.79086 23 1.59189e-06 24.7909 1.39876e-06 27L3.49691e-07 39C1.56562e-07 41.2091 1.79086 43 4 43Z" fill="#28C76F" fill-opacity="0.7"></path><rect x="7" y="7" width="53" height="53" rx="5" fill="#28C76F"></rect></svg>',
				'5': '<svg width="90" height="90" viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg" class="default-svg-table"> <rect y="50" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect> <rect y="19" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect> <rect x="35" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect> <rect x="70" y="35" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect> <rect class="desk-one__svg-table" x="10" y="10" width="70" height="70" rx="5" fill="#28C76F"></rect><rect opacity="0" class="desk-one__svg-stroke" x="9" y="9" width="72" height="72" rx="5.5" stroke="black"></rect><rect opacity="0" class="desk-one__svg-stroke-double" x="4" y="3" width="83" height="83" rx="5.5" stroke="black"></rect> <rect x="35.3474" y="70" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect></svg>',
				'6': '<svg width="90" height="90" viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg"><rect y="50" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect><rect y="19" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect><rect x="20" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect><rect x="51" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect><rect x="70" y="35" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect><rect x="35" y="70" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect><rect x="10" y="10" width="70" height="70" rx="5" fill="#28C76F"></rect></svg>',
				'7': '<svg width="91" height="90" viewBox="0 0 91 90" fill="none" xmlns="http://www.w3.org/2000/svg"><rect y="50" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect><rect y="19" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect><rect x="20" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect><rect x="51" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect><rect x="71" y="19" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect><rect x="71" y="50" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect><rect x="35" y="70" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect><rect x="10" y="10" width="70" height="70" rx="5" fill="#28C76F"></rect></svg>',
				'8': '<svg width="91" height="90" viewBox="0 0 91 90" fill="none" xmlns="http://www.w3.org/2000/svg"><rect y="50" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect> <rect y="19" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect> <rect x="20" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect> <rect x="51" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect> <rect x="71" y="19" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect> <rect x="71" y="50" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect> <rect x="20" y="70" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect> <rect x="51" y="70" width="20" height="20" rx="5" fill="#28C76F" fill-opacity="0.7"></rect> <rect x="10" y="10" width="70" height="70" rx="5" fill="#28C76F"></rect></svg>',
				'10': '<svg width="210" height="105" viewBox="0 0 210 105" fill="none" xmlns="http://www.w3.org/2000/svg" class="default-svg-table"><rect x="25" y="7" width="20" height="90" rx="4" fill="#28C76F" fill-opacity="0.7"></rect><rect x="60" y="7" width="20" height="90" rx="4" fill="#28C76F" fill-opacity="0.7"></rect><rect x="95" y="7" width="20" height="90" rx="4" fill="#28C76F" fill-opacity="0.7"></rect><rect x="130" y="7" width="20" height="90" rx="4" fill="#28C76F" fill-opacity="0.7"></rect><rect x="165" y="7" width="20" height="90" rx="4" fill="#28C76F" fill-opacity="0.7"></rect><rect class="desk-one__svg-table" x="15" y="22" width="180" height="60" rx="4" fill="#28C76F"></rect><rect opacity="0" class="desk-one__svg-stroke" x="14" y="21" width="182" height="62" rx="4" stoke="black"></rect><rect opacity="0" class="desk-one__svg-stroke-double" x="9" y="15" width="192" height="72" rx="4" stoke="black"></rect></svg>'
			}
		}

		if (!svgTables[shape][capacity]) return false;
		let svgNewDesign = data?.design[design_id]?.svg ? data?.design[design_id]?.svg : false;

		const showPrice = this?.settings?.showPrice;
		const valuta = this?.settings?.valuta ? this?.settings?.valuta : 'â½';

		table.innerHTML = `
			${svgNewDesign ? svgNewDesign : svgTables[shape][capacity]}
			<div class="remarked-primary-widget__table-num">${number}</div>
			${showPrice && price ? `<div class="remarked-primary-widget__table-price">${price.toLocaleString()} ${valuta}</div>` : ''}
		`;

		table.style.top = top + 'px';
		table.style.left = left + 'px';

		return table;
	}

	_handlerRoom(e) {
		if (e.target.classList.contains('remarked-primary-widget__tables-button--active')) return;
		let id = e.target.getAttribute('data-maps-id');
		this.modal.querySelector('.remarked-primary-widget__room--active').classList.remove('remarked-primary-widget__room--active');
		this.modal.querySelector('.remarked-primary-widget__tables-button--active').classList.remove('remarked-primary-widget__tables-button--active');
		this.modal.querySelector(`${id}`).classList.add('remarked-primary-widget__room--active');
		e.target.classList.add('remarked-primary-widget__tables-button--active');
		if (this.options.showSlotsByRoom && this.slots && this.slots.length) {
			this.widget.renderSlots(this.slots)
		}
	}

	_handlerTable(e) {
		let table = e.target.closest('.remarked-primary-widget__table');
		let id = table.getAttribute('data-table-id');
		let capacity = +table.getAttribute('data-capacity');

		//useBundels
		if (this.settings?.useBundels && this.bundels) {
			if (table.classList.contains('remarked-primary-widget__table--busy')) return;
			this.stateActiveTables = {};
			this._removeActiveTables();
			if (!table.classList.contains('remarked-primary-widget__table--active')) {
				let bundel = null;

				for(const b of this.bundels) {
					if (b.includes(parseInt(id))) {
						bundel = b;
						break;
					}
				}

				if (bundel) {
					for(const tableID of bundel) {
						const tableBundle = this.modal.querySelector('.remarked-primary-widget__table[data-table-id="'+tableID+'"]');
						tableBundle.classList.add('remarked-primary-widget__table--active');
						this.stateActiveTables[tableID] = {
							tableID,
							capacity: +tableBundle.getAttribute('data-capacity'),
						};
					}
				} else {
					table.classList.add('remarked-primary-widget__table--active');
					this.stateActiveTables[id] = {
						id,
						capacity,
					};
				}

			}
			this.modal.querySelector('input[name="tables-widget"]').value = JSON.stringify(Object.keys(this.stateActiveTables));
			return;
		}
		//useBundels

		if (table.classList.contains('remarked-primary-widget__table--busy') || table.classList.contains('remarked-primary-widget__table--active')) {
			if (table.classList.contains('remarked-primary-widget__table--active')) {
				table.classList.remove('remarked-primary-widget__table--active');
				delete this.stateActiveTables[id];

				if (this.options.oneGuestOneTable) {
					let adultGuestsCount = parseInt(this.modal.querySelector('#remarked-primary-widget__qty').value);
					if ((adultGuestsCount - 1) > 0) {
						this.modal.querySelector('#remarked-primary-widget__qty').value = adultGuestsCount - 1;
					}
				}
			}
		} else {
			if (this.settings) {
				const settings = this.settings;
				const max_tables = settings.max_tables ? settings.max_tables : null;
				if (max_tables) {
					const { title, text, count } = max_tables;
					const stateCount = Object.keys(this.stateActiveTables);
					if (count <= stateCount.length) {
						if (title && text) {
							this._modal(title, text);
						} else {
							this._modal(this.t.errorTitle, this.t.maxTablesSelected);
						}
						return false;
					}
				}
			}

			try {
				if (this.settings && !this.settings.max_tables && !this.options.oneGuestOneTable) {
					let adultGuestsCount = this.modal.querySelector('#remarked-primary-widget__qty').value;
					let childrenCount = this.options.children ? this.modal.querySelector('#remarked-primary-widget__children-qty').value : 0;

					const guestsCount = +(Number(adultGuestsCount) + Number(childrenCount));
					let maxCapacity = 0;

					if (Object.keys(this.stateActiveTables).length) {
						for (const key in this.stateActiveTables) {
							if (Object.hasOwnProperty.call(this.stateActiveTables, key)) {
								const element = this.stateActiveTables[key];
								maxCapacity += +element.capacity;
							}
						}
					}

					if (guestsCount <= maxCapacity && maxCapacity) {
						this._modal(this.t.errorTitle, this.t.maxTablesSelected);
						return;
					}
				}
			} catch (error) {
				console.error(error);
			}

			if (this.options.oneGuestOneTable) {
				let adultGuestsCount = parseInt(this.modal.querySelector('#remarked-primary-widget__qty').value);

				if (Object.keys(this.stateActiveTables).length > 0) {
					if (adultGuestsCount >= this.options.qtyMax) return;
					if ((adultGuestsCount + 1) > this.options.qtyMax) return;

					this.modal.querySelector('#remarked-primary-widget__qty').value = adultGuestsCount + 1;
				}

			}

			table.classList.add('remarked-primary-widget__table--active');
			this.stateActiveTables[id] = {
				id,
				capacity,
			};
		}
		this.modal.querySelector('input[name="tables-widget"]').value = JSON.stringify(Object.keys(this.stateActiveTables));
	}

	_removeBusyTables() {
		let busy = this.modal.querySelectorAll('.remarked-primary-widget__table--busy');
		for (let i = 0; i < busy.length; i++) {
			let table = busy[i];
			table.classList.remove('remarked-primary-widget__table--busy');
		}
	}

	_removeActiveTables() {
		let active = this.modal.querySelectorAll('.remarked-primary-widget__table--active');
		for (let i = 0; i < active.length; i++) {
			let table = active[i];
			table.classList.remove('remarked-primary-widget__table--active');
		}
	}

	logger() {
		console.log(new Date());
	}

	_modal(title, text) {
		let modal = document.createElement('div');
		modal.classList.add('__notice-modal');

		let overlay = document.createElement('div');
		overlay.classList.add('__notice-overlay');

		modal.innerHTML = `
			<div class="__title">${title}</div>
			<div class="__content">${text}</div>
		`;

		overlay.innerHTML = `
			<div class="__close">
				<svg width="23px" height="23px" viewBox="0 0 23 23" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"> <g stroke="none" stroke-width="1" fill="#f07048" fill-rule="evenodd"> <rect transform="translate(11.313708, 11.313708) rotate(-45.000000) translate(-11.313708, -11.313708) " x="10.3137085" y="-3.6862915" width="2" height="30"></rect> <rect transform="translate(11.313708, 11.313708) rotate(-315.000000) translate(-11.313708, -11.313708) " x="10.3137085" y="-3.6862915" width="2" height="30"></rect></g></svg>
			</div>
		`;

		//modal.querySelector('.__close').addEventListener('click', () => overlay.remove());
		overlay.addEventListener('click', () => {
			overlay.classList.add('remarked-primary-widget--none');
			modal.classList.add('remarked-primary-widget')
			setTimeout(() => overlay.remove(), 450);
		});

		overlay.append(modal);
		this.modal.append(overlay);
	}

	_formatDate(date) {
		let dd = date.getDate();
		if (dd < 10) dd = '0' + dd;

		let mm = date.getMonth() + 1;
		if (mm < 10) mm = '0' + mm;

		let yy = date.getFullYear();
		if (yy < 10) yy = '0' + yy;

		return yy + '-' + mm + '-' + dd;
	}

	init() {
		//console.log('...start');
		//this._createRoomMaps();
	}

}

