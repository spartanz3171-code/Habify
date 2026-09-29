// ==========================================
// HABIFY - Game Engine (Core Mechanics)
// With 24h cooldowns and daily penalties
// ==========================================

const Engine = {

    // --- Habit Management ---

    async addHabit(title, type, xpReward = 20, hpPenalty = 10, isDefault = false, frequency = 'daily', goldReward = null) {
        // Adding is allowed up to 20 habits max
        if (!isDefault && GameState.habits.length >= 20) {
            console.warn("Habit cap reached (20 max).");
            return null;
        }

        const habit = {
            id: generateId(),
            title: title,
            type: type,
            xpReward: type === 'positive' ? xpReward : 0,
            hpPenalty: type === 'negative' ? hpPenalty : 0,
            goldReward: goldReward !== null ? goldReward : (type === 'positive' ? Math.floor(xpReward / 2) : 0),
            completedAt: null,
            frequency: frequency || 'daily'
        };
        GameState.habits.push(habit);
        await saveHabitToDB(habit);
        return habit;
    },

    async addHabitFromCatalog(catalogId, frequencyOverride = null) {
        if (GameState.habits.length >= 20) {
            return { success: false, message: 'Límite alcanzado (Máximo 20 misiones activas)' };
        }
        const preset = GameState.presetCatalog.find(p => p.id === catalogId);
        if (!preset) return { success: false, message: 'Misión no encontrada en el catálogo' };

        const alreadyHas = GameState.habits.some(h => h.title === preset.title);
        if (alreadyHas) {
            return { success: false, message: 'Ya tienes esta misión en tus hábitos activos' };
        }

        const freq = frequencyOverride || preset.defaultFrequency || 'daily';
        const habit = await this.addHabit(
            preset.title,
            preset.type,
            preset.xpReward,
            preset.hpPenalty,
            false,
            freq,
            preset.goldReward
        );
        return { success: true, habit };
    },

    async removeHabit(id) {
        // Deleting IS blocked for 24h after the last deletion (anti-farming)
        if (getHabitEditCooldown()) {
            console.warn("Habit deletion is on cooldown.");
            return;
        }

        GameState.habits = GameState.habits.filter(h => h.id !== id);
        await deleteHabitFromDB(id);

        // Only deletions start the 24h cooldown
        GameState.avatar.lastHabitModified = Date.now();
        await saveAvatarToDB();
    },

    async loadDefaultHabits() {
        // Load initial 3 defaults from catalog if empty
        const defaultIds = ['hab_water', 'hab_cardio', 'hab_code'];
        for (const id of defaultIds) {
            await this.addHabitFromCatalog(id);
        }
    },

    // --- Habit Completion (24h Cooldown) ---

    async completeHabit(id) {
        const habit = GameState.habits.find(h => h.id === id);
        if (!habit) return null;

        // Check cooldown
        if (isOnCooldown(habit)) return null;

        // If cooldown expired, reset completedAt first
        habit.completedAt = Date.now();

        if (habit.type === 'positive') {
            GameState.avatar.currentXP += habit.xpReward;
            GameState.avatar.gold += habit.goldReward;
            // Revive if dead
            if (GameState.avatar.isDead) {
                GameState.avatar.isDead = false;
                GameState.avatar.hp = 30;
            }
            this._checkLevelUp();
            await saveHabitToDB(habit);
            await saveAvatarToDB();
            return {
                type: 'reward',
                xp: habit.xpReward,
                gold: habit.goldReward,
                message: `+${habit.xpReward} XP, +${habit.goldReward} G`
            };
        } else {
            // Negative habit: marking it means user FAILED (did the bad thing)
            GameState.avatar.hp = Math.max(0, GameState.avatar.hp - habit.hpPenalty);
            if (GameState.avatar.hp <= 0) {
                this._handleGameOver();
            }
            await saveHabitToDB(habit);
            await saveAvatarToDB();
            return {
                type: 'penalty',
                hpLost: habit.hpPenalty,
                message: `-${habit.hpPenalty} HP`,
                gameOver: GameState.avatar.hp <= 0
            };
        }
    },

    // --- Daily Penalty Check ---

    async checkDailyPenalties() {
        const now = Date.now();
        const lastCheck = GameState.avatar.lastPenaltyCheck
            ? new Date(GameState.avatar.lastPenaltyCheck).getTime()
            : now;

        // Check if at least 12h have passed since last global check
        if (now - lastCheck < (12 * 60 * 60 * 1000)) return [];

        const currentDate = new Date();
        const dayOfWeek = currentDate.getDay(); // 0 = Sun, 6 = Sat
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

        const penalties = [];
        for (const habit of GameState.habits) {
            if (habit.type !== 'positive') continue;

            // Habits for workdays are not penalized on weekends
            if (habit.frequency === 'workdays' && isWeekend) continue;

            const cycleMs = getHabitCooldownMs(habit);

            // If habit was NOT completed in its frequency cycle
            if (!habit.completedAt || (now - habit.completedAt) > cycleMs) {
                const penalty = 10; // HP penalty per missed habit
                GameState.avatar.hp = Math.max(0, GameState.avatar.hp - penalty);
                penalties.push({
                    habit: habit.title,
                    hpLost: penalty
                });

                // Reset completedAt so it counts as "available" again
                habit.completedAt = null;
                await saveHabitToDB(habit);
            }
        }

        if (GameState.avatar.hp <= 0) {
            this._handleGameOver();
        }

        GameState.avatar.lastPenaltyCheck = new Date().toISOString();
        await saveAvatarToDB();

        return penalties;
    },

    // --- Leveling ---

    _checkLevelUp() {
        while (GameState.avatar.currentXP >= GameState.avatar.xpToLevel) {
            GameState.avatar.currentXP -= GameState.avatar.xpToLevel;
            GameState.avatar.level++;
            GameState.avatar.xpToLevel = Math.floor(GameState.avatar.xpToLevel * 1.5);
            GameState.avatar.gold += 25;
            GameState.avatar.hp = Math.min(GameState.avatar.maxHp, GameState.avatar.hp + 20);
            this._showLevelUpNotification();
        }
    },

    _showLevelUpNotification() {
        const notification = document.createElement('div');
        notification.className = 'level-up-notification';
        notification.innerHTML = `
            <div class="level-up-content">
                <span class="level-up-icon">⚔️</span>
                <span class="level-up-text">LV ${GameState.avatar.level}!</span>
                <span class="level-up-bonus">+25G +20HP</span>
            </div>
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 500);
        }, 3000);
    },

    _handleGameOver() {
        GameState.avatar.isDead = true;
        GameState.avatar.hp = 0;
        // XP penalty
        GameState.avatar.currentXP = Math.max(0, GameState.avatar.currentXP - 20);
    },

    // --- Store ---

    async buyItem(itemId) {
        const userId = GameState.user?.id;
        const item = GameState.shopItems.find(i => i.id === itemId);
        if (!item || item.purchased) return { success: false, message: 'No disponible.' };
        if (GameState.avatar.gold < item.cost) return { success: false, message: 'Oro insuficiente!' };

        GameState.avatar.gold -= item.cost;
        item.purchased = true;
        GameState.inventory.push({ ...item });
        await addInventoryToDB(itemId);
        if (GameState.user?.id !== userId) return { success: false, message: 'La sesión cambió.' };
        await saveAvatarToDB();
        return { success: true, message: `${item.name} comprado!` };
    },

    async equipItem(itemId) {
        const item = GameState.inventory.find(i => i.id === itemId);
        if (!item) return { status: 'error' };

        let equipped = false;
        if (item.type === 'background') {
            if (GameState.avatar.equippedBackground === item.id) GameState.avatar.equippedBackground = null;
            else { GameState.avatar.equippedBackground = item.id; equipped = true; }
        } else if (item.type === 'pet') {
            if (GameState.avatar.equippedPet === item.id) GameState.avatar.equippedPet = null;
            else { GameState.avatar.equippedPet = item.id; equipped = true; }
        } else if (item.type === 'weapon') {
            if (GameState.avatar.equippedWeapon === item.id) GameState.avatar.equippedWeapon = null;
            else { GameState.avatar.equippedWeapon = item.id; equipped = true; }
        } else if (item.type === 'shield') {
            if (GameState.avatar.equippedShield === item.id) GameState.avatar.equippedShield = null;
            else { GameState.avatar.equippedShield = item.id; equipped = true; }
        } else if (item.type === 'spell') {
            let spells = GameState.avatar.equippedSpell ? GameState.avatar.equippedSpell.split(',') : [];
            if (spells.includes(item.id)) {
                spells = spells.filter(s => s !== item.id);
                equipped = false;
            } else {
                spells.push(item.id);
                equipped = true;
            }
            GameState.avatar.equippedSpell = spells.length > 0 ? spells.join(',') : null;
        }
        await saveAvatarToDB();
        return { status: 'success', equipped };
    },

    // --- Battle System ---

    generateOpponent() {
        if (GameState.monsters && GameState.monsters.length > 0) {
            const m = GameState.monsters[Math.floor(Math.random() * GameState.monsters.length)];
            const levelVar = Math.floor(Math.random() * 3) - 1;
            const oppLevel = Math.max(1, GameState.avatar.level + levelVar);
            
            // scale monster
            const scale = oppLevel / m.base_level;
            return {
                name: m.name,
                sprite: m.sprite,
                level: oppLevel,
                xp: Math.floor(m.xp_reward * scale),
                hp: Math.floor(m.base_hp * scale),
                maxHp: Math.floor(m.base_hp * scale),
                attack: Math.floor(m.base_attack * scale),
                goldRaw: Math.floor(m.gold_reward * scale)
            };
        }

        const enemies = [
            { name: 'Goblin Oscuro', sprite: 'goblin' },
            { name: 'Esqueleto Guerrero', sprite: 'skeleton' },
            { name: 'Slime Gigante', sprite: 'slime' },
            { name: 'Orco Salvaje', sprite: 'orc' },
            { name: 'Espectro', sprite: 'ghost' }
        ];
        const e = enemies[Math.floor(Math.random() * enemies.length)];
        const levelVar = Math.floor(Math.random() * 3) - 1;
        const oppLevel = Math.max(1, GameState.avatar.level + levelVar);

        return {
            name: e.name,
            sprite: e.sprite,
            level: oppLevel,
            xp: 15 + oppLevel * 10,
            hp: 70 + oppLevel * 10,
            maxHp: 70 + oppLevel * 10,
            attack: 10 + oppLevel * 2,
            goldRaw: 10 + oppLevel * 5
        };
    },

    // --- Real-time combat: coordinates are pixels, y marks the fighter's feet. ---

    _combat: { width: 640, height: 320, floor: 286, step: 1 / 120 },
    _rtInputs: {},
    _inputBuffer: {},
    _rtEntities: [],
    _rtProjectiles: [],
    _rtEffects: [],
    _gameLoopRunning: false,
    _rafId: null,
    _loopToken: 0,
    _accumulator: 0,
    _hitStop: 0,

    resetInputs() {
        this._rtInputs = { left: false, right: false, up: false, attack: false, heavy: false, magic: false, heal: false, fire: false, guard: false };
        this._inputBuffer = {};
        for (const ent of this._rtEntities) ent.queuedCombo = false;
    },

    // Movement and guard are held; actions are buffered briefly on a fresh press.
    handleInput(action, isPressed) {
        if (!(action in this._rtInputs)) return;
        if (isPressed && !this._rtInputs[action] && !['left', 'right', 'guard'].includes(action)) {
            this._inputBuffer[action] = 0.2;
        }
        this._rtInputs[action] = !!isPressed;
    },

    startPvEBattle(opponent) {
        if (GameState.currentBattle && !GameState.currentBattle.isFinished) return GameState.currentBattle;
        this.stopGameLoop();
        const maxHp = 100 + (GameState.avatar.level || 1) * 10;
        GameState.currentBattle = {
            mode: 'pve', opponent, playerHp: maxHp, playerMaxHp: maxHp,
            oppHp: opponent.hp, oppMaxHp: opponent.maxHp,
            logs: [], isFinished: false, healUses: 0, fireUses: 0, knockout: null
        };
        this._rtEntities = [
            this._createFighter('player', true, 150, this._combat.floor, GameState.avatar),
            this._createFighter('enemy', false, 490, this._combat.floor, opponent)
        ];
        this._rtProjectiles = [];
        this._accumulator = 0;
        this._hitStop = 0;
        this._freshBattle = true;
        return GameState.currentBattle;
    },

    _createFighter(id, isPlayer, x, y, stats) {
        return {
            id, isPlayer, x, y, stats, width: 44, height: 88, vx: 0, vy: 0,
            grounded: true, state: 'IDLE', facing: isPlayer ? 'right' : 'left',
            attack: null, combo: 0, comboWindow: 0, queuedCombo: false,
            hitStunTimer: 0, castTimer: 0, magicCooldown: 0,
            aiTimer: 0.65, aiCount: 0, aiRetreat: 0,
            aiGuardTimer: 0, aiGuardCooldown: 0,
            staggerHits: 0, staggerWindow: 0, recoveryPending: false, recoveryTimer: 0,
            dom: null, shadow: null, art: null
        };
    },

    _measureArena() {
        const arena = document.getElementById('real-time-arena');
        if (!arena) return null;
        const width = Math.max(240, arena.clientWidth || 640);
        const height = Math.max(240, arena.clientHeight || 320);
        const oldWidth = this._combat.width;
        const oldFloor = this._combat.floor;
        this._combat = { ...this._combat, width, height, floor: height - 34 };
        for (const ent of this._rtEntities) {
            ent.x = this._freshBattle ? width * (ent.isPlayer ? 0.24 : 0.76) : ent.x * width / oldWidth;
            ent.x = Math.max(30, Math.min(width - 30, ent.x));
            ent.y += this._combat.floor - oldFloor;
            if (ent.grounded) ent.y = this._combat.floor;
        }
        for (const projectile of this._rtProjectiles) {
            projectile.x *= width / oldWidth;
            projectile.y += this._combat.floor - oldFloor;
        }
        this._freshBattle = false;
        arena.style.setProperty('--combat-floor', '34px');
        return arena;
    },

    startGameLoop() {
        const battle = GameState.currentBattle;
        if (this._gameLoopRunning || !battle || battle.isFinished || !this._measureArena()) return;
        this._gameLoopRunning = true;
        this._accumulator = 0;
        this._lastTime = performance.now();
        const token = ++this._loopToken;
        const arena = document.getElementById('real-time-arena');
        if (arena) arena.dataset.paused = 'false';
        this._renderRT();
        this._rafId = requestAnimationFrame(time => this._gameLoop(time, token));
    },

    stopGameLoop() {
        this._gameLoopRunning = false;
        this._loopToken++;
        if (this._rafId !== null) cancelAnimationFrame(this._rafId);
        this._rafId = null;
        this._accumulator = 0;
        this.resetInputs();
        for (const effect of this._rtEffects) effect.dom.remove();
        this._rtEffects = [];
        const arena = document.getElementById('real-time-arena');
        if (arena) arena.dataset.paused = 'true';
    },

    _gameLoop(time, token = this._loopToken) {
        if (token !== this._loopToken || !this._gameLoopRunning || !GameState.currentBattle || GameState.currentBattle.isFinished) return;
        const arena = document.getElementById('real-time-arena');
        if (!arena) { this.stopGameLoop(); return; }
        if (arena.clientWidth !== this._combat.width || arena.clientHeight !== this._combat.height) this._measureArena();
        this._updateRT(Math.min(Math.max(0, (time - this._lastTime) / 1000), 0.1));
        this._lastTime = time;
        this._renderRT();
        if (this._gameLoopRunning && token === this._loopToken) {
            this._rafId = requestAnimationFrame(next => this._gameLoop(next, token));
        }
    },

    _updateRT(dt) {
        this._accumulator = Math.min(this._accumulator + Math.max(0, dt), 0.1);
        while (this._accumulator + 1e-9 >= this._combat.step) {
            this._accumulator -= this._combat.step;
            this._stepCombat(this._combat.step);
        }
    },

    _stepCombat(dt) {
        const battle = GameState.currentBattle;
        if (!battle || battle.isFinished) return;
        this._advanceEffects(dt);
        if (this._hitStop > 0) { this._hitStop = Math.max(0, this._hitStop - dt); return; }
        const [player, enemy] = this._rtEntities;
        if (!player || !enemy) return;
        for (const ent of this._rtEntities) {
            ent.magicCooldown = Math.max(0, ent.magicCooldown - dt);
            ent.comboWindow = Math.max(0, ent.comboWindow - dt);
            ent.hitStunTimer = Math.max(0, ent.hitStunTimer - dt);
            ent.castTimer = Math.max(0, ent.castTimer - dt);
            // Cooldowns keep progressing while stunned, casting or attacking.
            ent.aiTimer = Math.max(0, ent.aiTimer - dt);
            ent.aiRetreat = Math.max(0, ent.aiRetreat - dt);
            ent.aiGuardTimer = Math.max(0, ent.aiGuardTimer - dt);
            ent.aiGuardCooldown = Math.max(0, ent.aiGuardCooldown - dt);
            ent.recoveryTimer = Math.max(0, ent.recoveryTimer - dt);
            ent.staggerWindow = Math.max(0, ent.staggerWindow - dt);
            if (!ent.staggerWindow && !ent.recoveryPending) ent.staggerHits = 0;
            if (ent.state === 'HIT_STUN' && !ent.hitStunTimer) ent.state = 'IDLE';
            if (ent.state === 'CASTING' && !ent.castTimer) ent.state = 'IDLE';
            if (ent.recoveryPending && !ent.hitStunTimer && ent.state !== 'DEAD') {
                ent.recoveryPending = false;
                ent.recoveryTimer = 1.15;
                ent.staggerHits = 0;
                ent.aiTimer = 0;
                ent.aiRetreat = 0;
                ent.aiGuardTimer = 0;
                this._effect('recovery', ent.x, ent.y - 112, '◇');
            }
        }
        if (!battle.knockout) {
            this._controlPlayer(player, enemy, dt);
            this._controlEnemy(enemy, player, dt);
        }
        for (const ent of this._rtEntities) {
            this._advanceAttack(ent, dt);
            this._moveFighter(ent, dt);
        }
        this._resolveBodies(player, enemy);
        this._advanceProjectiles(dt);
        for (const action of Object.keys(this._inputBuffer)) {
            this._inputBuffer[action] -= dt;
            if (this._inputBuffer[action] <= 0) delete this._inputBuffer[action];
        }
        if (battle.knockout) {
            battle.knockout.remaining -= dt;
            if (battle.knockout.remaining <= 0) this._endBattle(battle.knockout.playerWon, false, battle);
        }
    },

    _approach(value, target, amount) {
        return value < target ? Math.min(target, value + amount) : Math.max(target, value - amount);
    },

    _controlPlayer(player, enemy, dt) {
        if (player.state === 'DEAD' || player.hitStunTimer > 0 || player.castTimer > 0) return;
        if (player.attack) {
            if (this._inputBuffer.attack && player.attack.kind === 'light' && player.combo < 3) {
                player.queuedCombo = true;
                delete this._inputBuffer.attack;
            }
            return;
        }
        // Facing locks during a guard, so attacks from behind cannot be blocked.
        if (player.state !== 'GUARDING') player.facing = player.x <= enemy.x ? 'right' : 'left';
        if (this._rtInputs.guard && player.grounded) {
            player.state = 'GUARDING';
            player.vx = this._approach(player.vx, 0, 2600 * dt);
            return;
        }
        const direction = Number(this._rtInputs.right) - Number(this._rtInputs.left);
        const acceleration = player.grounded ? 2000 : 850;
        const friction = player.grounded ? 2400 : 160;
        player.vx = this._approach(player.vx, direction * 225, (direction ? acceleration : friction) * dt);
        if (this._inputBuffer.up && player.grounded) {
            player.vy = -600;
            player.grounded = false;
            delete this._inputBuffer.up;
            this._effect('dust', player.x, this._combat.floor, '');
        }
        player.state = player.grounded ? (Math.abs(player.vx) > 15 ? 'RUNNING' : 'IDLE') : (player.vy < 0 ? 'JUMPING' : 'FALLING');
        if (this._inputBuffer.heavy) {
            delete this._inputBuffer.heavy;
            this._startAttack(player, 'heavy');
        } else if (this._inputBuffer.attack) {
            delete this._inputBuffer.attack;
            this._startAttack(player, 'light');
        } else {
            for (const action of ['heal', 'fire', 'magic']) {
                if (this._inputBuffer[action]) {
                    delete this._inputBuffer[action];
                    this._castSpell(player, action);
                    break;
                }
            }
        }
    },

    _controlEnemy(enemy, player, dt) {
        if (enemy.aiDisabled || enemy.state === 'DEAD' || enemy.hitStunTimer > 0 || enemy.attack) return;
        const distance = player.x - enemy.x;
        const direction = Math.sign(distance) || 1;
        enemy.facing = direction > 0 ? 'right' : 'left';
        if (!enemy.recoveryTimer && player.attack && Math.abs(distance) < 100 && enemy.aiCount % 3 === 2 && player.grounded && !enemy.aiGuardCooldown) {
            enemy.aiGuardTimer = 0.28;
            enemy.aiGuardCooldown = 1.15;
        }
        if (enemy.aiRetreat > 0 && !player.attack && !enemy.recoveryTimer) {
            enemy.vx = this._approach(enemy.vx, -direction * 85, 1200 * dt);
            enemy.state = 'RUNNING';
        } else if (enemy.aiGuardTimer > 0 && !enemy.recoveryTimer) {
            enemy.state = 'GUARDING';
            enemy.vx = this._approach(enemy.vx, 0, 1800 * dt);
        } else if (Math.abs(distance) > 72) {
            enemy.state = 'RUNNING';
            enemy.vx = this._approach(enemy.vx, direction * 128, 1150 * dt);
        } else {
            enemy.state = 'IDLE';
            enemy.vx = this._approach(enemy.vx, 0, 1900 * dt);
            if (enemy.aiTimer <= 0 && Math.abs(player.y - enemy.y) < 60) {
                enemy.aiCount++;
                this._startAttack(enemy, enemy.aiCount % 3 === 0 ? 'heavy' : 'light');
                enemy.aiTimer = 0.8;
            }
        }
    },

    _startAttack(ent, kind, chained = false) {
        if (ent.state === 'DEAD' || ent.hitStunTimer > 0) return;
        const combo = kind === 'light' ? (chained ? ent.combo + 1 : (ent.comboWindow > 0 && ent.combo < 3 ? ent.combo + 1 : 1)) : 0;
        ent.combo = combo;
        const heavy = kind === 'heavy';
        ent.attack = {
            kind, elapsed: 0, startup: ent.isPlayer ? (heavy ? 0.23 : 0.075) : (heavy ? 0.5 : 0.34),
            active: heavy ? 0.14 : 0.1, recovery: heavy ? 0.36 : 0.19,
            range: heavy ? 91 : (combo === 3 ? 84 : 76),
            multiplier: heavy ? 1.85 : [1, 1, 1.15, 1.4][combo || 1],
            knockback: heavy ? 330 : (combo === 3 ? 220 : 100),
            phase: 'startup', hit: false
        };
        ent.queuedCombo = false;
        ent.state = heavy ? 'HEAVY_ATTACK' : 'ATTACKING';
        ent.vx *= ent.grounded ? 0.2 : 0.8;
    },

    _advanceAttack(ent, dt) {
        const attack = ent.attack;
        if (!attack || ent.state === 'DEAD') return;
        attack.elapsed += dt;
        if (attack.elapsed < attack.startup) attack.phase = 'startup';
        else if (attack.elapsed < attack.startup + attack.active) {
            if (attack.phase === 'startup') {
                ent.vx += (ent.facing === 'right' ? 1 : -1) * (attack.kind === 'heavy' ? 140 : 90);
            }
            attack.phase = 'active';
            if (!attack.hit) this._executeMeleeHit(ent);
        } else attack.phase = 'recovery';
        if (attack.elapsed >= attack.startup + attack.active + attack.recovery) {
            ent.attack = null;
            ent.comboWindow = 0.34;
            ent.state = 'IDLE';
            if (ent.queuedCombo && ent.combo < 3) this._startAttack(ent, 'light', true);
            else if (!ent.isPlayer) ent.aiRetreat = 0.22;
        }
    },

    _moveFighter(ent, dt) {
        const floor = this._combat.floor;
        if (ent.attack || ent.castTimer > 0 || ent.hitStunTimer > 0 || ent.state === 'DEAD') {
            // A hit keeps its impulse while stunned; input never cancels knockback.
            ent.vx = this._approach(ent.vx, 0, (ent.hitStunTimer > 0 ? 220 : 600) * dt);
        }
        ent.x += ent.vx * dt;
        if (!ent.grounded || ent.vy < 0) {
            ent.vy += 1600 * dt;
            ent.y += ent.vy * dt;
        }
        if (ent.y >= floor) {
            if (!ent.grounded && ent.vy > 100) this._effect('dust', ent.x, floor, '');
            ent.y = floor;
            ent.vy = 0;
            ent.grounded = true;
        } else ent.grounded = false;
        if (!ent.grounded && !ent.attack && !ent.hitStunTimer && !ent.castTimer && ent.state !== 'DEAD') ent.state = ent.vy < 0 ? 'JUMPING' : 'FALLING';
        const min = 27, max = this._combat.width - 27;
        if (ent.x < min || ent.x > max) {
            ent.x = Math.max(min, Math.min(max, ent.x));
            ent.vx = 0;
        }
    },

    _resolveBodies(a, b) {
        if (a.state === 'DEAD' || b.state === 'DEAD') return;
        // Feet and heads must overlap: an airborne fighter can cross over a rival.
        if (a.y <= b.y - b.height || b.y <= a.y - a.height) return;
        const minDistance = (a.width + b.width) / 2;
        const distance = b.x - a.x;
        if (Math.abs(distance) >= minDistance) return;
        const direction = distance >= 0 ? 1 : -1;
        const push = (minDistance - Math.abs(distance)) / 2;
        a.x -= push * direction;
        b.x += push * direction;
        const min = 27, max = this._combat.width - 27;
        if (a.x < min) { b.x += min - a.x; a.x = min; }
        if (b.x < min) { a.x += min - b.x; b.x = min; }
        if (a.x > max) { b.x -= a.x - max; a.x = max; }
        if (b.x > max) { a.x -= b.x - max; b.x = max; }
    },

    _executeMeleeHit(attacker) {
        const attack = attacker.attack;
        const target = this._rtEntities.find(ent => ent.id !== attacker.id);
        if (!attack || attack.hit || !target || target.state === 'DEAD') return;
        const direction = attacker.facing === 'right' ? 1 : -1;
        const distance = (target.x - attacker.x) * direction;
        const fistY = attacker.y - 55;
        if (distance < 0 || distance > attack.range || fistY < target.y - target.height || fistY > target.y - 8) return;
        attack.hit = true;
        let base = attacker.isPlayer ? 5 + (GameState.avatar.level || 1) * 2 + (GameState.avatar.equippedWeapon ? 8 : 0) : attacker.stats.attack;
        if (target.isPlayer && GameState.avatar.equippedShield) base = Math.max(2, base - 8);
        this.applyDamage(target.id, attacker.id, Math.max(1, Math.round(base * attack.multiplier)), {
            knockback: attack.knockback, heavy: attack.kind === 'heavy', direction
        });
        if (attacker.isPlayer && attacker.combo > 1) this._effect('combo', attacker.x, attacker.y - 120, `${attacker.combo} HIT`);
    },

    _castSpell(player, requested) {
        if (player.magicCooldown > 0) return;
        const spells = (GameState.avatar.equippedSpell || '').split(',');
        const battle = GameState.currentBattle;
        let type = requested;
        if (type === 'magic') {
            type = spells.includes('spell_fire') && !battle.fireUses ? 'fire' : spells.includes('spell_heal') && !battle.healUses ? 'heal' : 'magic';
            if (type === 'magic' && spells.some(id => ['spell_heal', 'spell_fire'].includes(id))) return;
        }
        if (type === 'heal') {
            if (!spells.includes('spell_heal') || battle.healUses >= 1) return;
            battle.healUses++;
            const restored = Math.min(battle.playerMaxHp - battle.playerHp, Math.floor(battle.playerMaxHp * 0.35));
            battle.playerHp += restored;
            this._effect('heal', player.x, player.y - 55, `+${restored}`);
            this._spellBurst('heal', player.x, player.y - 48);
            this._updateHpBars();
        } else {
            if (type === 'fire') {
                if (!spells.includes('spell_fire') || battle.fireUses >= 1) return;
                battle.fireUses++;
            } else if (GameState.avatar.level < 2) return;
            this._spawnProjectile(player, type);
        }
        player.state = 'CASTING';
        player.castTimer = 0.45;
        player.magicCooldown = 1.2;
        player.vx *= 0.25;
    },

    _spawnProjectile(source, type) {
        const direction = source.facing === 'right' ? 1 : -1;
        this._spellBurst(type, source.x + direction * 43, source.y - 56, true, direction);
        this._rtProjectiles.push({
            sourceId: source.id, x: source.x + direction * 43, y: source.y - 56,
            vx: direction * 380, radius: 15, type, life: 2.5, warmup: 0.1, trailTimer: 0, dom: null,
            damage: Math.max(6, (GameState.avatar.level || 1) * 3) * (type === 'fire' ? 2 : 1)
        });
    },

    _advanceProjectiles(dt) {
        this._rtProjectiles = this._rtProjectiles.filter(projectile => {
            if (projectile.warmup > 0) {
                projectile.warmup = Math.max(0, projectile.warmup - dt);
                const source = this._rtEntities.find(ent => ent.id === projectile.sourceId);
                if (source) {
                    projectile.x = source.x + Math.sign(projectile.vx) * 43;
                    projectile.y = source.y - 56;
                }
                return true;
            }
            projectile.x += projectile.vx * dt;
            projectile.life -= dt;
            projectile.trailTimer -= dt;
            if (projectile.trailTimer <= 0) {
                projectile.trailTimer = 0.055;
                if (!this._prefersReducedMotion()) {
                    this._effect(`trail-${projectile.type}`, projectile.x - Math.sign(projectile.vx) * 15, projectile.y, '', { direction: Math.sign(projectile.vx), life: 0.32 });
                }
            }
            const target = this._rtEntities.find(ent => ent.id !== projectile.sourceId);
            if (target && target.state !== 'DEAD' && Math.abs(projectile.x - target.x) < target.width / 2 + projectile.radius && projectile.y >= target.y - target.height && projectile.y <= target.y) {
                this.applyDamage(target.id, projectile.sourceId, projectile.damage, { knockback: 175, direction: Math.sign(projectile.vx) });
                this._spellBurst(projectile.type, projectile.x, projectile.y, false, Math.sign(projectile.vx));
                projectile.life = 0;
            }
            const alive = projectile.life > 0 && projectile.x > -30 && projectile.x < this._combat.width + 30;
            if (!alive && projectile.dom) projectile.dom.remove();
            return alive;
        });
    },

    _prefersReducedMotion() {
        return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    },

    _spellBurst(type, x, y, charging = false, direction = 1) {
        const particles = Array.from({ length: 6 }, (_, i) => {
            const angle = i * Math.PI / 3;
            const distance = type === 'heal' ? 48 : 35;
            return `<i class="spell-particle" style="--particle-x:${Math.round(Math.cos(angle) * distance)}px;--particle-y:${Math.round(Math.sin(angle) * distance)}px;--particle-delay:${i * 0.015}s"></i>`;
        }).join('');
        this._effect(`${charging ? 'cast' : 'burst'}-${type}`, x, y, '', {
            life: charging ? 0.28 : 0.8, direction,
            html: `<i class="spell-flash"></i><i class="spell-ring"></i><i class="spell-ring spell-ring-second"></i>${particles}`
        });
    },

    applyDamage(targetId, sourceId, damage, impact = {}) {
        const battle = GameState.currentBattle;
        const target = this._rtEntities.find(ent => ent.id === targetId);
        const source = this._rtEntities.find(ent => ent.id === sourceId);
        if (!battle || battle.isFinished || battle.knockout || !target || target.state === 'DEAD') return;
        const direction = impact.direction || (source && source.x > target.x ? -1 : 1);
        const facingSource = target.facing === (direction > 0 ? 'left' : 'right');
        const blocked = target.state === 'GUARDING' && target.grounded && facingSource;
        const finalDamage = Math.max(1, Math.round(damage * (blocked ? 0.25 : 1)));
        const resistsStagger = !target.isPlayer && target.recoveryTimer > 0;
        if (!resistsStagger) {
            target.attack = null;
            target.queuedCombo = false;
            target.castTimer = 0;
            const stun = blocked ? 0.12 : (impact.heavy ? 0.42 : 0.24);
            // Once the third stagger lands, further hits cannot extend its recovery.
            target.hitStunTimer = target.recoveryPending ? Math.min(target.hitStunTimer, stun) : stun;
            target.state = blocked ? 'GUARDING' : 'HIT_STUN';
            target.vx = direction * (impact.knockback || 140) * (blocked ? 0.32 : 1);
            if (!blocked && impact.heavy) { target.vy = -135; target.grounded = false; }
            if (!target.isPlayer && !blocked) {
                target.staggerHits++;
                target.staggerWindow = 1.4;
                if (target.staggerHits >= 3) target.recoveryPending = true;
            }
        }
        // Recovery resists interruption, never damage. Attacks retain their visible windup.
        this._hitStop = Math.min(0.075, Math.max(this._hitStop, resistsStagger ? 0.012 : blocked ? 0.025 : impact.heavy ? 0.075 : 0.045));
        const hpKey = target.isPlayer ? 'playerHp' : 'oppHp';
        battle[hpKey] = Math.max(0, battle[hpKey] - finalDamage);
        this._effect(blocked ? 'block' : 'impact', target.x - direction * 16, target.y - 55, '');
        this._effect(blocked ? 'blocked-number' : 'damage', target.x, target.y - 95, `${blocked ? '◇ ' : '−'}${finalDamage}`);
        const arena = document.getElementById('real-time-arena');
        if (arena && impact.heavy && !blocked && !this._prefersReducedMotion() && typeof arena.animate === 'function') {
            arena.animate([{ transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 130 });
        }
        this._updateHpBars();
        if (battle[hpKey] === 0) {
            target.state = 'DEAD';
            target.attack = null;
            target.hitStunTimer = 0;
            target.recoveryTimer = 0;
            target.recoveryPending = false;
            battle.knockout = { remaining: 0.9, playerWon: !target.isPlayer };
            this.resetInputs();
            this._effect('knockout', this._combat.width / 2, this._combat.height / 2 - 15, 'K.O.');
        }
    },

    _effect(kind, x, y, text, options = {}) {
        const arena = document.getElementById('real-time-arena');
        if (!arena) return;
        while (this._rtEffects.length >= 32) this._rtEffects.shift().dom.remove();
        const effect = document.createElement('span');
        effect.className = `combat-effect combat-${kind}`;
        effect.style.left = `${x}px`;
        effect.style.top = `${y}px`;
        effect.textContent = text;
        effect.style.setProperty('--effect-direction', options.direction || 1);
        if (options.html) effect.innerHTML = options.html;
        effect.setAttribute('aria-hidden', 'true');
        arena.appendChild(effect);
        this._rtEffects.push({ dom: effect, life: options.life || 0.95, arena });
        return effect;
    },

    _advanceEffects(dt) {
        this._rtEffects = this._rtEffects.filter(effect => {
            effect.life -= dt;
            const alive = effect.life > 0 && effect.dom.parentNode === effect.arena;
            if (!alive) effect.dom.remove();
            return alive;
        });
    },

    _updateHpBars() {
        const battle = GameState.currentBattle;
        if (!battle) return;
        for (const [prefix, hp, max] of [['p', battle.playerHp, battle.playerMaxHp], ['e', battle.oppHp, battle.oppMaxHp]]) {
            const fill = document.getElementById(`rt-${prefix}-hp-fill`);
            const label = document.getElementById(`rt-${prefix}-hp-text`);
            if (fill) {
                fill.style.width = `${Math.max(0, hp / max * 100)}%`;
                fill.style.background = hp > max * 0.5 ? (prefix === 'p' ? '#7ae2a4' : '#fb7a79') : hp > max * 0.25 ? '#f7c948' : '#ff4e64';
            }
            if (label) label.textContent = `${hp}/${max} BHP`;
        }
    },

    _renderRT() {
        const arena = document.getElementById('real-time-arena');
        if (!arena) return;
        for (const ent of this._rtEntities) {
            if (!ent.dom || ent.dom.parentNode !== arena) {
                ent.shadow = document.createElement('div');
                ent.shadow.className = 'combat-shadow';
                arena.appendChild(ent.shadow);
                ent.dom = document.createElement('div');
                ent.dom.className = `combat-fighter ${ent.isPlayer ? 'combat-player' : 'combat-enemy'}`;
                ent.dom.innerHTML = ent.isPlayer
                    ? CharacterArt.render(GameState.avatar, { state: ent.state, facing: ent.facing })
                    : CharacterArt.renderMonster(ent.stats.sprite, { state: ent.state, facing: ent.facing });
                ent.art = ent.dom.querySelector('.character-art');
                const tell = document.createElement('span');
                tell.className = 'combat-tell';
                tell.textContent = '!';
                tell.setAttribute('aria-hidden', 'true');
                ent.dom.appendChild(tell);
                arena.appendChild(ent.dom);
            }
            ent.dom.style.transform = `translate3d(${ent.x - 64}px, ${ent.y - 128}px, 0)`;
            ent.dom.dataset.state = ent.state;
            ent.dom.dataset.phase = ent.attack ? ent.attack.phase : '';
            ent.dom.dataset.heavy = ent.attack && ent.attack.kind === 'heavy' ? 'true' : 'false';
            ent.dom.dataset.recovery = ent.recoveryTimer > 0 ? 'true' : 'false';
            if (ent.art) {
                ent.art.dataset.state = ent.state;
                ent.art.dataset.facing = ent.facing;
                ent.art.dataset.combo = String(ent.combo || 1);
                ent.art.dataset.phase = ent.attack ? ent.attack.phase : '';
                ent.art.style.setProperty('--attack-duration', `${ent.attack ? ent.attack.startup + ent.attack.active + ent.attack.recovery : 0.4}s`);
            }
            const altitude = Math.max(0, this._combat.floor - ent.y);
            ent.shadow.style.transform = `translate3d(${ent.x - 28}px, ${this._combat.floor - 4}px, 0) scale(${Math.max(0.4, 1 - altitude / 220)})`;
            ent.shadow.style.opacity = String(Math.max(0.18, 0.5 - altitude / 350));
        }
        for (const projectile of this._rtProjectiles) {
            this._renderProjectile(projectile, arena);
        }
    },

    _renderProjectile(projectile, arena) {
        if (!projectile.dom || projectile.dom.parentNode !== arena) {
            if (projectile.dom) projectile.dom.remove();
            projectile.dom = document.createElement('div');
            projectile.dom.className = `combat-projectile combat-projectile-${projectile.type}`;
            projectile.dom.setAttribute('aria-hidden', 'true');
            projectile.dom.innerHTML = '<span class="combat-orb"><i class="orb-aura"></i><i class="orb-tail orb-tail-outer"></i><i class="orb-tail orb-tail-inner"></i><i class="orb-ring"></i><i class="orb-core"></i><i class="orb-spark"></i></span>';
            arena.appendChild(projectile.dom);
        }
        // Only this outer element positions the shot. Child transforms animate its art.
        projectile.dom.style.transform = `translate3d(${projectile.x - 15}px, ${projectile.y - 15}px, 0)`;
        projectile.dom.style.setProperty('--projectile-direction', Math.sign(projectile.vx));
        projectile.dom.dataset.charging = projectile.warmup > 0 ? 'true' : 'false';
    },


    async _endBattle(playerWon, fled = false, expectedBattle = GameState.currentBattle) {
        if (!expectedBattle || GameState.currentBattle !== expectedBattle || expectedBattle.isFinished) return null;
        const b = GameState.currentBattle;
        b.isFinished = true;
        
        // Stop the real-time loop
        this.stopGameLoop();
        
        let result;
        if (fled) {
            // Player retreated from the fight
            const penalty = 10;
            // Floor at 1 HP: never kills the avatar, daily habit system is safe
            GameState.avatar.hp = Math.max(1, (GameState.avatar.hp || 100) - penalty);
            GameState.avatar.isDead = false;
            result = {
                won: false, fled: true, xpGain: 0, goldGain: 0, hpLost: penalty,
                message: `⚑ Huiste del combate. Penalización: -${penalty} HP a tu avatar. (HP restante: ${GameState.avatar.hp}/${GameState.avatar.maxHp})`
            };
            if (typeof App !== 'undefined' && App.showToast) App.showToast(`⚑ Huiste de la batalla (-${penalty} HP)`, 'warning');
        } else if (playerWon) {
            const xpGain = b.opponent.xp;
            const goldGain = b.opponent.goldRaw;
            GameState.avatar.currentXP += xpGain;
            GameState.avatar.gold += goldGain;
            // Victory bonus: restore +5 HP to real avatar
            GameState.avatar.hp = Math.min(GameState.avatar.maxHp, (GameState.avatar.hp || 100) + 5);
            this._checkLevelUp();
            result = {
                won: true, fled: false, xpGain, goldGain, hpLost: 0,
                message: `¡VICTORIA! +${xpGain}XP +${goldGain}G (+5 HP avatar recuperados)`
            };
            if (typeof App !== 'undefined' && App.showToast) App.showToast(`¡VICTORIA! +${xpGain}XP +${goldGain}G`, 'gold');
        } else {
            // Defeat in the arena
            const penalty = 20;
            // Floor at 1 HP: defeat in arcade combat does not wipe your real habit progress
            GameState.avatar.hp = Math.max(1, (GameState.avatar.hp || 100) - penalty);
            GameState.avatar.isDead = false;
            result = {
                won: false, fled: false, hpLoss: penalty, xpGain: 0, goldGain: 0,
                message: `DERROTA EN ARENA: Caíste en combate. Penalización: -${penalty} HP a tu avatar. (HP restante: ${GameState.avatar.hp}/${GameState.avatar.maxHp})`
            };
            if (typeof App !== 'undefined' && App.showToast) App.showToast(`Derrota en arena (-${penalty} HP)`, 'error');
        }

        const logEntry = {
            opponent: b.opponent.name, won: result.won, fled: !!result.fled,
            xpGained: result.xpGain, goldGained: result.goldGain, hpLost: result.hpLost || result.hpLoss || 0
        };
        GameState.battleLog.unshift({ ...logEntry, date: new Date().toLocaleDateString() });
        await addBattleLogToDB(logEntry);
        await saveAvatarToDB();
        // A completed save must never clear or navigate away from a newer match.
        if (GameState.currentBattle !== b) return result;
        
        GameState._lastBattleResult = result;
        GameState._currentOpponent = null;
        GameState.currentBattle = null;
        
        if (GameState.currentView === 'arena' && typeof App !== 'undefined' && App.navigate) {
            App.navigate('arena');
        }
        return result;
    },

    fleeBattle() {
        if (!GameState.currentBattle || GameState.currentBattle.isFinished || GameState.currentBattle.knockout) return;
        this._endBattle(false, true);
    },

    getCompletionRate() {
        if (GameState.habits.length === 0) return 0;
        const completed = GameState.habits.filter(h => isOnCooldown(h)).length;
        return Math.round((completed / GameState.habits.length) * 100);
    },

    // --- Admin Engine Operations ---

    async adminReviveUser(userId) {
        await adminUpdateUserAvatar(userId, { hp: 100, is_dead: false });
        if (userId === GameState.avatarId) {
            GameState.avatar.hp = 100;
            GameState.avatar.isDead = false;
            await saveAvatarToDB();
        }
        return true;
    },

    async adminGrantGold(userId, amount) {
        const user = GameState.adminUsersList.find(u => u.id === userId);
        const currentGold = user ? user.gold : (userId === GameState.avatarId ? GameState.avatar.gold : 0);
        const newGold = Math.max(0, currentGold + amount);
        await adminUpdateUserAvatar(userId, { gold: newGold });
        if (userId === GameState.avatarId) {
            GameState.avatar.gold = newGold;
            await saveAvatarToDB();
        }
        return newGold;
    },

    async adminGrantXP(userId, amount) {
        const user = GameState.adminUsersList.find(u => u.id === userId);
        const currentXP = user ? (user.current_xp || 0) : (userId === GameState.avatarId ? GameState.avatar.currentXP : 0);
        const newXP = currentXP + amount;
        await adminUpdateUserAvatar(userId, { current_xp: newXP });
        if (userId === GameState.avatarId) {
            GameState.avatar.currentXP = newXP;
            this._checkLevelUp();
            await saveAvatarToDB();
        }
        return newXP;
    },

    async adminUpdateShopItemPrice(itemId, newCost) {
        const item = GameState.shopItems.find(i => i.id === itemId);
        if (!item) return false;
        item.cost = Math.max(0, parseInt(newCost) || item.cost);
        await adminSaveShopItem(item);
        return true;
    },

    async adminUpdateMonsterStats(monsterId, updates) {
        const monster = GameState.monsters.find(m => m.id === monsterId);
        if (!monster) return false;
        Object.assign(monster, updates);
        await adminSaveMonster(monster);
        return true;
    }
};
