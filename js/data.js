// ==========================================
// HABIFY - Data Models + Supabase Client
// With Catalog, Frequencies & Admin Control
// ==========================================

const SUPABASE_URL = 'https://uinzcfqqfuilshihxbjh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpbnpjZnFxZnVpbHNoaWh4YmpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0OTc3OTQsImV4cCI6MjA4ODA3Mzc5NH0.pOaoYD9otSbN8zof-fGUopahLBjXgifei_poqQP3i0U';

let supabase;

// ==========================================
// FREQUENCY CONFIGURATIONS & SAFEGUARDS
// ==========================================
const MIN_COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12h mínimo estricto anti-farming

const FREQUENCY_CONFIGS = {
    daily: {
        id: 'daily',
        label: 'Diario (24h)',
        cooldownMs: 24 * 60 * 60 * 1000,
        description: 'Se reinicia cada 24 horas',
        isWorkdays: false
    },
    workdays: {
        id: 'workdays',
        label: 'Días Laborales (Lun-Vie)',
        cooldownMs: 24 * 60 * 60 * 1000,
        description: 'Lunes a Viernes (Sin penalización en fin de semana)',
        isWorkdays: true
    },
    '3x_week': {
        id: '3x_week',
        label: '3 veces por semana',
        cooldownMs: 48 * 60 * 60 * 1000, // Cooldown de 48h
        description: 'Mínimo 48h entre marcas',
        isWorkdays: false
    },
    '2x_week': {
        id: '2x_week',
        label: '2 veces por semana',
        cooldownMs: 72 * 60 * 60 * 1000, // Cooldown de 72h
        description: 'Mínimo 72h entre marcas',
        isWorkdays: false
    },
    weekly: {
        id: 'weekly',
        label: 'Semanal (1 vez/sem)',
        cooldownMs: 7 * 24 * 60 * 60 * 1000, // Cooldown de 7 días
        description: 'Se reinicia cada 7 días',
        isWorkdays: false
    }
};

