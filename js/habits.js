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
    previewCatalog(id) {
        const root = document.getElementById(`config-${id}`), item = GameState.presetCatalog.find(p => p.id === id);
        const label = root?.closest('.catalog-card')?.querySelector('.catalog-card-title');
        if (!label || !item) return;
        const value = Number(root.querySelector('[data-progress="initial"]').value);
        label.textContent = root.querySelector('[data-progress="enabled"]').checked && value > 0 ? this.title(item,value,this.preset(item)?.unit) : item.title;
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
        const p = h.progression, done = h.recorded, available = this.available(h);
        const title = this.title(h);
        const max = p && Number(h.current_target) >= p.max;
        const next = p ? Math.min(p.max, Number(h.current_target) + p.step) : null;
        const bonusPaid = p && h.difficulty_level + 1 <= h.rewarded_level;
        return `<article class="card habit-progress-card ${done ? 'completed' : ''}" data-progress-habit="${esc(h.id)}">
            <div class="habit-progress-heading"><h3>${esc(title)}</h3><span class="section-badge">${p ? `${t('NIVEL', 'LEVEL')} ${h.difficulty_level}` : t('META FIJA', 'FIXED GOAL')}</span></div>
            <p class="habit-description">${esc(h.description || '')}</p>
            <p>${p ? `${t('Meta mínima', 'Minimum goal')}: <strong>${h.current_target} ${this.unit(p.unit)}</strong>. ${t('Si la alcanzaste o superaste, marca Completado.', 'If you reached or exceeded it, mark Completed.')}` : h.type === 'negative' ? t('Registra el incumplimiento sólo si ocurrió.', 'Log the setback only if it happened.') : t('Marca Completado cuando hayas cumplido este hábito.', 'Mark Completed when you have fulfilled this habit.')}</p>
            <p class="habit-schedule">${this.frequency(h.frequency)}</p>
            ${p ? `<div class="habit-progress-meter"><label>${max ? t('Nivel máximo alcanzado', 'Maximum level reached') : `${t('Próximo nivel', 'Next level')}: ${h.progress_count}/7 ${t('cumplimientos programados consecutivos', 'consecutive scheduled completions')}`}</label><progress max="7" value="${max ? 7 : h.progress_count}" aria-label="${t('Progreso al siguiente nivel', 'Progress to next level')}"></progress></div>
                ${!max ? `<p>${t('Siguiente objetivo', 'Next target')}: ${next} ${this.unit(p.unit)} · ${bonusPaid ? t('Bonificación ya obtenida', 'Bonus already earned') : `+${h.rewards.bonus_xp} XP / +${h.rewards.bonus_gold} G`}</p>` : ''}` : ''}
            <p>${t('Racha actual', 'Current streak')}: ${h.current_streak} · ${t('Mejor racha', 'Best streak')}: ${h.best_streak}</p>
            <p class="habit-reward">${h.type === 'positive' ? `+${h.xpReward} XP / +${h.goldReward} G` : `−${h.hpPenalty} HP`}</p>
            ${!available ? `<p class="habit-availability" role="status">${esc(this.availabilityText(h))}</p>` : ''}
            <button class="btn btn-primary" ${!available || this.busy ? 'disabled' : ''} onclick="App.toggleHabit('${esc(h.id)}')">${!this.rulesReady ? t('EN MANTENIMIENTO', 'UNDER MAINTENANCE') : done ? h.type === 'negative' ? t('REGISTRADO', 'RECORDED') : t('COMPLETADO', 'COMPLETED') : !h.period ? t('DÍA DE DESCANSO', 'REST DAY') : !available ? t('YA REGISTRADO', 'ALREADY RECORDED') : h.type === 'negative' ? t('REGISTRAR INCUMPLIMIENTO', 'LOG SETBACK') : t('MARCAR COMPLETADO', 'MARK COMPLETED')}</button>
            ${management ? `<div class="habit-actions">
                ${!p && h.type === 'positive' && this.preset(h) ? `<button class="btn btn-secondary" onclick="HabitProgress.configure('${esc(h.id)}')">${t('Añadir niveles', 'Add levels')}</button>` : ''}
                <button class="btn btn-secondary" onclick="HabitProgress.confirmReset('${esc(h.id)}')">${t('Reiniciar progreso', 'Reset progress')}</button>
                <button class="btn btn-danger" ${!this.rulesReady || this.deleteRemaining() ? 'disabled' : ''} onclick="HabitProgress.confirmDelete('${esc(h.id)}')">${t('Eliminar hábito', 'Delete habit')}</button>
                <button class="btn btn-secondary" onclick="HabitProgress.history('${esc(h.id)}')">${t('Historial', 'History')}</button></div>` : ''}</article>`;
    },
    configForm(item) {
        const p = this.preset(item);
        if (!this.ready || item.type !== 'positive' || !p) return '';
        const t = this.text.bind(this);
        const field = (key, label, value, min, max) => `<label>${label}<input class="form-input" data-progress="${key}" type="number" step="any" min="${min}" max="${max}" value="${value}" required></label>`;
        return `<details class="habit-config" id="config-${item.id}" oninput="HabitProgress.previewCatalog('${item.id}')" onchange="HabitProgress.previewCatalog('${item.id}')"><summary>${t('Configurar progresión opcional', 'Configure optional progression')}</summary>
            <label><input data-progress="enabled" type="checkbox" checked> ${t('Aumentar la meta al cumplirla varios días', 'Increase the goal after consistent completions')}</label>
            <div class="habit-config-fields">${field('initial',t('Objetivo inicial','Initial target'),p.initial,0.1,100000)}${field('max',t('Objetivo máximo','Maximum target'),p.max,0.1,100000)}${field('step',t('Incremento','Increment'),p.step,0.1,100000)}
            <input data-progress="unit" type="hidden" value="${p.unit}"></div>
            <p>${t('Subes de dificultad después de 7 cumplimientos programados consecutivos. Este número es fijo.', 'Difficulty increases after 7 consecutive scheduled completions. This number is fixed.')}</p>
            <p>${t('Estas metas se expresan en', 'These goals use')} <strong>${this.unit(p.unit)}</strong>. ${t('Sólo tendrás que marcar Completado si alcanzaste la meta mínima, aunque hayas hecho más. No se te pedirá escribir cantidades.', 'Just mark Completed when you reach the minimum goal, even if you do more. No amount entry is needed.')}</p></details>`;
    },
    readConfig(id, frequency) {
        const root = document.getElementById(`config-${id}`);
        let progression = null;
        if (root?.querySelector('[data-progress="enabled"]')?.checked) {
            progression = { required: 7 };
            for (const key of ['initial','max','step','unit']) {
                const input = root.querySelector(`[data-progress="${key}"]`);
                if (!input.reportValidity()) return null;
                progression[key] = key === 'unit' ? input.value : Number(input.value);
            }
            if (progression.max < progression.initial || Math.ceil((progression.max - progression.initial) / progression.step) > 19) {
                App.showToast(this.text('El máximo debe ser igual o mayor al inicio y permitir hasta 20 niveles.', 'The maximum must be at least the initial target, with up to 20 levels.'), 'error'); return null;
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
        document.getElementById('modal-root').innerHTML=`<div class="modal-overlay"><section class="card habit-measure" role="dialog" aria-modal="true" aria-labelledby="configure-title"><h2 id="configure-title">${this.text('Añadir niveles','Add levels')}: ${Views.escape(h.title)}</h2>${this.configForm(h)}<p>${this.text('La frecuencia, el historial y las recompensas anteriores se conservan. Las cantidades quedarán fijadas para este hábito.','Schedule, history and prior rewards are retained. Targets will be fixed for this habit.')}</p><button class="btn btn-primary" onclick="HabitProgress.saveConfig('${h.id}')">${this.text('GUARDAR','SAVE')}</button><button class="btn btn-secondary" onclick="HabitProgress.closeModal()">${this.text('CANCELAR','CANCEL')}</button></section></div>`;
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
