const I18N = {
    current: 'es',
    
    dict: {
        es: {
            'nav.home': 'Inicio',
            'nav.habits': 'Habitos',
            'nav.store': 'Tienda',
            'nav.arena': 'Arena',
            'btn.logout': 'SALIR',
            'auth.login': 'INICIAR SESION',
            'auth.register': 'REGISTRARSE',
            'auth.email': 'CORREO ELECTRONICO',
            'auth.password': 'CONTRASEÑA',
            'auth.name': 'NOMBRE DEL AVATAR',
            'auth.class': 'CLASE DEL AVATAR',
            'class.hero': 'Heroe Aventurero',
            'class.mage': 'Mago Arcano',
            'class.knight': 'Caballero Real',
            'class.elf': 'Elfo del Bosque',
            'dashboard.stats': 'Estadisticas Visuales',
            'dashboard.inventory': 'Inventario Activo',
            'dashboard.gold': 'ORO',
            'dashboard.level': 'NIVEL',
            'dashboard.hp': 'VIDA',
            'dashboard.exp': 'EXP',
            'dashboard.health': 'SALUD VITAL',
            'dashboard.dead_title': 'TU AVATAR HA CAIDO',
            'dashboard.dead_desc': 'Completa habitos para revivir',
            'dashboard.habits': 'HABITOS',
            'dashboard.empty_title': 'Sin habitos aun.<br>Ve a Habitos para agregar.',
            'dashboard.btn_go': 'IR A HABITOS',
            'habits.add_title': 'NUEVO HABITO RPG',
            'habits.habit_name': 'Titulo del Habito',
            'habits.habit_type': 'Tipo',
            'habits.positive': 'Positivo (Da XP / Oro)',
            'habits.negative': 'Negativo (Quita Vida)',
            'habits.difficulty': 'Dificultad (Valor)',
            'habits.btn_add': '+ AÑADIR MISION',
            'habits.btn_defaults': 'Cargar por Defecto',
            'habits.empty': 'No tienes misiones activas.',
            'store.header': 'MERCADO NEGRO',
            'store.all': 'TODO',
            'store.weapons': 'ARMAS',
            'store.spells': 'HECHIZOS',
            'store.pets': 'MASCOTAS',
            'store.backgrounds': 'FONDOS',
            'arena.versus': 'DESAFIO EPICO',
            'arena.btn_attack': 'ATAQUE FISICO',
            'arena.btn_flee': 'HUIR',
            'toast.loading': 'CARGANDO...',
            
            // Store Items - ES (Sin Acentos)
            'item.bg_tokyo.name': 'Fondo de Tokio',
            'item.bg_tokyo.desc': 'Un paisaje nocturno de Tokio con luces de neon.',
            'item.bg_paris.name': 'Fondo de Paris',
            'item.bg_paris.desc': 'Vista de la Torre Eiffel al atardecer.',
            'item.bg_space.name': 'Fondo Espacial',
            'item.bg_space.desc': 'Una galaxia lejana llena de estrellas.',
            'item.bg_forest.name': 'Bosque Encantado',
            'item.bg_forest.desc': 'Un bosque magico lleno de misterio.',
            'item.bg_japan.name': 'Fondo de Japon',
            'item.bg_japan.desc': 'El majestuoso Monte Fuji y cerezos en flor.',
            'item.pet_trex.name': 'Mascota Mini T-Rex',
            'item.pet_trex.desc': 'Un pequeño dinosaurio que te acompaña.',
            'item.pet_dragon.name': 'Mascota Dragon',
            'item.pet_dragon.desc': 'Un dragon bebe que escupe fuego.',
            'item.pet_cat.name': 'Gato Magico',
            'item.pet_cat.desc': 'Un gato con poderes misticos.',
            'item.pet_phoenix.name': 'Fenix Dorado',
            'item.pet_phoenix.desc': 'Un ave fenix renacida de las cenizas.',
            'item.wpn_sword.name': 'Espada de Madera',
            'item.wpn_sword.desc': 'Una espada basica para principiantes.',
            'item.wpn_staff.name': 'Baston Arcano',
            'item.wpn_staff.desc': 'Un baston cargado de energia magica.',
            'item.wpn_bow.name': 'Arco Elfico',
            'item.wpn_bow.desc': 'Un arco forjado por elfos ancestrales.',
            'item.wpn_shield.name': 'Escudo de Hierro',
            'item.wpn_shield.desc': 'Proteccion resistente contra ataques.',
            'item.spell_fire.name': 'Bola de Fuego',
            'item.spell_fire.desc': 'Hechizo de Daño Altisimo',
            'item.spell_heal.name': 'Curacion Menor',
            'item.spell_heal.desc': 'Recupera el 35% de Vida Maxima'
        },
        en: {
            'nav.home': 'Home',
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
            'dashboard.empty_title': 'No habits yet.<br>Go to Habits to add.',
            'dashboard.btn_go': 'GO TO HABITS',
            'habits.add_title': 'NEW RPG HABIT',
            'habits.habit_name': 'Habit Title',
            'habits.habit_type': 'Type',
            'habits.positive': 'Positive (Gives XP / Gold)',
            'habits.negative': 'Negative (Takes HP)',
            'habits.difficulty': 'Difficulty (Value)',
            'habits.btn_add': '+ ADD QUEST',
            'habits.btn_defaults': 'Load Defaults',
            'habits.empty': 'No active quests.',
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
        return this.dict[this.current][key] || key;
    },

    setLang(lang) {
        if (this.dict[lang]) {
            this.current = lang;
            this.updateStaticUI();
            if (window.App && window.GameState && GameState.currentView) {
                App.navigate(GameState.currentView); // Refresh current view
            }
        }
    },

    updateStaticUI() {
        // Update elements that are always in DOM (Nav, Header)
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
