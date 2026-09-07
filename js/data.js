// ==========================================
// HABIFY - Data Models + Supabase Client
// ==========================================

const SUPABASE_URL = 'https://uinzcfqqfuilshihxbjh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpbnpjZnFxZnVpbHNoaWh4YmpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0OTc3OTQsImV4cCI6MjA4ODA3Mzc5NH0.pOaoYD9otSbN8zof-fGUopahLBjXgifei_poqQP3i0U';

let supabase;

// In-memory game state (synced with Supabase)
const GameState = {
    user: null,       // Supabase user
    avatarId: null,   // DB avatar ID

    avatar: {
        name: 'Héroe',
        level: 1,
        currentXP: 0,
        xpToLevel: 100,
        gold: 50,
        hp: 100,
        maxHp: 100,
        isDead: false,
        equippedBackground: null,
        equippedPet: null,
        equippedWeapon: null,
        equippedShield: null,
        equippedSpell: null,
        lastPenaltyCheck: null,
        lastHabitModified: null,
        avatarClass: 'hero'
    },

    habits: [],
    shopItems: [],
    inventory: [],
    monsters: [],
    battleLog: [],
    currentView: 'dashboard',
    _storeFilter: 'all',
    currentBattle: null, // Holds active turn-based battle state
    _currentOpponent: null,
    _lastBattleResult: null,
    _cooldownInterval: null
};

// Weapon ID to CSS class mapping
const WEAPON_CSS = {
    'wpn_staff': 'has-staff',
    'wpn_sword': 'has-sword',
    'wpn_shield': 'has-shield',
    'wpn_bow': 'has-bow'
};

// Pet ID to CSS class mapping
const PET_CSS = {
    'pet_trex': 'pixel-pet-trex',
    'pet_dragon': 'pixel-pet-dragon',
    'pet_cat': 'pixel-pet-cat',
    'pet_phoenix': 'pixel-pet-phoenix'
};

// Enemy types for sprites
const ENEMY_SPRITES = {
    'Goblin Oscuro': 'goblin',
    'Esqueleto Guerrero': 'skeleton',
    'Slime Gigante': 'slime',
    'Orco Salvaje': 'orc',
    'Espectro': 'ghost'
};

// ==========================================
// Supabase Helpers
// ==========================================

async function initSupabase() {
    if (!window.supabase || !window.supabase.createClient) {
        throw new Error('Supabase JS library not loaded. Check your internet connection.');
    }
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('Supabase initialized successfully');
}

async function loadGameFromDB() {
    if (!GameState.user) return false;

    try {
        // Load avatar
        const { data: avatar, error: avatarErr } = await supabase
            .from('avatars')
            .select('*')
            .eq('user_id', GameState.user.id)
            .single();

        if (avatarErr) throw avatarErr;

        GameState.avatarId = avatar.id;
        GameState.avatar.name = avatar.name;
        GameState.avatar.level = avatar.level;
        GameState.avatar.currentXP = avatar.current_xp;
        GameState.avatar.xpToLevel = avatar.xp_to_level;
        GameState.avatar.gold = avatar.gold;
        GameState.avatar.hp = avatar.hp;
        GameState.avatar.maxHp = avatar.max_hp;
        GameState.avatar.isDead = avatar.is_dead;
        GameState.avatar.equippedBackground = avatar.equipped_background;
        GameState.avatar.equippedPet = avatar.equipped_pet;
        GameState.avatar.equippedWeapon = avatar.equipped_weapon;
        GameState.avatar.equippedShield = avatar.equipped_shield || null;
        GameState.avatar.equippedSpell = avatar.equipped_spell || null;
        GameState.avatar.lastPenaltyCheck = avatar.last_penalty_check;
        GameState.avatar.lastHabitModified = avatar.last_habit_modified;
        GameState.avatar.avatarClass = avatar.avatar_class || 'hero';

        // Load habits
        const { data: habits } = await supabase
            .from('habits')
            .select('*')
            .eq('avatar_id', avatar.id)
            .order('created_at', { ascending: true });

        GameState.habits = (habits || []).map(h => ({
            id: h.id,
            title: h.title,
            type: h.type,
            xpReward: h.xp_reward,
            hpPenalty: h.hp_penalty,
            goldReward: h.gold_reward,
            completedAt: h.completed_at ? new Date(h.completed_at).getTime() : null
        }));

        // Load shop items
        const { data: shopItems } = await supabase
            .from('shop_items')
            .select('*')
            .order('cost', { ascending: true });

        // Load user inventory to mark purchased items
        const { data: inv } = await supabase
            .from('inventory')
            .select('item_id')
            .eq('avatar_id', avatar.id);

        const ownedIds = new Set((inv || []).map(i => i.item_id));
        GameState.shopItems = (shopItems || []).map(si => {
            const transName = I18N.t(`item.${si.id}.name`);
            const transDesc = I18N.t(`item.${si.id}.desc`);
            return {
                ...si,
                name: transName !== `item.${si.id}.name` ? transName : si.name,
                description: transDesc !== `item.${si.id}.desc` ? transDesc : si.description,
                purchased: ownedIds.has(si.id)
            };
        });

        GameState.inventory = (inv || []).map(i => {
            const item = GameState.shopItems.find(si => si.id === i.item_id);
            return item ? { ...item, purchased: true } : null;
        }).filter(Boolean);

        // Load monsters
        const { data: monstersInfo } = await supabase.from('monsters').select('*');
        GameState.monsters = monstersInfo || [];

        // Load battle log
        const { data: battles } = await supabase
            .from('battle_log')
            .select('*')
            .eq('avatar_id', avatar.id)
            .order('created_at', { ascending: false })
            .limit(10);

        GameState.battleLog = (battles || []).map(b => ({
            opponent: b.opponent,
            won: b.won,
            date: new Date(b.created_at).toLocaleDateString()
        }));

        return true;
    } catch (e) {
        console.error('Error loading from DB:', e);
        return false;
    }
}

