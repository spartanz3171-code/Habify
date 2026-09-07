// ==========================================
// HABIFY - Main App Controller
// With Supabase Auth + Cooldown Timers
// ==========================================

const App = {

    async init() {
        try {
            await initSupabase();
        } catch (e) {
            console.error('Supabase init failed:', e);
            this.showAuth('login');
            return;
        }

        // Check existing session
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
            GameState.user = session.user;
            await this.loadUserData();
        } else {
            this.showAuth('login');
        }

        // Listen for auth changes
        supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session) {
                // Prevent redundant DB reloading when switching tabs/refreshing tokens
                if (!GameState.user || GameState.user.id !== session.user.id) {
                    GameState.user = session.user;
                    await this.loadUserData();
                }
            } else if (event === 'SIGNED_OUT') {
                GameState.user = null;
                this.showAuth('login');
            }
        });

        this.initInput();
    },

    initInput() {
        // Keyboard controls
        window.addEventListener('keydown', (e) => {
            if (!GameState.currentBattle || GameState.currentBattle.isFinished) return;
            switch(e.code) {
                case 'ArrowLeft': Engine.handleInput('left', true); break;
                case 'ArrowRight': Engine.handleInput('right', true); break;
                case 'ArrowUp': Engine.handleInput('up', true); break;
                case 'Space':
                case 'KeyZ': Engine.handleInput('attack', true); break;
                case 'KeyX': Engine.handleInput('magic', true); break;
                case 'KeyC': Engine.handleInput('guard', true); break;
            }
        });

        window.addEventListener('keyup', (e) => {
            if (!GameState.currentBattle || GameState.currentBattle.isFinished) return;
            switch(e.code) {
                case 'ArrowLeft': Engine.handleInput('left', false); break;
                case 'ArrowRight': Engine.handleInput('right', false); break;
                case 'ArrowUp': Engine.handleInput('up', false); break;
                case 'Space':
                case 'KeyZ': Engine.handleInput('attack', false); break;
                case 'KeyX': Engine.handleInput('magic', false); break;
                case 'KeyC': Engine.handleInput('guard', false); break;
            }
        });

        // Touch Virtual Gamepad handler
        const setupTouchControl = (selector, actionKey) => {
            document.querySelectorAll(selector).forEach(btn => {
                const startAction = (e) => {
                    e.preventDefault();
                    if (!GameState.currentBattle || GameState.currentBattle.isFinished) return;
                    btn.classList.add('active');
                    Engine.handleInput(actionKey, true);
                };
                const stopAction = (e) => {
                    e.preventDefault();
                    btn.classList.remove('active');
                    Engine.handleInput(actionKey, false);
                };

                btn.addEventListener('touchstart', startAction, { passive: false });
                btn.addEventListener('touchend', stopAction, { passive: false });
                btn.addEventListener('touchcancel', stopAction, { passive: false });
                btn.addEventListener('mousedown', startAction);
                btn.addEventListener('mouseup', stopAction);
            });
        };

        // Attach controls dynamically
        document.addEventListener('DOMContentLoaded', () => {
            setupTouchControl('.dpad-left', 'left');
            setupTouchControl('.dpad-right', 'right');
            setupTouchControl('.dpad-up', 'up');
            setupTouchControl('.action-btn-attack', 'attack');
            setupTouchControl('.action-btn-magic', 'magic');
            setupTouchControl('.action-btn-guard', 'guard');
        });
    },

    async loadUserData() {
        const content = document.getElementById('app-content');
        content.innerHTML = Views.renderLoading();

        const loaded = await loadGameFromDB();
        if (!loaded) {
            // If avatar wasn't created yet (trigger may be slow), wait and retry
            await new Promise(r => setTimeout(r, 1500));
            await loadGameFromDB();
        }

        // Check daily penalties
        const penalties = await Engine.checkDailyPenalties();
        if (penalties.length > 0) {
            const totalHp = penalties.reduce((sum, p) => sum + p.hpLost, 0);
            setTimeout(() => {
                this.showToast(`PENALIZACION: -${totalHp}HP por habitos no cumplidos`, 'error');
            }, 500);
        }

        // Show main app
        this.showMainApp();

        // Start cooldown timer
        this.startCooldownTimer();
    },

    showMainApp() {
        // Show header and nav
        const header = document.getElementById('app-header');
        const nav = document.getElementById('bottom-nav');
        if (header) header.style.display = 'flex';
        if (nav) nav.style.display = 'flex';

        this.setupNavigation();
        this.navigate('dashboard');
        this.updateHeader();
    },

    // --- Auth ---

    showAuth(mode) {
        // Hide header and nav
        const header = document.getElementById('app-header');
        const nav = document.getElementById('bottom-nav');
        if (header) header.style.display = 'none';
        if (nav) nav.style.display = 'none';

        const content = document.getElementById('app-content');
        content.innerHTML = Views.renderAuth(mode);
    },

    async handleAuth(event, mode) {
        event.preventDefault();
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        const errorEl = document.getElementById('auth-error');
        const submitBtn = document.getElementById('auth-submit');

        submitBtn.textContent = 'CARGANDO...';
        submitBtn.disabled = true;
        errorEl.classList.remove('show');

        try {
            if (mode === 'register') {
                const avatarName = document.getElementById('auth-avatar-name').value.trim() || 'Héroe';
                const avatarClass = document.getElementById('auth-avatar-class').value || 'hero';

                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: { avatar_name: avatarName, avatar_class: avatarClass }
                    }
                });

                if (error) throw error;

                // If no session returned (email confirmation required), auto-login
                if (data.user && !data.session) {
                    const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
                        email,
                        password
                    });
                    if (loginErr) throw loginErr;
                }

                // Wait for trigger to create avatar, then update name and class
                if (data.user || (data.session && data.session.user)) {
                    const userId = data.user ? data.user.id : data.session.user.id;
                    await new Promise(r => setTimeout(r, 1500));
                    await supabase.from('avatars')
                        .update({ name: avatarName, avatar_class: avatarClass })
                        .eq('user_id', userId);

                    // Update GameState immediately to reflect user's choice
                    if (GameState.avatar) {
                        GameState.avatar.name = avatarName;
                        GameState.avatar.avatarClass = avatarClass;
                        if (GameState.currentView === 'dashboard') {
                            this.navigate('dashboard');
                        }
                    }
                }
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password
                });
                if (error) throw error;
            }
        } catch (err) {
            let errorMsg = err.message || 'Error de autenticacion';
            // Translate common Supabase errors
            if (errorMsg.includes('Invalid login credentials')) {
                errorMsg = 'Email o clave incorrecta';
            } else if (errorMsg.includes('already registered')) {
                errorMsg = 'Este email ya esta registrado. Inicia sesion.';
            }
            errorEl.textContent = errorMsg;
            errorEl.classList.add('show');
            submitBtn.textContent = mode === 'login' ? '>> ENTRAR <<' : '>> CREAR CUENTA <<';
            submitBtn.disabled = false;
        }
    },

    async logout() {
        if (confirm('Cerrar sesion?')) {
            // Clear cooldown timer
            if (GameState._cooldownInterval) {
                clearInterval(GameState._cooldownInterval);
            }
            await supabase.auth.signOut();
        }
    },

    // --- Navigation ---

    setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigate(item.dataset.view);
            });
        });
    },

    navigate(viewName) {
        GameState.currentView = viewName;
        const content = document.getElementById('app-content');

        content.style.opacity = '0';

        setTimeout(() => {
            switch (viewName) {
                case 'dashboard': content.innerHTML = Views.renderDashboard(); break;
                case 'habits': content.innerHTML = Views.renderHabits(); break;
                case 'store': content.innerHTML = Views.renderStore(); break;
                case 'arena': content.innerHTML = Views.renderArena(); break;
                default: content.innerHTML = Views.renderDashboard();
            }

            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.toggle('active', item.dataset.view === viewName);
            });

            content.style.opacity = '1';
            this.updateHeader();
        }, 100);
    },

    updateHeader() {
        const goldEl = document.getElementById('header-gold');
        const levelEl = document.getElementById('header-level');
        if (goldEl) goldEl.textContent = GameState.avatar.gold;
        if (levelEl) levelEl.textContent = `LV${GameState.avatar.level}`;
    },

    // --- Cooldown Timer ---

    startCooldownTimer() {
        if (GameState._cooldownInterval) clearInterval(GameState._cooldownInterval);

        GameState._cooldownInterval = setInterval(() => {
            if (GameState.currentView !== 'dashboard') return;

            // Update all cooldown displays
            GameState.habits.forEach(h => {
                const el = document.querySelector(`[data-habit-id="${h.id}"]`);
                if (el && isOnCooldown(h)) {
                    const remaining = getRemainingCooldown(h);
                    if (remaining) {
                        el.textContent = remaining;
                    } else {
                        // Cooldown expired, re-render
                        this.navigate('dashboard');
                    }
                }
            });
        }, 1000);
    },

    // --- Habit Actions ---

    async toggleHabit(id) {
        const habit = GameState.habits.find(h => h.id === id);
        if (!habit || isOnCooldown(habit)) return;

        const result = await Engine.completeHabit(id);
        if (result) {
            if (result.type === 'reward') {
                this.showToast(result.message, 'success');
            } else if (result.type === 'penalty') {
                this.showToast(result.message, 'error');
                if (result.gameOver) {
                    setTimeout(() => {
                        this.showToast('TU AVATAR HA CAIDO! -20XP', 'error');
                    }, 1500);
                }
            }
        }

        this.navigate('dashboard');
    },

    async handleAddHabit(event) {
        event.preventDefault();
        
        if (GameState.habits.length >= 7) {
            this.showToast('Límite de hábitos alcanzado (Máx 7)', 'error');
            return;
        }

        const title = document.getElementById('habit-title').value.trim();
        const type = document.getElementById('habit-type').value;
        const value = parseInt(document.getElementById('habit-value').value) || 20;

        if (!title) return;

        await Engine.addHabit(title, type, value, value);
        this.showToast('HABITO CREADO!', 'success');
        this.navigate('habits');
    },

    handleTypeChange() {
        const type = document.getElementById('habit-type').value;
        const label = document.getElementById('reward-label');
        if (label) {
            label.textContent = type === 'positive' ? 'XP' : 'HP PENALTY';
        }
    },

    async deleteHabit(id) {
        await Engine.removeHabit(id);
        this.showToast('ELIMINADO', 'gold');
        this.navigate('habits');
    },

    async loadDefaults() {
        await Engine.loadDefaultHabits();
        this.showToast('DEFAULTS CARGADOS!', 'success');
        this.navigate('habits');
    },

    confirmReset() {
        if (confirm('BORRAR TODOS LOS DATOS?')) {
            // We don't actually delete DB data, just clear local state
            location.reload();
        }
    },

    // --- Store ---

    filterStore(filter) {
        GameState._storeFilter = filter;
        this.navigate('store');
    },

    async buyItem(itemId) {
        const result = await Engine.buyItem(itemId);
        if (result.success) {
            this.showToast(result.message, 'gold');
            await Engine.equipItem(itemId);
        } else {
            this.showToast(result.message, 'error');
        }
        this.navigate('store');
    },

    async equipItem(itemId) {
        const result = await Engine.equipItem(itemId);
        if (result && result.status === 'success') {
            this.showToast(result.equipped ? 'EQUIPADO!' : 'DESEQUIPADO', result.equipped ? 'success' : 'gold');
        }
        this.navigate('store');
    },

    // --- Battle ---

    async startBattle(mode) {
        if (mode === 'pvp') {
            this.startPvP();
            return;
        }

        // ⚠️ DEAD AVATAR CHECK — must complete habits to revive
        if (GameState.avatar.isDead || GameState.avatar.hp <= 0) {
            this.showToast('☠ Tu avatar ha caído. ¡Completa Hábitos para poder revivir y volver a combatir!', 'error');
            return;
        }

        const btn = document.getElementById('battle-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'PREPARANDO...';
        }

        setTimeout(() => {
            const opponent = GameState._currentOpponent || Engine.generateOpponent();
            Engine.startPvEBattle(opponent);
            GameState._lastBattleResult = null;
            this.navigate('arena');
        }, 300);
    },


    async attackPvE(type) {
        // Run player animation
        const heroElem = document.querySelector('.player .pixel-hero');
        let delayBeforeHit = 300;
        
        if (heroElem) {
            heroElem.classList.remove('anim-attack-basic', 'anim-spell-fire', 'anim-spell-heal', 'attack');
            
            if (type === 'basic') {
                heroElem.classList.add('anim-attack-basic');
                delayBeforeHit = 400;
            } else if (type === 'spell_fire') {
                heroElem.classList.add('anim-spell-fire');
                const pWrapper = document.querySelector('.player .sprite-wrapper');
                if (pWrapper) {
                    const fireball = document.createElement('div');
                    fireball.className = 'fireball-projectile';
                    pWrapper.appendChild(fireball);
                    setTimeout(() => fireball.remove(), 400);
                }
                delayBeforeHit = 600;
            } else if (type === 'spell_heal') {
                heroElem.classList.add('anim-spell-heal');
                const pWrapper = document.querySelector('.player .sprite-wrapper');
                if (pWrapper) {
                    for(let i=0; i<3; i++) {
                        const spark = document.createElement('div');
                        spark.className = 'heal-sparkle';
                        spark.style.left = (15 + i*15) + 'px';
                        spark.style.top = (40 + (i%2)*10) + 'px';
                        pWrapper.appendChild(spark);
                        setTimeout(() => spark.remove(), 500);
                    }
                }
                delayBeforeHit = 600;
            } else {
                heroElem.classList.add('attack');
            }
            
            setTimeout(() => {
                heroElem.classList.remove('anim-attack-basic', 'anim-spell-fire', 'anim-spell-heal', 'attack');
            }, delayBeforeHit);
        }

        if (type === 'spell_fire') {
            setTimeout(() => {
                const enemyElem = document.querySelector('.enemy .pixel-enemy');
                if (enemyElem) {
                    enemyElem.classList.add('anim-damage-fire');
                    setTimeout(() => enemyElem.classList.remove('anim-damage-fire'), 500);
                }
            }, 300);
        }

        setTimeout(async () => {
            const result = await Engine.executePvETurn(type);
            this.navigate('arena');
            if (result && result.won !== undefined) {
                this.showToast(result.message, result.won ? 'gold' : 'error');
            } else if (result) {
                // Opponent attack animation
                setTimeout(() => {
                    const enemyElem = document.querySelector('.enemy .pixel-enemy');
                    if (enemyElem) {
                        enemyElem.classList.add('anim-attack-enemy-basic');
                        setTimeout(() => enemyElem.classList.remove('anim-attack-enemy-basic'), 400);
                    }
                    this.navigate('arena'); // Update player HP display after enemy hits
                }, 100);
            }
        }, 300);
    },

    surrenderBattle() {
        if (confirm('¿Huir cuenta como derrota. Perderás la vida de la batalla actual. ¿Seguro?')) {
            Engine.stopGameLoop();
            Engine._endBattle(false);
        }
    },

    async startPvP() {
        this.showToast('Buscando oponente...', 'gold');
        const channel = supabase.channel('matchmaking', {
            config: { presence: { key: GameState.avatar.name } }
        });

        channel.on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState();
            const keys = Object.keys(state);
            if (keys.length > 1) {
                const opponentName = keys.find(k => k !== GameState.avatar.name);
                this.showToast('Oponente encontrado: ' + opponentName, 'success');
                const opponent = {
                    name: opponentName, sprite: 'skeleton', level: GameState.avatar.level,
                    hp: 150, maxHp: 150, attack: 15, xp: 50, goldRaw: 30
                };
                Engine.startPvEBattle(opponent); // Reuse local logic for demo
                this.navigate('arena');
                channel.unsubscribe();
            }
        });

        channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track({ name: GameState.avatar.name, ready: true });
            }
        });
    },

    newOpponent() {
        GameState._currentOpponent = Engine.generateOpponent();
        GameState._lastBattleResult = null;
        this.navigate('arena');
    },

    // --- Toast ---

    showToast(message, type = 'success') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
