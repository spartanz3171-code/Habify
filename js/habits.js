// Scheduled habit progress is authoritative in Supabase; previews never award currency.
const HabitProgress = {
    ready: false,
    installed: false,
    busy: false,
    rulesReady: false,
    abstinenceReady: false,
    deleteAvailableAt: null,
    clockOffset: 0,
    pendingRequests: new Map(),
    cyclePenalties: [],
    text(es, en) { return I18N.current === 'en' ? en : es; },
    dismissedGuides: new Set(),
    showGuide() {
        const user = GameState.user;
        if (!user?.id || user.user_metadata?.habify_habit_guide_dismissed === true || this.dismissedGuides.has(user.id)) return false;
        try { return localStorage.getItem('habify_habit_guide_' + user.id) !== 'hidden'; } catch (_) { return true; }
    },
    async dismissGuide() {
        const user = GameState.user;
        if (!user?.id) return;
        this.dismissedGuides.add(user.id);
        user.user_metadata = { ...user.user_metadata, habify_habit_guide_dismissed: true };
        try { localStorage.setItem('habify_habit_guide_' + user.id, 'hidden'); } catch (_) { /* In-memory dismissal still works. */ }
        document.querySelector('.habit-quick-guide')?.remove();
        document.querySelector('.habit-page-actions button')?.focus({ preventScroll: true });
        // This is a display preference, not a permission or security claim.
        try { await supabase.auth.updateUser({ data: { habify_habit_guide_dismissed: true } }); } catch (_) { /* Offline: keep the device preference. */ }
    },
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
        for (const [key, column] of Object.entries({ currentXP: 'current_xp', xpToLevel: 'xp_to_level', gold: 'gold', hp: 'hp', maxHp: 'max_hp', level: 'level', isDead: 'is_dead', gameRevision: 'game_revision', economyVersion: 'economy_version' })) {
            if (a[column] !== undefined) GameState.avatar[key] = a[column];
        }
    },
    syncRules(data) {
        this.rulesReady = data.rules_version >= 4;
        this.abstinenceReady = data.rules_version >= 5;
        this.deleteAvailableAt = data.delete_available_at || null;
        this.clockOffset = data.server_now ? Date.parse(data.server_now) - Date.now() : 0;
        if (data.penalties?.length) this.cyclePenalties.push(...data.penalties);
    },
    now() { return Date.now() + this.clockOffset; },
    deleteRemaining() { return Math.max(0, Date.parse(this.deleteAvailableAt || 0) - (Date.now() + this.clockOffset)) || 0; },
    managementNotice() {
        if (!this.rulesReady) return this.text('Los hábitos están temporalmente en mantenimiento mientras se actualizan sus periodos. Tus datos se conservan.', 'Habits are temporarily undergoing maintenance while their periods are updated. Your data is preserved.');
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
        this.updateCountdowns();
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
        } finally { this.busy = false; this.updateCountdowns(); }
    },
    unit(unit) { return ({ liters: this.text('litros', 'liters'), hours: this.text('horas', 'hours'), minutes: this.text('minutos', 'minutes'), pages: this.text('páginas', 'pages'), units: this.text('veces', 'times') })[unit] || ''; },
    preset(item) {
        const key = item.catalog_id || item.id;
        return this.presets[key] || this.presets[GameState.presetCatalog.find(p => p.title === item.title)?.id];
    },
    title(item, target = item.current_target, unit = item.progression?.unit) {
        if (item.type === 'negative') {
            const base = String(item.title || '').replace(/^(?:NO|DO NOT)\s+/i, '');
            return `${this.text('NO', 'DO NOT')} ${base}`;
        }
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
    catalogTitle(item) { const p = this.preset(item); return p && item.type === 'positive' ? this.title(item,p.initial,p.unit) : this.title(item); },
    rewardText(item, growing = false) {
        if (item.type === 'negative') return this.text('Evitarlo: +2 XP · +1 moneda. Cada tropiezo: −5 monedas · −5 de vida.', 'Avoid it: +2 XP · +1 coin. Each setback: −5 coins · −5 health.');
        const xp = growing ? 10 : item.xpReward, gold = growing ? 5 : item.goldReward;
        return this.text(`+${xp} XP · +${gold} monedas`, `+${xp} XP · +${gold} coins`);
    },
    configExample(p) {
        const amount = value => `${new Intl.NumberFormat(I18N.current === 'en' ? 'en-US' : 'es-MX', {maximumFractionDigits:3}).format(value)} ${this.unit(p.unit)}`;
        return this.text(`Empiezas con ${amount(p.initial)}. Al cumplir tu meta 7 veces seguidas, sube a ${amount(Math.min(p.max,p.initial+p.step))}. Nunca pasará de ${amount(p.max)}.`, `Start with ${amount(p.initial)}. After meeting your goal 7 times in a row, it grows to ${amount(Math.min(p.max,p.initial+p.step))}. It will never exceed ${amount(p.max)}.`);
    },
    availabilityText(h) {
        if (!this.rulesReady) return this.managementNotice();
        if (!this.cycleOpen(h)) return this.text('Actualizando el siguiente periodo…', 'Updating the next period…');
        if (h.type === 'negative' && h.lapse_count > 0) return this.text(`Registraste ${h.lapse_count} ${h.lapse_count === 1 ? 'tropiezo' : 'tropiezos'} en este periodo. Podrás volver a ganar la recompensa en el siguiente.`, `You logged ${h.lapse_count} ${h.lapse_count === 1 ? 'setback' : 'setbacks'} this period. You can earn the reward again next period.`);
        if (h.recorded) return this.text('Ya cumpliste este periodo. El reloj sigue hasta la siguiente oportunidad.', 'You completed this period. The timer continues until the next opportunity.');
        if (h.available_after && this.now() < Date.parse(h.available_after)) return this.text('Se conserva el bloqueo de tu recompensa anterior hasta la siguiente oportunidad.', 'Your previous reward remains protected until the next opportunity.');
        return '';
    },
    cycleOpen(h) { return !!h.cycle_start_at && this.now() >= Date.parse(h.cycle_start_at) && this.now() < Date.parse(h.cycle_end_at); },
    remaining(until) { return Math.max(0, Date.parse(until || '') - this.now()) || 0; },
    duration(ms) {
        let seconds = Math.max(0, Math.ceil(ms / 1000));
        const days = Math.floor(seconds / 86400); seconds %= 86400;
        const hours = Math.floor(seconds / 3600); seconds %= 3600;
        return `${days ? days + 'd ' : ''}${String(hours).padStart(2,'0')}:${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
    },
    abstinenceAvailable(h) { return this.abstinenceReady && h.type === 'negative' && this.available(h) && !h.lapse_count; },
    canLapse(h) { return this.rulesReady && h.type === 'negative' && this.cycleOpen(h); },
    stamp() { return (this.deleteRemaining() > 0 ? 'locked:' : 'open:') + GameState.habits.map(h => `${h.id}:${h.cycle_start_at}:${this.cycleOpen(h)}:${this.remaining(h.abstinence_available_at) > 0}:${this.remaining(h.available_after) > 0}`).join('|'); },
    updateCountdowns() {
        for (const card of document.querySelectorAll('[data-progress-habit]')) {
            const h = GameState.habits.find(item => item.id === card.dataset.progressHabit);
            if (!h) continue;
            const timer = card.querySelector('[data-cycle-countdown]');
            if (timer) timer.textContent = this.duration(this.remaining(h.cycle_end_at));
            const unlock = card.querySelector('[data-abstinence-countdown]');
            if (unlock) unlock.textContent = this.duration(this.remaining(h.abstinence_available_at));
            const complete = card.querySelector('[data-habit-complete]');
            if (complete) complete.disabled = this.busy || !this.available(h);
            const abstain = card.querySelector('[data-habit-abstain]');
            if (abstain) abstain.disabled = this.busy || !this.abstinenceAvailable(h);
            const lapse = card.querySelector('[data-habit-lapse]');
            if (lapse) lapse.disabled = this.busy || !this.canLapse(h);
        }
    },
    async refreshDay() {
        this.updateCountdowns();
        if(!this.ready || this.busy || (GameState.currentBattle && !GameState.currentBattle.isFinished) || !GameState.user || document.hidden || this.stamp()===this.dayStamp || Date.now() - (this.lastRefreshAttempt || 0) < 15000) return;
        this.lastRefreshAttempt = Date.now();
        const result=await this.act('list');
        if(result && ['dashboard','habits'].includes(GameState.currentView)) App.navigate(GameState.currentView);
    },
    frequency(value) { return ({ daily: this.text('Todos los días', 'Every day'), workdays: this.text('Lunes a viernes', 'Monday to Friday'), '3x_week': this.text('Lunes, miércoles y viernes', 'Monday, Wednesday and Friday'), '2x_week': this.text('Martes y jueves', 'Tuesday and Thursday'), weekly: this.text('Cada 7 días', 'Every 7 days') })[value] || value; },
    available(h) { return this.rulesReady && this.cycleOpen(h) && !h.recorded && (!h.available_after || this.now() >= Date.parse(h.available_after)); },
    cycleSummary(h) {
        if (!h.cycle_end_at) return '';
        const t = this.text.bind(this), esc = Views.escape;
        const date = new Intl.DateTimeFormat(I18N.current === 'en' ? 'en-US' : 'es-MX', { timeZone: h.habit_timezone || 'UTC', dateStyle: 'short', timeStyle: 'short' }).format(new Date(h.cycle_end_at));
        return `<div class="habit-cycle-clock"><span class="habit-clock-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><div class="habit-cycle-copy"><span>${h.recorded && !h.lapse_count ? t('Nueva oportunidad en', 'Next opportunity in') : t('El periodo termina en', 'Period ends in')}</span><strong data-cycle-countdown>${this.duration(this.remaining(h.cycle_end_at))}</strong></div><small>${t('Se renueva', 'Renews')}<br>${esc(date)}</small></div>
            ${h.missed_cycles > 0 ? `<p class="habit-cycle-warning">${t(`${h.missed_cycles}/3 periodos seguidos sin cumplir. Al tercero se desactiva: −15 monedas y −15 de vida.`, `${h.missed_cycles}/3 consecutive missed periods. At three it becomes inactive: −15 coins and −15 health.`)}</p>` : ''}`;
    },
    actionButtons(h) {
        const t = this.text.bind(this), id = Views.escape(h.id);
        if (h.type === 'positive') return `<button class="btn btn-primary habit-complete-button" data-habit-complete ${!this.available(h) || this.busy ? 'disabled' : ''} onclick="App.toggleHabit('${id}')">${!this.rulesReady ? t('EN MANTENIMIENTO','UNDER MAINTENANCE') : h.recorded ? t('COMPLETADO','COMPLETED') : t('MARCAR COMPLETADO','MARK COMPLETED')}</button>`;
        return `<div class="habit-abstinence-actions">
            <button class="btn btn-primary habit-abstain-button" data-habit-abstain ${!this.abstinenceAvailable(h) || this.busy ? 'disabled' : ''} onclick="HabitProgress.report('${id}','abstain')">${t('NO LO HICE','I DID NOT DO IT')}<small>${h.lapse_count ? t('Periodo con tropiezos','Setbacks this period') : h.recorded ? t('Ya registrado','Already recorded') : '+2 XP · +1 G'}</small></button>
            <button class="btn btn-danger habit-lapse-button" data-habit-lapse ${!this.canLapse(h) || this.busy ? 'disabled' : ''} onclick="HabitProgress.report('${id}','lapse')">${t('SÍ LO HICE','I DID IT')}<small>−5 G · −5 HP</small></button>
            </div>${!this.abstinenceReady ? `<p class="habit-unlock-note" role="status">${t('Falta actualizar los retos en tu cuenta para habilitar “NO LO HICE” desde la activación.', 'Your account needs the challenge update to enable “I DID NOT DO IT” from activation.')}</p>` : ''}`;
    },
    penaltyNotice() {
        if (!this.cyclePenalties.length) return '';
        const t = this.text.bind(this), esc = Views.escape;
        return `<section class="habit-cycle-notice" role="status"><strong>${t('Hábitos desactivados por 3 periodos sin cumplir','Habits deactivated after 3 missed periods')}</strong>${this.cyclePenalties.map(p => `<p>${esc(p.title)} · −${Number(p.gold_lost) || 0} G · −${Number(p.hp_lost) || 0} HP</p>`).join('')}<p>${t('Su historial se conserva. Puedes activarlos otra vez desde el catálogo.','Their history is saved. You can activate them again from the catalog.')}</p><button class="btn btn-secondary" onclick="HabitProgress.cyclePenalties=[];App.navigate(GameState.currentView)">${t('ENTENDIDO','GOT IT')}</button></section>`;
    },
    card(h, management = false) {
        const t = this.text.bind(this), esc = Views.escape;
        const p = h.progression, done = h.recorded && !h.lapse_count, positive = h.type === 'positive';
        const catalog = GameState.presetCatalog.find(item => item.id === h.catalog_id || item.title === h.title);
        const icon = catalog?.icon || (positive ? '🌱' : '🧭');
        const max = p && Number(h.current_target) >= p.max;
        const next = p ? Math.min(p.max, Number(h.current_target) + p.step) : null;
        const bonusPaid = p && h.difficulty_level + 1 <= h.rewarded_level;
        const fixedLabel = t('Tu meta de este periodo', 'Your goal this period');
        return `<article class="card habit-progress-card ${done ? 'completed' : ''} ${positive ? 'positive' : 'negative'}" data-progress-habit="${esc(h.id)}">
            <div class="habit-progress-heading"><span class="habit-symbol" aria-hidden="true">${esc(icon)}</span><div class="habit-heading-copy"><h3>${esc(this.title(h))}</h3><p class="habit-schedule">${this.frequency(h.frequency)}</p></div><span class="habit-kind">${p ? `${t('NIVEL', 'LEVEL')} ${h.difficulty_level}` : positive ? t('Meta fija', 'Fixed goal') : t('Reto personal', 'Personal challenge')}</span></div>
            <p class="habit-instruction">${p && !this.preset(h) ? `<strong>${t('Tu meta', 'Your goal')}: ${h.current_target} ${this.unit(p.unit)}.</strong> ` : ''}${positive ? management ? t('Registra en Inicio cuando alcances tu meta. Hacer más también cuenta, una vez por periodo.', 'Record your goal on Home when you reach it. Doing more counts too, once per period.') : t('Cuando lo logres, pulsa Marcar completado. ¡También cuenta si haces más!', 'When you reach your goal, tap Mark completed. Doing more counts too!') : t('“SÍ LO HICE” significa que realizaste la conducta que quieres evitar. “NO LO HICE” confirma que la evitaste; está disponible desde la activación, una vez por periodo y solo si no registraste tropiezos.', '“I DID IT” means you did the behavior you want to avoid. “I DID NOT DO IT” confirms you avoided it; it is available from activation, once per period and only if you logged no setbacks.')}</p>
            ${p ? `<div class="habit-progress-meter"><div class="habit-meter-label"><label for="habit-meter-${esc(h.id)}">${max ? t('¡Llegaste al último nivel!', 'You reached the final level!') : t(`Camino al nivel ${h.difficulty_level+1}`, `On the way to level ${h.difficulty_level+1}`)}</label><strong>${max ? '7/7' : `${h.progress_count}/7`}</strong></div><progress id="habit-meter-${esc(h.id)}" max="7" value="${max ? 7 : h.progress_count}" aria-label="${max ? t('Último nivel alcanzado', 'Final level reached') : t('Progreso al siguiente nivel', 'Progress to next level')}"></progress>
                <p>${max ? t('Sigue cumpliendo esta meta para ganar premios.', 'Keep meeting this goal to earn rewards.') : t(`Completa tu meta 7 veces seguidas para llegar a ${next} ${this.unit(p.unit)}.`, `Meet your goal 7 times in a row to reach ${next} ${this.unit(p.unit)}.`)}</p></div>` : positive ? `<div class="habit-progress-meter habit-fixed-meter"><div class="habit-meter-label"><label for="habit-meter-${esc(h.id)}">${fixedLabel}</label><strong>${done ? t('¡Lista!', 'Done!') : !h.period ? t('Descanso', 'Rest day') : t('Pendiente', 'Not yet')}</strong></div><progress id="habit-meter-${esc(h.id)}" max="1" value="${done ? 1 : 0}"></progress><p>${t('Esta meta se mantiene igual. También ganas premios al completarla.', 'This goal stays the same. You still earn rewards for completing it.')}</p></div>` : ''}
            <div class="habit-reward-row"><span class="habit-reward">${esc(this.rewardText(h))}</span>${positive ? `<span class="habit-streak" title="${t('Cumplimientos seguidos', 'Completions in a row')}"><span aria-hidden="true">🔥</span> ${h.current_streak === 1 ? t('1 vez', '1 time') : t(`${h.current_streak} veces seguidas`, `${h.current_streak} in a row`)}</span>` : ''}</div>
            ${this.cycleSummary(h)}
            ${this.availabilityText(h) ? `<p class="habit-availability" role="status">${esc(this.availabilityText(h))}</p>` : ''}
            ${management ? '' : this.actionButtons(h)}
            ${management ? `<details class="habit-options"><summary>${t('Opciones e historial', 'Options and history')}</summary>
                ${h.description ? `<p class="habit-description">${esc(h.description)}</p>` : ''}
                ${positive ? `<p>${t('Mejor racha', 'Best streak')}: ${h.best_streak} ${t('veces seguidas', 'times in a row')}.</p>` : ''}
                ${p && !max ? `<p>${t('Si termina un periodo sin completar la meta, la cuenta de 7 vuelve a cero.', 'If a period ends without meeting the goal, the count of 7 starts over.')}</p><p>${bonusPaid ? t('Ya recibiste el premio extra del siguiente nivel.', 'You already received the next level bonus.') : t(`Premio extra al subir: +${h.rewards.bonus_xp} XP y +${h.rewards.bonus_gold} monedas.`, `Level-up bonus: +${h.rewards.bonus_xp} XP and +${h.rewards.bonus_gold} coins.`)}</p>` : ''}
                <div class="habit-actions">
                <button class="btn btn-secondary" onclick="HabitProgress.history('${esc(h.id)}')">${t('Historial', 'History')}</button>
                <button class="btn btn-secondary" onclick="HabitProgress.confirmReset('${esc(h.id)}')">${t('Reiniciar progreso', 'Reset progress')}</button>
                <button class="btn btn-danger" ${!this.rulesReady || this.deleteRemaining() ? 'disabled' : ''} onclick="HabitProgress.confirmDelete('${esc(h.id)}')">${t('Eliminar hábito', 'Delete habit')}</button>
                </div>${this.deleteRemaining() ? `<p class="habit-availability">${esc(this.managementNotice())}</p>` : ''}</details>` : ''}</article>`;
    },
    configForm(item) {
        const p = this.preset(item);
        if (!this.ready || item.type !== 'positive' || !p) return '';
        const t = this.text.bind(this);
        const stages = [];
        for (let value = p.initial; value <= p.max; value += p.step) stages.push(value);
        return `<details class="habit-config" id="config-${item.id}"><summary>${t('Ver niveles fijos', 'View fixed levels')}</summary>
            <p>${stages.join(' → ')} ${this.unit(p.unit)}</p>
            <p class="habit-config-example">${this.configExample(p)}</p>
            <p class="habit-config-help">${t('Las metas y los aumentos son iguales para todos. Alcanzar o superar el mínimo cuenta una vez por período; hacer más no salta niveles ni multiplica premios.', 'Goals and increases are the same for everyone. Reaching or exceeding the minimum counts once per period; doing more does not skip levels or multiply rewards.')}</p>
            <p class="habit-config-help">${t('Solo cuentan los días que elegiste. Los días de descanso no cortan tu avance.', 'Only your chosen days count. Rest days do not break your progress.')}</p></details>`;
    },
    readConfig(id, frequency) {
        return { catalog_id: id, frequency, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' };
    },
    async complete(id) {
        const h = GameState.habits.find(x => x.id === id);
        if (!h || h.type !== 'positive' || !this.available(h) || this.busy) return;
        // The click attests that the minimum was reached, not an exact measured amount.
        return this.submit(id, h.progression ? Number(h.current_target) : null, h.period);
    },
    closeModal() { document.getElementById('modal-root').innerHTML = ''; },
    async report(id, action) {
        const h = GameState.habits.find(x => x.id === id);
        if (!h || this.busy || (action !== 'abstain' && action !== 'lapse')) return;
        if (action === 'abstain' ? !this.abstinenceAvailable(h) : !this.canLapse(h)) return;
        return this.submit(id, null, h.period, action);
    },
    async submit(id,value,period,action = 'complete') {
        const before = GameState.habits.find(x => x.id === id);
        if (!before || this.busy) return;
        const view = GameState.currentView;
        const uid = GameState.user?.id;
        const key = `${uid}:${id}:${action}:${before.cycle_start_at}:${period}:${value}`;
        // Keep the UUID after a network error: retrying a lost response must not
        // charge another setback. The next acknowledged click gets a new UUID.
        let request = this.pendingRequests.get(key);
        if (!request) {
            request = { request_id: crypto.randomUUID(), expected_cycle_start_at: before.cycle_start_at };
            this.pendingRequests.set(key, request);
        }
        const result = await this.act(action,id,request,value,period);
        if (!result) return;
        this.pendingRequests.delete(key);
        this.closeModal();
        const t=this.text.bind(this), h=GameState.habits.find(x=>x.id===id);
        const success = ['completed','abstained'].includes(result.status);
        let message = success ? `${t('Registrado','Recorded')}: +${result.xp} XP / +${result.gold} G`
            : result.status === 'lapsed' ? `${t('Tropiezo registrado','Setback recorded')}: −${result.gold_lost} G / −${result.hp_lost} HP`
            : result.status === 'request_replayed' ? t('Ese intento ya se había guardado. No se aplicó otro cobro ni otra recompensa.', 'That attempt was already saved. No extra charge or reward was applied.')
            : result.status === 'cycle_failed' ? t('Ya registraste un tropiezo en este periodo. Podrás ganar la recompensa en el siguiente.', 'You already logged a setback this period. You can earn the reward next period.')
            : result.status === 'auto_archived' ? t('El hábito se desactivó tras 3 periodos sin cumplir. Puedes reactivarlo desde Hábitos.', 'The habit was deactivated after 3 missed periods. You can reactivate it from Habits.')
            : result.status === 'not_due' && action === 'abstain' ? t('Este periodo no está activo. Actualiza tus hábitos e inténtalo de nuevo.', 'This period is not active. Refresh your habits and try again.')
            : result.status === 'below_target'
            ? t('Cantidad guardada. Aún no alcanzaste el objetivo; puedes actualizarla en este período.', 'Amount saved. Target not reached yet; you can update it within this period.')
            : result.status === 'already_recorded' ? t('Este período ya estaba registrado. No se duplicaron recompensas.', 'This period was already recorded. Rewards were not duplicated.')
            : t('El período cambió o no está disponible. Revisa el calendario actualizado.', 'The period changed or is not due. Check the updated schedule.');
        if(result.advanced && h) message += ` · ${t('¡Nuevo nivel!', 'New level!')} ${h.difficulty_level}: ${h.current_target} ${this.unit(h.progression.unit)} · +${result.bonus_xp} XP / +${result.bonus_gold} G`;
        App.showToast(message, success ? 'success' : result.status === 'lapsed' ? 'error' : 'gold');
        if (success) window.Feedback?.play(result.advanced ? 'level' : 'success');
        if(GameState.user) App.navigate(view);
    },
    async confirmReset(id) {
        const h=GameState.habits.find(x=>x.id===id); if(!h || this.busy) return;
        if(!confirm(this.text(`¿Reiniciar el progreso de «${this.title(h)}»? La racha actual y el contador del próximo nivel volverán a cero, y la dificultad volverá al nivel inicial. Se conservarán descripción, frecuencia, objetivos, historial, mejor racha y recompensas. No podrás volver a cobrar este período ni bonificaciones ya obtenidas.`, `Reset progress for “${this.title(h)}”? Current streak and level progress become zero and difficulty returns to the initial level. Description, schedule, targets, history, best streak and earned rewards remain. Previously earned rewards cannot be claimed again.`))) return;
        const result = await this.act('reset',id);
        if (!result) return;
        if (result.status === 'saved') App.showToast(this.text('Progreso reiniciado; historial conservado.', 'Progress reset; history retained.'),'success');
        else if (result.status === 'auto_archived') App.showToast(this.text('El hábito se desactivó tras 3 periodos sin cumplir; su historial se conserva.', 'The habit was deactivated after 3 missed periods; its history is preserved.'),'gold');
        App.navigate('habits');
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
        let events = [];
        if (this.rulesReady) {
            let eventQuery=supabase.from('habit_events').select('*').eq('user_id',uid).eq('kind','auto_archived').order('created_at',{ascending:false}).limit(50);
            if(id) eventQuery=eventQuery.eq('habit_id',id);
            const result=await eventQuery; if(uid!==GameState.user?.id) return;
            if(result.error) {App.showToast(this.text('No se pudo cargar el historial.','Could not load history.'),'error');return;}
            events=(result.data || []).map(row=>({...row,...row.details,outcome:'auto_archived'}));
        }
        const rows=[...(data || []),...events].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,50);
        const t=this.text.bind(this), esc=Views.escape;
        const outcomes={completed:t('Completado','Completed'),missed:t('Sin completar','Missed'),below_target:t('Objetivo pendiente','Below target'),legacy:t('Registro anterior','Legacy completion'),abstained:t('NO LO HICE','I DID NOT DO IT'),lapsed:t('Tropiezos registrados','Setbacks logged'),auto_archived:t('Desactivado tras 3 periodos sin cumplir','Deactivated after 3 missed periods')};
        const date = row => new Intl.DateTimeFormat(I18N.current === 'en' ? 'en-US' : 'es-MX',{dateStyle:'short',timeStyle:'short'}).format(new Date(row.cycle_start_at || row.created_at));
        document.getElementById('modal-root').innerHTML=`<div class="modal-overlay"><section class="card habit-history" role="dialog" aria-modal="true" aria-labelledby="history-title"><h2 id="history-title">${t('Últimos 50 registros','Latest 50 entries')}</h2>${rows.map(row=>`<p><strong>${esc(row.title)}</strong> · ${esc(date(row))} · ${outcomes[row.outcome] || esc(row.outcome)}${row.lapse_count ? ` (${Number(row.lapse_count)})` : ''}${row.measured != null ? ` · ${Number(row.measured)}/${Number(row.target)}` : ''}<br>+${Number(row.xp || 0)+Number(row.bonus_xp || 0)} XP / +${Number(row.gold || 0)+Number(row.bonus_gold || 0)+Number(row.avatar_bonus_gold || 0)} G${row.gold_lost || row.hp_lost ? ` / −${Number(row.gold_lost || 0)} G / −${Number(row.hp_lost || 0)} HP` : ''}</p>`).join('') || `<p>${t('Todavía no hay registros.','No entries yet.')}</p>`}<button class="btn btn-secondary" onclick="HabitProgress.closeModal()">${t('CERRAR','CLOSE')}</button></section></div>`;
    }
};
window.HabitProgress = HabitProgress;