async function saveAvatarToDB() {
    if (!GameState.avatarId) return;
    const a = GameState.avatar;
    await supabase.from('avatars').update({
        name: a.name,
        level: a.level,
        current_xp: a.currentXP,
        xp_to_level: a.xpToLevel,
        gold: a.gold,
        hp: a.hp,
        max_hp: a.maxHp,
        is_dead: a.isDead,
        equipped_background: a.equippedBackground,
        equipped_pet: a.equippedPet,
        equipped_weapon: a.equippedWeapon,
        equipped_shield: a.equippedShield,
        equipped_spell: a.equippedSpell,
        last_penalty_check: a.lastPenaltyCheck ? new Date(a.lastPenaltyCheck).toISOString() : null,
        last_habit_modified: a.lastHabitModified ? new Date(a.lastHabitModified).toISOString() : null,
        avatar_class: a.avatarClass || 'hero',
        updated_at: new Date().toISOString()
    }).eq('id', GameState.avatarId);
}

async function saveHabitToDB(habit) {
    await supabase.from('habits').upsert({
        id: habit.id,
        avatar_id: GameState.avatarId,
        title: habit.title,
        type: habit.type,
        xp_reward: habit.xpReward,
        hp_penalty: habit.hpPenalty,
        gold_reward: habit.goldReward,
        completed_at: habit.completedAt ? new Date(habit.completedAt).toISOString() : null
    });
}

async function deleteHabitFromDB(habitId) {
    await supabase.from('habits').delete().eq('id', habitId);
}

async function addInventoryToDB(itemId) {
    await supabase.from('inventory').insert({
        avatar_id: GameState.avatarId,
        item_id: itemId
    });
}

async function addBattleLogToDB(entry) {
    await supabase.from('battle_log').insert({
        avatar_id: GameState.avatarId,
        opponent: entry.opponent,
        won: entry.won,
        xp_gained: entry.xpGained || 0,
        gold_gained: entry.goldGained || 0,
        hp_lost: entry.hpLost || 0
    });
}

// ==========================================
// Cooldown Helpers
// ==========================================

const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

function isOnCooldown(habit) {
    if (!habit.completedAt) return false;
    return (Date.now() - habit.completedAt) < COOLDOWN_MS;
}

function getRemainingCooldown(habit) {
    if (!habit.completedAt) return null;
    const remaining = COOLDOWN_MS - (Date.now() - habit.completedAt);
    if (remaining <= 0) return null;
    return formatTime(remaining);
}

function getHabitEditCooldown() {
    if (!GameState.avatar || !GameState.avatar.lastHabitModified) return null;
    const remaining = (24 * 60 * 60 * 1000) - (Date.now() - new Date(GameState.avatar.lastHabitModified).getTime());
    if (remaining <= 0) return null;
    return formatTime(remaining);
}

function formatTime(remaining) {
    const hours = Math.floor(remaining / 3600000);
    const mins = Math.floor((remaining % 3600000) / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Unique ID generator
let _idCounter = Date.now();
function generateId() {
    return crypto.randomUUID ? crypto.randomUUID() : 'h_' + (++_idCounter).toString(36);
}
