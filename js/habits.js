// Scheduled habit progress is authoritative in Supabase; previews never award currency.
const HabitProgress = {
    ready: false,
    installed: false,
    busy: false,
    rulesReady: false,
    deleteAvailableAt: null,
    clockOffset: 0,
    text(es, en) { return I18N.current === 'en' ? en : es; },
    presets: {
        hab_water: { initial: 2, max: 3, step: 1, required: 7, unit: 'liters' },
        hab_sleep: { initial: 5, max: 8, step: 1, required: 7, unit: 'hours' },
        hab_read: { initial: 5, max: 30, step: 5, required: 7, unit: 'pages' },
        hab_cardio: { initial: 10, max: 40, step: 10, required: 7, unit: 'minutes' },
        hab_meditate: { initial: 5, max: 20, step: 5, required: 7, unit: 'minutes' },
        hab_code: { initial: 15, max: 60, step: 15, required: 7, unit: 'minutes' }
    },
    fromRow(h) {
        return { ...h, xpReward: h.rewards?.xp ?? h.xp_reward, goldReward: h.rewards?.gold ?? h.gold_reward,
            hpPenalty: h.hp_penalty, completedAt: h.completed_at ? new Date(h.completed_at).getTime() : null };
    },
    syncAvatar(a) {
        if (!a) return;
        rememberAvatarBalance(a);
        for (const [key, column] of Object.entries({ currentXP: 'current_xp', xpToLevel: 'xp_to_level', gold: 'gold', hp: 'hp', maxHp: 'max_hp', level: 'level', isDead: 'is_dead', gameRevision: 'game_revision' })) {
            if (a[column] !== undefined) GameState.avatar[key] = a[column];
        }
    },
    syncRules(data) {
        this.rulesReady = data.rules_version >= 2;
        this.deleteAvailableAt = data.delete_available_at || null;
        this.clockOffset = data.server_now ? Date.parse(data.server_now) - Date.now() : 0;
    },
    deleteRemaining() { return Math.max(0, Date.parse(this.deleteAvailableAt || 0) - (Date.now() + this.clockOffset)) || 0; },
    managementNotice() {
        if (!this.rulesReady) return this.text('Los hábitos están temporalmente en mantenimiento. Tus datos se conservan.', 'Habits are temporarily undergoing maintenance. Your data is preserved.');
        const rule = this.text('Puedes eliminar un hábito cada 24 horas. Reactivarlo no permite cobrar otra vez el mismo período.', 'You can delete one habit every 24 hours. Reactivating it cannot earn another reward for the same period.');
        if (!this.deleteRemaining()) return rule;
        const date = new Intl.DateTimeFormat(I18N.current === 'en' ? 'en-US' : 'es-MX', {dateStyle:'short',timeStyle:'short'}).format(new Date(this.deleteAvailableAt));
        return rule + this.text(' Próxima eliminación disponible: ', ' Next deletion available: ') + date + '.';
    },
    async load() {
        const uid = GameState.user?.id;
        this.ready = false;
        try {
            const { data, error } = await supabase.rpc('habit_action', { p_action: 'list' });
            if (uid !== GameState.user?.id) return;
            if (error || !Array.isArray(data?.habits)) return;
            this.ready = true;
            this.syncRules(data);
            this.syncAvatar(data.avatar);
            GameState.habits = data.habits.map(h => this.fromRow(h));
            this.dayStamp = this.stamp();
            const catalog = await supabase.from('habit_catalog').select('definition');
            if (uid !== GameState.user?.id) return;
            const definitions = (catalog.data || []).map(row => row.definition).filter(row => row?.id && row?.title);
            if (!catalog.error && definitions.length) GameState.presetCatalog = definitions;
        } catch (_) { /* Keep legacy habits visible before the migration. */ }
    },
    async act(action, id, config = {}, value = null, period = null) {
        if (!this.ready || this.busy || App.shopBusy || Atelier.busy) return null;
        if (action !== 'list' && !this.rulesReady) { App.showToast(this.managementNotice(), 'error'); return null; }
        this.busy = true;
        const uid = GameState.user?.id;
        try {
            return await queueAvatarWrite(async () => {
                if (uid !== GameState.user?.id) return null;
                const { data, error } = await supabase.rpc('habit_action', { p_action: action, p_id: id || null, p_config: config, p_value: value, p_expected_period: period });
                if (uid !== GameState.user?.id) return null;
                if (error || !Array.isArray(data?.habits)) throw error || new Error('Invalid response');
                this.syncAvatar(data.avatar);
                this.syncRules(data);
                GameState.habits = data.habits.map(h => this.fromRow(h));
                this.dayStamp = this.stamp();
                return data;
            });
        } catch (_) {
            App.showToast(this.text('No se pudo guardar. Revisa la conexión y vuelve a intentarlo.', 'Could not save. Check your connection and try again.'), 'error');
            return null;
        } finally { this.busy = false; }
    },
    unit(unit) { return ({ liters: this.text('litros', 'liters'), hours: this.text('horas', 'hours'), minutes: this.text('minutos', 'minutes'), pages: this.text('páginas', 'pages'), units: this.text('veces', 'times') })[unit] || ''; },
    preset(item) {
        const key = item.catalog_id || item.id;
        return this.presets[key] || this.presets[GameState.presetCatalog.find(p => p.title === item.title)?.id];
    },
    title(item, target = item.current_target, unit = item.progression?.unit) {
        if (target == null || !Number.isFinite(Number(target))) return item.title;
        const id = item.catalog_id || (this.presets[item.id] ? item.id : GameState.presetCatalog.find(p => p.title === item.title)?.id);
        const amount = new Intl.NumberFormat(I18N.current === 'en' ? 'en-US' : 'es-MX', {maximumFractionDigits:3}).format(Number(target));
        const titles = {
            hab_water: this.text(`Beber ${amount} litros de agua`, `Drink ${amount} liters of water`),
            hab_read: this.text(`Leer ${amount} páginas de un libro`, `Read ${amount} pages of a book`),
            hab_sleep: this.text(`Dormir ${amount} horas`, `Sleep ${amount} hours`),
            hab_cardio: this.text(`Hacer ${amount} minutos de cardio`, `Do ${amount} minutes of cardio`),
            hab_meditate: this.text(`Meditar ${amount} minutos`, `Meditate for ${amount} minutes`),
            hab_code: this.text(`Estudiar programación ${amount} minutos`, `Study programming for ${amount} minutes`)
        };
        return titles[id] || item.title;
    },
    catalogTitle(item) { const p = this.preset(item); return p && item.type === 'positive' ? this.title(item,p.initial,p.unit) : item.title; },
    rewardText(item, growing = false) {
        if (item.type === 'negative') return this.text(`−${item.hpPenalty} de vida si ocurre`, `−${item.hpPenalty} health if it happens`);
        const xp = growing ? 10 : item.xpReward, gold = growing ? 5 : item.goldReward;
        return this.text(`+${xp} XP · +${gold} monedas`, `+${xp} XP · +${gold} coins`);
    },
    configExample(p) {
        const amount = value => `${new Intl.NumberFormat(I18N.current === 'en' ? 'en-US' : 'es-MX', {maximumFractionDigits:3}).format(value)} ${this.unit(p.unit)}`;
        if (p.max < p.initial || ![p.initial,p.max,p.step].every(v => Number.isFinite(v) && v > 0)) return this.text('Elige cantidades mayores que cero. La meta final no puede ser menor que la del inicio.', 'Choose amounts above zero. Your final goal cannot be smaller than your starting goal.');
        if (p.initial === p.max) return this.text(`Tu meta será ${amount(p.initial)}. Ya está en el límite que elegiste y no aumentará.`, `Your goal will be ${amount(p.initial)}. It is already at your chosen limit and will not increase.`);
        return this.text(`Empiezas con ${amount(p.initial)}. Al cumplir tu meta 7 veces seguidas, sube a ${amount(Math.min(p.max,p.initial+p.step))}. Nunca pasará de ${amount(p.max)}.`, `Start with ${amount(p.initial)}. After meeting your goal 7 times in a row, it grows to ${amount(Math.min(p.max,p.initial+p.step))}. It will never exceed ${amount(p.max)}.`);
    },
    previewCatalog(id) {
        const root = document.getElementById(`config-${id}`), item = GameState.presetCatalog.find(p => p.id === id) || GameState.habits.find(h => h.id === id);
        if (!root || !item) return;
        const enabled = root.querySelector('[data-progress="enabled"]').checked;
        const fields = root.querySelector('fieldset');
        fields.disabled = !enabled; fields.hidden = !enabled;
        const p = {unit:this.preset(item).unit};
        for (const key of ['initial','max','step']) p[key] = Number(root.querySelector(`[data-progress="${key}"]`).value);
        root.querySelector('.habit-config-example').textContent = enabled ? this.configExample(p) : this.text('Usarás la meta del título. Se mantendrá igual y seguirás ganando premios al completarla.', 'Use the goal in the title. It stays the same and you still earn rewards for completing it.');
        const card = root.closest('.catalog-card');
        if (card) {
            card.querySelector('.catalog-card-title').textContent = enabled && p.initial > 0 ? this.title(item,p.initial,p.unit) : item.title;
            card.querySelector('[data-habit-reward]').textContent = this.rewardText(item,enabled);
        }
    },
    availabilityText(h) {
        if (!this.rulesReady) return this.managementNotice();
        if (h.recorded && h.type === 'negative') return this.text('Este incumplimiento ya quedó registrado.', 'This setback has already been recorded.');
        if (h.recorded) return this.text(h.frequency === 'weekly' ? 'Ya completaste este hábito esta semana.' : 'Ya completaste este hábito hoy.', h.frequency === 'weekly' ? 'You completed this habit this week.' : 'You completed this habit today.');
        if (!h.period) return this.text('Hoy es día de descanso para este hábito. Disponible: ', 'Today is a rest day for this habit. Scheduled: ') + this.frequency(h.frequency) + '.';
        if (h.available_after && Date.now() < Date.parse(h.available_after)) {
            const date = new Intl.DateTimeFormat(I18N.current === 'en' ? 'en-US' : 'es-MX', {dateStyle:'short',timeStyle:'short'}).format(new Date(h.available_after));
            return this.text('Ya lo completaste recientemente. Podrás volver a marcarlo el ', 'You completed it recently. Available again on ') + date + '.';
        }
        return '';
    },
    stamp() { return (this.deleteRemaining() > 0 ? 'locked:' : 'open:') + GameState.habits.map(h => new Intl.DateTimeFormat('en-CA', {timeZone:h.habit_timezone || 'UTC'}).format(new Date()) + ':' + (!h.available_after || Date.now() >= Date.parse(h.available_after))).join('|'); },
    async refreshDay() {
        if(!this.ready || this.busy || GameState.currentBattle || !GameState.user || document.hidden || this.stamp()===this.dayStamp) return;
        const result=await this.act('list');
        if(result && ['dashboard','habits'].includes(GameState.currentView)) App.navigate(GameState.currentView);
    },
    frequency(value) { return ({ daily: this.text('Todos los días', 'Every day'), workdays: this.text('Lunes a viernes', 'Monday to Friday'), '3x_week': this.text('Lunes, miércoles y viernes', 'Monday, Wednesday and Friday'), '2x_week': this.text('Martes y jueves', 'Tuesday and Thursday'), weekly: this.text('Una vez por semana · lunes a domingo', 'Once a week · Monday to Sunday') })[value] || value; },
    available(h) { return this.rulesReady && !!h.period && !h.recorded && (!h.available_after || Date.now() >= Date.parse(h.available_after)); },
    card(h, management = false) {
        const t = this.text.bind(this), esc = Views.escape;
        const p = h.progression, done = h.recorded, available = this.available(h), positive = h.type === 'positive';
        const catalog = GameState.presetCatalog.find(item => item.id === h.catalog_id || item.title === h.title);
        const icon = catalog?.icon || (positive ? '🌱' : '🧭');
        const max = p && Number(h.current_target) >= p.max;
        const next = p ? Math.min(p.max, Number(h.current_target) + p.step) : null;
        const bonusPaid = p && h.difficulty_level + 1 <= h.rewarded_level;
        const fixedLabel = t(h.frequency === 'weekly' ? 'Tu meta de esta semana' : 'Tu meta de hoy', h.frequency === 'weekly' ? 'Your goal this week' : 'Your goal today');
        return `<article class="card habit-progress-card ${done ? 'completed' : ''} ${positive ? 'positive' : 'negative'}" data-progress-habit="${esc(h.id)}">
            <div class="habit-progress-heading"><span class="habit-symbol" aria-hidden="true">${esc(icon)}</span><div class="habit-heading-copy"><h3>${esc(this.title(h))}</h3><p class="habit-schedule">${this.frequency(h.frequency)}</p></div><span class="habit-kind">${p ? `${t('NIVEL', 'LEVEL')} ${h.difficulty_level}` : positive ? t('Meta fija', 'Fixed goal') : t('A evitar', 'To avoid')}</span></div>
            <p class="habit-instruction">${p && !this.preset(h) ? `<strong>${t('Tu meta', 'Your goal')}: ${h.current_target} ${this.unit(p.unit)}.</strong> ` : ''}${positive ? t('Cuando lo logres, pulsa Marcar completado. ¡También cuenta si haces más!', 'When you reach your goal, tap Mark completed. Doing more counts too!') : t('Regístralo solo si ocurrió. Así puedes reconocer qué mejorar.', 'Log this only if it happened. It helps you see what to work on.')}</p>
            ${p ? `<div class="habit-progress-meter"><div class="habit-meter-label"><label for="habit-meter-${esc(h.id)}">${max ? t('¡Llegaste al último nivel!', 'You reached the final level!') : t(`Camino al nivel ${h.difficulty_level+1}`, `On the way to level ${h.difficulty_level+1}`)}</label><strong>${max ? '7/7' : `${h.progress_count}/7`}</strong></div><progress id="habit-meter-${esc(h.id)}" max="7" value="${max ? 7 : h.progress_count}" aria-label="${max ? t('Último nivel alcanzado', 'Final level reached') : t('Progreso al siguiente nivel', 'Progress to next level')}"></progress>
                <p>${max ? t('Sigue cumpliendo esta meta para ganar premios.', 'Keep meeting this goal to earn rewards.') : t(`Completa tu meta 7 veces seguidas para llegar a ${next} ${this.unit(p.unit)}.`, `Meet your goal 7 times in a row to reach ${next} ${this.unit(p.unit)}.`)}</p></div>` : positive ? `<div class="habit-progress-meter habit-fixed-meter"><div class="habit-meter-label"><label for="habit-meter-${esc(h.id)}">${fixedLabel}</label><strong>${done ? t('¡Lista!', 'Done!') : !h.period ? t('Descanso', 'Rest day') : t('Pendiente', 'Not yet')}</strong></div><progress id="habit-meter-${esc(h.id)}" max="1" value="${done ? 1 : 0}"></progress><p>${t('Esta meta se mantiene igual. También ganas premios al completarla.', 'This goal stays the same. You still earn rewards for completing it.')}</p></div>` : ''}
            <div class="habit-reward-row"><span class="habit-reward">${esc(this.rewardText(h))}</span>${positive ? `<span class="habit-streak" title="${t('Cumplimientos seguidos', 'Completions in a row')}"><span aria-hidden="true">🔥</span> ${h.current_streak === 1 ? t('1 vez', '1 time') : t(`${h.current_streak} veces seguidas`, `${h.current_streak} in a row`)}</span>` : ''}</div>
            ${!available ? `<p class="habit-availability" role="status">${esc(this.availabilityText(h))}</p>` : ''}
            <button class="btn ${positive ? 'btn-primary' : 'btn-secondary'} habit-complete-button" ${!available || this.busy ? 'disabled' : ''} onclick="App.toggleHabit('${esc(h.id)}')">${!this.rulesReady ? t('EN MANTENIMIENTO', 'UNDER MAINTENANCE') : done ? positive ? t('COMPLETADO', 'COMPLETED') : t('REGISTRADO', 'RECORDED') : !h.period ? t('DÍA DE DESCANSO', 'REST DAY') : !available ? t('YA REGISTRADO', 'ALREADY RECORDED') : positive ? t('MARCAR COMPLETADO', 'MARK COMPLETED') : t('REGISTRAR TROPIEZO', 'LOG SETBACK')}</button>
            ${management ? `<details class="habit-options"><summary>${t('Opciones e historial', 'Options and history')}</summary>
                ${h.description ? `<p class="habit-description">${esc(h.description)}</p>` : ''}
                ${positive ? `<p>${t('Mejor racha', 'Best streak')}: ${h.best_streak} ${t('veces seguidas', 'times in a row')}.</p>` : ''}
                ${p && !max ? `<p>${t('Los días de descanso no cortan tu avance. Si un día que toca no completas la meta, la cuenta de 7 vuelve a cero.', 'Rest days do not break your progress. If you miss a scheduled goal, the count of 7 starts over.')}</p><p>${bonusPaid ? t('Ya recibiste el premio extra del siguiente nivel.', 'You already received the next level bonus.') : t(`Premio extra al subir: +${h.rewards.bonus_xp} XP y +${h.rewards.bonus_gold} monedas.`, `Level-up bonus: +${h.rewards.bonus_xp} XP and +${h.rewards.bonus_gold} coins.`)}</p>` : ''}
                ${!p && positive && this.preset(h) ? `<p>${t('¿Quieres que tu meta crezca poco a poco? Puedes activar los niveles.', 'Want your goal to grow little by little? You can enable levels.')}</p><button class="btn btn-secondary" ${!this.rulesReady ? 'disabled' : ''} onclick="HabitProgress.configure('${esc(h.id)}')">${t('Activar niveles', 'Enable levels')}</button>` : ''}
                <div class="habit-actions">
                <button class="btn btn-secondary" onclick="HabitProgress.history('${esc(h.id)}')">${t('Historial', 'History')}</button>
                <button class="btn btn-secondary" onclick="HabitProgress.confirmReset('${esc(h.id)}')">${t('Reiniciar progreso', 'Reset progress')}</button>
                <button class="btn btn-danger" ${!this.rulesReady || this.deleteRemaining() ? 'disabled' : ''} onclick="HabitProgress.confirmDelete('${esc(h.id)}')">${t('Eliminar hábito', 'Delete habit')}</button>
                </div>${this.deleteRemaining() ? `<p class="habit-availability">${esc(this.managementNotice())}</p>` : ''}</details>` : ''}</article>`;
    },
    configForm(item, enableOnly = false) {
        const p = this.preset(item);
        if (!this.ready || item.type !== 'positive' || !p) return '';
        const t = this.text.bind(this);
        const field = (key, label, help, value) => `<label>${label}<span class="habit-input-unit"><input class="form-input" data-progress="${key}" type="number" inputmode="decimal" step="any" min="0.1" max="100000" value="${value}" aria-label="${label} (${this.unit(p.unit)})" aria-describedby="hint-${item.id}-${key}" required><span aria-hidden="true">${this.unit(p.unit)}</span></span><small id="hint-${item.id}-${key}">${help}</small></label>`;
        return `<details class="habit-config" id="config-${item.id}" oninput="HabitProgress.previewCatalog('${item.id}')" onchange="HabitProgress.previewCatalog('${item.id}')"><summary>${t('Personalizar mi meta', 'Make this goal mine')}</summary>
            <label class="habit-level-toggle" ${enableOnly ? 'hidden' : ''}><input data-progress="enabled" type="checkbox" checked ${enableOnly ? 'disabled' : ''}> ${t('Quiero que mi meta crezca con niveles', 'I want my goal to grow with levels')}</label>
            <fieldset class="habit-config-fields"><legend class="sr-only">${t('Tu meta paso a paso', 'Your goal step by step')}</legend>
            ${field('initial',t('¿Con cuánto empiezas?','Where do you start?'),t('Tu primera meta.','Your first goal.'),p.initial)}
            ${field('step',t('¿Cuánto aumenta?','How much does it grow?'),t('Lo que añades al subir un nivel.','What you add at each new level.'),p.step)}
            ${field('max',t('¿Hasta dónde quieres llegar?','Where do you want to stop?'),t('Tu meta final. No subirá más.','Your final goal. It will not grow past this.'),p.max)}
            <input data-progress="unit" type="hidden" value="${p.unit}"></fieldset>
            <p class="habit-config-example" aria-live="polite">${this.configExample(p)}</p>
            <p class="habit-config-help">${t('Solo cuentan los días que elegiste. Los días de descanso no cortan tu avance.', 'Only your chosen days count. Rest days do not break your progress.')}</p></details>`;
    },
    readConfig(id, frequency) {
        const root = document.getElementById(`config-${id}`);
        let progression = null;
        if (root?.querySelector('[data-progress="enabled"]')?.checked) {
            progression = { required: 7 };
            for (const key of ['initial','max','step','unit']) {
                const input = root.querySelector(`[data-progress="${key}"]`);
                if (!input.checkValidity()) { root.open = true; input.reportValidity(); return null; }
                progression[key] = key === 'unit' ? input.value : Number(input.value);
            }
            if (progression.max < progression.initial || Math.ceil((progression.max - progression.initial) / progression.step) > 19) {
                root.open = true;
                App.showToast(this.text('La meta final no puede ser menor que la primera. Elige un aumento que permita llegar en 20 niveles o menos.', 'The final goal cannot be smaller than the first. Choose an increase that reaches it in 20 levels or fewer.'), 'error'); return null;
            }
        }
        return { catalog_id: id, frequency, progression, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' };
    },
    async complete(id) {
        const h = GameState.habits.find(x => x.id === id);
        if (!h || !this.available(h) || this.busy) return;
        // The click attests that the minimum was reached, not an exact measured amount.
        return this.submit(id, h.progression ? Number(h.current_target) : null, h.period);
    },
    closeModal() { document.getElementById('modal-root').innerHTML = ''; },
    configure(id) {
        const h=GameState.habits.find(x=>x.id===id);if(!h || h.progression || !this.preset(h) || this.busy)return;
        document.getElementById('modal-root').innerHTML=`<div class="modal-overlay"><section class="card habit-measure" role="dialog" aria-modal="true" aria-labelledby="configure-title"><h2 id="configure-title">${this.text('Activar niveles','Enable levels')}: ${Views.escape(h.title)}</h2>${this.configForm(h,true)}<p>${this.text('Tus premios e historial se conservan. Revisa bien las metas: quedarán guardadas para este hábito.','Your rewards and history stay saved. Check your goals carefully: they will be saved for this habit.')}</p><button class="btn btn-primary" onclick="HabitProgress.saveConfig('${h.id}')">${this.text('GUARDAR','SAVE')}</button><button class="btn btn-secondary" onclick="HabitProgress.closeModal()">${this.text('CANCELAR','CANCEL')}</button></section></div>`;
        const root=document.getElementById(`config-${id}`);root.open=true;root.querySelector('[data-progress="enabled"]').checked=true;
    },
    async saveConfig(id) {
        const h=GameState.habits.find(x=>x.id===id);if(!h)return;
        const cfg=this.readConfig(id,h.frequency);if(!cfg?.progression)return;
        if(await this.act('configure',id,cfg)){this.closeModal();App.navigate('habits');}
    },
    async submit(id,value,period) {
        const view = GameState.currentView;
        const result = await this.act('complete',id,{},value,period);
        if (!result) return;
        this.closeModal();
        const t=this.text.bind(this), h=GameState.habits.find(x=>x.id===id);
        let message = result.status === 'completed' ? `${t('Registrado','Recorded')}: +${result.xp} XP / +${result.gold} G` : result.status === 'below_target'
            ? t('Cantidad guardada. Aún no alcanzaste el objetivo; puedes actualizarla en este período.', 'Amount saved. Target not reached yet; you can update it within this period.')
            : result.status === 'already_recorded' ? t('Este período ya estaba registrado. No se duplicaron recompensas.', 'This period was already recorded. Rewards were not duplicated.')
            : t('El período cambió o no está disponible. Revisa el calendario actualizado.', 'The period changed or is not due. Check the updated schedule.');
        if(result.status==='completed' && h?.type==='negative') message=`${t('Incumplimiento registrado','Setback recorded')}: −${h.hpPenalty} HP`;
        if(result.advanced) message += ` · ${t('¡Nuevo nivel!', 'New level!')} ${h.difficulty_level}: ${h.current_target} ${this.unit(h.progression.unit)} · +${result.bonus_xp} XP / +${result.bonus_gold} G`;
        App.showToast(message, result.status === 'completed' ? 'success' : 'gold');
        if(GameState.user) App.navigate(view);
    },
    async confirmReset(id) {
        const h=GameState.habits.find(x=>x.id===id); if(!h || this.busy) return;
        if(!confirm(this.text(`¿Reiniciar el progreso de «${this.title(h)}»? La racha actual y el contador del próximo nivel volverán a cero, y la dificultad volverá al nivel inicial. Se conservarán descripción, frecuencia, objetivos, historial, mejor racha y recompensas. No podrás volver a cobrar este período ni bonificaciones ya obtenidas.`, `Reset progress for “${this.title(h)}”? Current streak and level progress become zero and difficulty returns to the initial level. Description, schedule, targets, history, best streak and earned rewards remain. Previously earned rewards cannot be claimed again.`))) return;
        if(await this.act('reset',id)) { App.showToast(this.text('Progreso reiniciado; historial conservado.', 'Progress reset; history retained.'),'success'); App.navigate('habits'); }
    },
    async confirmDelete(id) {
        if(this.busy) return;
        if (!this.rulesReady || this.deleteRemaining()) { App.showToast(this.managementNotice(),'error'); return; }
        if(!confirm(this.text('¿Eliminar este hábito de tu lista? Su configuración, historial y recompensas se conservan para cuando lo reactives. Reactivarlo no permite cobrar otra vez el mismo período. Podrás eliminar otro hábito en 24 horas.', 'Remove this habit from your list? Its settings, history and rewards are retained for reactivation. Reactivating cannot earn another reward for the same period. Another deletion will be available in 24 hours.'))) return;
        const result=await this.act('archive',id);
        if(result?.status==='saved') App.showToast(this.text('Hábito eliminado; historial conservado. Podrás eliminar otro en 24 horas.', 'Habit deleted; history retained. Another deletion is available in 24 hours.'),'success');
        else if(result?.status==='delete_cooldown') App.showToast(this.managementNotice(),'error');
        if(result) App.navigate('habits');
    },
    async history(id = null) {
        const uid=GameState.user?.id;
        let query=supabase.from('habit_activity').select('*').eq('user_id',uid).order('created_at',{ascending:false}).limit(50);
        if(id) query=query.eq('habit_id',id);
        const {data,error}=await query; if(uid!==GameState.user?.id) return;
        if(error) {App.showToast(this.text('No se pudo cargar el historial.','Could not load history.'),'error');return;}
        const t=this.text.bind(this), esc=Views.escape;
        const outcomes={completed:t('Completado','Completed'),missed:t('Sin completar','Missed'),below_target:t('Objetivo pendiente','Below target'),legacy:t('Registro anterior','Legacy completion')};
        document.getElementById('modal-root').innerHTML=`<div class="modal-overlay"><section class="card habit-history" role="dialog" aria-modal="true" aria-labelledby="history-title"><h2 id="history-title">${t('Últimos 50 registros','Latest 50 entries')}</h2>${(data||[]).map(row=>`<p><strong>${esc(row.title)}</strong> · ${esc(row.period)} · ${outcomes[row.outcome] || esc(row.outcome)}${row.measured != null ? ` · ${row.measured}/${row.target}` : ''}<br>+${row.xp+row.bonus_xp} XP / +${row.gold+row.bonus_gold+row.avatar_bonus_gold} G</p>`).join('') || `<p>${t('Todavía no hay registros.','No entries yet.')}</p>`}<button class="btn btn-secondary" onclick="HabitProgress.closeModal()">${t('CERRAR','CLOSE')}</button></section></div>`;
    }
};
window.HabitProgress = HabitProgress;