// ==========================================
// MASTER PRESET HABITS CATALOG (25 Hábitos)
// ==========================================
const PRESET_HABITS_CATALOG = [
    // --- SALUD Y BIENESTAR ---
    {
        id: 'hab_water',
        title: 'Beber 2 Litros de Agua',
        category: 'health',
        icon: '💧',
        type: 'positive',
        xpReward: 20,
        hpPenalty: 0,
        goldReward: 10,
        defaultFrequency: 'daily',
        description: 'Mantente hidratado durante el día para recuperar vitalidad.'
    },
    {
        id: 'hab_fruit',
        title: 'Comer Fruta o Verdura Fresca',
        category: 'health',
        icon: '🥗',
        type: 'positive',
        xpReward: 15,
        hpPenalty: 0,
        goldReward: 7,
        defaultFrequency: 'daily',
        description: 'Aporta vitaminas y nutrientes esenciales para tu cuerpo.'
    },
    {
        id: 'hab_sleep',
        title: 'Dormir 7 a 8 Horas',
        category: 'health',
        icon: '😴',
        type: 'positive',
        xpReward: 25,
        hpPenalty: 0,
        goldReward: 12,
        defaultFrequency: 'daily',
        description: 'Un descanso reparador para regenerar energía y enfoque.'
    },
    {
        id: 'hab_teeth',
        title: 'Higiene Dental y Cepillado',
        category: 'health',
        icon: '🦷',
        type: 'positive',
        xpReward: 15,
        hpPenalty: 0,
        goldReward: 7,
        defaultFrequency: 'daily',
        description: 'Cuidado y salud bucal después de tus comidas principales.'
    },
    {
        id: 'hab_sun',
        title: 'Tomar 15 Minutos de Sol',
        category: 'health',
        icon: '☀️',
        type: 'positive',
        xpReward: 15,
        hpPenalty: 0,
        goldReward: 7,
        defaultFrequency: 'daily',
        description: 'Vitamina D natural y un respiro al aire libre.'
    },
    {
        id: 'hab_screen_off',
        title: 'Desconectar Pantallas Antes de Dormir',
        category: 'health',
        icon: '📵',
        type: 'positive',
        xpReward: 20,
        hpPenalty: 0,
        goldReward: 10,
        defaultFrequency: 'daily',
        description: '30 minutos sin celular ni televisión antes de acostarte.'
    },

    // --- FITNESS Y DEPORTE ---
    {
        id: 'hab_cardio',
        title: '30 Minutos de Ejercicio Cardio',
        category: 'fitness',
        icon: '🏃‍♂️',
        type: 'positive',
        xpReward: 30,
        hpPenalty: 0,
        goldReward: 15,
        defaultFrequency: '3x_week',
        description: 'Correr, trotar, nadar o bicicleta para fortalecer el corazón.'
    },
    {
        id: 'hab_strength',
        title: 'Entrenamiento de Fuerza o Pesas',
        category: 'fitness',
        icon: '🏋️',
        type: 'positive',
        xpReward: 35,
        hpPenalty: 0,
        goldReward: 17,
        defaultFrequency: '3x_week',
        description: 'Rutina de resistencia muscular o calistenia.'
    },
    {
        id: 'hab_steps',
        title: 'Caminar 8,000 Pasos',
        category: 'fitness',
        icon: '🚶',
        type: 'positive',
        xpReward: 25,
        hpPenalty: 0,
        goldReward: 12,
        defaultFrequency: 'daily',
        description: 'Movimiento activo y constante a lo largo de tu día.'
    },
    {
        id: 'hab_stretch',
        title: 'Estiramientos o Yoga 15 Min',
        category: 'fitness',
        icon: '🧘‍♂️',
        type: 'positive',
        xpReward: 20,
        hpPenalty: 0,
        goldReward: 10,
        defaultFrequency: 'daily',
        description: 'Flexibilidad y relajación muscular para prevenir lesiones.'
    },

    // --- ESTUDIO Y PRODUCTIVIDAD ---
    {
        id: 'hab_code',
        title: 'Estudio o Práctica de Programación',
        category: 'productivity',
        icon: '💻',
        type: 'positive',
        xpReward: 35,
        hpPenalty: 0,
        goldReward: 17,
        defaultFrequency: 'daily',
        description: 'Escribir código, resolver ejercicios o aprender arquitectura.'
    },
    {
        id: 'hab_read',
        title: 'Leer 15 Páginas de un Libro',
        category: 'productivity',
        icon: '📖',
        type: 'positive',
        xpReward: 25,
        hpPenalty: 0,
        goldReward: 12,
        defaultFrequency: 'daily',
        description: 'Lectura para expandir tu conocimiento y concentración.'
    },
    {
        id: 'hab_lang',
        title: 'Practicar Inglés u Otro Idioma',
        category: 'productivity',
        icon: '🇬🇧',
        type: 'positive',
        xpReward: 25,
        hpPenalty: 0,
        goldReward: 12,
        defaultFrequency: 'daily',
        description: '20 minutos de vocabulario, escucha o conversación.'
    },
    {
        id: 'hab_top_task',
        title: 'Completar Tarea Prioritaria',
        category: 'productivity',
        icon: '🎯',
        type: 'positive',
        xpReward: 30,
        hpPenalty: 0,
        goldReward: 15,
        defaultFrequency: 'workdays',
        description: 'Resolver el objetivo más importante del trabajo o estudio.'
    },
    {
        id: 'hab_plan',
        title: 'Planificar el Día Siguiente',
        category: 'productivity',
        icon: '📅',
        type: 'positive',
        xpReward: 20,
        hpPenalty: 0,
        goldReward: 10,
        defaultFrequency: 'daily',
        description: 'Definir tus 3 prioridades clave antes de finalizar el día.'
    },
    {
        id: 'hab_clean_room',
        title: 'Ordenar Espacio de Trabajo',
        category: 'productivity',
        icon: '🧹',
        type: 'positive',
        xpReward: 20,
        hpPenalty: 0,
        goldReward: 10,
        defaultFrequency: 'daily',
        description: 'Mantener ordenado tu escritorio o habitación despeja tu mente.'
    },

    // --- MENTE Y EMOCIONES ---
    {
        id: 'hab_meditate',
        title: 'Meditación o Respiración Consciente',
        category: 'mind',
        icon: '🧘',
        type: 'positive',
        xpReward: 20,
        hpPenalty: 0,
        goldReward: 10,
        defaultFrequency: 'daily',
        description: '10 minutos de calma, respiración y atención plena.'
    },
    {
        id: 'hab_journal',
        title: 'Escribir Diario o Gratitud',
        category: 'mind',
        icon: '✍️',
        type: 'positive',
        xpReward: 20,
        hpPenalty: 0,
        goldReward: 10,
        defaultFrequency: 'daily',
        description: 'Anotar 3 cosas por las que estás agradecido hoy.'
    },
    {
        id: 'hab_hobby',
        title: 'Practicar Hobby Creativo',
        category: 'mind',
        icon: '🎨',
        type: 'positive',
        xpReward: 25,
        hpPenalty: 0,
        goldReward: 12,
        defaultFrequency: '2x_week',
        description: 'Dibujo, música, escritura o cualquier expresión artística.'
    },

    // --- FINANZAS PERSONALES ---
    {
        id: 'hab_no_impulse',
        title: 'Cero Gastos Hormiga o Impulsivos',
        category: 'finance',
        icon: '💰',
        type: 'positive',
        xpReward: 25,
        hpPenalty: 0,
        goldReward: 12,
        defaultFrequency: 'daily',
        description: 'Control financiero: no gastar en compras innecesarias.'
    },
    {
        id: 'hab_track_expenses',
        title: 'Registrar Gastos del Día',
        category: 'finance',
        icon: '📊',
        type: 'positive',
        xpReward: 20,
        hpPenalty: 0,
        goldReward: 10,
        defaultFrequency: 'daily',
        description: 'Anotar cada ingreso y egreso en tu presupuesto.'
    },

    // --- MALOS HÁBITOS A EVITAR (Quitan HP si caes en ellos) ---
    {
        id: 'hab_no_soda',
        title: 'Consumir Refrescos o Bebidas Azucaradas',
        category: 'negative',
        icon: '🥤',
        type: 'negative',
        xpReward: 0,
        hpPenalty: 15,
        goldReward: 0,
        defaultFrequency: 'daily',
        description: 'Penalización: consumir exceso de azúcar daña tu salud.'
    },
    {
        id: 'hab_no_junk',
        title: 'Comer Comida Chatarra / Frituras',
        category: 'negative',
        icon: '🍔',
        type: 'negative',
        xpReward: 0,
        hpPenalty: 20,
        goldReward: 0,
        defaultFrequency: 'daily',
        description: 'Penalización: ultraprocesados afectan tu rendimiento.'
    },
    {
        id: 'hab_no_scroll',
        title: 'Más de 2 Horas en Redes Sociales',
        category: 'negative',
        icon: '📱',
        type: 'negative',
        xpReward: 0,
        hpPenalty: 20,
        goldReward: 0,
        defaultFrequency: 'daily',
        description: 'Penalización: el scrolling infinito drena tu concentración.'
    },
    {
        id: 'hab_no_smoke',
        title: 'Fumar Cigarrillo o Vapear',
        category: 'negative',
        icon: '🚬',
        type: 'negative',
        xpReward: 0,
        hpPenalty: 25,
        goldReward: 0,
        defaultFrequency: 'daily',
        description: 'Penalización severa: afecta directamente tu vitalidad.'
    },
    {
        id: 'hab_no_procrastinate',
        title: 'Procrastinar Deberes Urgentes',
        category: 'negative',
        icon: '🛋️',
        type: 'negative',
        xpReward: 0,
        hpPenalty: 20,
        goldReward: 0,
        defaultFrequency: 'workdays',
        description: 'Penalización: aplazar compromisos críticos genera estrés.'
    },
    {
        id: 'hab_no_late',
        title: 'Desvelarse Sin Motivo (> 12:00 AM)',
        category: 'negative',
        icon: '🌙',
        type: 'negative',
        xpReward: 0,
        hpPenalty: 15,
        goldReward: 0,
        defaultFrequency: 'daily',
        description: 'Penalización: trasnochar disminuye tu regeneración física.'
    }
];

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
    _cooldownInterval: null,

    // Admin & Features State
    isAdmin: false,
    adminTab: 'stats',
    adminUsersList: [],
    presetCatalog: [...PRESET_HABITS_CATALOG],
    tutorialStep: 0
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

        // Check Admin privileges
        GameState.isAdmin = !!avatar.is_admin || 
            (GameState.user.email && GameState.user.email.toLowerCase().includes('admin')) ||
            (GameState.user.user_metadata && GameState.user.user_metadata.is_admin === true);

        // Load habits with frequency support
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
            completedAt: h.completed_at ? new Date(h.completed_at).getTime() : null,
            frequency: h.frequency || 'daily'
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
    const payload = {
        id: habit.id,
        avatar_id: GameState.avatarId,
        title: habit.title,
        type: habit.type,
        xp_reward: habit.xpReward,
        hp_penalty: habit.hpPenalty,
        gold_reward: habit.goldReward,
        completed_at: habit.completedAt ? new Date(habit.completedAt).toISOString() : null,
        frequency: habit.frequency || 'daily'
    };

    try {
        const { error } = await supabase.from('habits').upsert(payload);
        if (error && error.message && error.message.includes('frequency')) {
            // If the column 'frequency' has not been added yet in DB, retry without it
            delete payload.frequency;
            await supabase.from('habits').upsert(payload);
        }
    } catch (err) {
        console.warn('saveHabitToDB fallback:', err);
        delete payload.frequency;
        await supabase.from('habits').upsert(payload);
    }
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
// Cooldown Helpers & Frequency Logic
// ==========================================

