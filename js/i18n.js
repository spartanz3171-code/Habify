const I18N = {
    current: (() => { try { return localStorage.getItem('habify_language') === 'en' ? 'en' : 'es'; } catch { return 'es'; } })(),
    
    dict: {
        es: {
            'nav.home': 'Inicio',
            'nav.character': 'Personaje',
            'nav.habits': 'Hábitos',
            'nav.store': 'Tienda',
            'nav.arena': 'Arena',
            'btn.logout': 'SALIR',
            'auth.login': 'INICIAR SESIÓN',
            'auth.register': 'REGISTRARSE',
            'auth.email': 'CORREO ELECTRÓNICO',
            'auth.password': 'CONTRASEÑA',
            'auth.name': 'NOMBRE DEL AVATAR',
            'auth.class': 'CLASE DEL AVATAR',
            'class.hero': 'Héroe Aventurero',
            'class.mage': 'Mago Arcano',
            'class.knight': 'Caballero Real',
            'class.elf': 'Elfo del Bosque',
            'dashboard.stats': 'Estadísticas Visuales',
            'dashboard.inventory': 'Inventario Activo',
            'dashboard.gold': 'ORO',
            'dashboard.level': 'NIVEL',
            'dashboard.hp': 'VIDA',
            'dashboard.exp': 'EXP',
            'dashboard.health': 'SALUD VITAL',
            'dashboard.dead_title': 'TU AVATAR HA CAÍDO',
            'dashboard.dead_desc': 'Completa hábitos para revivir',
            'dashboard.habits': 'HÁBITOS',
            'dashboard.empty_title': 'Sin hábitos activos aún.<br>Explora el catálogo para agregar.',
            'dashboard.btn_go': 'IR A HÁBITOS',
            
            // Habits section
            'habits.title': 'MISIONES Y HÁBITOS',
            'habits.active_title': 'Tus Misiones Activas',
            'habits.catalog_title': 'CATÁLOGO DE HÁBITOS',
            'habits.catalog_desc': 'Elige tus misiones de nuestra biblioteca RPG precargada',
            'habits.empty': 'No tienes misiones activas todavía.',
            'habits.filter_all': 'TODOS',
            'habits.filter_health': 'SALUD',
            'habits.filter_fitness': 'FITNESS',
            'habits.filter_productivity': 'ESTUDIO',
            'habits.filter_mind': 'MENTE',
            'habits.filter_finance': 'FINANZAS',
            'habits.filter_negative': 'A EVITAR',
            'habits.frequency_label': 'Frecuencia:',
            'habits.btn_activate': '+ ACTIVAR MISIÓN',
            'habits.btn_activated': '✓ YA ACTIVA',
            
            // Frequencies
            'freq.daily': 'Diario (24h)',
            'freq.workdays': 'Días Laborales (Lun-Vie)',
            'freq.3x_week': '3 veces por semana',
            'freq.2x_week': '2 veces por semana',
            'freq.weekly': 'Semanal (1 vez/sem)',
            
            // Store
            'store.header': 'MERCADO NEGRO',
            'store.all': 'TODO',
            'store.weapons': 'ARMAS',
            'store.spells': 'HECHIZOS',
            'store.pets': 'MASCOTAS',
            'store.backgrounds': 'FONDOS',
            'arena.versus': 'DESAFÍO ÉPICO',
            'arena.btn_attack': 'ATAQUE FÍSICO',
            'arena.btn_flee': 'HUIR',
            'toast.loading': 'CARGANDO...',
            
            // Onboarding & Tutorial
            'tutorial.badge': 'GUÍA DEL AVENTURERO',
            'tutorial.step1_title': '¡BIENVENIDO A HABIFY!',
            'tutorial.step1_desc': 'Habify convierte tus hábitos del mundo real en una épica aventura RPG. Cada hábito cumplido fortalece a tu Avatar con Experiencia (XP) para subir de nivel y Monedas de Oro (G).',
            'tutorial.step2_title': 'VIDA (HP) Y PENALIZACIONES',
            'tutorial.step2_desc': '¡Cuidado con descuidarte! Si olvidas cumplir tus hábitos en su frecuencia o caes en hábitos negativos, tu Avatar perderá Vida (HP). Si tu HP llega a 0, tu héroe caerá (-20 XP) y no podrás combatir hasta que cumplas hábitos para revivir.',
            'tutorial.step3_title': 'MERCADO NEGRO Y ARENA',
            'tutorial.step3_desc': 'Con el oro ganado puedes comprar armas, escudos, hechizos arcanos, mascotas y fondos para tu avatar. ¡Luego pon a prueba tu poder en combates en tiempo real dentro de la Arena!',
            'tutorial.step4_title': '¡ELIGE TUS MISIONES!',
            'tutorial.step4_desc': 'Para comenzar con control total, los hábitos ya están precargados y equilibrados. ¡Puedes elegir hasta 20 hábitos con diferentes frecuencias! Vamos a la sección de hábitos a seleccionar tus primeras misiones.',
            'tutorial.btn_next': 'SIGUIENTE ▶',
            'tutorial.btn_prev': '◀ ANTERIOR',
            'tutorial.btn_start': '>> ¡VAMOS A ELEGIR HÁBITOS! <<',
            'tutorial.btn_close': 'CERRAR',

            // Admin Panel
            'admin.title': 'PANEL DE CONTROL ADMINISTRADOR',
            'admin.tab_stats': 'MÉTRICAS',
            'admin.tab_users': 'USUARIOS',
            'admin.tab_store': 'TIENDA',
            'admin.tab_arena': 'ARENA',
            'admin.tab_catalog': 'CATÁLOGO',
            
            // Store Items - ES
            'item.bg_tokyo.name': 'Fondo de Tokio',
            'item.bg_tokyo.desc': 'Un paisaje nocturno de Tokio con luces de neón.',
            'item.bg_paris.name': 'Fondo de París',
            'item.bg_paris.desc': 'Vista de la Torre Eiffel al atardecer.',
            'item.bg_space.name': 'Fondo Espacial',
            'item.bg_space.desc': 'Una galaxia lejana llena de estrellas.',
            'item.bg_forest.name': 'Bosque Encantado',
            'item.bg_forest.desc': 'Un bosque mágico lleno de misterio.',
            'item.bg_japan.name': 'Fondo de Japón',
            'item.bg_japan.desc': 'El majestuoso Monte Fuji y cerezos en flor.',
            'item.pet_trex.name': 'Mascota Mini T-Rex',
            'item.pet_trex.desc': 'Un pequeño dinosaurio que te acompaña.',
            'item.pet_dragon.name': 'Mascota Dragón',
            'item.pet_dragon.desc': 'Un dragón bebé que escupe fuego.',
            'item.pet_cat.name': 'Gato Mágico',
            'item.pet_cat.desc': 'Un gato con poderes místicos.',
            'item.pet_phoenix.name': 'Fénix Dorado',
            'item.pet_phoenix.desc': 'Un ave fénix renacida de las cenizas.',
            'item.wpn_sword.name': 'Espada de Madera',
            'item.wpn_sword.desc': 'Una espada básica para principiantes.',
            'item.wpn_staff.name': 'Bastón Arcano',
            'item.wpn_staff.desc': 'Un bastón cargado de energía mágica.',
            'item.wpn_bow.name': 'Arco Élfico',
            'item.wpn_bow.desc': 'Un arco forjado por elfos ancestrales.',
            'item.wpn_shield.name': 'Escudo de Hierro',
            'item.wpn_shield.desc': 'Protección resistente contra ataques.',
            'item.spell_fire.name': 'Bola de Fuego',
            'item.spell_fire.desc': 'Hechizo de Daño Altísimo',
            'item.spell_heal.name': 'Curación Menor',
            'item.spell_heal.desc': 'Recupera el 35% de Vida Máxima'
        },
        en: {
            'nav.home': 'Home',
            'nav.character': 'Character',
            'nav.habits': 'Habits',
            'nav.store': 'Shop',
            'nav.arena': 'Arena',
            'btn.logout': 'LOGOUT',
            'auth.login': 'LOGIN',
            'auth.register': 'REGISTER',
            'auth.email': 'EMAIL',
            'auth.password': 'PASSWORD',
            'auth.name': 'AVATAR NAME',
            'auth.class': 'AVATAR CLASS',
            'class.hero': 'Adventurer Hero',
            'class.mage': 'Arcane Mage',
            'class.knight': 'Royal Knight',
            'class.elf': 'Forest Elf',
            'dashboard.stats': 'Visual Stats',
            'dashboard.inventory': 'Active Inventory',
            'dashboard.gold': 'GOLD',
            'dashboard.level': 'LEVEL',
            'dashboard.hp': 'HP',
            'dashboard.exp': 'EXP',
            'dashboard.health': 'VITAL HEALTH',
            'dashboard.dead_title': 'YOUR AVATAR HAS FALLEN',
            'dashboard.dead_desc': 'Complete habits to revive',
            'dashboard.habits': 'HABITS',
            'dashboard.empty_title': 'No active habits yet.<br>Explore the catalog to add quests.',
            'dashboard.btn_go': 'GO TO HABITS',
            
            // Habits section
            'habits.title': 'QUESTS & HABITS',
            'habits.active_title': 'Your Active Quests',
            'habits.catalog_title': 'HABIT CATALOG',
            'habits.catalog_desc': 'Choose your quests from our curated preset RPG library',
            'habits.empty': 'You have no active quests yet.',
            'habits.filter_all': 'ALL',
            'habits.filter_health': 'HEALTH',
            'habits.filter_fitness': 'FITNESS',
            'habits.filter_productivity': 'STUDY',
            'habits.filter_mind': 'MIND',
            'habits.filter_finance': 'FINANCE',
            'habits.filter_negative': 'TO AVOID',
            'habits.frequency_label': 'Frequency:',
            'habits.btn_activate': '+ ACTIVATE QUEST',
            'habits.btn_activated': '✓ ALREADY ACTIVE',

            // Frequencies
            'freq.daily': 'Daily (24h)',
            'freq.workdays': 'Workdays (Mon-Fri)',
            'freq.3x_week': '3 times a week',
            'freq.2x_week': '2 times a week',
            'freq.weekly': 'Weekly (1x/week)',

            // Store
            'store.header': 'BLACK MARKET',
            'store.all': 'ALL',
            'store.weapons': 'WEAPONS',
            'store.spells': 'SPELLS',
            'store.pets': 'PETS',
            'store.backgrounds': 'BACKGROUNDS',
            'arena.versus': 'EPIC CHALLENGE',
            'arena.btn_attack': 'PHYSICAL ATTACK',
            'arena.btn_flee': 'FLEE',
            'toast.loading': 'LOADING...',

            // Onboarding & Tutorial
            'tutorial.badge': "ADVENTURER'S GUIDE",
            'tutorial.step1_title': 'WELCOME TO HABIFY!',
            'tutorial.step1_desc': 'Habify turns your real-world habits into an epic RPG quest. Every completed habit grants Experience (XP) to level up and Gold Coins (G) to buy gear.',
            'tutorial.step2_title': 'HEALTH (HP) & PENALTIES',
            'tutorial.step2_desc': 'Be careful! If you neglect habits or trigger negative habits, your avatar will lose Health (HP). If your HP reaches 0, you fall defeated (-20 XP) and must fulfill habits to revive.',
            'tutorial.step3_title': 'BLACK MARKET & COMBAT ARENA',
            'tutorial.step3_desc': 'Spend your hard-earned gold on weapons, shields, spells, pets, and backgrounds. Then enter the Arena to battle monsters in real-time!',
            'tutorial.step4_title': 'SELECT YOUR QUESTS!',
            'tutorial.step4_desc': 'To keep balance, habits are preset with verified rewards. You can choose up to 20 habits with custom safe frequencies. Let us pick your first quests now!',
            'tutorial.btn_next': 'NEXT ▶',
            'tutorial.btn_prev': '◀ PREV',
            'tutorial.btn_start': '>> SELECT HABITS NOW! <<',
            'tutorial.btn_close': 'CLOSE',

            // Admin Panel
            'admin.title': 'ADMIN DEVELOPER DASHBOARD',
            'admin.tab_stats': 'METRICS',
            'admin.tab_users': 'USERS',
            'admin.tab_store': 'STORE',
            'admin.tab_arena': 'ARENA',
            'admin.tab_catalog': 'CATALOG',

            // Store Items - EN
            'item.bg_tokyo.name': 'Tokyo Background',
            'item.bg_tokyo.desc': 'A Tokyo nightscape with neon lights.',
            'item.bg_paris.name': 'Paris Background',
            'item.bg_paris.desc': 'View of the Eiffel Tower at sunset.',
            'item.bg_space.name': 'Space Background',
            'item.bg_space.desc': 'A distant galaxy full of stars.',
            'item.bg_forest.name': 'Enchanted Forest',
            'item.bg_forest.desc': 'A magical forest full of mystery.',
            'item.bg_japan.name': 'Japan Background',
            'item.bg_japan.desc': 'Majestic Mount Fuji and cherry blossoms.',
            'item.pet_trex.name': 'Mini T-Rex Pet',
            'item.pet_trex.desc': 'A small dinosaur companion.',
            'item.pet_dragon.name': 'Dragon Pet',
            'item.pet_dragon.desc': 'A baby dragon that breathes fire.',
            'item.pet_cat.name': 'Magic Cat',
            'item.pet_cat.desc': 'A cat with mystical powers.',
            'item.pet_phoenix.name': 'Golden Phoenix',
            'item.pet_phoenix.desc': 'A phoenix reborn from ashes.',
            'item.wpn_sword.name': 'Wooden Sword',
            'item.wpn_sword.desc': 'A basic sword for beginners.',
            'item.wpn_staff.name': 'Arcane Staff',
            'item.wpn_staff.desc': 'A staff charged with magic energy.',
            'item.wpn_bow.name': 'Elven Bow',
            'item.wpn_bow.desc': 'A bow forged by ancestral elves.',
            'item.wpn_shield.name': 'Iron Shield',
            'item.wpn_shield.desc': 'Sturdy protection against attacks.',
            'item.spell_fire.name': 'Fireball',
            'item.spell_fire.desc': 'Very High Damage spell.',
            'item.spell_heal.name': 'Minor Heal',
            'item.spell_heal.desc': 'Recovers 35% of Maximum HP.'
        }
    },

    t(key) {
        return (this.dict[this.current] && this.dict[this.current][key]) || key;
    },

    setLang(lang) {
        if (this.dict[lang]) {
            this.current = lang;
            try { localStorage.setItem('habify_language', lang); } catch { /* Private browsing may disable storage. */ }
            this.updateStaticUI();
            if (typeof App !== 'undefined' && typeof GameState !== 'undefined' && GameState.currentView) {
                if (document.body.dataset.view === 'auth') {
                    if (document.getElementById('email-verification')) App.showEmailVerification(App.pendingVerificationEmail);
                    else App.showAuth(App.authMode || 'login');
                } else App.navigate(GameState.currentView);
            }
        }
    },

    updateStaticUI() {
        const els = document.querySelectorAll('[data-i18n]');
        els.forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (el.tagName === 'INPUT' && el.type === 'button') {
                el.value = this.t(key);
            } else {
                el.textContent = this.t(key);
            }
        });
    }
};

window.I18N = I18N;
