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
        const item = GameState.shopItems.find(i => i.id === itemId);
        if (!item || item.purchased) return { success: false, message: 'No disponible.' };
        if (GameState.avatar.gold < item.cost) return { success: false, message: 'Oro insuficiente!' };

        GameState.avatar.gold -= item.cost;
        item.purchased = true;
        GameState.inventory.push({ ...item });
        await addInventoryToDB(itemId);
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

    // --- Real-Time Battle Engine ---

    _rtInputs: { left: false, right: false, up: false, attack: false, magic: false, heal: false, fire: false, guard: false },

    _rtEntities: [],
    _rtProjectiles: [],
    _gameLoopRunning: false,
    _lastTime: 0,

    handleInput(action, isPressed) {
        if (this._rtInputs[action] !== undefined) {
            // Instant trigger for action buttons, hold/release for directional & guard
            if (action === 'attack' || action === 'magic' || action === 'up' || action === 'heal' || action === 'fire') {
                if (isPressed) this._rtInputs[action] = true;
            } else {
                this._rtInputs[action] = isPressed;
            }
        }
    },

    startPvEBattle(opponent) {
        // Dedicated Battle HP: Fighter enters arena with independent combat HP (100 + level * 10)
        // Defeat or surrender will penalize real HP, but will NEVER wipe the character to 0 HP!
        const playerBattleMaxHp = 100 + (GameState.avatar.level || 1) * 10;
        const playerBattleHp = playerBattleMaxHp;
        
        GameState.currentBattle = {
            mode: 'pve',
            opponent: opponent,
            playerHp: playerBattleHp,
            playerMaxHp: playerBattleMaxHp,
            oppHp: opponent.hp,
            oppMaxHp: opponent.maxHp,
            logs: [],
            isFinished: false,
            healUses: 0,
            fireUses: 0
        };
        
        // Setup real time entities
        this._rtEntities = [
            this._createFighter('player', true, 80, 240, GameState.avatar),
            this._createFighter('enemy', false, 280, 240, opponent)
        ];
        this._rtProjectiles = [];
        this._rtInputs = { left: false, right: false, up: false, attack: false, magic: false, heal: false, fire: false, guard: false };
        this._gameLoopRunning = false;

        return GameState.currentBattle;
    },

    _createFighter(id, isPlayer, x, y, stats) {
        return {
            id,
            isPlayer,
            x, y,
            width: 40, height: 60,
            vx: 0, vy: 0,
            state: 'IDLE',
            facing: isPlayer ? 'right' : 'left',
            stats,
            attackTimer: 0,
            hitStunTimer: 0,
            deadTimer: 0,
            cooldowns: { attack: 0, magic: 0 },
            dom: null
        };
    },

    startGameLoop() {
        if (this._gameLoopRunning) return;
        this._gameLoopRunning = true;
        this._lastTime = performance.now();
        requestAnimationFrame((t) => this._gameLoop(t));
    },

    stopGameLoop() {
        this._gameLoopRunning = false;
        const arena = document.getElementById('real-time-arena');
        if (arena) arena.innerHTML = '';
    },

    _gameLoop(time) {
        if (!this._gameLoopRunning || GameState.currentBattle?.isFinished) {
            this._gameLoopRunning = false;
            return;
        }
        
        const dt = Math.min((time - this._lastTime) / 1000, 0.1);
        this._lastTime = time;

        this._updateRT(dt);
        this._renderRT();

        requestAnimationFrame((t) => this._gameLoop(t));
    },

    _updateRT(dt) {
        const floorY = 240;
        const gravity = 1500;
        const moveSpeed = 150;
        const jumpSpeed = -500;
        
        const p = this._rtEntities.find(e => e.isPlayer);
        const e = this._rtEntities.find(e => !e.isPlayer);

        if (!p || !e) return;

        // Player Input
        if (p.state !== 'HIT_STUN' && p.state !== 'DEAD' && p.state !== 'ATTACKING' && p.state !== 'CASTING') {
            if (this._rtInputs.guard) {
                p.vx = 0;
                p.state = 'GUARDING';
            } else if (this._rtInputs.left) {
                p.vx = -moveSpeed;
                p.state = 'RUNNING';
            } else if (this._rtInputs.right) {
                p.vx = moveSpeed;
                p.state = 'RUNNING';
            } else {
                p.vx = 0;
                p.state = 'IDLE';
            }

            // Direction facing: Street Fighter style facing opponent
            p.facing = (p.x <= e.x) ? 'right' : 'left';

            if (this._rtInputs.up) {
                if (p.y >= floorY) { p.vy = jumpSpeed; p.state = 'JUMPING'; }
                this._rtInputs.up = false; // consume
            }

            // Attacks cooldowns
            if (p.cooldowns.attack > 0) p.cooldowns.attack -= dt;
            if (p.cooldowns.magic > 0) p.cooldowns.magic -= dt;

            if (this._rtInputs.attack) {
                if (p.cooldowns.attack <= 0) {
                    p.state = 'ATTACKING';
                    p.attackTimer = 0.4;
                    p.cooldowns.attack = 0.5;
                    p.vx = 0;
                }
                this._rtInputs.attack = false;
            } 
            
            // HEAL button (separate from fire)
            if (this._rtInputs.heal) {
                if (p.cooldowns.magic <= 0) {
                    if (GameState.currentBattle.healUses < 1) {
                        GameState.currentBattle.healUses++;
                        const healAmt = Math.floor(GameState.currentBattle.playerMaxHp * 0.35);
                        GameState.currentBattle.playerHp = Math.min(GameState.currentBattle.playerMaxHp, GameState.currentBattle.playerHp + healAmt);
                        this._updateHpBars();
                        if (typeof App !== 'undefined' && App.showToast) App.showToast(`♥ ¡Curación! +${healAmt} BHP`, 'success');
                        this._spawnHealBurst(p);
                        p.state = 'CASTING';
                        p.attackTimer = 0.6;
                        p.cooldowns.magic = 1.2;
                    } else {
                        if (typeof App !== 'undefined' && App.showToast) App.showToast('Ya usaste la curación esta batalla', 'error');
                    }
                }
                this._rtInputs.heal = false;
            }

            // FIRE button (separate from heal)
            if (this._rtInputs.fire) {
                if (p.cooldowns.magic <= 0) {
                    if (GameState.currentBattle.fireUses < 1) {
                        GameState.currentBattle.fireUses++;
                        this._spawnProjectile(p, 'fire');
                        p.state = 'CASTING';
                        p.attackTimer = 0.6;
                        p.cooldowns.magic = 1.2;
                    } else {
                        if (typeof App !== 'undefined' && App.showToast) App.showToast('Ya usaste la bola de fuego esta batalla', 'error');
                    }
                }
                this._rtInputs.fire = false;
            }

            // Generic MAGIC (for players with no specific spell equipped)
            if (this._rtInputs.magic) {
                if (p.cooldowns.magic <= 0) {
                    const hasHeal = GameState.avatar.equippedSpell?.includes('spell_heal');
                    const hasFire = GameState.avatar.equippedSpell?.includes('spell_fire');
                    if (!hasHeal && !hasFire && GameState.avatar.level >= 2) {
                        this._spawnProjectile(p, 'magic');
                        p.state = 'CASTING';
                        p.attackTimer = 0.6;
                        p.cooldowns.magic = 1.2;
                    }
                }
                this._rtInputs.magic = false;
            }

        }

        // Enemy AI (Walk towards player and attack periodically)
        if (e.state !== 'HIT_STUN' && e.state !== 'DEAD' && e.state !== 'ATTACKING') {
            const dist = p.x - e.x;
            e.facing = dist >= 0 ? 'right' : 'left';

            if (Math.abs(dist) > 55) {
                e.vx = dist > 0 ? moveSpeed * 0.6 : -moveSpeed * 0.6;
                e.state = 'RUNNING';
            } else {
                e.vx = 0;
                e.state = 'IDLE';
                if (e.cooldowns.attack <= 0 && p.state !== 'DEAD') {
                    e.state = 'ATTACKING';
                    e.attackTimer = 0.4;
                    e.cooldowns.attack = 1.5;
                }
            }
            if (e.cooldowns.attack > 0) e.cooldowns.attack -= dt;
        }

        // Arena dimensions
        const arena = document.getElementById('real-time-arena');
        const arenaW = arena ? arena.clientWidth : 400;

        // Solid body pushback collision resolution (Street Fighter style: fighters cannot pass through each other)
        const minBodyDist = 55;
        const dx = e.x - p.x;
        const absDx = Math.abs(dx);
        if (absDx < minBodyDist && p.state !== 'DEAD' && e.state !== 'DEAD') {
            const overlap = minBodyDist - absDx;
            if (dx > 0) { // p is left, e is right
                p.x = Math.max(15, p.x - overlap * 0.5);
                e.x = Math.min(arenaW - 15, e.x + overlap * 0.5);
                if (p.vx > 0) p.vx = 0;
                if (e.vx < 0) e.vx = 0;
            } else { // p is right, e is left
                p.x = Math.min(arenaW - 15, p.x + overlap * 0.5);
                e.x = Math.max(15, e.x - overlap * 0.5);
                if (p.vx < 0) p.vx = 0;
                if (e.vx > 0) e.vx = 0;
            }
        }

        // Update physics & timers for all entities
        this._rtEntities.forEach(ent => {
            if (ent.state === 'DEAD') {
                ent.vx = 0;
            } else {
                // Gravity
                ent.vy += gravity * dt;
                
                ent.x += ent.vx * dt;
                ent.y += ent.vy * dt;

                // Floor collision
                if (ent.y >= floorY) {
                    ent.y = floorY;
                    ent.vy = 0;
                    if (ent.state === 'JUMPING') ent.state = 'IDLE';
                }

                // Stage bounds
                if (ent.x < 15) ent.x = 15;
                if (ent.x > arenaW - 15) ent.x = arenaW - 15; 

                // Timers: attackTimer controls ATTACKING, CASTING states
                if (ent.attackTimer > 0) {
                    ent.attackTimer -= dt;
                    if (ent.attackTimer <= 0) {
                        // Only execute melee hit for ATTACKING, CASTING handled by projectile
                        if (ent.state === 'ATTACKING') {
                            this._executeMeleeHit(ent);
                        }
                        ent.state = 'IDLE';
                    }
                }
                if (ent.hitStunTimer > 0) {
                    ent.hitStunTimer -= dt;
                    if (ent.hitStunTimer <= 0) ent.state = 'IDLE';
                }
            }
        });

        // Projectiles update
        for (let i = this._rtProjectiles.length - 1; i >= 0; i--) {
            const proj = this._rtProjectiles[i];
            proj.x += proj.vx * dt;
            proj.life -= dt;
            
            // Collision
            const target = proj.sourceId === 'player' ? e : p;
            if (target.state !== 'DEAD') {
                if (Math.abs(proj.x - target.x) < 30 && target.y - proj.y < 50 && target.y - proj.y > -10) {
                    this.applyDamage(target.id, proj.sourceId, proj.damage);
                    proj.life = 0; // destroy
                }
            }

            if (proj.life <= 0 || proj.x < 0 || proj.x > arenaW) {
                if (proj.dom) proj.dom.remove();
                this._rtProjectiles.splice(i, 1);
            }
        }
    },

    _spawnProjectile(source, type) {
        const damage = Math.floor(GameState.avatar.level * 2 * 1.5);
        const dir = source.facing === 'right' ? 1 : -1;
        const projX = source.x + dir * 30;
        const projY = source.y - 45; // chest height
        
        this._rtProjectiles.push({
            id: 'proj_' + generateId(),
            sourceId: source.id,
            x: projX,
            y: projY,
            vx: dir * 320,
            damage: type === 'fire' ? damage * 2 : damage,
            life: 2.5,
            type,
            dir,
            dom: null,
            _trailTimer: 0
        });
    },

    _executeMeleeHit(attacker) {
        const target = this._rtEntities.find(ent => ent.id !== attacker.id);
        if (!target || target.state === 'DEAD') return;

        const dist = target.x - attacker.x;
        const inRange = Math.abs(dist) < 70;
        const facingCorrectly = (attacker.facing === 'right' && dist > 0) || (attacker.facing === 'left' && dist < 0);
        const yDist = Math.abs(target.y - attacker.y);

        if (inRange && facingCorrectly && yDist < 40) {
            let dmg = attacker.isPlayer
                ? (GameState.avatar.level * 2) + (GameState.avatar.equippedWeapon ? 10 : 0)
                : attacker.stats.attack;

            dmg = Math.max(1, Math.floor(dmg * (0.8 + Math.random() * 0.4)));

            if (!attacker.isPlayer && GameState.avatar.equippedShield) {
                dmg = Math.max(1, dmg - 8);
            }

            // Visual slash effect on target
            this._spawnSwordSlash(target.x, target.y - 35, attacker.facing);

            // Screen shake on successful hit
            const arenaEl = document.getElementById('real-time-arena');
            if (arenaEl) {
                arenaEl.classList.remove('hit-shake');
                void arenaEl.offsetWidth; // force reflow to restart animation
                arenaEl.classList.add('hit-shake');
                setTimeout(() => arenaEl.classList.remove('hit-shake'), 280);
            }

            this.applyDamage(target.id, attacker.id, dmg);
        }
    },

    _spawnSwordSlash(x, y, dir) {
        const arena = document.getElementById('real-time-arena');
        if (!arena) return;
        const slash = document.createElement('div');
        slash.className = 'sword-slash-effect ' + (dir === 'left' ? 'dir-left' : 'dir-right');
        slash.style.left = (x - 32) + 'px';
        slash.style.top = (y - 32) + 'px';
        arena.appendChild(slash);
        setTimeout(() => slash.remove(), 320);
    },

    _spawnBlockSpark(x, y) {
        const arena = document.getElementById('real-time-arena');
        if (!arena) return;
        
        const spark = document.createElement('div');
        spark.className = 'guard-shield-spark';
        spark.style.left = (x - 25) + 'px';
        spark.style.top = (y - 25) + 'px';
        arena.appendChild(spark);
        setTimeout(() => spark.remove(), 350);

        const txt = document.createElement('div');
        txt.textContent = '🛡️ BLOQUEO';
        txt.style.cssText = `
            position: absolute; left: ${x - 35}px; top: ${y - 30}px;
            color: #38bdf8; font-size: 10px; font-weight: bold;
            font-family: 'Press Start 2P', monospace;
            z-index: 210; text-shadow: 1px 1px 0 #000;
            pointer-events: none; transition: all 0.5s ease-out;
        `;
        arena.appendChild(txt);
        requestAnimationFrame(() => {
            txt.style.top = (y - 55) + 'px';
            txt.style.opacity = '0';
        });
        setTimeout(() => txt.remove(), 550);
    },

    applyDamage(targetId, sourceId, damage) {
        const target = this._rtEntities.find(e => e.id === targetId);
        if (!target || target.state === 'DEAD') return;

        let finalDamage = damage;
        const isGuarding = target.isPlayer && target.state === 'GUARDING';

        if (isGuarding) {
            finalDamage = Math.max(1, Math.floor(damage * 0.25)); // 75% damage mitigation!
            this._spawnBlockSpark(target.x, target.y - 40);
            target.hitStunTimer = 0.12; // minimal stun while guarding
        } else {
            target.state = 'HIT_STUN';
            target.hitStunTimer = 0.3;
        }

        this._spawnDamageText(target.x, target.y - 60, finalDamage, isGuarding);

        if (target.isPlayer) {
            GameState.currentBattle.playerHp = Math.max(0, GameState.currentBattle.playerHp - finalDamage);
            // Battle HP is isolated: DO NOT overwrite GameState.avatar.hp during combat!
            this._updateHpBars();

            if (GameState.currentBattle.playerHp <= 0) {
                target.state = 'DEAD';
                setTimeout(() => this._endBattle(false, false), 1200);
            }
        } else {
            GameState.currentBattle.oppHp = Math.max(0, GameState.currentBattle.oppHp - finalDamage);
            this._updateHpBars();

            if (GameState.currentBattle.oppHp <= 0) {
                target.state = 'DEAD';
                setTimeout(() => this._endBattle(true, false), 1200);
            }
        }
    },

    _spawnDamageText(x, y, dmg, isBlocked = false) {
        const arena = document.getElementById('real-time-arena');
        if (!arena) return;
        const el = document.createElement('div');
        el.textContent = isBlocked ? `🛡️ -${dmg}` : `-${dmg}`;
        el.style.cssText = `
            position: absolute; left: ${x - 20}px; top: ${y}px;
            color: ${isBlocked ? '#38bdf8' : '#ff004d'}; font-size: ${isBlocked ? '14px' : '18px'}; font-weight: bold;
            font-family: 'Press Start 2P', monospace;
            z-index: 200; text-shadow: 2px 2px 0 #000;
            pointer-events: none; transition: all 0.6s ease-out;
        `;
        arena.appendChild(el);
        requestAnimationFrame(() => {
            el.style.top = (y - 40) + 'px';
            el.style.opacity = '0';
            el.style.fontSize = isBlocked ? '16px' : '22px';
        });
        setTimeout(() => el.remove(), 650);
    },

    _spawnHealBurst(entity) {
        const arena = document.getElementById('real-time-arena');
        if (!arena) return;
        // Create 5 green sparkles around the player
        for (let i = 0; i < 6; i++) {
            const spark = document.createElement('div');
            const angle = (i / 6) * Math.PI * 2;
            const dist = 30 + Math.random() * 20;
            const sx = entity.x + Math.cos(angle) * dist;
            const sy = entity.y - 40 + Math.sin(angle) * dist;
            spark.style.cssText = `
                position:absolute; left:${sx}px; top:${sy}px;
                width:8px; height:8px; background:#00e436; border-radius:50%;
                box-shadow:0 0 8px #00e436, 0 0 16px #00ff88;
                pointer-events:none; transition: all 0.7s ease-out;
                z-index: 150;
            `;
            arena.appendChild(spark);
            requestAnimationFrame(() => {
                spark.style.top = (sy - 40) + 'px';
                spark.style.opacity = '0';
                spark.style.transform = 'scale(2)';
            });
            setTimeout(() => spark.remove(), 750);
        }
        // Big heal text
        const el = document.createElement('div');
        el.textContent = '♥ CURADO';
        el.style.cssText = `
            position:absolute; left:${entity.x - 30}px; top:${entity.y - 80}px;
            color:#00e436; font-size:14px; font-weight:bold;
            font-family:'Press Start 2P', monospace;
            z-index:200; text-shadow:1px 1px 0 #004400;
            pointer-events:none; transition: all 0.8s ease-out;
        `;
        arena.appendChild(el);
        requestAnimationFrame(() => {
            el.style.top = (entity.y - 120) + 'px';
            el.style.opacity = '0';
        });
        setTimeout(() => el.remove(), 900);
    },

    // Called after any HP change to immediately reflect it in the HUD
    _updateHpBars() {
        const b = GameState.currentBattle;
        if (!b) return;

        // Player HP bar
        const pFill = document.getElementById('rt-p-hp-fill');
        const pText = document.getElementById('rt-p-hp-text');
        if (pFill) {
            pFill.style.width = `${Math.max(0, (b.playerHp / b.playerMaxHp) * 100)}%`;
            if (b.playerHp > b.playerMaxHp * 0.5) pFill.style.background = '#00e436';
            else if (b.playerHp > b.playerMaxHp * 0.25) pFill.style.background = '#f7c948';
            else pFill.style.background = '#ff004d';
        }
        if (pText) pText.textContent = `${b.playerHp}/${b.playerMaxHp} BHP`;

        // Enemy HP bar
        const eFill = document.getElementById('rt-e-hp-fill');
        const eText = document.getElementById('rt-e-hp-text');
        if (eFill) eFill.style.width = `${Math.max(0, (b.oppHp / b.oppMaxHp) * 100)}%`;
        if (eText) eText.textContent = `${b.oppHp}/${b.oppMaxHp} BHP`;
    },

    _renderRT() {
        const arena = document.getElementById('real-time-arena');
        if (!arena) return;

        const arenaH = arena.clientHeight || 260;

        this._rtEntities.forEach(ent => {
            if (!ent.dom) {
                ent.dom = document.createElement('div');
                ent.dom.className = 'fighter-container ' + (ent.isPlayer ? 'is-player' : 'is-monster');
                
                const wrapper = document.createElement('div');
                wrapper.className = 'sprite-wrapper';

                // Use PNG image only — no CSS box-shadow sprites
                const img = document.createElement('img');
                const imgName = ent.isPlayer
                    ? (GameState.avatar.avatarClass || 'hero')
                    : (ent.stats.sprite || 'goblin');
                
                img.src = 'assets/sprites/' + imgName + '.png';
                // Monsters usually face left in their PNGs, Player faces right.
                if (!ent.isPlayer) {
                    img.classList.add('monster-sprite');
                }

                img.onerror = () => {
                    // Fallback: small colored circle if image fails
                    img.style.display = 'none';
                    const fallback = document.createElement('div');
                    fallback.style.cssText = `width:40px;height:60px;background:${ent.isPlayer ? '#00e436' : '#ff004d'};border-radius:4px;`;
                    wrapper.appendChild(fallback);
                };
                img.style.cssText = 'display:block;width:90px;height:auto;object-fit:contain;image-rendering:pixelated;pointer-events:none;user-select:none;';
                
                if (!ent.isPlayer) {
                    // Enemies are bigger and nastier-looking
                    img.style.width = '120px';
                    img.style.filter = 'drop-shadow(0 0 6px rgba(255,0,77,0.5))';
                }
                
                if (ent.isPlayer && GameState.avatar.isDead) {
                    img.style.filter = 'grayscale(1) brightness(0.5)';
                }
                
                wrapper.appendChild(img);

                // Ground shadow - makes fighters look grounded, not floating
                const shadow = document.createElement('div');
                shadow.className = 'fighter-shadow';
                ent.dom.appendChild(shadow);

                ent.dom.appendChild(wrapper);
                arena.appendChild(ent.dom);
            }

            // Position: center of fighter container = ent.x
            const spriteHalfW = 50; // Standardized to half of 100px container
            ent.dom.style.left = (ent.x - spriteHalfW) + 'px';
            const bottomPx = arenaH - ent.y;
            ent.dom.style.bottom = Math.max(0, bottomPx) + 'px';
            ent.dom.style.top = 'auto';

            // Scale ground shadow by proximity to floor (smaller when airborne)
            const shadowEl = ent.dom.querySelector('.fighter-shadow');
            if (shadowEl) {
                const floorDist = 240 - ent.y; // 0 on floor, negative if above
                const floorRatio = Math.max(0, 1 - Math.abs(floorDist) / 80);
                shadowEl.style.transform = `scaleX(${floorRatio})`;
                shadowEl.style.opacity = (0.15 + floorRatio * 0.35).toString();
            }

            ent.dom.style.top = 'auto';
            
            ent.dom.setAttribute('data-state', ent.state);
            ent.dom.setAttribute('data-facing', ent.facing);
        });

        this._rtProjectiles.forEach(proj => {
            if (!proj.dom) {
                // Build a rich multi-layer fireball element
                proj.dom = document.createElement('div');
                proj.dom.className = proj.type === 'fire' ? 'rt-proj rt-proj-fire' : 'rt-proj rt-proj-magic';

                // Core glow ball
                const core = document.createElement('div');
                core.className = 'proj-core';
                proj.dom.appendChild(core);

                // Rotating flame ring
                const ring = document.createElement('div');
                ring.className = 'proj-ring';
                proj.dom.appendChild(ring);

                // Mirror if going left
                if (proj.dir === -1) proj.dom.style.transform = 'scaleX(-1)';

                arena.appendChild(proj.dom);
            }

            // Move: use proj.x as CENTER of the element (24px half-width)
            proj.dom.style.left = (proj.x - 24) + 'px';
            proj.dom.style.top  = (proj.y - 24) + 'px';

            // Emit trail particles every ~3 frames
            proj._trailTimer = (proj._trailTimer || 0) + 1;
            if (proj._trailTimer % 3 === 0) {
                const spark = document.createElement('div');
                spark.className = proj.type === 'fire' ? 'proj-trail-fire' : 'proj-trail-magic';
                spark.style.left = (proj.x - 6 + (Math.random() * 8 - 4)) + 'px';
                spark.style.top  = (proj.y - 6 + (Math.random() * 8 - 4)) + 'px';
                arena.appendChild(spark);
                setTimeout(() => spark.remove(), 350);
            }
        });
    },


    async _endBattle(playerWon, fled = false) {
        if (!GameState.currentBattle || GameState.currentBattle.isFinished) return null;
        const b = GameState.currentBattle;
        b.isFinished = true;
        
        // Stop the real-time loop
        this._gameLoopRunning = false;
        
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
        
        GameState._lastBattleResult = result;
        GameState._currentOpponent = null;
        GameState.currentBattle = null;
        
        if (typeof App !== 'undefined' && App.navigate) {
            App.navigate('arena');
        }
        return result;
    },

    fleeBattle() {
        if (!GameState.currentBattle || GameState.currentBattle.isFinished) return;
        this._gameLoopRunning = false;
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
