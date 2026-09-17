// ==========================================
// HABIFY - View Renderers (8-Bit Pixel Art)
// ==========================================

const Views = {

    // ========================================
    // AUTH VIEW (Login / Register)
    // ========================================
    renderAuth(mode = 'login') {
        const isLogin = mode === 'login';
        return `
            <div class="auth-container">
                <div style="font-size:40px; margin-bottom:12px;">⚔️</div>
                <div class="auth-title">HABIFY</div>
                <div class="auth-subtitle">${isLogin ? 'Inicia sesion, aventurero' : 'Crea tu cuenta'}</div>

                <div class="auth-error" id="auth-error"></div>

                <form id="auth-form" onsubmit="App.handleAuth(event, '${mode}')">
                    <div class="form-group">
                        <label class="form-label" data-i18n="auth.email">${I18N.t('auth.email')}</label>
                        <input type="email" class="form-input" id="auth-email" placeholder="hero@habify.com" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label" data-i18n="auth.password">${I18N.t('auth.password')}</label>
                        <input type="password" class="form-input" id="auth-password" placeholder="Min 6 caracteres" minlength="6" required>
                    </div>
                    ${!isLogin ? `
                    <div class="form-group">
                        <label class="form-label" data-i18n="auth.name">${I18N.t('auth.name')}</label>
                        <input type="text" class="form-input" id="auth-avatar-name" placeholder="Tu nombre de heroe" maxlength="16" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label" data-i18n="auth.class">${I18N.t('auth.class')}</label>
                        <select class="form-input" id="auth-avatar-class" required>
                            <option value="hero">Heroe Aventurero</option>
                            <option value="mage">Mago Arcano</option>
                            <option value="knight">Caballero Real</option>
                            <option value="elf">Elfo del Bosque</option>
                        </select>
                    </div>
                    ` : ''}
                    <button type="submit" class="btn btn-primary btn-block" id="auth-submit">
                        ${isLogin ? '>> ' + I18N.t('auth.login') + ' <<' : '>> ' + I18N.t('auth.register') + ' <<'}
                    </button>
                </form>

                <div class="auth-switch">
                    ${isLogin
                ? '¿No tienes cuenta? <a onclick="App.showAuth(\'register\')">Registrate</a>'
                : '¿Ya tienes cuenta? <a onclick="App.showAuth(\'login\')">Inicia sesion</a>'}
                </div>

                <div style="margin-top: 22px; padding-top: 12px; border-top: 1px solid var(--pixel-dark-gray); text-align: center;">
                    <a onclick="App.openAdminPanel()" style="font-size: 6px; color: var(--text-muted); opacity: 0.6; text-decoration: none; cursor: pointer; letter-spacing: 0.5px;">
                        🛡️ ACCESO ADMINISTRATIVO / DEV
                    </a>
                </div>
            </div>
        `;
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

        const HD_MODE = true; // Set to false to revert to blocky CSS sprites and CSS weapons

        // Build hero CSS classes
        let heroClasses = 'pixel-hero';
        let hdImageHtml = '';

        if (!HD_MODE) {
            heroClasses += ` ${a.avatarClass || 'hero'}`;
            if (a.isDead) {
                heroClasses += ' dead';
            } else {
                if (a.equippedWeapon && WEAPON_CSS[a.equippedWeapon]) {
                    heroClasses += ' ' + WEAPON_CSS[a.equippedWeapon];
                }
                if (a.equippedShield && WEAPON_CSS[a.equippedShield]) {
                    heroClasses += ' ' + WEAPON_CSS[a.equippedShield];
                }
            }
        } else {
            // High Definition image injection
            heroClasses += ' hd-active';
            const spriteName = a.avatarClass || 'hero';
            const filterCss = a.isDead ? 'filter: grayscale(1) brightness(0.5);' : '';
            hdImageHtml = `<img src="assets/sprites/${spriteName}.png" class="hd-sprite-img" style="display: block; margin: 0 auto; width: 72px; height: auto; object-fit: contain; image-rendering: pixelated; z-index: 10; ${filterCss}">`;
        }

        // Pet sprite
        let petHtml = '';
        if (a.equippedPet && PET_CSS[a.equippedPet]) {
            if (!HD_MODE) {
                petHtml = `<div class="pet-wrapper"><div class="${PET_CSS[a.equippedPet]}"></div></div>`;
            } else {
                petHtml = `<div class="pet-wrapper hd-active">
                    <img src="assets/sprites/${a.equippedPet}.png" onerror="this.onerror=null; this.src='assets/sprites/pet_dragon.png';" style="display: block; margin: 0 auto; width: 48px; height: auto; image-rendering: pixelated; z-index: 10; animation: hero-breathe 2s steps(2) infinite; animation-delay: 0.5s;">
                </div>`;
            }
        }

        // Background variation
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

        const classNames = {
            'hero': I18N.t('class.hero'),
            'mage': I18N.t('class.mage'),
            'knight': I18N.t('class.knight'),
            'elf': I18N.t('class.elf')
        };
        const displayClass = classNames[a.avatarClass || 'hero'] || I18N.t('class.hero');

        let html = `
            <div class="avatar-section ${bgClass}">
                <div class="sprite-scene">
                    <div class="sprite-wrapper">
                        <div class="${heroClasses}">
                            ${hdImageHtml}
                        </div>
                    </div>
                    ${petHtml}
                </div>

                <div class="avatar-name">${a.name}</div>
                <div class="avatar-level">${displayClass} - ${I18N.t('dashboard.level')} ${a.level}</div>

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
        const editCooldown = getHabitEditCooldown();
        const atCap = habits.length >= 20;
        const catalogFilter = GameState._catalogFilter || 'all';

        let html = `
            <div class="section-header">
                <h2 class="section-title" data-i18n="habits.title">${I18N.t('habits.title')}</h2>
                <div class="section-badge" style="border-color: ${atCap ? 'var(--pixel-red)' : 'var(--pixel-cyan)'}; color: ${atCap ? 'var(--pixel-red)' : 'var(--pixel-gold)'};">
                    ${habits.length}/20
                </div>
            </div>
            
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
            const alreadyActive = GameState.habits.some(h => h.title === item.title);
            const isNegative = item.type === 'negative';

            html += `
                <div class="catalog-card ${alreadyActive ? 'active-in-habits' : ''} ${isNegative ? 'negative' : ''}">
                    <div>
                        <div class="catalog-card-header">
                            <span class="catalog-card-icon">${item.icon}</span>
                            <span class="catalog-card-title">${item.title}</span>
                        </div>
                        <div class="catalog-card-desc">${item.description}</div>
                        <div class="catalog-card-meta">
                            <span>${!isNegative ? `<span style="color:var(--pixel-green);">+${item.xpReward} XP</span> | <span style="color:var(--pixel-gold);">+${item.goldReward} G</span>` : `<span style="color:var(--pixel-red);">-${item.hpPenalty} HP</span>`}</span>
                            <span style="font-size:6px; color:var(--text-muted);">${item.category.toUpperCase()}</span>
                        </div>
                    </div>

                    <div>
                        <div class="catalog-card-freq">
                            <label style="font-size: 6px; color: var(--text-muted); display:block; margin-bottom: 2px;" data-i18n="habits.frequency_label">${I18N.t('habits.frequency_label')}</label>
                            <select id="freq-select-${item.id}" ${alreadyActive ? 'disabled' : ''}>
                                <option value="daily" ${item.defaultFrequency === 'daily' ? 'selected' : ''}>Diario (24h)</option>
                                <option value="workdays" ${item.defaultFrequency === 'workdays' ? 'selected' : ''}>Días Laborales (Lun-Vie)</option>
                                <option value="3x_week" ${item.defaultFrequency === '3x_week' ? 'selected' : ''}>3 veces por semana (48h)</option>
                                <option value="2x_week" ${item.defaultFrequency === '2x_week' ? 'selected' : ''}>2 veces por semana (72h)</option>
                                <option value="weekly" ${item.defaultFrequency === 'weekly' ? 'selected' : ''}>Semanal (7 días)</option>
                            </select>
                        </div>

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
            <div class="flex-center gap-8">
                <button class="btn btn-danger btn-sm" onclick="App.confirmReset()">
                    REINICIAR
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

        let html = `
            <div class="section-header" style="margin-bottom:16px;">
                <h2 class="section-title" data-i18n="store.header">${I18N.t('store.header')}</h2>
                <div class="stat-value gold" style="font-size:14px;">${GameState.avatar.gold} G</div>
            </div>

            <div class="store-filter-tabs">
                <button class="store-filter-tab ${filter === 'all' ? 'active' : ''}" onclick="App.filterStore('all')" data-i18n="store.all">${I18N.t('store.all')}</button>
                <button class="store-filter-tab ${filter === 'weapon' ? 'active' : ''}" onclick="App.filterStore('weapon')" data-i18n="store.weapons">${I18N.t('store.weapons')}</button>
                <button class="store-filter-tab ${filter === 'spell' ? 'active' : ''}" onclick="App.filterStore('spell')" data-i18n="store.spells">${I18N.t('store.spells')}</button>
                <button class="store-filter-tab ${filter === 'pet' ? 'active' : ''}" onclick="App.filterStore('pet')" data-i18n="store.pets">${I18N.t('store.pets')}</button>
                <button class="store-filter-tab ${filter === 'background' ? 'active' : ''}" onclick="App.filterStore('background')" data-i18n="store.backgrounds">${I18N.t('store.backgrounds')}</button>
            </div>

            <div class="store-grid">
        `;

        const filtered = filter === 'all'
            ? GameState.shopItems
            : GameState.shopItems.filter(i => i.type === filter);

        filtered.forEach(item => {
            const canAfford = GameState.avatar.gold >= item.cost;
            const isPurchased = item.purchased;

            html += `
                <div class="store-card ${isPurchased ? 'purchased' : ''}" onclick="${!isPurchased && canAfford ? `App.buyItem('${item.id}')` : (!isPurchased ? `App.showToast('ORO INSUFICIENTE!', 'error')` : '')}">
                    <span class="store-card-icon">${item.icon}</span>
                    <div class="store-card-name">${item.name}</div>
                    <div class="store-card-desc">${item.description}</div>
                    <div class="store-card-price">${item.cost}G</div>
                </div>
            `;
        });

        html += '</div>';

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
                    <div class="inventory-item ${isEquipped ? 'equipped' : ''}" onclick="App.equipItem('${item.id}')">
                        <span class="inventory-item-icon">${item.icon}</span>
                        <span>${item.name}</span>
                        ${isEquipped ? '<span style="color: var(--pixel-green);">*</span>' : ''}
                    </div>
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

        if (!GameState._currentOpponent) {
            GameState._currentOpponent = Engine.generateOpponent();
        }
        const opp = GameState._currentOpponent;

        const HD_MODE = true; // Set to false to revert to blocky CSS sprites

        // Hero classes
        let heroClasses = 'pixel-hero';
        let hdHeroHtml = '';
        if (!HD_MODE) {
            heroClasses += ` ${a.avatarClass || 'hero'}`;
            if (a.isDead) {
                heroClasses += ' dead';
            } else {
                if (a.equippedWeapon && WEAPON_CSS[a.equippedWeapon]) {
                    heroClasses += ' ' + WEAPON_CSS[a.equippedWeapon];
                }
                if (a.equippedShield && WEAPON_CSS[a.equippedShield]) {
                    heroClasses += ' ' + WEAPON_CSS[a.equippedShield];
                }
            }
        } else {
            heroClasses += ' hd-active';
            const spriteName = a.avatarClass || 'hero';
            const filterCss = a.isDead ? 'filter: grayscale(1) brightness(0.5);' : '';
            hdHeroHtml = `<img src="assets/sprites/${spriteName}.png" class="hd-sprite-img" style="display: block; margin: 0 auto; width: 72px; height: auto; object-fit: contain; image-rendering: pixelated; z-index: 10; ${filterCss}">`;
        }

        // Enemy classes
        let enemyClasses = 'pixel-enemy';
        let hdEnemyHtml = '';
        const enemyClass = opp.sprite || 'goblin';
        
        if (!HD_MODE) {
            enemyClasses += ` ${enemyClass}`;
        } else {
            enemyClasses += ' hd-active';
            hdEnemyHtml = `<img src="assets/sprites/${enemyClass}.png" class="hd-sprite-img" style="display: block; margin: 0 auto; width: 72px; height: auto; object-fit: contain; image-rendering: pixelated; z-index: 10; transform: scaleX(-1);">`;
        }
        const classNames = {
            'hero': 'Héroe Aventurero',
            'mage': 'Mago Arcano',
            'knight': 'Caballero Real',
            'elf': 'Elfo del Bosque'
        };
        const displayClass = classNames[a.avatarClass || 'hero'] || 'Héroe Aventurero';

        let bgClass = '';
        if (a.equippedBackground) {
            bgClass = a.equippedBackground;
        }

        let activeB = GameState.currentBattle;
        let isFighting = activeB && !activeB.isFinished;
        let opStats = isFighting ? activeB.opponent : opp;
        
        let pHp = isFighting ? activeB.playerHp : a.hp;
        let pMax = isFighting ? activeB.playerMaxHp : a.maxHp;
        let eHp = isFighting ? activeB.oppHp : opStats.hp;
        let eMax = isFighting ? activeB.oppMaxHp : opStats.maxHp;

        // Detect equipped spells for dynamic button labels
        const hasHeal = !!(a.equippedSpell && a.equippedSpell.includes('spell_heal'));
        const hasFire = !!(a.equippedSpell && a.equippedSpell.includes('spell_fire'));

        let html = `
            <div class="section-header">
                <h2 class="section-title" data-i18n="arena.versus">${I18N.t('arena.versus')}</h2>
                <div class="section-badge">LV${a.level}</div>
            </div>
        `;

        if (isFighting) {
            html += `
                <!-- HEALTH HUD - HIGH VISIBILITY PIXEL DESIGN -->
                <div class="battle-hud">
                    <div class="hud-unit player">
                        <div class="hud-label">${a.name} LV${a.level} <span style="font-size:7px; opacity:0.8;">(HP Avatar: ${a.hp}/${a.maxHp})</span></div>
                        <div class="hud-bar-container">
                            <div id="rt-p-hp-fill" class="hud-bar-fill hp" style="width: ${(pHp/pMax)*100}%"></div>
                            <div id="rt-p-hp-text" class="hud-bar-text">${pHp}/${pMax} BHP</div>
                        </div>
                    </div>
                    
                    <div class="hud-vs-badge">VS</div>
                    
                    <div class="hud-unit enemy">
                        <div class="hud-label">${opStats.name} LV${opStats.level}</div>
                        <div class="hud-bar-container">
                            <div id="rt-e-hp-fill" class="hud-bar-fill hp enemy-hp" style="width: ${(eHp/eMax)*100}%"></div>
                            <div id="rt-e-hp-text" class="hud-bar-text">${eHp}/${eMax} BHP</div>
                        </div>
                    </div>
                </div>

                <div id="real-time-arena" class="arena-stage ${bgClass}" style="position: relative; width: 100%; height: 260px; overflow: hidden; border: 2px solid var(--pixel-dark-gray); margin-bottom: 10px;">
                    <!-- Engine will render fighters here -->
                </div>

                <!-- BATTLE CONTROLS WITH CLEAR ICONS -->
                <div class="rt-controls">
                    <!-- Movement cluster (left side) -->
                    <div class="rt-cluster rt-cluster-move">
                        <button class="rt-btn rt-btn-dir dpad-left"
                            onmousedown="Engine.handleInput('left', true)" onmouseup="Engine.handleInput('left', false)" onmouseleave="Engine.handleInput('left', false)"
                            ontouchstart="Engine.handleInput('left', true); event.preventDefault();" ontouchend="Engine.handleInput('left', false); event.preventDefault();">
                            <span class="rt-btn-icon">◀</span>
                            <span class="rt-btn-label">IZQ</span>
                        </button>
                        <button class="rt-btn rt-btn-dir dpad-right"
                            onmousedown="Engine.handleInput('right', true)" onmouseup="Engine.handleInput('right', false)" onmouseleave="Engine.handleInput('right', false)"
                            ontouchstart="Engine.handleInput('right', true); event.preventDefault();" ontouchend="Engine.handleInput('right', false); event.preventDefault();">
                            <span class="rt-btn-icon">▶</span>
                            <span class="rt-btn-label">DER</span>
                        </button>
                        <button class="rt-btn rt-btn-jump dpad-up"
                            onmousedown="Engine.handleInput('up', true)" onmouseup="Engine.handleInput('up', false)" onmouseleave="Engine.handleInput('up', false)"
                            ontouchstart="Engine.handleInput('up', true); event.preventDefault();" ontouchend="Engine.handleInput('up', false); event.preventDefault();">
                            <span class="rt-btn-icon">▲</span>
                            <span class="rt-btn-label">SALTAR</span>
                        </button>
                    </div>

                    <!-- Keyboard hint -->
                    <div class="rt-kb-hint">
                        ⌨ Flechas = Mover | ↑ = Saltar | Z = Golpe | X = Magia | C = Defensa
                    </div>

                    <!-- Action cluster (right side) -->
                    <div class="rt-cluster rt-cluster-action">
                        <button class="rt-btn rt-btn-attack action-btn-attack"
                            onmousedown="Engine.handleInput('attack', true)" onmouseup="Engine.handleInput('attack', false)" onmouseleave="Engine.handleInput('attack', false)"
                            ontouchstart="Engine.handleInput('attack', true); event.preventDefault();" ontouchend="Engine.handleInput('attack', false); event.preventDefault();">
                            <span class="rt-btn-icon">⚔️</span>
                            <span class="rt-btn-label">GOLPE</span>
                        </button>
                        <button class="rt-btn rt-btn-guard action-btn-guard"
                            onmousedown="Engine.handleInput('guard', true)" onmouseup="Engine.handleInput('guard', false)" onmouseleave="Engine.handleInput('guard', false)"
                            ontouchstart="Engine.handleInput('guard', true); event.preventDefault();" ontouchend="Engine.handleInput('guard', false); event.preventDefault();">
                            <span class="rt-btn-icon">🛡️</span>
                            <span class="rt-btn-label">DEFENSA</span>
                        </button>
                        ${hasHeal ? `
                        <button class="rt-btn rt-btn-heal"
                            onmousedown="Engine.handleInput('heal', true)" onmouseup="Engine.handleInput('heal', false)" onmouseleave="Engine.handleInput('heal', false)"
                            ontouchstart="Engine.handleInput('heal', true); event.preventDefault();" ontouchend="Engine.handleInput('heal', false); event.preventDefault();">
                            <span class="rt-btn-icon">💚</span>
                            <span class="rt-btn-label">CURAR</span>
                        </button>
                        ` : ''}
                        ${hasFire ? `
                        <button class="rt-btn rt-btn-fire"
                            onmousedown="Engine.handleInput('fire', true)" onmouseup="Engine.handleInput('fire', false)" onmouseleave="Engine.handleInput('fire', false)"
                            ontouchstart="Engine.handleInput('fire', true); event.preventDefault();" ontouchend="Engine.handleInput('fire', false); event.preventDefault();">
                            <span class="rt-btn-icon">🔥</span>
                            <span class="rt-btn-label">FUEGO</span>
                        </button>
                        ` : ''}
                        ${!hasHeal && !hasFire ? `
                        <button class="rt-btn rt-btn-magic action-btn-magic"
                            onmousedown="Engine.handleInput('magic', true)" onmouseup="Engine.handleInput('magic', false)" onmouseleave="Engine.handleInput('magic', false)"
                            ontouchstart="Engine.handleInput('magic', true); event.preventDefault();" ontouchend="Engine.handleInput('magic', false); event.preventDefault();">
                            <span class="rt-btn-icon">✨</span>
                            <span class="rt-btn-label">MAGIA</span>
                        </button>
                        ` : ''}
                    </div>

                </div>

                <div class="flex-center" style="margin-top:8px;">
                    <button id="btn-flee-battle" class="btn btn-danger" style="font-size:8px; padding:8px 18px; opacity:0.85;" onclick="App.surrenderBattle()">⚑ HUIR DE LA BATALLA</button>
                </div>

            `;
            
            setTimeout(() => {
                if (Engine.startGameLoop && !Engine._gameLoopRunning) {
                    // Position enemy relative to actual arena width
                    const arena = document.getElementById('real-time-arena');
                    if (arena) {
                        const w = arena.clientWidth;
                        const enemy = Engine._rtEntities.find(e => !e.isPlayer);
                        if (enemy) enemy.x = Math.max(200, w - 100);
                    }
                    Engine.startGameLoop();
                }
            }, 150);
        } else {
            html += `
            <div class="arena-stage ${bgClass}">
                <div class="arena-fighters">
                    <div class="arena-fighter player">
                        <div class="arena-sprite-wrapper">
                            <div class="sprite-wrapper">
                                <div class="${heroClasses}">
                                    ${hdHeroHtml}
                                </div>
                            </div>
                        </div>
                        <div class="arena-fighter-name">${a.name}</div>
                        <div class="arena-fighter-level">${displayClass} LV${a.level}</div>
                        <div class="progress-bar" style="margin-top: 4px; border-color: var(--pixel-dark-gray); height: 8px;">
                            <div class="progress-fill hp" style="background: #00e436; width: ${(pHp/pMax)*100}%"></div>
                        </div>
                        <div style="font-size:6px; margin-top:2px;">${pHp}/${pMax} HP</div>
                    </div>
                    <div class="arena-vs">VS</div>
                    <div class="arena-fighter enemy">
                        <div class="arena-sprite-wrapper">
                            <div class="sprite-wrapper">
                                <div class="${enemyClasses}">
                                    ${hdEnemyHtml}
                                </div>
                            </div>
                        </div>
                        <div class="arena-fighter-name">${opStats.name}</div>
                        <div class="arena-fighter-level">LV${opStats.level}</div>
                        <div class="progress-bar" style="margin-top: 4px; border-color: var(--pixel-dark-gray); height: 8px;">
                            <div class="progress-fill hp" style="background: #ff004d; width: ${(eHp/eMax)*100}%"></div>
                        </div>
                        <div style="font-size:6px; margin-top:2px;">${eHp}/${eMax} HP</div>
                    </div>
                </div>
            </div>`;

            if (GameState._lastBattleResult) {
                const r = GameState._lastBattleResult;
                const resultTitle = r.won ? '¡VICTORIA!' : (r.fled ? '⚑ RETIRADA / HUIDA' : 'DERROTA');
                const resultClass = r.won ? 'victory' : (r.fled ? 'fled' : 'defeat');
                html += `
                    <div class="battle-result ${resultClass}">
                        <div class="battle-result-title">${resultTitle}</div>
                        <div class="battle-result-detail">${r.message}</div>
                    </div>
                `;
            }

            html += `
                <div class="flex-center gap-8 mb-16">
                    <button class="btn btn-primary btn-block" onclick="App.startBattle('pve')" id="battle-btn">
                        LUCHAR (PvE)
                    </button>
                    <button class="btn btn-gold btn-block" onclick="App.startBattle('pvp')">
                        MODO PvP
                    </button>
                </div>
                <button class="btn btn-secondary btn-block mb-16" onclick="App.newOpponent()">
                    NUEVO OPONENTE
                </button>
            `;
        }

        if (GameState.battleLog.length > 0) {
            html += `
                <div class="section-header">
                    <span class="section-title">HISTORIAL</span>
                    <span class="section-badge">${GameState.battleLog.filter(b => b.won).length}W-${GameState.battleLog.filter(b => !b.won).length}L</span>
                </div>
                <div class="battle-history">
            `;
            const recent = GameState.battleLog.slice(0, 5);
            recent.forEach(b => {
                html += `
                    <div class="battle-history-item">
                        <span class="battle-history-opponent">${b.opponent}</span>
                        <span class="battle-history-result ${b.won ? 'win' : 'loss'}">${b.won ? 'WIN' : 'LOSS'}</span>
                    </div>
                `;
            });
            html += '</div>';
        }

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
                        <td style="font-size:16px;">${c.icon}</td>
                        <td><strong>${c.title}</strong></td>
                        <td>${c.category}</td>
                        <td>${c.type}</td>
                        <td>${c.type === 'positive' ? `+${c.xpReward}XP / +${c.goldReward}G` : `-${c.hpPenalty}HP`}</td>
                        <td>${c.defaultFrequency}</td>
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
