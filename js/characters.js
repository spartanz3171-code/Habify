// Original, modular pixel artwork. Every piece shares a 96 × 108 pixel canvas.
// Character appearance is data; there are no external sprite files or SVG IDs.
(() => {
    'use strict';

    const INK = '#17172b';
    const GOLD = '#e5b859';
    const LIGHT = '#ffe3a0';
    const STATES = ['IDLE', 'RUNNING', 'JUMPING', 'FALLING', 'ATTACKING', 'HEAVY_ATTACK', 'CASTING', 'GUARDING', 'HIT_STUN', 'DEAD'];
    const ROLES = ['hero', 'mage', 'knight', 'elf'];
    const PALETTES = Object.freeze({
        skin: ['#efbd91', '#d99566', '#ab704f', '#754d3b', '#f4d7bd', '#51392f'],
        hairColor: ['#44302e', '#201f30', '#c88545', '#ead29a', '#8d465f', '#c6c4d9'],
        outfitColor: ['#8256c6', '#406fbd', '#3b947d', '#ba526c', '#b48945', '#556681']
    });
    const DEFAULT_APPEARANCE = Object.freeze({
        body: 'male', skin: '#efbd91', hairStyle: 'short', hairColor: '#44302e',
        outfitColor: '#8256c6', outfit: 'default', accessory: 'none'
    });

    function normalizeAppearance(value) {
        const source = value && typeof value === 'object' ? value : {};
        const pick = (key, choices) => choices.includes(source[key]) ? source[key] : DEFAULT_APPEARANCE[key];
        const color = key => typeof source[key] === 'string' && /^#[0-9a-f]{6}$/i.test(source[key]) ? source[key].toLowerCase() : DEFAULT_APPEARANCE[key];
        return {
            body: pick('body', ['male', 'female']), skin: color('skin'),
            hairStyle: pick('hairStyle', ['short', 'long', 'ponytail', 'braids']),
            hairColor: color('hairColor'), outfitColor: color('outfitColor'),
            outfit: pick('outfit', ['default', 'outfit_ranger', 'outfit_knight', 'outfit_arcane']),
            accessory: pick('accessory', ['none', 'acc_scarf', 'acc_circlet', 'acc_cape'])
        };
    }

    function shade(hex, amount) {
        const n = parseInt(hex.slice(1), 16);
        const channel = shift => Math.max(0, Math.min(255, ((n >> shift) & 255) + amount)).toString(16).padStart(2, '0');
        return `#${channel(16)}${channel(8)}${channel(0)}`;
    }
    const rect = (x, y, w, h, color, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" ${extra}/>`;
    const poly = (points, color, extra = '') => `<polygon points="${points}" fill="${color}" ${extra}/>`;
    const group = (name, content) => `<g class="${name}">${content}</g>`;

    function colors(a) {
        return {
            cloth: a.outfitColor, clothLight: shade(a.outfitColor, 35), clothHigh: shade(a.outfitColor, 62),
            clothDark: shade(a.outfitColor, -35), clothDeep: shade(a.outfitColor, -60),
            skin: a.skin, skinLight: shade(a.skin, 22), skinDark: shade(a.skin, -35), skinDeep: shade(a.skin, -57),
            hair: a.hairColor, hairLight: shade(a.hairColor, 31), hairDark: shade(a.hairColor, -22),
            steel: '#899eaf', steelLight: '#d2e3e8', steelDark: '#4b5c78', leather: '#664637', leatherLight: '#976f49'
        };
    }

    function cape(c, role, a) {
        const outer = a.accessory === 'acc_cape' ? '#964c72' : c.clothDark;
        return group('char-cape',
            poly('33,43 57,42 62,53 64,75 70,98 61,100 54,97 47,101 39,97 27,101 22,96 26,77 29,56', INK) +
            poly('35,46 55,45 59,55 60,74 66,96 59,97 54,94 47,98 39,94 27,98 25,95 29,77 32,57', outer) +
            poly('35,47 41,46 37,64 34,79 30,95 26,97 29,76 31,57', shade(outer, 30)) +
            poly('42,48 47,46 43,71 43,92 40,92 39,70', shade(outer, 13)) +
            poly('51,47 56,48 58,67 58,82 63,94 57,92 52,76', shade(outer, -25)) +
            poly('34,58 36,60 32,76 29,90 28,91 31,74', shade(outer, 47)) +
            poly('26,96 28,98 39,94 47,98 54,94 60,97 66,95 67,97 60,99 54,96 47,100 39,96 27,100', role === 'mage' ? GOLD : shade(outer, -20)));
    }

    function leg(c, front, armored) {
        const x = front ? 51 : 36;
        const dark = front ? c.clothDark : c.clothDeep;
        const metal = front ? c.steel : c.steelDark;
        const upper = poly(`${x},71 ${x + 13},71 ${x + 13},83 ${x + 11},91 ${x + 1},91 ${x - 1},85`, INK) +
            rect(x + 2, 75, 8, 15, dark) + rect(x + 2, 76, 3, 10, front ? c.clothLight : c.cloth) +
            (armored ? rect(x + 1, 78, 10, 10, metal) + rect(x + 2, 78, 3, 7, c.steelLight) + rect(x + 2, 87, 8, 2, c.steelDark) : '') +
            rect(x + 1, 88, 11, 5, INK) + rect(x + 3, 89, 7, 3, armored ? c.steelLight : c.leatherLight);
        const lower = poly(`${x + 1},90 ${x + 12},90 ${x + 12},99 ${x + 17},101 ${x + 18},108 ${x - 1},108 ${x - 1},99`, INK) +
            rect(x + 2, 94, 8, 10, armored ? metal : c.leather) +
            rect(x + 2, 94, 3, 7, armored ? c.steelLight : c.leatherLight) +
            rect(x + 2, 101, 13, 4, armored ? metal : c.leather) +
            rect(x + 3, 101, 10, 2, armored ? c.steelLight : c.leatherLight) +
            rect(x, 106, 17, 2, '#111323') + rect(x + 7, 96, 4, 2, GOLD);
        return group(`char-leg char-leg-${front ? 'front' : 'back'}`, upper + group('char-shin', lower));
    }

    function torso(c, role, a) {
        const armored = a.outfit === 'default' ? role === 'knight' : a.outfit === 'outfit_knight';
        const robe = a.outfit === 'default' ? role === 'mage' : a.outfit === 'outfit_arcane';
        const ranger = a.outfit === 'default' ? role === 'elf' : a.outfit === 'outfit_ranger';
        const feminine = a.body === 'female';
        const left = feminine ? 37 : 34;
        let body = poly(`${left},44 44,41 57,41 65,45 64,59 62,70 66,78 55,81 48,77 35,80 32,75 36,62`, INK) +
            poly(`${left + 2},46 44,44 55,44 62,47 60,60 59,70 62,75 54,77 47,73 35,76 39,62`, c.cloth) +
            poly(`${left + 2},47 43,46 45,53 42,66 40,72 35,74 39,60`, c.clothLight) +
            poly('56,45 62,48 59,65 60,73 55,75 52,63', c.clothDark) +
            rect(45, 45, 3, 18, c.clothHigh) + rect(48, 48, 2, 11, c.clothLight);
        if (armored) {
            body += poly('37,46 44,43 57,44 62,47 61,61 55,68 43,67 37,61', c.steelDark) +
                poly('39,47 46,46 47,51 58,47 59,59 54,64 43,63 39,58', c.steel) +
                poly('40,47 44,47 46,51 55,49 57,48 57,51 47,55 40,52', c.steelLight) +
                rect(41, 55, 3, 6, c.steelLight) + rect(48, 56, 2, 7, '#647b97') +
                poly('49,49 51,47 54,49 54,53 51,56 49,53', GOLD) + rect(51, 49, 1, 3, LIGHT) +
                rect(40, 64, 18, 3, '#536784') + rect(40, 64, 9, 1, c.steelLight) +
                poly('34,72 44,73 45,81 34,82', c.steelDark) + rect(35, 74, 7, 5, c.steel) +
                poly('55,73 63,72 67,80 57,82', c.steelDark) + rect(57, 75, 6, 4, c.steel);
        } else if (robe) {
            body += poly('38,66 59,66 65,91 56,96 49,91 42,96 31,92', INK) +
                poly('39,68 56,68 61,89 55,92 49,87 42,92 34,90', c.clothDark) +
                poly('41,69 45,69 44,88 41,91 38,88', c.clothLight) +
                poly('50,69 53,68 56,87 54,89 51,85', c.cloth) +
                poly('35,88 42,90 48,85 50,88 42,94 34,92', GOLD) +
                poly('50,87 55,90 61,87 63,91 55,94', GOLD) +
                poly('42,43 46,43 50,55 54,43 58,44 52,59 49,59', GOLD) +
                rect(49, 55, 4, 5, '#76dcd7') + rect(49, 55, 2, 2, '#d5fff2');
        } else if (ranger) {
            body += poly('38,46 43,44 48,50 55,45 59,46 59,59 54,66 42,65 37,58', '#573e32') +
                poly('39,47 43,46 47,52 55,48 57,49 56,58 52,62 43,62 39,57', '#8d6848') +
                poly('40,48 43,48 46,53 53,50 55,50 55,52 46,56 40,53', '#b39361') +
                rect(40, 57, 3, 3, '#b39361') + rect(50, 59, 5, 2, '#654734') +
                poly('36,46 40,44 59,65 58,69 53,67', c.leather) +
                poly('39,46 41,46 58,65 56,65', c.leatherLight) + rect(46, 54, 4, 5, GOLD) +
                rect(47, 55, 2, 3, INK) + rect(38, 55, 4, 2, c.clothHigh) +
                rect(42, 63, 2, 6, c.clothDeep) + rect(54, 68, 8, 10, INK) +
                rect(55, 69, 6, 7, c.leather) + rect(55, 69, 6, 2, c.leatherLight) + rect(57, 72, 2, 2, GOLD);
        } else {
            // The original adventurer wears a cuirass over a cloth tunic.
            body += poly('36,47 43,43 55,44 62,48 60,59 55,64 43,64 37,59', INK) +
                poly('38,48 44,46 55,46 59,49 58,57 54,61 44,61 40,57', c.steelDark) +
                poly('39,48 45,47 47,50 55,47 58,49 57,54 52,59 45,59 41,55', c.steel) +
                poly('40,49 44,48 46,51 54,49 56,49 55,52 47,54 41,52', c.steelLight) +
                rect(42, 55, 3, 3, '#bdced5') + rect(47, 56, 5, 3, '#637990') +
                rect(39, 61, 19, 2, '#353b50') + rect(40, 61, 8, 1, '#aebdca') +
                poly('36,45 41,44 42,49 39,55 36,54', c.leather) +
                poly('55,44 58,44 61,61 57,66 55,61', c.leather) +
                rect(38, 47, 2, 6, c.leatherLight) + rect(56, 47, 2, 11, c.leatherLight) +
                rect(49, 47, 4, 4, GOLD) + rect(50, 48, 2, 2, '#eff4e7') +
                poly('34,74 43,73 45,83 41,87 32,85 31,79', INK) +
                poly('34,76 41,75 42,82 40,84 34,83', c.leather) + rect(34, 76, 7, 3, c.leatherLight) + rect(37, 78, 3, 3, GOLD);
        }
        if (armored) body +=
            // Faceted plate edges and an enamel crest echo the original knight.
            poly('39,47 43,46 46,50 46,52 40,50', '#edf2e8') +
            poly('56,51 59,48 59,57 55,61 51,63 50,61', '#667c93') +
            poly('46,51 56,51 56,59 52,64 47,61', INK) +
            poly('47,52 55,52 55,58 52,62 48,60', '#9c4552') +
            poly('49,53 52,54 53,53 54,55 52,57 54,59 52,60 50,58 49,59 49,57 51,56', GOLD) +
            rect(37, 57, 2, 4, GOLD) + rect(57, 61, 2, 2, GOLD) +
            rect(38, 66, 21, 2, c.steelDark) + rect(39, 66, 10, 1, c.steelLight);
        if (robe) body +=
            poly('36,46 42,43 48,49 47,54 40,51 35,49', INK) +
            poly('38,46 42,45 46,49 45,51 40,49', c.clothDeep) +
            poly('37,46 39,46 46,51 46,53 40,50 36,48', GOLD) +
            poly('55,44 61,45 64,49 56,53 52,53 53,50', INK) +
            poly('57,46 60,46 61,48 55,51 53,51', c.clothDeep) +
            poly('54,51 62,47 63,49 56,53 53,53', GOLD) +
            rect(42, 55, 1, 8, GOLD) + rect(45, 57, 1, 8, GOLD) + rect(55, 56, 1, 8, GOLD) +
            poly('43,73 46,75 47,86 50,90 53,86 54,74 57,72 56,88 50,94 44,89', GOLD) +
            poly('46,76 48,77 49,85 51,87 50,90 47,87', c.clothDeep) +
            poly('50,73 53,77 51,81 48,78', '#67bca0') + rect(50, 75, 1, 3, '#c8ebc4');
        if (ranger) body +=
            poly('47,74 53,73 57,84 50,91 43,85', INK) +
            poly('48,76 52,75 54,83 50,88 46,84', c.clothDark) +
            poly('50,78 52,81 52,84 50,86 48,84 48,81', '#a4b765') + rect(50, 79, 1, 6, '#d2d688') +
            rect(38, 64, 3, 2, '#be9a69') + rect(54, 62, 2, 2, '#be9a69');
        // Purchased outfits have their own details even on the matching class.
        if (a.outfit === 'outfit_knight') body +=
            poly('39,48 44,49 49,53 54,49 60,48 57,54 51,58 47,58 42,54', GOLD) +
            poly('49,51 53,55 49,60 45,55', INK) + poly('49,53 51,55 49,58 47,55', '#75d8d0') +
            rect(48, 54, 2, 2, '#d9fff0') + rect(38, 74, 2, 6, GOLD) + rect(60, 74, 2, 6, GOLD) +
            rect(43, 63, 13, 2, GOLD);
        if (a.outfit === 'outfit_arcane') body +=
            poly('39,73 43,77 39,81 35,77', GOLD) + rect(38, 75, 2, 4, c.clothDeep) +
            poly('57,76 61,80 57,84 53,80', GOLD) + rect(56, 78, 2, 4, c.clothDeep) +
            rect(47, 78, 3, 11, '#a4f3ef') + rect(45, 81, 7, 2, '#a4f3ef') +
            rect(45, 46, 2, 7, '#a4f3ef') + rect(55, 46, 2, 7, '#a4f3ef');
        if (a.outfit === 'outfit_ranger') body +=
            poly('56,45 60,47 41,67 37,66', c.leather) + poly('57,47 59,48 40,66 39,65', c.leatherLight) +
            rect(34, 73, 10, 10, INK) + rect(35, 74, 8, 7, c.leather) + rect(35, 74, 8, 2, c.leatherLight) + rect(38, 77, 2, 2, GOLD);
        body += rect(36, 68, 25, 5, INK) + rect(37, 69, 23, 3, c.leather) +
            rect(45, 68, 7, 6, GOLD) + rect(47, 70, 3, 2, INK) + rect(46, 68, 5, 1, LIGHT) +
            rect(38, 70, 2, 1, c.leatherLight) + rect(56, 69, 3, 1, c.leatherLight);
        return group('char-torso', body);
    }

    function backHair(c, a) {
        if (a.hairStyle === 'short') return '';
        if (a.hairStyle === 'ponytail') return group('char-hair-tail',
            poly('35,20 30,20 27,26 28,36 24,43 26,51 32,46 35,35 36,28', INK) +
            poly('33,22 30,25 31,36 28,43 28,47 31,42 33,33', c.hair) +
            rect(29, 26, 2, 9, c.hairLight) + rect(32, 22, 5, 3, GOLD));
        if (a.hairStyle === 'braids') return group('char-hair-tail',
            poly('35,23 42,23 42,43 39,45 41,49 39,53 33,53 32,47 35,43 33,39', INK) +
            rect(35, 27, 5, 17, c.hair) + rect(36, 43, 3, 8, c.hair) +
            rect(35, 31, 3, 2, c.hairLight) + rect(37, 35, 3, 2, c.hairLight) +
            rect(35, 39, 3, 2, c.hairLight) + rect(36, 44, 3, 2, c.hairLight) + rect(34, 49, 6, 2, GOLD));
        return group('char-hair-tail',
            poly('34,18 59,18 64,30 61,49 55,52 47,49 41,53 31,48 32,29', INK) +
            poly('36,21 57,22 60,34 58,47 52,49 46,45 40,49 34,46 35,29', c.hair) +
            rect(35, 26, 3, 18, c.hairLight) + rect(39, 38, 2, 9, c.hairLight) +
            rect(55, 29, 3, 16, c.hairDark) + rect(45, 39, 4, 10, c.hairDark));
    }

    function head(c, role, a) {
        const feminine = a.body === 'female';
        let content = rect(45, 37, 11, 9, INK) + rect(47, 38, 7, 7, c.skinDark) + rect(50, 39, 4, 5, c.skin) +
            poly(feminine ? '39,20 44,17 58,18 63,23 63,29 65,30 65,33 62,34 61,38 56,42 49,42 43,37 38,32' :
                '39,20 44,17 58,18 63,23 63,29 66,30 66,34 63,34 62,39 57,43 46,42 41,37 38,32', INK) +
            poly(feminine ? '42,22 47,20 58,21 61,24 61,31 63,31 63,32 60,33 59,37 55,40 50,40 44,35 41,29' :
                '42,22 47,20 58,21 61,24 61,31 64,31 64,33 61,33 60,38 55,40 47,39 43,35 41,29', c.skin) +
            poly('43,22 48,21 53,22 51,27 45,28 43,26', c.skinLight) +
            poly('43,30 47,31 48,37 56,39 54,41 46,39 42,34', c.skinDark) +
            rect(60, 25, 2, 4, c.skinDark) + rect(60, 33, 2, 4, c.skinDark) +
            rect(58, 30, 3, 3, c.skinLight) + rect(55, 36, 5, 1, c.skinDeep) +
            rect(55, 37, 3, 1, c.skinLight) +
            rect(48, 27, 5, 1, c.hairDark) + rect(57, 26, 5, 1, c.hairDark) +
            rect(49, 29, 4, 3, '#faf4e5') + rect(58, 28, 3, 3, '#faf4e5') +
            rect(51, 29, 2, 3, INK) + rect(59, 28, 2, 3, INK) +
            rect(51, 29, 1, 1, '#9ccdd7') + rect(59, 28, 1, 1, '#9ccdd7') +
            rect(39, 28, 4, 6, INK) + rect(40, 29, 3, 4, c.skin) + rect(41, 30, 1, 2, c.skinDark);
        if (feminine) content += rect(48, 28, 5, 1, INK) + rect(57, 27, 4, 1, INK) + rect(54, 37, 4, 1, '#ac625e') + rect(42, 33, 2, 3, GOLD);
        else content += rect(45, 36, 1, 2, c.skinDeep) + rect(46, 39, 6, 1, c.skinDeep);
        if (role === 'elf') content += poly('40,29 32,24 34,32 40,36 43,33', INK) + poly('40,30 35,28 37,32 40,33', c.skin) + rect(39, 32, 2, 1, c.skinDark);
        content += poly('36,21 38,14 43,11 56,11 63,16 64,24 60,26 57,23 52,21 48,25 43,24 42,30 38,29', INK) +
            poly('38,20 40,16 45,13 55,13 60,16 62,21 58,23 54,19 49,20 46,23 41,22 40,27 38,26', c.hair) +
            poly('40,18 45,14 53,14 56,16 47,16 43,19', c.hairLight) +
            rect(39, 20, 3, 4, c.hairLight) + rect(51, 17, 6, 2, c.hairLight) +
            poly('56,19 60,19 61,23 58,22', c.hairDark) + rect(43, 22, 2, 3, c.hairDark);
        if (role === 'mage') {
            // A deep hood, open around the face so skin and hairstyle remain visible.
            content += poly('30,40 32,29 37,16 47,4 53,4 61,12 68,29 70,42 62,49 56,44 62,38 64,29 60,21 54,17 46,19 40,27 39,35 44,42 40,47', INK) +
                poly('33,39 35,29 40,17 48,7 52,7 58,14 65,30 67,40 62,45 59,43 65,37 66,29 62,20 55,14 45,16 38,26 37,35 41,43 39,44', c.clothDeep) +
                poly('35,31 41,18 49,9 51,9 48,15 41,23 38,33 36,39', c.cloth) +
                poly('55,10 59,14 65,30 66,36 63,33 61,23', c.clothDark) +
                poly('33,39 35,40 39,44 41,42 38,35 39,26 46,18 54,16 61,22 64,30 62,38 58,43 61,46 67,41 66,43 61,49 55,44 61,37 62,29 59,23 54,19 47,21 41,28 41,35 46,43 40,48 32,42', GOLD) +
                rect(39, 27, 1, 7, LIGHT) + rect(45, 19, 3, 1, LIGHT) + rect(61, 25, 1, 4, '#99733e');
            if (!feminine) content +=
                poly('44,35 48,37 51,36 54,38 60,34 61,40 58,47 52,52 47,47 44,41', INK) +
                poly('46,37 49,39 52,38 55,40 59,37 58,43 53,49 49,45 46,40', c.hair) +
                poly('47,38 49,40 49,43 52,47 51,42 53,40 54,44 53,48 50,45', c.hairLight) +
                rect(56, 39, 1, 5, c.hairLight) + rect(50, 37, 5, 1, c.skinDeep);
        }
        if (role === 'hero') content +=
            poly('35,23 36,16 41,10 55,9 62,13 65,21 61,24 58,20 44,21 41,25 40,32 36,31', INK) +
            poly('38,22 39,17 43,13 54,12 60,15 62,20 58,18 43,19 39,24 39,29 37,28', '#4e5b70') +
            poly('40,17 44,13 51,13 53,15 52,17 44,18', '#8f9cac') +
            poly('43,14 47,13 49,13 49,15 44,16', '#cdd7d9') +
            rect(40, 20, 21, 2, '#b3a06f') + rect(44, 19, 10, 1, LIGHT) +
            rect(45, 14, 2, 6, '#c3b288') + rect(54, 14, 2, 6, '#4a4e5c') +
            poly('46,11 47,6 52,2 58,3 63,10 58,12 55,7 52,7 51,12', INK) +
            poly('49,10 50,6 53,4 56,5 59,9 57,9 54,6 52,8 52,10', GOLD) +
            rect(49, 10, 5, 2, c.steelLight) + rect(37, 24, 2, 4, '#7e8998');
        if (role === 'knight') content +=
            poly('34,26 35,16 41,10 54,8 61,12 65,19 65,28 62,27 61,22 43,23 43,32 39,39 34,35', INK) +
            poly('38,22 39,16 44,12 54,11 59,14 61,19 58,18 42,19 40,26 37,30', c.steelDark) +
            poly('40,18 43,13 51,11 54,13 54,18', c.steelLight) + rect(43, 18, 17, 2, c.steel) +
            rect(45, 13, 2, 5, '#f0f4e8') + rect(55, 14, 3, 4, '#6b8298') +
            poly('36,23 41,22 41,30 38,35 36,34', c.steel) + rect(36, 24, 1, 9, c.steelLight) +
            rect(37, 30, 1, 3, '#374157') + rect(39, 28, 1, 3, '#374157') +
            rect(39, 21, 25, 2, GOLD) + rect(49, 14, 2, 9, GOLD) + rect(49, 14, 1, 7, LIGHT) +
            rect(50, 24, 2, 3, c.steelDark) + rect(63, 23, 2, 4, GOLD) +
            poly('46,10 47,4 52,0 58,1 62,5 64,11 58,13 57,8 54,5 52,7 51,11', INK) +
            poly('49,9 50,4 53,2 56,3 60,6 61,10 59,10 57,6 54,4 51,7 51,10', '#a94e62') +
            rect(52, 3, 3, 2, '#e48a88') + rect(50, 9, 5, 3, GOLD);
        if (role === 'elf') content +=
            poly('40,21 45,21 51,24 56,20 62,19 62,23 56,24 51,28 46,25 40,24', INK) +
            poly('41,22 45,22 51,25 56,21 61,20 60,23 56,23 51,27 46,24 41,23', GOLD) +
            poly('43,19 47,20 49,23 45,22', '#879b58') + poly('56,20 60,17 60,20 56,23', '#b2c67e') +
            poly('51,23 54,26 51,29 49,26', '#73b58a') + rect(51, 24, 1, 2, '#d6eaa1');
        if (a.accessory === 'acc_circlet') content +=
            rect(41, 24, 21, 2, GOLD) + rect(48, 23, 6, 4, INK) +
            poly('51,22 54,25 51,29 48,25', GOLD) + rect(50, 24, 2, 3, '#abf4db') + rect(50, 24, 1, 1, '#ffffff');
        return group('char-head', content);
    }

    function weapon(c, role, equipped) {
        const kind = String(equipped || (role === 'mage' ? 'staff' : role === 'elf' ? 'bow' : 'sword'));
        if (kind.includes('staff')) return group('char-weapon',
            rect(70, 31, 5, 55, INK) + rect(71, 32, 3, 52, c.leather) + rect(71, 33, 1, 48, c.leatherLight) +
            rect(68, 25, 9, 7, INK) + rect(69, 25, 7, 5, GOLD) +
            poly('66,21 69,14 75,14 79,21 76,28 69,28', INK) +
            poly('68,21 70,16 74,16 77,21 74,25 70,25', '#8561d0') +
            poly('70,17 73,17 74,20 71,23 69,21', '#d4b8ff') + rect(70, 16, 2, 2, '#f3e7ff') +
            rect(70, 40, 5, 3, GOLD) + rect(70, 75, 5, 3, GOLD) +
            group('char-magic-glint', rect(62, 19, 2, 2, '#d4b8ff') + rect(80, 13, 2, 2, '#bc8cff') + rect(77, 29, 2, 2, '#e5cdff')));
        if (kind.includes('bow')) return group('char-weapon',
            poly('74,33 79,38 83,46 86,57 86,68 82,78 77,85 73,87 76,79 80,69 81,58 78,45', INK) +
            poly('76,37 78,40 82,50 84,58 84,67 80,77 76,82 79,74 82,66 82,59 79,48', c.leatherLight) +
            rect(74, 37, 1, 47, '#ddd3b7') + rect(79, 60, 5, 8, GOLD) +
            rect(66, 57, 24, 2, '#c7c5ac') + poly('90,54 95,58 90,61', c.steelLight) +
            poly('68,55 73,57 73,59 68,61', c.clothLight));
        const enchanted = /fire|ice|magic|legend|flame/i.test(kind);
        const blade = enchanted ? '#a9f0e4' : c.steelLight;
        return group('char-weapon',
            poly('72,21 77,26 77,60 75,65 70,65 69,60 69,27', INK) +
            poly('72,25 75,28 75,58 73,62 71,58 71,29', blade) +
            rect(71, 30, 2, 29, '#f1f8ed') + rect(74, 30, 1, 29, enchanted ? '#55afc2' : c.steel) +
            rect(65, 62, 16, 5, INK) + rect(66, 63, 14, 2, GOLD) + rect(66, 63, 5, 1, LIGHT) +
            rect(70, 66, 6, 12, INK) + rect(71, 66, 4, 10, c.leather) +
            rect(71, 68, 4, 1, c.leatherLight) + rect(71, 72, 4, 1, c.leatherLight) +
            rect(70, 76, 6, 4, GOLD) + rect(71, 76, 2, 1, LIGHT));
    }

    function arm(c, role, a, front, avatar) {
        const armored = a.outfit === 'default' ? role === 'knight' : a.outfit === 'outfit_knight';
        const x = front ? 61 : 28;
        const handX = front ? 65 : 27;
        let content = poly(`${x},44 ${x + 9},45 ${x + 12},53 ${x + 11},64 ${x + 4},68 ${x - 1},62 ${x - 2},50`, INK) +
            poly(`${x + 1},48 ${x + 7},47 ${x + 9},53 ${x + 8},62 ${x + 3},64 ${x + 1},59`, front ? c.cloth : c.clothDark) +
            rect(x + 2, 49, 3, 9, front ? c.clothLight : c.cloth) +
            rect(x + 2, 60, 8, 6, INK) + rect(x + 3, 61, 6, 4, c.leather) + rect(x + 3, 61, 6, 1, GOLD);
        if (armored) content +=
            poly(`${x - 2},46 ${x + 3},42 ${x + 9},44 ${x + 13},50 ${x + 11},55 ${x + 1},54`, INK) +
            poly(`${x},47 ${x + 4},45 ${x + 8},46 ${x + 10},51 ${x + 9},52 ${x + 2},51`, front ? c.steel : c.steelDark) +
            rect(x + 2, 46, 5, 2, c.steelLight) + rect(x + 1, 52, 9, 2, GOLD) +
            rect(x + 4, 58, 6, 7, c.steelDark) + rect(x + 4, 58, 2, 6, c.steelLight);
        if (a.outfit === 'outfit_knight') content +=
            poly(`${x - 4},45 ${x + 3},38 ${x + 8},39 ${x + 14},46 ${x + 12},51 ${x + 1},49`, INK) +
            poly(`${x - 1},45 ${x + 4},41 ${x + 7},42 ${x + 11},46 ${x + 10},48 ${x + 2},46`, GOLD) +
            rect(x + 2, 43, 6, 2, LIGHT);
        if (front && avatar.equippedWeapon) content += weapon(c, role, avatar.equippedWeapon);
        content += rect(handX, 65, 10, 9, INK) + rect(handX + 1, 66, 8, 6, front ? c.skin : c.skinDark) +
            rect(handX + 1, 66, 4, 2, c.skinLight) + rect(handX + 5, 68, 3, 1, c.skinDark) + rect(handX + 6, 70, 2, 1, c.skinDark);
        if (!front && avatar.equippedShield) content += group('char-shield',
            poly('23,56 30,53 39,57 39,75 34,82 30,85 24,80 20,72 20,58', INK) +
            poly('23,59 30,56 36,59 36,74 32,80 30,82 26,78 23,72', GOLD) +
            poly('25,61 30,59 34,61 34,73 30,79 26,74', c.clothDark) +
            rect(28, 63, 4, 10, c.steelLight) + rect(26, 66, 8, 3, c.steelLight) +
            rect(24, 60, 2, 12, LIGHT));
        return group(`char-arm char-arm-${front ? 'front' : 'back'}`, content);
    }

    function effects() {
        return group('char-attack-fx',
            poly('71,28 90,35 104,50 109,67 105,61 94,47 81,37', '#fff2bf') +
            poly('83,33 98,44 110,61 113,76 106,66 100,54 89,41', '#f7bf68') +
            poly('92,44 102,56 107,67 109,79 105,74 100,59', '#ffffff')) +
            group('char-cast-fx',
                rect(77, 32, 4, 4, '#d4b7ff') + rect(84, 44, 3, 3, '#f3e5ff') +
                rect(71, 19, 3, 3, '#e9d2ff') + rect(61, 29, 2, 2, '#a992ff') +
                poly('82,20 84,25 89,27 84,29 82,34 80,29 75,27 80,25', '#bf9aff'));
    }

    function shell(content, options, role, extra = '') {
        const state = STATES.includes(options.state) ? options.state : 'IDLE';
        const facing = options.facing === 'left' || options.facing === -1 ? 'left' : 'right';
        const combo = [1, 2, 3].includes(Number(options.combo)) ? Number(options.combo) : 1;
        const phase = ['startup', 'active', 'recovery'].includes(options.phase) ? ` data-phase="${options.phase}"` : '';
        return `<span class="character-art ${extra}" data-role="${role}" data-state="${state}" data-facing="${facing}" data-combo="${combo}"${phase} aria-hidden="true"><svg class="character-svg" viewBox="0 0 96 108" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" preserveAspectRatio="xMidYMax meet" focusable="false"><g class="char-facing">${group('char-ground-shadow', rect(30, 103, 39, 4, '#0b0919', 'opacity=".3"') + rect(25, 104, 50, 2, '#0b0919', 'opacity=".2"'))}${group('char-body', content)}</g></svg></span>`;
    }

    function render(avatar = {}, options = {}) {
        avatar = avatar && typeof avatar === 'object' ? avatar : {};
        const a = normalizeAppearance(avatar.appearance);
        const c = colors(a);
        const role = ROLES.includes(avatar.avatarClass) ? avatar.avatarClass : 'hero';
        const armored = a.outfit === 'default' ? role === 'knight' : a.outfit === 'outfit_knight';
        let upper = backHair(c, a) + arm(c, role, a, false, avatar) + torso(c, role, a) + head(c, role, a);
        if (a.accessory === 'acc_scarf') upper += group('char-scarf',
            poly('41,40 53,43 59,39 61,44 53,49 41,46 32,53 26,51 34,45', INK) +
            poly('42,42 53,45 58,42 58,45 52,47 41,44 32,51 29,50 36,45', '#db6b77') +
            rect(44, 43, 8, 2, '#ffa09d'));
        upper += arm(c, role, a, true, avatar) + effects();
        return shell(cape(c, role, a) + leg(c, false, armored) + leg(c, true, armored) + group('char-upper-body', upper), options, role);
    }

    function monsterLeg(x, front, c, skeleton) {
        const upper = poly(`${x},72 ${x + 12},72 ${x + 11},94 ${x + 1},94`, INK) +
            rect(x + 3, 76, skeleton ? 5 : 7, 15, front ? c.mid : c.dark) + rect(x + 3, 77, 2, 12, c.high);
        const lower = poly(`${x + 1},90 ${x + 11},90 ${x + 11},101 ${x + 17},103 ${x + 17},108 ${x - 1},108 ${x - 1},102`, INK) +
            rect(x + 3, 92, 6, 13, skeleton ? c.mid : '#574235') + rect(x + 3, 103, 11, 3, skeleton ? c.high : '#7c6041') +
            (skeleton ? rect(x + 3, 93, 2, 10, c.high) + rect(x + 13, 103, 1, 3, INK) : rect(x + 2, 93, 8, 2, '#c7a264'));
        return group(`char-leg char-leg-${front ? 'front' : 'back'}`, upper + group('char-shin', lower));
    }

    function monsterArm(front, c, skeleton, orc) {
        const x = front ? 61 : 26;
        let content = poly(`${x},44 ${x + 10},45 ${x + 15},59 ${x + 13},73 ${x + 3},75 ${x},65 ${x - 3},56`, INK) +
            poly(`${x + 1},48 ${x + 8},48 ${x + 11},60 ${x + 10},69 ${x + 4},69 ${x + 2},60`, front ? c.mid : c.dark) +
            rect(x + 2, 49, skeleton ? 3 : 5, 9, c.high) + rect(x + 7, 61, 3, 8, c.high) +
            rect(x + 3, 64, 11, 5, '#523d3a') + rect(x + 4, 64, 9, 2, '#ae8b61') +
            rect(x + 4, 70, 9, 5, c.mid) + rect(x + 5, 70, 4, 2, c.high);
        if (skeleton) content += rect(x + 6, 55, 4, 7, INK) + rect(x + 4, 72, 1, 3, INK) + rect(x + 7, 72, 1, 3, INK);
        if (orc) content += poly(`${x - 2},46 ${x + 2},41 ${x + 10},42 ${x + 15},49 ${x + 12},56 ${x + 1},54`, INK) +
            poly(`${x},47 ${x + 3},44 ${x + 9},45 ${x + 12},50 ${x + 10},53 ${x + 2},51`, '#657083') +
            rect(x + 2, 46, 6, 2, '#a3abb6') + poly(`${x + 3},43 ${x + 5},35 ${x + 8},44`, '#e4d9b4');
        if (front) content += group('char-weapon',
            rect(71, 44, 5, 35, INK) + rect(72, 45, 3, 31, '#876044') +
            (orc ? poly('65,30 79,29 86,34 85,47 78,51 76,43 64,44 61,38', INK) +
                poly('66,32 78,31 83,35 82,45 79,47 77,41 66,42 63,38', '#82909b') + rect(65, 34, 4, 6, '#c0ccd0') +
                rect(77, 33, 3, 11, '#596174') : poly('73,27 77,32 77,57 71,57 71,32', INK) +
                poly('74,31 75,33 75,55 73,55 73,34', '#c9dad5') + rect(68, 57, 12, 3, '#aa895d')) +
            rect(68, 68, 8, 6, c.mid) + rect(69, 68, 3, 2, c.high));
        return group(`char-arm char-arm-${front ? 'front' : 'back'}`, content);
    }

    function humanoidMonster(sprite) {
        const skeleton = sprite === 'skeleton';
        const orc = sprite === 'orc';
        const c = skeleton ? { mid: '#c7c6a9', high: '#f0ead0', dark: '#777c76' } :
            orc ? { mid: '#78915b', high: '#a8b776', dark: '#4e6948' } : { mid: '#66a88d', high: '#a1d3a2', dark: '#397265' };
        let torsoArt = poly('35,44 46,40 59,43 65,51 63,72 59,81 35,80 31,71', INK) +
            poly('37,47 46,44 57,46 61,53 60,72 56,77 38,76 35,69', c.dark) +
            rect(38, 49, 9, 18, c.mid) + rect(39, 49, 4, 11, c.high) + rect(50, 50, 9, 14, c.mid);
        if (skeleton) torsoArt += rect(45, 45, 6, 27, c.high) + rect(47, 47, 2, 20, c.dark) +
            [49, 55, 61].map(y => rect(37, y, 23, 3, c.mid) + rect(38, y, 8, 1, c.high)).join('') +
            rect(35, 67, 27, 8, INK) + rect(38, 69, 21, 4, c.mid) + rect(45, 69, 5, 4, c.dark);
        else torsoArt += poly('36,44 42,43 59,67 55,72 49,63', '#78523c') +
            poly('38,45 41,45 57,68 55,69', '#b08654') + rect(47, 56, 5, 5, '#d5bc75') + rect(48, 57, 3, 3, INK);
        torsoArt += rect(34, 71, 28, 6, '#3e3031') + rect(35, 72, 26, 2, '#896248') +
            rect(46, 71, 7, 7, '#baa16c') + rect(48, 73, 3, 3, INK) +
            poly('36,77 46,78 44,88 34,87', '#6c4640') + poly('52,78 62,77 65,86 54,88', '#50353b');
        let face = poly('36,22 40,17 54,15 63,20 67,27 66,36 61,43 48,46 38,41 34,31', INK) +
            poly('39,24 42,20 53,18 61,22 64,28 63,35 59,40 49,42 41,38 37,31', c.mid) +
            poly('40,25 44,21 53,20 56,23 49,25 44,29 39,30', c.high) +
            poly('38,32 44,35 51,39 59,37 58,41 48,43 41,39', c.dark);
        if (skeleton) face += rect(42, 27, 8, 7, INK) + rect(55, 25, 7, 7, INK) +
            rect(46, 29, 3, 2, '#d47478') + rect(58, 27, 3, 2, '#d47478') +
            poly('53,31 55,36 51,36', INK) + rect(46, 39, 13, 5, c.high) +
            rect(48, 40, 1, 3, INK) + rect(52, 40, 1, 3, INK) + rect(56, 40, 1, 3, INK) + rect(43, 35, 4, 2, c.dark);
        else face +=
            poly('36,26 24,21 27,31 37,35 41,32', INK) + poly('36,28 28,25 30,30 37,32', c.mid) +
            poly('64,24 72,18 72,27 65,31', INK) + poly('65,25 70,22 69,26 65,28', c.high) +
            poly('42,27 50,27 51,31 44,31', INK) + rect(46, 28, 3, 2, '#e7d474') + rect(48, 28, 1, 2, '#bc614b') +
            poly('56,25 62,24 63,28 57,29', INK) + rect(58, 26, 3, 2, '#e7d474') + rect(60, 26, 1, 2, '#bc614b') +
            rect(55, 30, 8, 5, c.dark) + rect(57, 30, 6, 3, c.mid) + rect(53, 37, 9, 3, INK) +
            poly('52,34 55,38 53,39', '#ece6bb') + poly('61,34 62,39 59,39', '#ece6bb') +
            rect(35, 30, 3, 5, '#d5b569') +
            poly('38,21 40,16 45,17 47,12 52,16 56,13 59,19 55,22 47,21 42,25', '#363845') +
            rect(43, 18, 5, 2, '#616056');
        return monsterLeg(35, false, c, skeleton) + monsterLeg(51, true, c, skeleton) +
            group('char-upper-body', monsterArm(false, c, skeleton, orc) + group('char-torso', torsoArt) + group('char-head', face) + monsterArm(true, c, skeleton, orc) + effects());
    }

    function slime() {
        return group('char-slime',
            poly('21,93 24,76 31,64 39,57 51,54 64,58 73,68 78,84 84,94 81,104 70,108 28,108 17,104 15,98', INK) +
            poly('23,94 27,78 34,67 41,61 51,58 62,62 69,71 74,86 80,95 78,101 68,105 29,105 20,102 19,98', '#459e91') +
            poly('27,90 31,77 38,67 48,62 57,64 57,71 45,72 39,84 36,94', '#75ccb0') +
            poly('33,76 38,69 45,66 51,65 51,69 43,71 39,77', '#b7efc6') +
            poly('67,74 73,91 77,96 73,101 60,104 34,104 28,99 46,99 62,96 67,87', '#27776f') +
            rect(32, 83, 3, 7, '#a6e7c1') + rect(39, 66, 5, 3, '#e0f9d7') +
            rect(45, 80, 7, 10, INK) + rect(62, 77, 6, 10, INK) +
            rect(46, 81, 2, 3, '#e9ffd9') + rect(63, 78, 2, 3, '#e9ffd9') +
            rect(54, 92, 7, 2, INK) + rect(39, 90, 5, 3, '#4eada0') +
            rect(67, 88, 4, 3, '#61b5a3') + rect(27, 98, 4, 2, '#75ccb0') + rect(72, 95, 3, 2, '#75ccb0'));
    }

    function ghost() {
        return group('char-ghost',
            group('char-cape', poly('33,64 64,63 67,79 75,95 68,102 61,99 56,107 49,101 40,108 37,99 26,102 29,89', INK) +
                poly('36,66 60,66 63,80 70,95 65,98 59,94 55,101 49,96 42,102 40,94 31,97 34,85', '#6c639e') +
                poly('38,68 45,68 42,88 40,94 35,95', '#b2a7d3') +
                poly('55,70 59,73 60,87 65,93 59,91 54,95 53,84', '#8d84bb')) +
            group('char-arm char-arm-back', poly('36,46 29,47 23,59 17,61 17,67 25,68 33,61 39,51', INK) +
                poly('35,49 30,50 25,61 20,62 20,65 25,64 31,59 36,52', '#827ab0')) +
            group('char-upper-body',
                poly('34,24 40,17 52,15 64,19 68,29 66,48 60,70 41,74 30,64 31,45', INK) +
                poly('37,25 42,20 52,18 62,22 65,30 63,46 57,66 42,70 34,62 34,45', '#9d93c7') +
                poly('39,26 44,22 53,21 58,23 50,27 43,34 40,48 36,58 37,38', '#d4c7e8') +
                poly('59,27 63,30 61,46 55,63 48,67 52,53 56,42', '#6c6198') +
                group('char-head',
                    poly('42,31 50,29 60,30 61,41 56,51 45,50 40,41', '#37334f') +
                    rect(44, 35, 6, 4, '#9be0d8') + rect(56, 33, 4, 4, '#9be0d8') +
                    rect(46, 35, 3, 2, '#e2fff1') + rect(57, 33, 2, 2, '#e2fff1') +
                    poly('50,43 54,42 55,48 52,51 49,48', '#141a2b')) +
                group('char-arm char-arm-front', poly('61,47 68,49 71,61 80,63 81,69 73,72 65,68 61,57', INK) +
                    poly('64,50 67,52 68,63 77,65 77,68 73,69 66,65 64,58', '#bdb0db') +
                    rect(65, 52, 2, 9, '#e0d4ed')) + effects()));
    }

    function renderMonster(sprite = 'goblin', options = {}) {
        const kind = ['goblin', 'skeleton', 'slime', 'orc', 'ghost'].includes(sprite) ? sprite : 'goblin';
        const content = kind === 'slime' ? slime() : kind === 'ghost' ? ghost() : humanoidMonster(kind);
        return shell(content, options, kind, `character-monster character-${kind}`);
    }

    window.CharacterArt = Object.freeze({ render, renderMonster, normalizeAppearance, DEFAULT_APPEARANCE, PALETTES });
})();