function getHabitCooldownMs(habit) {
    const freqKey = habit.frequency || 'daily';
    const cfg = FREQUENCY_CONFIGS[freqKey] || FREQUENCY_CONFIGS.daily;
    return Math.max(MIN_COOLDOWN_MS, cfg.cooldownMs);
}

function isOnCooldown(habit) {
    if (!habit.completedAt) return false;
    const cdMs = getHabitCooldownMs(habit);
    return (Date.now() - habit.completedAt) < cdMs;
}

function getRemainingCooldown(habit) {
    if (!habit.completedAt) return null;
    const cdMs = getHabitCooldownMs(habit);
    const remaining = cdMs - (Date.now() - habit.completedAt);
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

// ==========================================
// Admin Database Helpers
// ==========================================

async function loadAllUsersForAdmin() {
    try {
        const { data, error } = await supabase
            .from('avatars')
            .select('*')
            .order('updated_at', { ascending: false });

        if (error || !data || data.length === 0) {
            // Provide current user + mock active/inactive players for testing
            const current = GameState.avatar;
            GameState.adminUsersList = [
                {
                    id: GameState.avatarId || 'curr_1',
                    name: current.name,
                    level: current.level,
                    hp: current.hp,
                    max_hp: current.maxHp,
                    gold: current.gold,
                    avatar_class: current.avatarClass || 'hero',
                    updated_at: new Date().toISOString(),
                    is_active: true
                },
                {
                    id: 'usr_2',
                    name: 'Kaelen el Sabio',
                    level: 4,
                    hp: 95,
                    max_hp: 100,
                    gold: 140,
                    avatar_class: 'mage',
                    updated_at: new Date(Date.now() - 4 * 3600000).toISOString(),
                    is_active: true
                },
                {
                    id: 'usr_3',
                    name: 'Valeria Guardiana',
                    level: 6,
                    hp: 100,
                    max_hp: 120,
                    gold: 310,
                    avatar_class: 'knight',
                    updated_at: new Date(Date.now() - 12 * 3600000).toISOString(),
                    is_active: true
                },
                {
                    id: 'usr_4',
                    name: 'Artemis Sombrío',
                    level: 2,
                    hp: 0,
                    max_hp: 100,
                    gold: 20,
                    avatar_class: 'elf',
                    updated_at: new Date(Date.now() - 5 * 86400000).toISOString(),
                    is_active: false
                }
            ];
            return GameState.adminUsersList;
        }

        const now = Date.now();
        GameState.adminUsersList = data.map(u => {
            const lastActive = u.updated_at ? new Date(u.updated_at).getTime() : 0;
            const isActive = (now - lastActive) < (48 * 3600000); // Active if within 48h
            return {
                id: u.id,
                name: u.name,
                level: u.level,
                hp: u.hp,
                max_hp: u.max_hp,
                gold: u.gold,
                avatar_class: u.avatar_class || 'hero',
                updated_at: u.updated_at || new Date().toISOString(),
                is_active: isActive
            };
        });
        return GameState.adminUsersList;
    } catch (err) {
        console.error('loadAllUsersForAdmin error:', err);
        return [];
    }
}

async function adminSaveShopItem(item) {
    try {
        await supabase.from('shop_items').upsert({
            id: item.id,
            name: item.name,
            cost: parseInt(item.cost),
            icon: item.icon,
            type: item.type,
            description: item.description
        });
    } catch (e) {
        console.warn('adminSaveShopItem local update only:', e);
    }
    // Update local GameState
    const idx = GameState.shopItems.findIndex(i => i.id === item.id);
    if (idx >= 0) {
        GameState.shopItems[idx] = { ...GameState.shopItems[idx], ...item };
    } else {
        GameState.shopItems.push({ ...item, purchased: false });
    }
    return true;
}

async function adminSaveMonster(monster) {
    try {
        const payload = {
            name: monster.name,
            sprite: monster.sprite,
            base_level: parseInt(monster.base_level),
            base_hp: parseInt(monster.base_hp),
            base_attack: parseInt(monster.base_attack),
            xp_reward: parseInt(monster.xp_reward),
            gold_reward: parseInt(monster.gold_reward)
        };
        if (monster.id) payload.id = monster.id;
        await supabase.from('monsters').upsert(payload);
    } catch (e) {
        console.warn('adminSaveMonster local update only:', e);
    }
    // Update local GameState
    const idx = GameState.monsters.findIndex(m => m.id === monster.id || m.name === monster.name);
    if (idx >= 0) {
        GameState.monsters[idx] = { ...GameState.monsters[idx], ...monster };
    } else {
        GameState.monsters.push({ ...monster, id: monster.id || Date.now() });
    }
    return true;
}

async function adminUpdateUserAvatar(avatarId, updates) {
    try {
        await supabase.from('avatars').update(updates).eq('id', avatarId);
    } catch (e) {
        console.warn('adminUpdateUserAvatar DB warning:', e);
    }
    // Update local memory if matching current avatar
    if (avatarId === GameState.avatarId) {
        if (updates.hp !== undefined) GameState.avatar.hp = updates.hp;
        if (updates.gold !== undefined) GameState.avatar.gold = updates.gold;
        if (updates.current_xp !== undefined) GameState.avatar.currentXP = updates.current_xp;
        if (updates.level !== undefined) GameState.avatar.level = updates.level;
        if (updates.is_dead !== undefined) GameState.avatar.isDead = updates.is_dead;
    }
    // Update admin list
    const user = GameState.adminUsersList.find(u => u.id === avatarId);
    if (user) {
        Object.assign(user, updates);
    }
    return true;
}
