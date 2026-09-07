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
    // HABITS MANAGEMENT VIEW
    // ========================================
    renderHabits() {
        const habits = GameState.habits;
        const editCooldown = getHabitEditCooldown();
        const atCap = habits.length >= 7;

        let html = `
            <div class="section-header">
                <h2 class="section-title" data-i18n="habits.add_title">${I18N.t('habits.add_title')}</h2>
                <div class="section-badge">${habits.length}/7</div>
            </div>
            
            ${editCooldown ? `
            <div class="card" style="border-color: var(--pixel-red); margin-bottom: 12px; text-align: center;">
                <div style="font-size: 10px; color: var(--pixel-red); margin-bottom: 6px;">🔒 ELIMINACIÓN BLOQUEADA</div>
                <div style="font-size: 8px; color: var(--text-muted);">
                    Podrás eliminar hábitos en:<br>
                    <span style="color:var(--pixel-accent); display:block; margin-top:4px;">${editCooldown}</span>
                </div>
            </div>
            ` : ''}

            ${atCap ? `
            <div class="card" style="border-color: #f7c948; margin-bottom: 12px; text-align: center;">
                <div style="font-size: 10px; color: #f7c948; margin-bottom: 4px;">⚠️ LÍMITE ALCANZADO (7/7)</div>
                <div style="font-size: 8px; color: var(--text-muted);">Elimina un hábito para poder agregar otro.</div>
            </div>
            ` : ''}

            <div class="card" style="${atCap ? 'opacity: 0.5; pointer-events: none;' : ''}">
                <form id="add-habit-form" onsubmit="App.handleAddHabit(event)">
                    <div class="form-group">
                        <label class="form-label" data-i18n="habits.habit_name">${I18N.t('habits.habit_name')}</label>
                        <input type="text" id="habit-title" class="form-input" placeholder="Ej: Beber agua" required maxlength="40" ${atCap ? 'disabled' : ''}>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label" data-i18n="habits.habit_type">${I18N.t('habits.habit_type')}</label>
                            <select id="habit-type" class="form-select" onchange="App.handleTypeChange()" ${atCap ? 'disabled' : ''}>
                                <option value="positive" data-i18n="habits.positive">${I18N.t('habits.positive')}</option>
                                <option value="negative" data-i18n="habits.negative">${I18N.t('habits.negative')}</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" data-i18n="habits.difficulty">${I18N.t('habits.difficulty')}</label>
                            <select id="habit-value" class="form-select" ${atCap ? 'disabled' : ''}>
                                <option value="10">Habitual (10)</option>
                                <option value="20" selected>Normal (20)</option>
                                <option value="40">Dificil (40)</option>
                                <option value="80">Epico (80)</option>
                            </select>
                        </div>
                    </div>

                    <div style="display:flex; gap:10px;">
                        <button type="submit" class="btn btn-primary" style="flex:1" data-i18n="habits.btn_add" ${atCap ? 'disabled' : ''}>${I18N.t('habits.btn_add')}</button>
                    </div>
                </form>
            </div>

            <div class="habit-list">
        `;

        if (habits.length === 0) {
            html += `
                <div class="empty-state">
                    <span class="empty-state-icon">📜</span>
                    <div class="empty-state-text" data-i18n="habits.empty">${I18N.t('habits.empty')}</div>
                    <button class="btn btn-secondary btn-sm" onclick="App.loadDefaults()" data-i18n="habits.btn_defaults">${I18N.t('habits.btn_defaults')}</button>
                </div>
            `;
        } else {
            habits.forEach(h => {
                const typeClass = h.type === 'positive' ? 'positive' : 'negative';
                const rewardText = h.type === 'positive'
                    ? `<span class="habit-reward">+${h.xpReward}XP</span>`
                    : `<span class="habit-penalty">-${h.hpPenalty}HP</span>`;

                html += `
                    <div class="habit-item ${typeClass}">
                        <div class="habit-checkbox" style="border-color: ${h.type === 'positive' ? 'var(--pixel-green)' : 'var(--pixel-red)'}; color: var(--text-secondary); font-size: 8px;">
                            ${h.type === 'positive' ? '+' : '-'}
                        </div>
                        <div class="habit-info">
                            <div class="habit-title">${h.title}</div>
                            ${rewardText}
                        </div>
                        ${!editCooldown
                            ? `<button class="habit-delete" onclick="App.deleteHabit('${h.id}')">X</button>`
                            : `<span style="font-size:12px; opacity:0.45; padding:4px 6px;" title="Bloqueado ${editCooldown}">🔒</span>`
                        }
                    </div>
                `;
            });
            html += '</div>';
        }

        html += `
            <div class="divider"></div>
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
                        <div class="hud-label">${a.name} LV${a.level}</div>
                        <div class="hud-bar-container">
                            <div id="rt-p-hp-fill" class="hud-bar-fill hp" style="width: ${(pHp/pMax)*100}%"></div>
                            <div id="rt-p-hp-text" class="hud-bar-text">${pHp}/${pMax} HP</div>
                        </div>
                    </div>
                    
                    <div class="hud-vs-badge">VS</div>
                    
                    <div class="hud-unit enemy">
                        <div class="hud-label">${opStats.name} LV${opStats.level}</div>
                        <div class="hud-bar-container">
                            <div id="rt-e-hp-fill" class="hud-bar-fill hp enemy-hp" style="width: ${(eHp/eMax)*100}%"></div>
                            <div id="rt-e-hp-text" class="hud-bar-text">${eHp}/${eMax} HP</div>
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
                        <button class="rt-btn rt-btn-dir"
                            onmousedown="Engine.handleInput('left', true)" onmouseup="Engine.handleInput('left', false)" onmouseleave="Engine.handleInput('left', false)"
                            ontouchstart="Engine.handleInput('left', true); event.preventDefault();" ontouchend="Engine.handleInput('left', false); event.preventDefault();">
                            <span class="rt-btn-icon">◀</span>
                            <span class="rt-btn-label">IZQ</span>
                        </button>
                        <button class="rt-btn rt-btn-dir"
                            onmousedown="Engine.handleInput('right', true)" onmouseup="Engine.handleInput('right', false)" onmouseleave="Engine.handleInput('right', false)"
                            ontouchstart="Engine.handleInput('right', true); event.preventDefault();" ontouchend="Engine.handleInput('right', false); event.preventDefault();">
                            <span class="rt-btn-icon">▶</span>
                            <span class="rt-btn-label">DER</span>
                        </button>
                        <button class="rt-btn rt-btn-jump"
                            onmousedown="Engine.handleInput('up', true)" onmouseup="Engine.handleInput('up', false)" onmouseleave="Engine.handleInput('up', false)"
                            ontouchstart="Engine.handleInput('up', true); event.preventDefault();" ontouchend="Engine.handleInput('up', false); event.preventDefault();">
                            <span class="rt-btn-icon">▲</span>
                            <span class="rt-btn-label">SALTAR</span>
                        </button>
                    </div>

                    <!-- Keyboard hint -->
                    <div class="rt-kb-hint">
                        ⌨ Flechas = Mover | Z = Golpe | X = Magia | ↑ = Saltar
                    </div>

                    <!-- Action cluster (right side) -->
                    <div class="rt-cluster rt-cluster-action">
                        <button class="rt-btn rt-btn-attack"
                            onmousedown="Engine.handleInput('attack', true)" onmouseup="Engine.handleInput('attack', false)" onmouseleave="Engine.handleInput('attack', false)"
                            ontouchstart="Engine.handleInput('attack', true); event.preventDefault();" ontouchend="Engine.handleInput('attack', false); event.preventDefault();">
                            <span class="rt-btn-icon">⚔️</span>
                            <span class="rt-btn-label">GOLPE</span>
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
                        <button class="rt-btn rt-btn-magic"
                            onmousedown="Engine.handleInput('magic', true)" onmouseup="Engine.handleInput('magic', false)" onmouseleave="Engine.handleInput('magic', false)"
                            ontouchstart="Engine.handleInput('magic', true); event.preventDefault();" ontouchend="Engine.handleInput('magic', false); event.preventDefault();">
                            <span class="rt-btn-icon">✨</span>
                            <span class="rt-btn-label">MAGIA</span>
                        </button>
                        ` : ''}
                    </div>

                </div>

                <div class="flex-center" style="margin-top:8px;">
                    <button class="btn btn-danger" style="font-size:8px; padding:6px 16px; opacity:0.7;" onclick="App.surrenderBattle()">⚑ HUIR DE LA BATALLA</button>
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
                html += `
                    <div class="battle-result ${r.won ? 'victory' : 'defeat'}">
                        <div class="battle-result-title">${r.won ? 'VICTORIA!' : 'DERROTA'}</div>
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
    }
};
