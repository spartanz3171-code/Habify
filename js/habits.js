// Scheduled habit progress is authoritative in Supabase; previews never award currency.
const HabitProgress = {
    ready: false,
    installed: false,
    busy: false,
    text(es, en) { return I18N.current === 'en' ? en : es; },
    presets: {
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
    async load() {
        const uid = GameState.user?.id;
        this.ready = false;
        try {
            const { data, error } = await supabase.rpc('habit_action', { p_action: 'list' });
            if (uid !== GameState.user?.id) return;
            if (error || !Array.isArray(data?.habits)) return;
            this.ready = true;
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
        this.busy = true;
        const uid = GameState.user?.id;
        try {
            return await queueAvatarWrite(async () => {
                if (uid !== GameState.user?.id) return null;
                const { data, error } = await supabase.rpc('habit_action', { p_action: action, p_id: id || null, p_config: config, p_value: value, p_expected_period: period });
                if (uid !== GameState.user?.id) return null;
                if (error || !Array.isArray(data?.habits)) throw error || new Error('Invalid response');
                this.syncAvatar(data.avatar);
                GameState.habits = data.habits.map(h => this.fromRow(h));
                this.dayStamp = this.stamp();
                return data;
            });
        } catch (_) {
            App.showToast(this.text('No se pudo guardar. Revisa la conexión y vuelve a intentarlo.', 'Could not save. Check your connection and try again.'), 'error');
            return null;
        } finally { this.busy = false; }
    },
    unit(unit) { return ({ hours: this.text('horas', 'hours'), minutes: this.text('minutos', 'minutes'), pages: this.text('páginas', 'pages'), units: this.text('unidades', 'units') })[unit] || ''; },
    stamp() { return GameState.habits.map(h => new Intl.DateTimeFormat('en-CA', {timeZone:h.habit_timezone || 'UTC'}).format(new Date()) + ':' + (!h.available_after || Date.now() >= Date.parse(h.available_after))).join('|'); },
    async refreshDay() {
        if(!this.ready || this.busy || GameState.currentBattle || !GameState.user || document.hidden || this.stamp()===this.dayStamp) return;
        const result=await this.act('list');
        if(result && ['dashboard','habits'].includes(GameState.currentView)) App.navigate(GameState.currentView);
    },
    frequency(value) { return ({ daily: this.text('Todos los días', 'Every day'), workdays: this.text('Lunes a viernes', 'Monday to Friday'), '3x_week': this.text('Lunes, miércoles y viernes', 'Monday, Wednesday and Friday'), '2x_week': this.text('Martes y jueves', 'Tuesday and Thursday'), weekly: this.text('Una vez por semana · lunes a domingo', 'Once a week · Monday to Sunday') })[value] || value; },
    available(h) { return !!h.period && !h.recorded && (!h.available_after || Date.now() >= Date.parse(h.available_after)); },
    card(h, management = false) {
        const t = this.text.bind(this), esc = Views.escape;
        const p = h.progression, done = h.recorded, available = this.available(h);
        const max = p && Number(h.current_target) >= p.max;
        const next = p ? Math.min(p.max, Number(h.current_target) + p.step) : null;
        const bonusPaid = p && h.difficulty_level + 1 <= h.rewarded_level;
        return `<article class="card habit-progress-card ${done ? 'completed' : ''}" data-progress-habit="${esc(h.id)}">
            <div class="habit-progress-heading"><h3>${esc(h.title)}</h3><span class="section-badge">${p ? `${t('NIVEL', 'LEVEL')} ${h.difficulty_level}` : t('SIN NIVELES', 'NO LEVELS')}</span></div>
            <p class="habit-description">${esc(h.description || '')}</p>
            <p>${p ? `${t('Objetivo', 'Target')}: <strong>${h.current_target} ${this.unit(p.unit)}</strong>` : t('Registro de completado / no completado', 'Completed / not completed')}</p>
            <p class="habit-schedule">${this.frequency(h.frequency)} · ${esc(h.habit_timezone)}</p>
            ${p ? `<div class="habit-progress-meter"><label>${max ? t('Nivel máximo alcanzado', 'Maximum level reached') : `${t('Próximo nivel', 'Next level')}: ${h.progress_count}/${p.required} ${t('cumplimientos programados consecutivos', 'consecutive scheduled completions')}`}</label><progress max="${p.required}" value="${max ? p.required : h.progress_count}" aria-label="${t('Progreso al siguiente nivel', 'Progress to next level')}"></progress></div>
                ${!max ? `<p>${t('Siguiente objetivo', 'Next target')}: ${next} ${this.unit(p.unit)} · ${bonusPaid ? t('Bonificación ya obtenida', 'Bonus already earned') : `+${h.rewards.bonus_xp} XP / +${h.rewards.bonus_gold} G`}</p>` : ''}` : ''}
            <p>${t('Racha actual', 'Current streak')}: ${h.current_streak} · ${t('Mejor racha', 'Best streak')}: ${h.best_streak}</p>
            <p class="habit-reward">${h.type === 'positive' ? `+${h.xpReward} XP / +${h.goldReward} G` : `−${h.hpPenalty} HP`}</p>
            <button class="btn btn-primary" ${!available || this.busy ? 'disabled' : ''} onclick="App.toggleHabit('${esc(h.id)}')">${done ? t('REGISTRADO', 'RECORDED') : !available ? t('FUERA DEL PERÍODO DISPONIBLE', 'NOT DUE') : p ? t('REGISTRAR CANTIDAD', 'LOG AMOUNT') : h.type === 'negative' ? t('REGISTRAR INCUMPLIMIENTO', 'LOG SETBACK') : t('COMPLETAR', 'COMPLETE')}</button>
            ${management ? `<div class="habit-actions">${!p && h.type === 'positive' ? `<button class="btn btn-secondary" onclick="HabitProgress.configure('${esc(h.id)}')">${t('Añadir niveles', 'Add levels')}</button>` : ''}<button class="btn btn-secondary" onclick="HabitProgress.confirmReset('${esc(h.id)}')">${t('Reiniciar progreso', 'Reset progress')}</button><button class="btn btn-danger" onclick="HabitProgress.confirmDelete('${esc(h.id)}')">${t('Eliminar hábito', 'Delete habit')}</button><button class="btn btn-secondary" onclick="HabitProgress.history('${esc(h.id)}')">${t('Historial', 'History')}</button></div>` : ''}</article>`;
    },
    configForm(item) {
        if (!this.ready || item.type !== 'positive') return '';
        const t = this.text.bind(this), p = this.presets[item.id] || { initial: 5, max: 20, step: 5, required: 7, unit: 'units' };
        const field = (key, label, value, min, max) => `<label>${label}<input class="form-input" data-progress="${key}" type="number" step="${key === 'required' ? '1' : 'any'}" min="${min}" max="${max}" value="${value}" required></label>`;
        return `<details class="habit-config" id="config-${item.id}"><summary>${t('Configurar progresión opcional', 'Configure optional progression')}</summary>
            <label><input data-progress="enabled" type="checkbox" ${this.presets[item.id] ? 'checked' : ''}> ${t('Medir cantidades y subir niveles', 'Measure amounts and gain levels')}</label>
            <div class="habit-config-fields">${field('initial',t('Objetivo inicial','Initial target'),p.initial,0.1,100000)}${field('max',t('Objetivo máximo','Maximum target'),p.max,0.1,100000)}${field('step',t('Incremento','Increment'),p.step,0.1,100000)}${field('required',t('Cumplimientos para subir','Completions to advance'),p.required,2,90)}
            <label>${t('Unidad','Unit')}<select class="form-input" data-progress="unit">${['hours','minutes','pages','units'].map(unit => `<option value="${unit}" ${p.unit === unit ? 'selected' : ''}>${this.unit(unit)}</option>`).join('')}</select></label></div>
            <p>${t('Las recompensas se calculan por nivel. La frecuencia y los objetivos se fijan al activar el hábito.', 'Rewards are calculated by level. Schedule and targets are fixed when activating the habit.')}</p></details>`;
    },
    readConfig(id, frequency) {
        const root = document.getElementById(`config-${id}`);
        let progression = null;
        if (root?.querySelector('[data-progress="enabled"]').checked) {
            progression = {};
            for (const key of ['initial','max','step','required','unit']) {
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
        if (!h.progression) return this.submit(id, null, h.period);
        const t = this.text.bind(this);
        document.getElementById('modal-root').innerHTML = `<div class="modal-overlay"><section class="card habit-measure" role="dialog" aria-modal="true" aria-labelledby="measurement-title"><h2 id="measurement-title">${Views.escape(h.title)}</h2><p>${t('Objetivo','Target')}: ${h.current_target} ${this.unit(h.progression.unit)}</p><form onsubmit="HabitProgress.submitMeasurement(event,'${h.id}','${h.period}')"><label for="habit-measured">${t('Cantidad real de este período','Actual amount this period')} (${this.unit(h.progression.unit)})</label><input class="form-input" type="number" id="habit-measured" min="0" max="100000" step="any" required><button class="btn btn-primary" type="submit">${t('GUARDAR REGISTRO','SAVE ENTRY')}</button><button class="btn btn-secondary" type="button" onclick="HabitProgress.closeModal()">${t('CANCELAR','CANCEL')}</button></form></section></div>`;
        document.getElementById('habit-measured').focus();
    },
    closeModal() { document.getElementById('modal-root').innerHTML = ''; },
    configure(id) {
        const h=GameState.habits.find(x=>x.id===id);if(!h || h.progression || this.busy)return;
        document.getElementById('modal-root').innerHTML=`<div class="modal-overlay"><section class="card habit-measure" role="dialog" aria-modal="true" aria-labelledby="configure-title"><h2 id="configure-title">${this.text('Añadir niveles','Add levels')}: ${Views.escape(h.title)}</h2>${this.configForm({id:h.id,type:h.type})}<p>${this.text('La frecuencia, el historial y las recompensas anteriores se conservan. Las cantidades quedarán fijadas para este hábito.','Schedule, history and prior rewards are retained. Targets will be fixed for this habit.')}</p><button class="btn btn-primary" onclick="HabitProgress.saveConfig('${h.id}')">${this.text('GUARDAR','SAVE')}</button><button class="btn btn-secondary" onclick="HabitProgress.closeModal()">${this.text('CANCELAR','CANCEL')}</button></section></div>`;
        const root=document.getElementById(`config-${id}`);root.open=true;root.querySelector('[data-progress="enabled"]').checked=true;
        const preset=this.presets[h.catalog_id];if(preset)for(const key of Object.keys(preset))root.querySelector(`[data-progress="${key}"]`).value=preset[key];
    },
    async saveConfig(id) {
        const h=GameState.habits.find(x=>x.id===id);if(!h)return;
        const cfg=this.readConfig(id,h.frequency);if(!cfg?.progression)return;
        if(await this.act('configure',id,cfg)){this.closeModal();App.navigate('habits');}
    },
    async submitMeasurement(event,id,period) {
        event.preventDefault();
        if (!event.target.reportValidity() || this.busy) return;
        const value = Number(document.getElementById('habit-measured').value);
        if (!Number.isFinite(value)) return;
        await this.submit(id, value, period);
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
        if(!confirm(this.text(`¿Reiniciar el progreso de «${h.title}»? La racha actual y el contador del próximo nivel volverán a cero, y la dificultad volverá al nivel inicial. Se conservarán nombre, descripción, frecuencia, objetivos, historial, mejor racha y recompensas. No podrás volver a cobrar este período ni bonificaciones ya obtenidas.`, `Reset progress for “${h.title}”? Current streak and level progress become zero and difficulty returns to the initial level. Name, description, schedule, targets, history, best streak and earned rewards remain. Previously earned rewards cannot be claimed again.`))) return;
        if(await this.act('reset',id)) { App.showToast(this.text('Progreso reiniciado; historial conservado.', 'Progress reset; history retained.'),'success'); App.navigate('habits'); }
    },
    async confirmDelete(id) {
        if(this.busy) return;
        if(!confirm(this.text('¿Estás seguro de que deseas eliminar este hábito? Esta acción eliminará su configuración y dejará de aparecer en tu lista. El historial y las recompensas se conservarán; los otros hábitos no cambiarán.', 'Delete this habit? Its active configuration will be removed and it will disappear from your list. History and earned rewards are retained; other habits are unchanged.'))) return;
        if(await this.act('archive',id)) { App.showToast(this.text('Hábito eliminado de tu lista; historial conservado.', 'Habit removed from your list; history retained.'),'success'); App.navigate('habits'); }
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
