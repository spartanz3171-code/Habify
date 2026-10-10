// ==========================================
// HABIFY - View Renderers (8-Bit Pixel Art)
// ==========================================

const Views = {
    renderCompanion(id, className = 'companion-sprite', options = {}) {
        if (!PetArt.supports(id)) return '';
        const name = I18N.t(`item.${id}.name`);
        return `<span class="${className}" role="img" aria-label="${this.escape(name)}">${PetArt.render(id, options)}</span>`;
    },
    escape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    classLabel(avatar) {
        const female = avatar.appearance?.body === 'female';
        const roles = I18N.current === 'en'
            ? { hero: 'Adventurer', mage: 'Arcane mage', knight: 'Royal knight', elf: 'Forest elf' }
            : { hero: female ? 'Aventurera' : 'Aventurero', mage: female ? 'Maga arcana' : 'Mago arcano', knight: female ? 'Caballera real' : 'Caballero real', elf: female ? 'Elfa del bosque' : 'Elfo del bosque' };
        return roles[avatar.avatarClass] || roles.hero;
    },

    // ========================================
    // AUTH VIEW (Login / Register)
    // ========================================
    renderAuth(mode = 'login') {
        const isLogin = mode === 'login';
        const t = (es, en) => I18N.current === 'en' ? en : es;
        return `
            <div class="auth-container">
                <div class="auth-party" aria-hidden="true">${CharacterArt.render({ avatarClass: 'elf', appearance: { body: 'female', hairStyle: 'ponytail', outfitColor: '#00a878' } })}${CharacterArt.render({ avatarClass: 'knight', appearance: { body: 'male', outfitColor: '#29adff' } })}${CharacterArt.render({ avatarClass: 'mage', appearance: { body: 'female', hairStyle: 'long', outfitColor: '#a855f7' } })}</div>
                <div class="auth-title">HABIFY</div>
                <div class="auth-subtitle">${isLogin ? t('Inicia sesión, aventurero', 'Sign in, adventurer') : t('Crea tu cuenta', 'Create your account')}</div>

                <div class="auth-error" id="auth-error" role="alert"></div>

                <form id="auth-form" onsubmit="App.handleAuth(event, '${mode}')">
                    <div class="form-group">
                        <label class="form-label" for="auth-email" data-i18n="auth.email">${I18N.t('auth.email')}</label>
                        <input type="email" class="form-input" id="auth-email" placeholder="tu@correo.com" autocomplete="email" maxlength="254" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="auth-password" data-i18n="auth.password">${I18N.t('auth.password')}</label>
                        <input type="password" class="form-input" id="auth-password" placeholder="${t('Mín. 6 caracteres', 'Min. 6 characters')}" autocomplete="${isLogin ? 'current-password' : 'new-password'}" minlength="6" required>
                    </div>
                    ${!isLogin ? `
                    <div class="form-group">
                        <label class="form-label" data-i18n="auth.name">${I18N.t('auth.name')}</label>
                        <input type="text" class="form-input" id="auth-avatar-name" placeholder="Tu nombre de heroe" maxlength="16" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label" data-i18n="auth.class">${I18N.t('auth.class')}</label>
                        <select class="form-input" id="auth-avatar-class" onchange="App.updateRegistrationPreview()" required>
                            <option value="hero">Heroe Aventurero</option>
                            <option value="mage">Mago Arcano</option>
                            <option value="knight">Caballero Real</option>
                            <option value="elf">Elfo del Bosque</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="auth-avatar-body">${I18N.current === 'en' ? 'CHARACTER' : 'PERSONAJE'}</label>
                        <select class="form-input" id="auth-avatar-body" onchange="App.updateRegistrationPreview()"><option value="female">${I18N.current === 'en' ? 'Woman' : 'Mujer'}</option><option value="male">${I18N.current === 'en' ? 'Man' : 'Hombre'}</option></select>
                    </div>
                    <div id="registration-preview" class="registration-preview">${CharacterArt.render({ avatarClass: 'hero', appearance: { body: 'female', hairStyle: 'ponytail' } })}</div>
                    <p class="form-help">${I18N.current === 'en' ? 'Customize your look anytime from Character.' : 'Podrás personalizar tu apariencia desde Personaje.'}</p>
                    <p class="form-help auth-verification-help">${t('Usa un correo al que tengas acceso. Te enviaremos un enlace para verificarlo antes de entrar.', 'Use an email you can access. We will send a verification link before you can sign in.')}</p>
                    ` : ''}
                    <button type="submit" class="btn btn-primary btn-block" id="auth-submit">
                        ${isLogin ? '>> ' + I18N.t('auth.login') + ' <<' : '>> ' + I18N.t('auth.register') + ' <<'}
                    </button>
                </form>
                ${isLogin ? `<button type="button" class="auth-text-button" id="forgot-password" onclick="PasswordRecovery.requestView()">${t('¿Olvidaste tu contraseña?', 'Forgot your password?')}</button>` : ''}

                <div class="auth-switch">
                    ${isLogin
                ? `${t('¿No tienes cuenta?', 'No account yet?')} <button type="button" class="auth-text-button" onclick="App.showAuth('register')">${t('Regístrate', 'Register')}</button>`
                : `${t('¿Ya tienes cuenta?', 'Already have an account?')} <button type="button" class="auth-text-button" onclick="App.showAuth('login')">${t('Inicia sesión', 'Sign in')}</button>`}
                </div>

                <div style="margin-top: 22px; padding-top: 12px; border-top: 1px solid var(--pixel-dark-gray); text-align: center;">
                    <a onclick="App.openAdminPanel()" style="font-size: 6px; color: var(--text-muted); opacity: 0.6; text-decoration: none; cursor: pointer; letter-spacing: 0.5px;">
                        🛡️ ACCESO ADMINISTRATIVO / DEV
                    </a>
                </div>
            </div>
        `;
    },

    renderEmailVerification(email, options = {}) {
        const t = (es, en) => I18N.current === 'en' ? en : es;
        return `<section class="auth-container auth-verification" id="email-verification" aria-labelledby="verification-title">
            <div class="auth-title">HABIFY</div>
            <div class="verification-emblem" aria-hidden="true">✉</div>
            <h1 id="verification-title">${t('Verifica tu correo', 'Verify your email')}</h1>
            <p class="verification-intro">${t('Tu aventura empieza con un correo confirmado.', 'Your adventure starts with a verified email.')}</p>
            <p class="verification-address" id="verification-email">${this.escape(email)}</p>
            <p class="verification-status" id="verification-status" role="status" aria-live="polite">${options.sent
                ? t('Si el correo puede registrarse, recibirás un enlace de verificación. Ábrelo para confirmar tu cuenta.', 'If the email can be registered, you will receive a verification link. Open it to confirm your account.')
                : t('Abre el enlace que recibiste para confirmar tu cuenta. Puedes solicitar uno nuevo aquí.', 'Open the link you received to confirm your account. You can request a new one here.')}</p>
            <p class="form-help">${t('Revisa también la carpeta de spam. Después de confirmar, podrás iniciar sesión con tu correo y contraseña.', 'Check your spam folder too. After confirming, sign in with your email and password.')}</p>
            <div class="auth-error ${options.error ? 'show' : ''}" id="auth-error" role="alert">${this.escape(options.error || '')}</div>
            <div class="verification-actions">
                <button type="button" class="btn btn-primary btn-block" id="verification-resend" onclick="App.resendVerification()">${t('REENVIAR VERIFICACIÓN', 'RESEND VERIFICATION')}</button>
                <button type="button" class="btn btn-secondary btn-block" id="verification-login" onclick="App.showAuth('login')">${t('IR A INICIAR SESIÓN', 'GO TO SIGN IN')}</button>
            </div>
            <button type="button" class="auth-text-button" onclick="App.showAuth('register')">${t('¿Escribiste mal el correo? Corregirlo', 'Wrong email? Correct it')}</button>
        </section>`;
    },

    // ========================================
    // LOADING VIEW
    // ========================================
    renderLoading() {
        return `
            <div class="loading-screen">
                <div class="pixel-spinner"></div>
                <div class="loading-text" data-i18n="toast.loading">${I18N.t('toast.loading')}</div>
            </div>
        `;
    },

    // ========================================
    // DASHBOARD VIEW
    // ========================================
    renderDashboard() {
        const a = GameState.avatar;
        const xpPercent = Math.min(100, (a.currentXP / a.xpToLevel) * 100);
        const hpPercent = (a.hp / a.maxHp) * 100;
        const completionRate = Engine.getCompletionRate();

        const petHtml = this.renderCompanion(a.equippedPet);
        let bgClass = '';
        if (a.equippedBackground) {
            bgClass = a.equippedBackground;
        }

        // Equipped items text
        let equippedHtml = '';
        if (a.equippedPet || a.equippedWeapon || a.equippedShield || a.equippedSpell) {
            equippedHtml = '<div class="equipped-items">';
            const addIcon = (itemId) => {
                const item = GameState.inventory.find(i => i.id === itemId);
                if (item) equippedHtml += `<span class="equipped-item"><span class="equipped-item-icon">${item.icon}</span>${item.name}</span>`;
            };
            if (a.equippedWeapon) addIcon(a.equippedWeapon);
            if (a.equippedShield) addIcon(a.equippedShield);
            if (a.equippedSpell) {
                const spellIds = a.equippedSpell.split(',');
                spellIds.forEach(id => addIcon(id));
            }
            if (a.equippedPet) addIcon(a.equippedPet);
            if (a.equippedBackground) {
                const bgItem = GameState.inventory.find(i => i.id === a.equippedBackground);
                if (bgItem) equippedHtml += `<span class="equipped-item"><span class="equipped-item-icon">🖼️</span>Fondo</span>`;
            }
            equippedHtml += '</div>';
        }

        const displayClass = this.classLabel(a);

        let html = `
            <section class="page-heading"><div><span class="eyebrow">${I18N.current === 'en' ? 'EVERY HABIT COUNTS' : 'CADA HÁBITO CUENTA'}</span><h1>${I18N.current === 'en' ? 'Your adventure' : 'Tu aventura'}</h1><p>${I18N.current === 'en' ? 'Small steps. A stronger hero.' : 'Pequeños pasos. Un personaje más fuerte.'}</p></div><button class="btn btn-secondary" onclick="App.navigate('character')">${I18N.current === 'en' ? 'CUSTOMIZE' : 'PERSONALIZAR'} ↗</button></section>
            <div class="avatar-section ${bgClass}">
                <div class="hero-profile-art"><span class="scene-star star-one">✦</span><span class="scene-star star-two">✦</span><div class="hero-plinth"></div>${CharacterArt.render(a, { state: a.isDead ? 'DEAD' : 'IDLE' })}${petHtml}</div>
                <div class="hero-profile-info">
                <span class="eyebrow">${I18N.current === 'en' ? 'YOUR HERO' : 'TU PERSONAJE'}</span>
                <div class="avatar-name">${this.escape(a.name)}</div>
                <div class="avatar-level">${displayClass} · ${I18N.t('dashboard.level')} ${a.level}</div>

                <div class="avatar-stats">
                    <div class="stat-item">
                        <span class="stat-value gold">${a.gold}G</span>
                        <span class="stat-label" data-i18n="dashboard.gold">${I18N.t('dashboard.gold')}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value green">LV${a.level}</span>
                        <span class="stat-label" data-i18n="dashboard.level">${I18N.t('dashboard.level')}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value red">${a.hp}HP</span>
                        <span class="stat-label" data-i18n="dashboard.hp">${I18N.t('dashboard.hp')}</span>
                    </div>
                </div>

                <div class="progress-group">
                    <div class="progress-header">
                        <span class="progress-label" data-i18n="dashboard.exp">${I18N.t('dashboard.exp')}</span>
                        <span class="progress-value">${a.currentXP}/${a.xpToLevel}</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill xp" style="width: ${xpPercent}%"></div>
                    </div>
                </div>

                <div class="progress-group">
                    <div class="progress-header">
                        <span class="progress-label" data-i18n="dashboard.health">${I18N.t('dashboard.health')}</span>
                        <span class="progress-value">${Math.floor(hpPercent)}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill hp" style="width: ${hpPercent}%"></div>
                    </div>
                </div>
            </div>

            </div>

            <div class="section-header" style="margin-top: 20px;">
                <h3 class="section-title" data-i18n="dashboard.inventory">${I18N.t('dashboard.inventory')}</h3>
            </div>
            ${equippedHtml}

            ${a.isDead ? `
                <div class="card" style="border-color: var(--pixel-red); text-align: center;">
                    <div style="font-size: 10px; color: var(--pixel-red); margin-bottom: 6px;">
                        ${I18N.t('dashboard.dead_title')}
                    </div>
                    <div style="font-size: 7px; color: var(--text-muted); margin-bottom: 10px;">
                        ${I18N.t('dashboard.dead_desc')}
                    </div>
                </div>
            ` : ''}

            <div class="section-header">
                <span class="section-title" data-i18n="dashboard.habits">${I18N.t('dashboard.habits')}</span>
                <span class="section-badge">${completionRate}%</span>
            </div>
        `;

        if (GameState.habits.length === 0) {
            html += `
                <div class="empty-state">
                    <span class="empty-state-icon">📝</span>
                    <p class="empty-state-text" data-i18n="dashboard.empty_title">${I18N.t('dashboard.empty_title')}</p>
                    <button class="btn btn-primary" onclick="App.navigate('habits')" data-i18n="dashboard.btn_go">${I18N.t('dashboard.btn_go')}</button>
                </div>
            `;
        } else {
            html += '<div class="habit-list">';
            GameState.habits.forEach(h => {
                if (HabitProgress.ready) { html += HabitProgress.card(h); return; }
                const onCooldown = isOnCooldown(h);
                const cooldownText = getRemainingCooldown(h);
                const typeClass = h.type === 'positive' ? 'positive' : 'negative';
                const isCompleted = onCooldown;

                const rewardText = h.type === 'positive'
                    ? `<span class="habit-reward">+${h.xpReward}XP +${h.goldReward}G</span>`
                    : `<span class="habit-penalty">-${h.hpPenalty}HP</span>`;

                const cooldownHtml = cooldownText
                    ? `<span class="habit-cooldown" data-habit-id="${h.id}">${cooldownText}</span>`
                    : '';

                html += `
                    <div class="habit-item ${typeClass} ${isCompleted ? 'completed' : ''} ${onCooldown ? 'on-cooldown' : ''}"
                         ${!onCooldown ? `onclick="App.toggleHabit('${h.id}')"` : ''}
                         id="habit-${h.id}">
                        <div class="habit-checkbox">${isCompleted ? '✓' : ''}</div>
                        <div class="habit-info">
                            <div class="habit-title">${h.title}</div>
                            ${onCooldown ? cooldownHtml : rewardText}
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        }

        return html;
    },

    // ========================================
    // ========================================
    // HABITS MANAGEMENT VIEW (CATALOG & ACTIVE)
    // ========================================
    renderHabits() {
        const habits = GameState.habits;
        const editCooldown = HabitProgress.ready ? null : getHabitEditCooldown();
        const atCap = habits.length >= 20;
        const catalogFilter = GameState._catalogFilter || 'all';
        const t = HabitProgress.text.bind(HabitProgress);

        let html = `
            <div class="section-header">
                <h2 class="section-title" data-i18n="habits.title">${I18N.t('habits.title')}</h2>
                <div class="section-badge" style="border-color: ${atCap ? 'var(--pixel-red)' : 'var(--pixel-cyan)'}; color: ${atCap ? 'var(--pixel-red)' : 'var(--pixel-gold)'};">
                    ${habits.length}/20
                </div>
            </div>
            
            ${HabitProgress.ready ? `<section class="habit-quick-guide" aria-label="${t('Cómo funcionan los hábitos', 'How habits work')}"><p>${t('Un paso pequeño cada día', 'One small step each day')}</p><ol><li><span>1</span>${t('Elige un hábito', 'Choose a habit')}</li><li><span>2</span>${t('Cumple tu meta', 'Meet your goal')}</li><li><span>3</span>${t('Marca Completado', 'Mark completed')}</li></ol><small>${t('Ganas monedas y experiencia (XP) para tu personaje.', 'Earn coins and experience (XP) for your character.')}</small></section><details class="habit-management-notice" ${!HabitProgress.rulesReady ? 'open' : ''}><summary>${t('Sobre eliminar hábitos', 'About deleting habits')}</summary><p role="status">${this.escape(HabitProgress.managementNotice())}</p></details>` : ''}
            ${editCooldown ? `
            <div class="card" style="border-color: var(--pixel-red); margin-bottom: 12px; text-align: center;">
                <div style="font-size: 9px; color: var(--pixel-red); margin-bottom: 4px;">🔒 ELIMINACIÓN BLOQUEADA</div>
                <div style="font-size: 7px; color: var(--text-muted);">
                    Podrás eliminar hábitos en: <span style="color:var(--pixel-accent);">${editCooldown}</span>
                </div>
            </div>
            ` : ''}

            ${habits.length >= 12 ? `
            <div class="card" style="border-color: var(--pixel-gold); margin-bottom: 12px; text-align: center; background: rgba(255, 236, 39, 0.05);">
                <div style="font-size: 8px; color: var(--pixel-gold); margin-bottom: 4px;">⚠️ ALTO RIESGO / ALTA RECOMPENSA</div>
                <div style="font-size: 7px; color: var(--text-muted);">Tienes ${habits.length} misiones activas. ¡Si descuidas tus hábitos perderás mucha vida en las penalizaciones!</div>
            </div>
            ` : ''}

            ${atCap ? `
            <div class="card" style="border-color: var(--pixel-red); margin-bottom: 12px; text-align: center;">
                <div style="font-size: 9px; color: var(--pixel-red); margin-bottom: 4px;">⚠️ LÍMITE MÁXIMO ALCANZADO (20/20)</div>
                <div style="font-size: 7px; color: var(--text-muted);">Elimina una misión existente para poder activar otra.</div>
            </div>
            ` : ''}

            <!-- MISIONES ACTIVAS -->
            <div class="section-header" style="margin-top: 10px;">
                <span class="section-title" data-i18n="habits.active_title">${I18N.t('habits.active_title')}</span>
                <span class="section-badge">${habits.length}</span>
            </div>
        `;

        if (habits.length === 0) {
            html += `
                <div class="empty-state" style="margin-bottom: 20px;">
                    <span class="empty-state-icon">📜</span>
                    <div class="empty-state-text" data-i18n="habits.empty">${I18N.t('habits.empty')}</div>
                    <p style="font-size: 7px; color: var(--pixel-gold); margin-top: 6px;">¡Explora el catálogo abajo para activar tus primeras misiones!</p>
                </div>
            `;
        } else {
            html += '<div class="habit-list" style="margin-bottom: 20px;">';
            habits.forEach(h => {
                if (HabitProgress.ready) { html += HabitProgress.card(h, true); return; }
                const typeClass = h.type === 'positive' ? 'positive' : 'negative';
                const rewardText = h.type === 'positive'
                    ? `<span class="habit-reward">+${h.xpReward}XP +${h.goldReward}G</span>`
                    : `<span class="habit-penalty">-${h.hpPenalty}HP</span>`;
                const freqInfo = FREQUENCY_CONFIGS[h.frequency] || FREQUENCY_CONFIGS.daily;

                html += `
                    <div class="habit-item ${typeClass}">
                        <div class="habit-checkbox" style="border-color: ${h.type === 'positive' ? 'var(--pixel-green)' : 'var(--pixel-red)'}; color: var(--text-secondary); font-size: 8px;">
                            ${h.type === 'positive' ? '+' : '-'}
                        </div>
                        <div class="habit-info">
                            <div class="habit-title">${h.title}</div>
                            <div style="display: flex; gap: 8px; align-items: center; margin-top: 2px;">
                                ${rewardText}
                                <span style="font-size: 6px; padding: 1px 4px; background: var(--bg-input); border: 1px solid var(--pixel-dark-gray); color: var(--pixel-cyan);">
                                    ${freqInfo.label}
                                </span>
                            </div>
                        </div>
                        ${!editCooldown
                            ? `<button class="habit-delete" onclick="App.deleteHabit('${h.id}')" title="Eliminar">X</button>`
                            : `<span style="font-size:10px; opacity:0.45; padding:4px 6px;" title="Bloqueado ${editCooldown}">🔒</span>`
                        }
                    </div>
                `;
            });
            html += '</div>';
        }

        // EXPLORADOR DEL CATÁLOGO DE HÁBITOS
        html += `
            <div class="divider"></div>
            <div class="catalog-explorer">
                <div class="section-header">
                    <div>
                        <h2 class="section-title" data-i18n="habits.catalog_title">${I18N.t('habits.catalog_title')}</h2>
                        <div style="font-size: 7px; color: var(--text-muted); margin-top: 4px;" data-i18n="habits.catalog_desc">${I18N.t('habits.catalog_desc')}</div>
                    </div>
                </div>

                <div class="catalog-filter-tabs">
                    <button class="catalog-filter-btn ${catalogFilter === 'all' ? 'active' : ''}" onclick="App.filterCatalog('all')" data-i18n="habits.filter_all">${I18N.t('habits.filter_all')}</button>
                    <button class="catalog-filter-btn ${catalogFilter === 'health' ? 'active' : ''}" onclick="App.filterCatalog('health')" data-i18n="habits.filter_health">${I18N.t('habits.filter_health')}</button>
                    <button class="catalog-filter-btn ${catalogFilter === 'fitness' ? 'active' : ''}" onclick="App.filterCatalog('fitness')" data-i18n="habits.filter_fitness">${I18N.t('habits.filter_fitness')}</button>
                    <button class="catalog-filter-btn ${catalogFilter === 'productivity' ? 'active' : ''}" onclick="App.filterCatalog('productivity')" data-i18n="habits.filter_productivity">${I18N.t('habits.filter_productivity')}</button>
                    <button class="catalog-filter-btn ${catalogFilter === 'mind' ? 'active' : ''}" onclick="App.filterCatalog('mind')" data-i18n="habits.filter_mind">${I18N.t('habits.filter_mind')}</button>
                    <button class="catalog-filter-btn ${catalogFilter === 'finance' ? 'active' : ''}" onclick="App.filterCatalog('finance')" data-i18n="habits.filter_finance">${I18N.t('habits.filter_finance')}</button>
                    <button class="catalog-filter-btn ${catalogFilter === 'negative' ? 'active' : ''}" onclick="App.filterCatalog('negative')" data-i18n="habits.filter_negative">${I18N.t('habits.filter_negative')}</button>
                </div>

                <div class="catalog-grid">
        `;

        const catalog = GameState.presetCatalog || PRESET_HABITS_CATALOG;
        const filteredCatalog = catalogFilter === 'all' 
            ? catalog 
            : catalog.filter(item => item.category === catalogFilter);

        filteredCatalog.forEach(item => {
            const activeHabit = GameState.habits.find(h => h.catalog_id === item.id || h.title === item.title);
            const alreadyActive = !!activeHabit;
            const isNegative = item.type === 'negative';

            html += `
                <div class="catalog-card ${alreadyActive ? 'active-in-habits' : ''} ${isNegative ? 'negative' : ''}">
                    <div>
                        <div class="catalog-card-header">
                            <span class="catalog-card-icon">${this.escape(item.icon)}</span>
                            <span class="catalog-card-title">${this.escape(HabitProgress.ready ? activeHabit ? HabitProgress.title(activeHabit) : HabitProgress.catalogTitle(item) : item.title)}</span>
                        </div>
                        <div class="catalog-card-desc">${this.escape(item.description)}</div>
                        <div class="catalog-card-meta"><span data-habit-reward>${this.escape(HabitProgress.rewardText(activeHabit || item, HabitProgress.ready && !alreadyActive && !isNegative && !!HabitProgress.preset(item)))}</span><span class="catalog-category">${this.escape(I18N.t('habits.filter_' + item.category))}</span></div>
                    </div>

                    <div>
                        <div class="catalog-card-freq">
                            <label for="freq-select-${item.id}" data-i18n="habits.frequency_label">${I18N.t('habits.frequency_label')}</label>
                            <select id="freq-select-${item.id}" ${alreadyActive ? 'disabled' : ''}>
                                <option value="daily" ${item.defaultFrequency === 'daily' ? 'selected' : ''}>${HabitProgress.ready ? HabitProgress.frequency('daily') : 'Diario (24h)'}</option>
                                <option value="workdays" ${item.defaultFrequency === 'workdays' ? 'selected' : ''}>${HabitProgress.ready ? HabitProgress.frequency('workdays') : 'Días Laborales (Lun-Vie)'}</option>
                                <option value="3x_week" ${item.defaultFrequency === '3x_week' ? 'selected' : ''}>${HabitProgress.ready ? HabitProgress.frequency('3x_week') : '3 veces por semana (48h)'}</option>
                                <option value="2x_week" ${item.defaultFrequency === '2x_week' ? 'selected' : ''}>${HabitProgress.ready ? HabitProgress.frequency('2x_week') : '2 veces por semana (72h)'}</option>
                                <option value="weekly" ${item.defaultFrequency === 'weekly' ? 'selected' : ''}>${HabitProgress.ready ? HabitProgress.frequency('weekly') : 'Semanal (7 días)'}</option>
                            </select>
                        </div>

                        ${!alreadyActive ? HabitProgress.configForm(item) : ''}
                        ${alreadyActive ? `
                            <button class="btn btn-secondary btn-block" style="font-size:7px; padding: 6px; opacity: 0.7;" disabled data-i18n="habits.btn_activated">
                                ${I18N.t('habits.btn_activated')}
                            </button>
                        ` : atCap ? `
                            <button class="btn btn-secondary btn-block" style="font-size:7px; padding: 6px; opacity: 0.5;" disabled>
                                LÍMITE (20/20)
                            </button>
                        ` : `
                            <button class="btn btn-primary btn-block" style="font-size:7px; padding: 6px;" onclick="App.activateCatalogHabit('${item.id}')" data-i18n="habits.btn_activate">
                                ${I18N.t('habits.btn_activate')}
                            </button>
                        `}
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>

            <div class="divider" style="margin-top: 24px;"></div>
            <div class="flex-center gap-8 habit-page-actions">
                ${HabitProgress.ready ? `<button class="btn btn-secondary btn-sm" onclick="HabitProgress.history()">${HabitProgress.text('HISTORIAL GENERAL', 'ALL HISTORY')}</button>` : ''}
                <button class="btn btn-secondary btn-sm" onclick="App.confirmReset()">
                    ${I18N.current === 'en' ? 'RELOAD APP' : 'RECARGAR APLICACIÓN'}
                </button>
                <button class="btn btn-secondary btn-sm" onclick="App.logout()">
                    SALIR
                </button>
            </div>
        `;

        return html;
    },

    // ========================================
    // STORE VIEW
    // ========================================
    renderStore() {
        const filter = GameState._storeFilter || 'all';
        const t = (es, en) => I18N.current === 'en' ? en : es;

        let html = `
            <div class="section-header" style="margin-bottom:16px;">
                <h2 class="section-title" data-i18n="store.header">${I18N.t('store.header')}</h2>
                <div class="stat-value gold" style="font-size:14px;">${GameState.avatar.gold} G</div>
            </div>

            <button class="wardrobe-banner" onclick="App.navigate('character')"><span class="wardrobe-banner-art">${CharacterArt.render({ ...GameState.avatar, appearance: { ...GameState.avatar.appearance, accessory: 'acc_cape' } })}</span><span><span class="eyebrow">${I18N.current === 'en' ? 'NEW · WARDROBE' : 'NUEVO · GUARDARROPA'}</span><strong>${I18N.current === 'en' ? 'Make your hero your own' : 'Tu personaje, a tu manera'}</strong><span>${I18N.current === 'en' ? 'Outfits, headwear and accessories' : 'Atuendos, cascos y accesorios'}</span></span><span class="banner-arrow">↗</span></button>

            <div class="store-filter-tabs">
                <button class="store-filter-tab ${filter === 'all' ? 'active' : ''}" onclick="App.filterStore('all')" data-i18n="store.all">${I18N.t('store.all')}</button>
                <button class="store-filter-tab ${filter === 'outfit' ? 'active' : ''}" onclick="App.filterStore('outfit')">${t('ATUENDOS', 'OUTFITS')}</button>
                <button class="store-filter-tab ${filter === 'headwear' ? 'active' : ''}" onclick="App.filterStore('headwear')">${t('CASCOS', 'HEADWEAR')}</button>
                <button class="store-filter-tab ${filter === 'accessory' ? 'active' : ''}" onclick="App.filterStore('accessory')">${t('ACCESORIOS', 'ACCESSORIES')}</button>
                <button class="store-filter-tab ${filter === 'weapon' ? 'active' : ''}" onclick="App.filterStore('weapon')" data-i18n="store.weapons">${I18N.t('store.weapons')}</button>
                <button class="store-filter-tab ${filter === 'spell' ? 'active' : ''}" onclick="App.filterStore('spell')" data-i18n="store.spells">${I18N.t('store.spells')}</button>
                <button class="store-filter-tab ${filter === 'pet' ? 'active' : ''}" onclick="App.filterStore('pet')" data-i18n="store.pets">${I18N.t('store.pets')}</button>
                <button class="store-filter-tab ${filter === 'background' ? 'active' : ''}" onclick="App.filterStore('background')" data-i18n="store.backgrounds">${I18N.t('store.backgrounds')}</button>
            </div>

        `;

        if (['all', 'outfit', 'accessory', 'headwear'].includes(filter)) {
            const cosmetics = Wardrobe.listCosmetics().filter(item => filter === 'all' || item.slot === filter);
            const title = filter === 'headwear' ? t('CASCOS', 'HEADWEAR') : filter === 'accessory' ? t('ACCESORIOS', 'ACCESSORIES') : filter === 'outfit' ? t('ATUENDOS', 'OUTFITS') : t('ATUENDOS, CASCOS Y ACCESORIOS', 'OUTFITS, HEADWEAR & ACCESSORIES');
            html += `<section class="store-wardrobe"><div class="section-header"><h3 class="section-title">${title}</h3><span class="collection-label">${t('PARA TODAS LAS CLASES', 'FOR EVERY CLASS')}</span></div>${Atelier.renderCosmeticCards(cosmetics)}</section>`;
        }

        const filtered = filter === 'all'
            ? GameState.shopItems
            : GameState.shopItems.filter(i => i.type === filter);

        if (filtered.length) {
            if (filter === 'all') html += `<div class="section-header"><h3 class="section-title">${t('EQUIPO Y COMPAÑEROS', 'GEAR & COMPANIONS')}</h3></div>`;
            html += '<div class="store-grid">';
        }

        filtered.forEach(item => {
            const canAfford = GameState.avatar.gold >= item.cost;
            const isPurchased = item.purchased;
            const pet = item.type === 'pet' && PetArt.supports(item.id);
            const isSpell = item.type === 'spell';
            const spellKind = item.id === 'spell_fire' ? 'fire' : item.id === 'spell_heal' ? 'heal' : 'arcane';
            const visual = pet ? PetArt.render(item.id) : isSpell ? `<span class="shop-spell-art shop-spell-${spellKind}" aria-hidden="true"><i></i><i></i><i></i></span>` : this.escape(item.icon);

            html += `
                <div class="store-card ${isPurchased ? 'purchased' : ''}" data-item-id="${this.escape(item.id)}">
                    <span class="store-card-icon ${pet ? 'store-pet-art' : isSpell ? 'store-spell-art' : ''}">${visual}</span>
                    <div class="store-card-name">${this.escape(item.name)}</div>
                    <div class="store-card-desc">${this.escape(item.description)}</div>
                    <div class="store-card-price">${item.cost}G</div>
                    ${!isPurchased ? `<button class="btn btn-gold store-purchase" onclick="App.buyItem('${this.escape(item.id)}')" ${App.shopBusy || Atelier.busy || !canAfford ? 'disabled' : ''}>${canAfford ? t('COMPRAR', 'BUY') : t('FALTA ORO', 'NEED GOLD')}</button>` : `<span class="store-owned-label">${t('EN TU INVENTARIO', 'IN YOUR INVENTORY')}</span>`}
                </div>
            `;
        });

        if (filtered.length) html += '</div>';

        // Inventory
        if (GameState.inventory.length > 0) {
            html += `
                <div class="divider"></div>
                <div class="section-header">
                    <span class="section-title">INVENTARIO</span>
                    <span class="section-badge">${GameState.inventory.length}</span>
                </div>
                <div class="inventory-grid">
            `;

            GameState.inventory.forEach(item => {
                const isEquipped =
                    GameState.avatar.equippedBackground === item.id ||
                    GameState.avatar.equippedPet === item.id ||
                    GameState.avatar.equippedWeapon === item.id ||
                    GameState.avatar.equippedShield === item.id ||
                    (GameState.avatar.equippedSpell && GameState.avatar.equippedSpell.split(',').includes(item.id));

                html += `
                    <button type="button" ${App.shopBusy || Atelier.busy ? 'disabled' : ''} class="inventory-item ${isEquipped ? 'equipped' : ''}" onclick="App.equipItem('${item.id}')">
                        <span class="inventory-item-icon ${PetArt.supports(item.id) ? 'inventory-pet-art' : ''}">${PetArt.supports(item.id) ? PetArt.render(item.id) : this.escape(item.icon)}</span>
                        <span>${item.name}</span>
                        ${isEquipped ? '<span style="color: var(--pixel-green);">*</span>' : ''}
                    </button>
                `;
            });
            html += '</div>';
        }

        return html;
    },

    // ========================================
    // ARENA VIEW
    // ========================================
    renderArena() {
        const a = GameState.avatar;
        const t = (es, en) => I18N.current === 'en' ? en : es;
        if (!GameState._currentOpponent) GameState._currentOpponent = Engine.generateOpponent();
        const b = GameState.currentBattle;
        const fighting = b && !b.isFinished;
        const opp = fighting ? b.opponent : GameState._currentOpponent;
        const background = /^bg_[a-z]+$/.test(a.equippedBackground || '') ? a.equippedBackground : '';
        const control = (action, icon, label, key, style = '') => `<button type="button" class="rt-btn ${style}" data-action="${action}" aria-label="${label}" title="${label} (${key})"><span class="rt-btn-icon" aria-hidden="true">${icon}</span><span class="rt-btn-label">${label}</span><kbd>${key}</kbd></button>`;
        let html = `<section class="page-heading"><div><span class="eyebrow">${t('PON A PRUEBA TU PROGRESO', 'PUT YOUR PROGRESS TO THE TEST')}</span><h1>${t('Arena de combate', 'Battle arena')}</h1><p>${t('Muévete, salta y encuentra el momento de atacar.', 'Move, jump and find your opening.')}</p></div><span class="arena-mode">PvE</span></section>`;
        if (fighting) {
            html += `<div class="battle-hud"><div class="hud-unit player"><div class="hud-label">${this.escape(a.name)} <span>LV ${a.level}</span></div><div class="hud-bar-container"><div id="rt-p-hp-fill" class="hud-bar-fill hp" style="width:${b.playerHp / b.playerMaxHp * 100}%"></div><div id="rt-p-hp-text" class="hud-bar-text">${b.playerHp}/${b.playerMaxHp}</div></div></div><span class="hud-vs-badge">VS</span><div class="hud-unit enemy"><div class="hud-label">${this.escape(opp.name)} <span>LV ${opp.level}</span></div><div class="hud-bar-container"><div id="rt-e-hp-fill" class="hud-bar-fill enemy-hp" style="width:${b.oppHp / b.oppMaxHp * 100}%"></div><div id="rt-e-hp-text" class="hud-bar-text">${b.oppHp}/${b.oppMaxHp}</div></div></div></div>
                <div id="real-time-arena" class="arena-stage ${background}" role="region" aria-label="${t('Combate en tiempo real', 'Real-time battle')}"></div>
                <div class="rt-controls"><div class="rt-cluster rt-cluster-move">${control('left', '←', t('IZQ', 'LEFT'), 'A / ←', 'rt-btn-dir')}${control('right', '→', t('DER', 'RIGHT'), 'D / →', 'rt-btn-dir')}${control('up', '↑', t('SALTO', 'JUMP'), 'W / ↑', 'rt-btn-jump')}</div>
                <div class="rt-cluster rt-cluster-action">${control('attack', '✦', t('GOLPE', 'HIT'), 'Z', 'rt-btn-attack')}${control('heavy', '✹', t('FUERTE', 'HEAVY'), 'V', 'rt-btn-heavy')}${control('guard', '◈', t('DEFENSA', 'GUARD'), 'C', 'rt-btn-guard')}${a.equippedSpell?.includes('spell_heal') ? control('heal', '♥', t('CURAR', 'HEAL'), 'H', 'rt-btn-heal') : ''}${a.equippedSpell?.includes('spell_fire') ? control('fire', '♨', t('FUEGO', 'FIRE'), 'X', 'rt-btn-fire') : ''}${!a.equippedSpell?.includes('spell_fire') && !a.equippedSpell?.includes('spell_heal') && a.level >= 2 ? control('magic', '✧', t('MAGIA', 'MAGIC'), 'X', 'rt-btn-magic') : ''}</div></div>
                <div class="combat-footer"><p>${t('Z encadena · V golpe fuerte · C defiende. Contorno dorado: el rival puede contraatacar.', 'Z combos · V heavy hit · C guard. Gold outline: your rival can retaliate.')}</p><button id="btn-flee-battle" class="btn btn-secondary" onclick="App.surrenderBattle()">${t('RETIRARSE', 'RETREAT')} ↗</button></div>`;
        } else {
            html += `<div class="arena-stage arena-preview ${background}"><div class="arena-preview-top"><span>HABIFY ARENA</span><span>${t('COMBATE LOCAL', 'LOCAL BATTLE')}</span></div><div class="arena-fighters"><div class="arena-fighter player">${CharacterArt.render(a, { state: a.isDead ? 'DEAD' : 'IDLE' })}<div class="arena-fighter-name">${this.escape(a.name)}</div><div class="arena-fighter-level">${this.classLabel(a)} · LV ${a.level}</div></div><div class="arena-vs">VS</div><div class="arena-fighter enemy">${CharacterArt.renderMonster(opp.sprite, { facing: 'left' })}<div class="arena-fighter-name">${this.escape(opp.name)}</div><div class="arena-fighter-level">LV ${opp.level}</div></div></div></div>`;
            const r = GameState._lastBattleResult;
            if (r) html += `<div class="battle-result ${r.won ? 'victory' : 'defeat'}" role="status"><div class="battle-result-title">${r.won ? t('¡VICTORIA!', 'VICTORY!') : (r.fled ? t('RETIRADA', 'RETREAT') : t('DERROTA', 'DEFEAT'))}</div><div class="battle-result-detail">${this.escape(r.message)}</div></div>`;
            html += `<div class="arena-start-actions"><button class="btn btn-primary" onclick="App.startBattle('pve')" id="battle-btn" ${a.isDead || a.hp <= 0 ? 'disabled' : ''}>${t('ENTRAR A LA ARENA', 'ENTER THE ARENA')} →</button><button class="btn btn-secondary" onclick="App.newOpponent()">${t('CAMBIAR RIVAL', 'CHANGE RIVAL')}</button></div>${a.isDead || a.hp <= 0 ? `<p class="arena-explainer">${t('Completa un hábito para recuperar vida y volver a combatir.', 'Complete a habit to recover and fight again.')}</p>` : ''}<div class="arena-details"><div><span>01</span><strong>${t('Combate con tu equipo', 'Fight with your gear')}</strong><p>${t('Tus armas y escudos cuentan. Los atuendos reflejan tu estilo.', 'Your weapons and shields count. Outfits express your style.')}</p></div><div><span>02</span><strong>${t('Domina el movimiento', 'Master your movement')}</strong><p>${t('Salta sobre tu rival, defiende y encadena hasta tres golpes.', 'Jump over your rival, guard and chain up to three hits.')}</p></div><div><span>03</span><strong>${t('Juega a tu manera', 'Play your way')}</strong><p>${t('Teclado en computadora y controles táctiles en celular.', 'Keyboard on desktop and touch controls on your phone.')}</p></div></div><p class="arena-online-note">${t('Batallas en línea con amigos · Próximamente', 'Online battles with friends · Coming soon')}</p>`;
        }
        if (GameState.battleLog.length) html += `<div class="section-header"><h2 class="section-title">${t('ÚLTIMOS COMBATES', 'RECENT BATTLES')}</h2></div><div class="battle-history">${GameState.battleLog.slice(0, 5).map(log => `<div class="battle-history-item"><span>${this.escape(log.opponent)}</span><span class="battle-history-result ${log.won ? 'win' : 'loss'}">${log.won ? t('VICTORIA', 'VICTORY') : t('DERROTA', 'DEFEAT')}</span></div>`).join('')}</div>`;
        return html;
    },

    // ========================================
    // TUTORIAL / ONBOARDING VIEW
    // ========================================
    renderTutorialModal(step = 0) {
        const steps = [
            {
                badge: I18N.t('tutorial.badge'),
                icon: '⚔️',
                title: I18N.t('tutorial.step1_title'),
                desc: I18N.t('tutorial.step1_desc')
            },
            {
                badge: I18N.t('tutorial.badge'),
                icon: '💖',
                title: I18N.t('tutorial.step2_title'),
                desc: I18N.t('tutorial.step2_desc')
            },
            {
                badge: I18N.t('tutorial.badge'),
                icon: '🏪',
                title: I18N.t('tutorial.step3_title'),
                desc: I18N.t('tutorial.step3_desc')
            },
            {
                badge: I18N.t('tutorial.badge'),
                icon: '📜',
                title: I18N.t('tutorial.step4_title'),
                desc: I18N.t('tutorial.step4_desc')
            }
        ];

        const s = steps[step] || steps[0];
        const isFirst = step === 0;
        const isLast = step === steps.length - 1;

        let dotsHtml = '';
        for (let i = 0; i < steps.length; i++) {
            dotsHtml += `<div class="tutorial-dot ${i === step ? 'active' : ''}"></div>`;
        }

        return `
            <div class="pixel-modal-backdrop" id="tutorial-modal">
                <div class="pixel-modal">
                    <button class="pixel-modal-close" onclick="App.closeTutorial()">X</button>
                    
                    <div class="tutorial-card">
                        <span class="tutorial-badge">${s.badge} [${step + 1}/${steps.length}]</span>
                        <div class="tutorial-icon">${s.icon}</div>
                        <h3 class="tutorial-title">${s.title}</h3>
                        <p class="tutorial-desc">${s.desc}</p>
                        
                        <div class="tutorial-dots">
                            ${dotsHtml}
                        </div>

                        <div class="tutorial-nav">
                            ${!isFirst ? `
                                <button class="btn btn-secondary" onclick="App.prevTutorialStep()" style="flex:1;">
                                    ${I18N.t('tutorial.btn_prev')}
                                </button>
                            ` : `
                                <button class="btn btn-secondary" onclick="App.closeTutorial()" style="flex:1;">
                                    ${I18N.t('tutorial.btn_close')}
                                </button>
                            `}

                            ${!isLast ? `
                                <button class="btn btn-primary" onclick="App.nextTutorialStep()" style="flex:1;">
                                    ${I18N.t('tutorial.btn_next')}
                                </button>
                            ` : `
                                <button class="btn btn-gold" onclick="App.finishTutorialAndGoToHabits()" style="flex:2;">
                                    ${I18N.t('tutorial.btn_start')}
                                </button>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // ========================================
    // ADMIN LOGIN MODAL
    // ========================================
    renderAdminLoginModal() {
        return `
            <div class="pixel-modal-backdrop" id="admin-login-modal">
                <div class="pixel-modal" style="max-width: 400px;">
                    <button class="pixel-modal-close" onclick="App.closeAdminLogin()">X</button>
                    <div style="text-align:center; margin-bottom:14px;">
                        <span style="font-size:32px;">🛡️</span>
                        <h3 style="font-size:10px; color:var(--pixel-gold); margin-top:8px;">ACCESO ADMINISTRADOR</h3>
                        <p style="font-size:7px; color:var(--text-muted); margin-top:4px;">Control del sistema y desarrollo</p>
                    </div>

                    <form onsubmit="App.handleAdminLogin(event)">
                        <div class="form-group">
                            <label class="form-label">USUARIO O EMAIL</label>
                            <input type="text" id="admin-login-user" class="form-input" placeholder="admin@habify.dev" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">CONTRASEÑA</label>
                            <input type="password" id="admin-login-pass" class="form-input" placeholder="Min 6 caracteres" required>
                        </div>
                        <button type="submit" class="btn btn-primary btn-block" style="margin-top:10px;">
                            >> ENTRAR AL PANEL <<
                        </button>
                        <button type="button" class="btn btn-secondary btn-block" style="margin-top:8px; font-size:6px;" onclick="App.enterAdminDevMode()">
                            ⚡ ACCESO RÁPIDO DESARROLLADOR
                        </button>
                    </form>
                </div>
            </div>
        `;
    },

    // ========================================
    // ADMIN DASHBOARD VIEW
    // ========================================
    renderAdminDashboard() {
        const tab = GameState.adminTab || 'stats';
        const users = GameState.adminUsersList || [];
        const activeUsers = users.filter(u => u.is_active);
        const inactiveUsers = users.filter(u => !u.is_active);
        const totalGold = users.reduce((sum, u) => sum + (u.gold || 0), 0);
        const avgLevel = users.length > 0 ? (users.reduce((sum, u) => sum + (u.level || 1), 0) / users.length).toFixed(1) : 1;

        let contentHtml = '';

        if (tab === 'stats') {
            contentHtml = `
                <div class="admin-kpi-grid">
                    <div class="admin-kpi-card">
                        <div class="admin-kpi-val">${users.length}</div>
                        <div class="admin-kpi-label">TOTAL USUARIOS</div>
                    </div>
                    <div class="admin-kpi-card">
                        <div class="admin-kpi-val" style="color:var(--pixel-green);">${activeUsers.length}</div>
                        <div class="admin-kpi-label">USUARIOS ACTIVOS</div>
                    </div>
                    <div class="admin-kpi-card">
                        <div class="admin-kpi-val" style="color:var(--pixel-red);">${inactiveUsers.length}</div>
                        <div class="admin-kpi-label">INACTIVOS (+48H)</div>
                    </div>
                    <div class="admin-kpi-card">
                        <div class="admin-kpi-val" style="color:var(--pixel-gold);">${totalGold} G</div>
                        <div class="admin-kpi-label">ORO EN CIRCULACIÓN</div>
                    </div>
                    <div class="admin-kpi-card">
                        <div class="admin-kpi-val">LV ${avgLevel}</div>
                        <div class="admin-kpi-label">NIVEL PROMEDIO</div>
                    </div>
                    <div class="admin-kpi-card">
                        <div class="admin-kpi-val">${GameState.shopItems.length}</div>
                        <div class="admin-kpi-label">ÍTEMS EN TIENDA</div>
                    </div>
                </div>

                <div class="card">
                    <div style="font-size:8px; color:var(--pixel-gold); margin-bottom:8px;">RESUMEN DE ESTADO DEL SISTEMA</div>
                    <div style="font-size:7px; line-height:1.8; color:var(--text-primary);">
                        • Base de datos Supabase conectada.<br>
                        • Catálogo precargado: ${GameState.presetCatalog.length} hábitos estructurados.<br>
                        • Modo PVP Realtime activo en canales de presencia.<br>
                        • Monstruos en Arena: ${GameState.monsters.length} oponentes escalables.
                    </div>
                </div>
            `;
        } else if (tab === 'users') {
            contentHtml = `
                <div class="admin-table-wrapper">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>JUGADOR</th>
                                <th>CLASE</th>
                                <th>NIVEL</th>
                                <th>HP</th>
                                <th>ORO</th>
                                <th>ESTADO</th>
                                <th>ACCIONES DEV</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            users.forEach(u => {
                contentHtml += `
                    <tr>
                        <td><strong>${u.name}</strong></td>
                        <td>${u.avatar_class}</td>
                        <td>LV${u.level}</td>
                        <td><span style="color:${u.hp > 0 ? 'var(--pixel-green)' : 'var(--pixel-red)'};">${u.hp}/${u.max_hp}</span></td>
                        <td><span style="color:var(--pixel-gold);">${u.gold}G</span></td>
                        <td><span class="admin-badge ${u.is_active ? 'active' : 'inactive'}">${u.is_active ? 'ACTIVO' : 'INACTIVO'}</span></td>
                        <td>
                            <button class="admin-action-btn" onclick="App.adminReviveUser('${u.id}')" title="Revivir">💖 REVIVIR</button>
                            <button class="admin-action-btn" onclick="App.adminGrantGold('${u.id}', 100)" title="+100G">+100G</button>
                            <button class="admin-action-btn" onclick="App.adminGrantXP('${u.id}', 50)" title="+50XP">+50XP</button>
                        </td>
                    </tr>
                `;
            });
            contentHtml += `
                        </tbody>
                    </table>
                </div>
            `;
        } else if (tab === 'store') {
            contentHtml = `
                <div style="font-size:8px; color:var(--pixel-gold); margin-bottom:10px;">GESTIÓN DEL MERCADO NEGRO (MODIFICAR PRECIOS)</div>
                <div class="admin-table-wrapper">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>ICON</th>
                                <th>NOMBRE</th>
                                <th>TIPO</th>
                                <th>PRECIO ACTUAL</th>
                                <th>NUEVO PRECIO</th>
                                <th>ACCIÓN</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            GameState.shopItems.forEach(item => {
                contentHtml += `
                    <tr>
                        <td style="font-size:16px;">${item.icon}</td>
                        <td><strong>${item.name}</strong><br><span style="font-size:6px; color:var(--text-muted);">${item.description}</span></td>
                        <td>${item.type}</td>
                        <td style="color:var(--pixel-gold);">${item.cost} G</td>
                        <td>
                            <input type="number" id="admin-cost-${item.id}" value="${item.cost}" min="0" max="9999" style="width:60px; padding:2px; font-size:7px; background:var(--bg-input); border:1px solid var(--pixel-dark-gray); color:#fff;">
                        </td>
                        <td>
                            <button class="admin-action-btn" onclick="App.adminSaveShopPrice('${item.id}')">💾 GUARDAR</button>
                        </td>
                    </tr>
                `;
            });
            contentHtml += `
                        </tbody>
                    </table>
                </div>

                <div class="card" style="margin-top:14px;">
                    <div style="font-size:8px; color:var(--pixel-green); margin-bottom:8px;">+ AÑADIR NUEVO ÍTEM A LA TIENDA</div>
                    <form onsubmit="App.adminCreateShopItem(event)">
                        <div class="form-row">
                            <div class="form-group" style="flex:1;">
                                <label class="form-label">ID ÚNICO</label>
                                <input type="text" id="new-item-id" class="form-input" placeholder="ej: wpn_katana" required>
                            </div>
                            <div class="form-group" style="flex:2;">
                                <label class="form-label">NOMBRE</label>
                                <input type="text" id="new-item-name" class="form-input" placeholder="Katana Legendaria" required>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group" style="flex:1;">
                                <label class="form-label">COSTO (G)</label>
                                <input type="number" id="new-item-cost" class="form-input" placeholder="100" required>
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label class="form-label">ICONO (EMOJI)</label>
                                <input type="text" id="new-item-icon" class="form-input" placeholder="🗡️" required maxlength="4">
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label class="form-label">TIPO</label>
                                <select id="new-item-type" class="form-select">
                                    <option value="weapon">Arma</option>
                                    <option value="shield">Escudo</option>
                                    <option value="spell">Hechizo</option>
                                    <option value="pet">Mascota</option>
                                    <option value="background">Fondo</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">DESCRIPCIÓN</label>
                            <input type="text" id="new-item-desc" class="form-input" placeholder="Efecto o detalle estético" required>
                        </div>
                        <button type="submit" class="btn btn-primary btn-sm">+ AGREGAR A LA TIENDA</button>
                    </form>
                </div>
            `;
        } else if (tab === 'arena') {
            contentHtml = `
                <div style="font-size:8px; color:var(--pixel-gold); margin-bottom:10px;">BALANCE DE MONSTRUOS Y JEFES EN ARENA</div>
                <div class="admin-table-wrapper">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>SPRITE</th>
                                <th>NOMBRE</th>
                                <th>NIVEL</th>
                                <th>HP BASE</th>
                                <th>ATAQUE</th>
                                <th>XP</th>
                                <th>ORO</th>
                                <th>ACCIÓN</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            GameState.monsters.forEach(m => {
                contentHtml += `
                    <tr>
                        <td><img src="assets/sprites/${m.sprite}.png" onerror="this.src='assets/sprites/goblin.png';" style="width:24px; height:24px; image-rendering:pixelated;"></td>
                        <td><strong>${m.name}</strong></td>
                        <td><input type="number" id="m-lvl-${m.id}" value="${m.base_level}" style="width:40px; padding:2px; font-size:7px; background:var(--bg-input); border:1px solid var(--pixel-dark-gray); color:#fff;"></td>
                        <td><input type="number" id="m-hp-${m.id}" value="${m.base_hp}" style="width:50px; padding:2px; font-size:7px; background:var(--bg-input); border:1px solid var(--pixel-dark-gray); color:#fff;"></td>
                        <td><input type="number" id="m-atk-${m.id}" value="${m.base_attack}" style="width:40px; padding:2px; font-size:7px; background:var(--bg-input); border:1px solid var(--pixel-dark-gray); color:#fff;"></td>
                        <td><input type="number" id="m-xp-${m.id}" value="${m.xp_reward}" style="width:40px; padding:2px; font-size:7px; background:var(--bg-input); border:1px solid var(--pixel-dark-gray); color:#fff;"></td>
                        <td><input type="number" id="m-gold-${m.id}" value="${m.gold_reward}" style="width:40px; padding:2px; font-size:7px; background:var(--bg-input); border:1px solid var(--pixel-dark-gray); color:#fff;"></td>
                        <td><button class="admin-action-btn" onclick="App.adminSaveMonsterStats('${m.id}')">💾 GUARDAR</button></td>
                    </tr>
                `;
            });
            contentHtml += `
                        </tbody>
                    </table>
                </div>

                <div class="card" style="margin-top:14px;">
                    <div style="font-size:8px; color:var(--pixel-red); margin-bottom:8px;">+ CREAR NUEVO JEFE O MONSTRUO</div>
                    <form onsubmit="App.adminCreateMonster(event)">
                        <div class="form-row">
                            <div class="form-group" style="flex:2;">
                                <label class="form-label">NOMBRE DEL MONSTRUO</label>
                                <input type="text" id="new-m-name" class="form-input" placeholder="Dragón Ancestral" required>
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label class="form-label">SPRITE</label>
                                <select id="new-m-sprite" class="form-select">
                                    <option value="goblin">Goblin</option>
                                    <option value="skeleton">Esqueleto</option>
                                    <option value="slime">Slime</option>
                                    <option value="orc">Orco</option>
                                    <option value="ghost">Espectro</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group" style="flex:1;">
                                <label class="form-label">NIVEL BASE</label>
                                <input type="number" id="new-m-lvl" class="form-input" value="5" required>
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label class="form-label">HP BASE</label>
                                <input type="number" id="new-m-hp" class="form-input" value="250" required>
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label class="form-label">ATAQUE</label>
                                <input type="number" id="new-m-atk" class="form-input" value="35" required>
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label class="form-label">XP RECOMPENSA</label>
                                <input type="number" id="new-m-xp" class="form-input" value="100" required>
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label class="form-label">ORO RECOMPENSA</label>
                                <input type="number" id="new-m-gold" class="form-input" value="60" required>
                            </div>
                        </div>
                        <button type="submit" class="btn btn-primary btn-sm">+ INVOCAR MONSTRUO EN LA ARENA</button>
                    </form>
                </div>
            `;
        } else if (tab === 'catalog') {
            contentHtml = `
                <div style="font-size:8px; color:var(--pixel-gold); margin-bottom:10px;">BIBLIOTECA DE HÁBITOS PRECARGADOS (${GameState.presetCatalog.length})</div>
                <div class="admin-table-wrapper">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>ICON</th>
                                <th>TÍTULO</th>
                                <th>CATEGORÍA</th>
                                <th>TIPO</th>
                                <th>RECOMPENSA / PENALIZACIÓN</th>
                                <th>FREC. DEFAULT</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            GameState.presetCatalog.forEach(c => {
                contentHtml += `
                    <tr>
                        <td style="font-size:16px;">${this.escape(c.icon)}</td>
                        <td><strong>${this.escape(c.title)}</strong></td>
                        <td>${this.escape(c.category)}</td>
                        <td>${this.escape(c.type)}</td>
                        <td>${c.type === 'positive' ? `+${c.xpReward}XP / +${c.goldReward}G` : `-${c.hpPenalty}HP`}</td>
                        <td>${this.escape(c.defaultFrequency)}</td>
                    </tr>
                `;
            });
            contentHtml += `
                        </tbody>
                    </table>
                </div>

                <div class="card" style="margin-top:14px;">
                    <div style="font-size:8px; color:var(--pixel-cyan); margin-bottom:8px;">+ AÑADIR NUEVO HÁBITO PRECARGADO AL CATÁLOGO GLOBAL</div>
                    <form onsubmit="App.adminAddCatalogHabit(event)">
                        <div class="form-row">
                            <div class="form-group" style="flex:2;">
                                <label class="form-label">TÍTULO</label>
                                <input type="text" id="new-cat-title" class="form-input" placeholder="Estudiar historia 20 min" required>
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label class="form-label">ICONO (EMOJI)</label>
                                <input type="text" id="new-cat-icon" class="form-input" placeholder="📜" required maxlength="4">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group" style="flex:1;">
                                <label class="form-label">CATEGORÍA</label>
                                <select id="new-cat-category" class="form-select">
                                    <option value="health">Salud</option>
                                    <option value="fitness">Fitness</option>
                                    <option value="productivity">Estudio/Productividad</option>
                                    <option value="mind">Mente</option>
                                    <option value="finance">Finanzas</option>
                                    <option value="negative">A Evitar (Negativo)</option>
                                </select>
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label class="form-label">TIPO</label>
                                <select id="new-cat-type" class="form-select">
                                    <option value="positive">Positivo</option>
                                    <option value="negative">Negativo</option>
                                </select>
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label class="form-label">XP / PENALTY</label>
                                <input type="number" id="new-cat-val" class="form-input" value="20" required>
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label class="form-label">FRECUENCIA DEFAULT</label>
                                <select id="new-cat-freq" class="form-select">
                                    <option value="daily">Diario</option>
                                    <option value="workdays">Días Laborales</option>
                                    <option value="3x_week">3 veces por semana</option>
                                    <option value="2x_week">2 veces por semana</option>
                                    <option value="weekly">Semanal</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">DESCRIPCIÓN</label>
                            <input type="text" id="new-cat-desc" class="form-input" placeholder="Detalle pedagógico o motivo del hábito" required>
                        </div>
                        <button type="submit" class="btn btn-primary btn-sm">+ AGREGAR AL CATÁLOGO GLOBAL</button>
                    </form>
                </div>
            `;
        }

        return `
            <div class="pixel-modal-backdrop" id="admin-dashboard-modal">
                <div class="pixel-modal admin-modal">
                    <button class="pixel-modal-close" onclick="App.closeAdminDashboard()">X</button>
                    
                    <div class="admin-header">
                        <div>
                            <div class="admin-title">⚡ HABIFY - PANEL DE ADMINISTRADOR / DEV</div>
                            <div style="font-size:6px; color:var(--text-muted); margin-top:2px;">Centro de comando del juego</div>
                        </div>
                        <span class="admin-badge active" style="font-size:7px;">ADMIN ACTIVO</span>
                    </div>

                    <div class="admin-nav-tabs">
                        <button class="admin-tab-btn ${tab === 'stats' ? 'active' : ''}" onclick="App.setAdminTab('stats')">📊 MÉTRICAS</button>
                        <button class="admin-tab-btn ${tab === 'users' ? 'active' : ''}" onclick="App.setAdminTab('users')">👥 USUARIOS</button>
                        <button class="admin-tab-btn ${tab === 'store' ? 'active' : ''}" onclick="App.setAdminTab('store')">🏪 TIENDA</button>
                        <button class="admin-tab-btn ${tab === 'arena' ? 'active' : ''}" onclick="App.setAdminTab('arena')">⚔️ ARENA</button>
                        <button class="admin-tab-btn ${tab === 'catalog' ? 'active' : ''}" onclick="App.setAdminTab('catalog')">📜 CATÁLOGO</button>
                    </div>

                    <div class="admin-tab-content">
                        ${contentHtml}
                    </div>
                </div>
            </div>
        `;
    }
};
