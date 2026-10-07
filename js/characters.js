// Original, modular RPG artwork. Every piece shares a 96 × 108 coordinate canvas.
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
    // Hue-shifted material ramps keep dark skin, pale hair and saturated cloth readable.
    function mix(hex, light, ratio) {
        const a = parseInt(hex.slice(1), 16);
        const b = parseInt(light.slice(1), 16);
        const channel = shift => Math.round(((a >> shift) & 255) * (1 - ratio) + ((b >> shift) & 255) * ratio).toString(16).padStart(2, '0');
        return `#${channel(16)}${channel(8)}${channel(0)}`;
    }
    const rect = (x, y, w, h, color, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" ${extra}/>`;
    const poly = (points, color, extra = '') => `<polygon points="${points}" fill="${color}" ${extra}/>`;
    const path = (d, color, extra = '') => `<path d="${d}" fill="${color}" ${extra}/>`;
    const ellipse = (cx, cy, rx, ry, color) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${color}"/>`;
    const group = (name, content) => `<g class="${name}">${content}</g>`;
    const hairLayer = (name, content) => `<g class="${name}" shape-rendering="geometricPrecision">${content}</g>`;

    function colors(a) {
        return {
            cloth: a.outfitColor, clothLight: mix(a.outfitColor, '#e7d8f0', .25), clothHigh: mix(a.outfitColor, '#f0deed', .44),
            clothDark: mix(a.outfitColor, '#21223b', .36), clothDeep: mix(a.outfitColor, '#161a30', .59),
            skin: a.skin, skinLight: mix(a.skin, '#ffe8c9', .32), skinDark: mix(a.skin, '#66394a', .28), skinDeep: mix(a.skin, '#38273e', .42),
            hair: a.hairColor, hairLight: mix(a.hairColor, '#dfc39f', .21), hairHigh: mix(a.hairColor, '#f2d9b8', .32), hairDark: mix(a.hairColor, '#14172b', .44),
            steel: '#8596ad', steelLight: '#c4d7de', steelHigh: '#f0efdb', steelDark: '#4c607d', steelDeep: '#29364f',
            leather: '#77523e', leatherLight: '#ba9361', leatherDark: '#443039', goldDark: '#8d603c'
        };
    }

    function cape(c, role, a) {
        const outer = a.accessory === 'acc_cape' ? '#964c72' : c.clothDark;
        const rim = mix(outer, '#d7cfa8', .33);
        const deep = mix(outer, '#151b32', .5);
        if (role === 'elf' && a.accessory !== 'acc_cape') return group('char-cape',
            poly('35,41 55,42 60,51 59,65 62,80 55,83 51,90 44,86 36,94 34,84 25,88 28,72 27,56', INK) +
            poly('36,44 53,44 57,52 55,65 59,78 52,80 49,86 44,82 37,89 37,80 29,83 32,68 30,56', outer) +
            poly('35,47 40,45 38,62 36,73 31,80 34,65 32,56', rim) +
            poly('45,47 49,45 46,65 44,80 39,86 42,69', c.cloth) +
            poly('52,48 55,53 52,67 56,77 51,81 48,73', deep) +
            poly('30,81 36,78 37,86 44,80 48,83 48,85 44,83 36,90 35,82 29,85', '#9d9f62'));
        if (role === 'hero' && a.accessory !== 'acc_cape') return group('char-cape',
            poly('32,43 53,42 59,52 60,67 56,88 49,91 41,88 34,92 23,86 28,65 27,54', INK) +
            poly('34,46 52,45 56,53 56,68 53,85 48,88 40,85 34,88 27,84 31,65 30,54', outer) +
            poly('34,48 39,47 36,63 35,77 30,84 28,83 33,62', rim) +
            poly('43,49 47,47 43,68 41,83 36,86 39,66', c.cloth) +
            poly('51,48 54,55 52,69 52,81 48,84 47,70', deep) +
            poly('28,83 34,86 40,83 48,86 53,83 53,85 48,88 40,86 34,89 27,85', c.leatherLight));
        return group('char-cape',
            poly('33,43 57,42 62,53 64,75 70,98 61,100 54,97 47,101 39,97 27,101 22,96 26,77 29,56', INK) +
            poly('35,46 55,45 59,55 60,74 66,96 59,97 54,94 47,98 39,94 27,98 25,95 29,77 32,57', outer) +
            poly('35,47 41,46 37,64 34,79 30,95 26,97 29,76 31,57', shade(outer, 30)) +
            poly('42,48 47,46 43,71 43,92 40,92 39,70', shade(outer, 13)) +
            poly('51,47 56,48 58,67 58,82 63,94 57,92 52,76', shade(outer, -25)) +
            poly('34,58 36,60 32,76 29,90 28,91 31,74', shade(outer, 47)) +
            poly('26,96 28,98 39,94 47,98 54,94 60,97 66,95 67,97 60,99 54,96 47,100 39,96 27,100', GOLD) +
            poly('32,60 35,54 33,73 29,87 27,91 28,81', rim) +
            poly('56,57 58,66 60,85 64,94 60,92 56,76', deep) +
            rect(30, 89, 1, 4, GOLD) + rect(32, 91, 1, 3, GOLD) + rect(59, 87, 1, 4, GOLD));
    }

    function leg(c, front, armored) {
        const x = front ? 51 : 36;
        const dark = front ? c.clothDark : c.clothDeep;
        const metal = front ? c.steel : c.steelDark;
        let upper = poly(`${x + 1},72 ${x + 12},73 ${x + 12},82 ${x + 10},91 ${x + 1},93 ${x - 1},85`, INK) +
            poly(`${x + 2},75 ${x + 10},76 ${x + 9},85 ${x + 8},90 ${x + 3},91 ${x + 1},84`, dark) +
            poly(`${x + 2},76 ${x + 5},77 ${x + 4},84 ${x + 6},88 ${x + 3},90 ${x + 1},84`, front ? c.cloth : c.clothDark) +
            rect(x + 3, 78, 1, 5, c.clothLight) + rect(x + 6, 86, 3, 1, c.clothDeep);
        if (armored) upper +=
            poly(`${x + 1},78 ${x + 10},77 ${x + 11},84 ${x + 8},88 ${x + 2},88 ${x},84`, c.steelDeep) +
            poly(`${x + 2},79 ${x + 8},79 ${x + 9},84 ${x + 7},87 ${x + 3},86`, metal) +
            poly(`${x + 2},79 ${x + 5},79 ${x + 4},84 ${x + 3},86 ${x + 1},83`, c.steelLight) +
            rect(x + 5, 79, 4, 1, c.steelHigh);
        upper += poly(`${x + 1},87 ${x + 6},86 ${x + 11},88 ${x + 11},92 ${x + 7},95 ${x + 2},94 ${x},91`, INK) +
            poly(`${x + 2},88 ${x + 6},87 ${x + 10},89 ${x + 9},92 ${x + 6},94 ${x + 2},92`, armored ? metal : c.leather) +
            poly(`${x + 2},88 ${x + 6},88 ${x + 5},91 ${x + 2},91`, armored ? c.steelLight : c.leatherLight) +
            rect(x + 6, 92, 3, 1, armored ? c.steelDeep : c.leatherDark);
        const lower = poly(`${x + 2},92 ${x + 11},92 ${x + 10},99 ${x + 14},101 ${x + 16},103 ${x + 16},107 ${x + 1},108 ${x - 1},105 ${x},100`, INK) +
            poly(`${x + 3},94 ${x + 9},94 ${x + 8},101 ${x + 13},103 ${x + 14},105 ${x + 2},105 ${x + 1},103`, armored ? metal : c.leather) +
            poly(`${x + 3},94 ${x + 5},94 ${x + 4},101 ${x + 2},103 ${x + 2},100`, armored ? c.steelLight : c.leatherLight) +
            poly(`${x + 6},94 ${x + 9},94 ${x + 8},100 ${x + 6},101`, armored ? c.steelDark : c.leatherDark) +
            poly(`${x + 3},102 ${x + 7},101 ${x + 11},102 ${x + 13},104 ${x + 3},104`, armored ? c.steelLight : c.leatherLight) +
            rect(x + 1, 106, 14, 1, '#111323') + rect(x + 2, 105, 11, 1, armored ? c.steelDeep : c.leatherDark) +
            rect(x + 4, 97, 6, 2, c.leatherDark) + rect(x + 6, 97, 3, 2, GOLD) + rect(x + 7, 97, 1, 1, LIGHT);
        return group(`char-leg char-leg-${front ? 'front' : 'back'}`, upper + group('char-shin', lower));
    }

    function torso(c, role, a) {
        const armored = a.outfit === 'default' ? role === 'knight' : a.outfit === 'outfit_knight';
        const robe = a.outfit === 'default' ? role === 'mage' : a.outfit === 'outfit_arcane';
        const ranger = a.outfit === 'default' ? role === 'elf' : a.outfit === 'outfit_ranger';
        const feminine = a.body === 'female';
        let art = poly(feminine ? '37,45 44,42 55,42 61,45 62,54 57,66 59,70 64,78 57,83 49,79 40,83 33,79 39,66 35,54' :
            '34,45 43,41 56,41 64,45 64,56 60,68 64,78 57,83 49,79 40,83 32,79 36,66 33,56', INK) +
            poly(feminine ? '38,47 44,44 54,44 59,47 59,54 54,66 57,71 61,77 56,79 49,75 40,80 36,77 42,66 38,54' :
                '35,47 44,44 55,44 61,47 60,57 57,69 61,77 56,79 49,75 40,80 35,77 39,66 36,55', c.cloth) +
            poly('39,47 44,46 45,57 42,69 40,77 36,77 40,63', c.clothLight) +
            poly('55,46 60,48 57,61 56,68 60,76 56,78 52,66', c.clothDark) +
            poly('44,71 47,72 47,76 42,79 41,78', c.clothDeep);
        if (armored) {
            art += poly('35,47 43,43 56,43 63,47 61,60 57,67 42,67 35,59', c.steelDeep) +
                poly('38,47 44,45 55,45 60,48 58,58 54,64 44,63 38,58', c.steel) +
                poly('38,48 43,46 47,47 49,52 44,55 39,53', c.steelLight) +
                poly('39,48 43,47 46,48 46,50 40,51', c.steelHigh) +
                poly('50,51 55,46 59,48 57,53 52,55', '#a4bac9') +
                poly('50,54 52,56 57,54 56,60 53,63 50,63', c.steelDark) +
                poly('40,55 45,57 48,56 47,62 43,61', '#9fabb7') +
                rect(39, 55, 1, 4, c.steelHigh) + rect(57, 50, 1, 3, c.steelLight) +
                poly('46,50 50,49 54,51 54,58 50,62 46,58', c.goldDark) +
                poly('47,51 50,50 53,52 53,57 50,60 47,57', '#793a53') +
                poly('49,52 50,53 52,52 51,55 52,57 50,58 49,56 48,57 48,55 50,55', GOLD) +
                rect(49, 52, 1, 1, LIGHT) +
                poly('38,62 44,64 55,64 59,62 58,66 43,68 38,66', c.steelDeep) +
                poly('39,63 44,65 56,65 58,64 57,66 44,67 39,65', c.steelLight) +
                poly('34,73 44,73 45,83 39,87 31,82', INK) +
                poly('35,75 41,75 42,81 38,84 34,81', c.steel) +
                rect(35, 76, 6, 1, c.steelLight) + rect(35, 80, 6, 1, c.steelDark) +
                poly('54,73 63,73 67,81 60,86 54,82', INK) +
                poly('56,75 61,75 64,81 60,83 56,80', c.steelDark) +
                poly('56,75 60,75 61,78 56,77', c.steelLight) +
                poly('45,73 51,73 54,88 48,94 43,88', c.clothDeep) +
                poly('47,75 50,75 52,87 48,91 45,87', c.cloth) + rect(48, 79, 1, 8, GOLD);
        } else if (robe) {
            art += poly('37,63 59,63 64,78 67,95 57,99 49,94 41,99 29,95 33,79', INK) +
                poly('39,65 56,65 60,78 63,93 56,96 49,91 41,96 33,93 36,79', c.clothDeep) +
                poly('40,67 44,68 42,83 42,92 37,94 35,91 38,77', c.clothLight) +
                poly('53,67 56,67 59,83 61,92 57,94 54,89', c.clothDark) +
                poly('46,68 50,68 52,86 49,90 45,87', c.cloth) +
                poly('37,90 42,92 48,87 49,90 42,96 34,93 34,91', GOLD) +
                poly('50,90 56,94 62,91 63,94 56,97 49,93', GOLD) +
                rect(37, 91, 3, 1, LIGHT) + rect(58, 93, 3, 1, LIGHT) +
                poly('36,46 43,42 50,48 56,42 63,45 65,50 54,57 50,54 44,57 34,51', INK) +
                poly('38,46 43,44 49,49 50,52 44,54 37,50', c.clothDeep) +
                poly('54,47 57,44 62,46 62,49 54,54 51,52', c.clothDeep) +
                poly('37,47 43,46 48,50 47,52 43,49 38,49', GOLD) +
                poly('53,50 58,47 61,47 61,49 54,53', GOLD) +
                poly('47,50 51,49 54,52 51,59 47,56', c.goldDark) +
                poly('49,51 51,51 52,53 50,56 48,54', '#71ccb5') + rect(49, 51, 1, 2, '#dcf4c8') +
                rect(42, 56, 1, 9, GOLD) + rect(55, 55, 1, 10, GOLD) +
                poly('47,76 50,73 53,77 50,82', GOLD) + poly('49,77 50,75 51,77 50,80', '#b0e8d2') +
                rect(49, 84, 2, 3, GOLD) +
                poly('33,68 41,66 44,77 36,80 32,77', INK) +
                poly('34,69 39,68 42,76 37,78 34,76', '#714750') +
                poly('35,70 38,69 40,75 37,76', '#ede0b9') + rect(36, 71, 1, 4, '#bcac8b');
        } else if (ranger) {
            art += poly('37,47 43,43 49,49 56,44 61,47 60,59 55,66 43,66 36,59', c.leatherDark) +
                poly('39,48 43,46 48,52 55,47 58,49 56,58 52,62 44,62 39,57', c.leather) +
                poly('39,48 43,47 47,52 47,55 41,54', c.leatherLight) +
                poly('51,52 55,48 57,49 54,55 51,57', '#98774e') +
                rect(44, 57, 1, 4, '#c6aa76') + rect(48, 58, 1, 4, '#c6aa76') +
                poly('35,46 39,44 59,65 58,69 54,67', c.leatherDark) +
                poly('37,46 39,46 58,65 56,66', c.leatherLight) +
                rect(45, 54, 4, 5, GOLD) + rect(46, 55, 2, 3, c.leatherDark) +
                poly('44,72 53,71 57,85 49,94 40,87', INK) +
                poly('45,74 51,74 54,84 49,90 43,85', c.clothDark) +
                poly('48,77 51,79 51,84 48,88 45,84 46,81', '#9baf76') +
                poly('48,79 49,79 49,85 47,86', '#d0d59c') +
                poly('34,71 41,70 42,78 37,83 32,78', c.leatherDark) +
                poly('35,72 39,72 40,77 36,79 34,77', c.leatherLight) + rect(36, 74, 2, 2, GOLD);
        } else {
            art += poly('35,48 43,43 55,44 62,48 60,60 55,65 42,65 36,60', c.steelDeep) +
                poly('38,49 44,46 54,47 59,49 57,57 53,62 44,61 39,57', c.steel) +
                poly('39,49 44,47 47,50 48,53 44,55 40,53', c.steelLight) +
                poly('40,49 44,48 46,50 43,52 40,51', c.steelHigh) +
                poly('49,52 55,48 58,50 55,54 51,56', '#b0c3cf') +
                poly('50,57 56,56 53,61 46,60 43,57', c.steelDark) +
                rect(40, 55, 2, 4, c.steelLight) + rect(46, 58, 3, 1, '#b2c3ce') +
                poly('36,46 40,44 43,46 40,59 40,67 36,67 37,57', c.leatherDark) +
                poly('37,47 39,46 40,47 38,59 39,65 37,65', c.leatherLight) +
                poly('54,45 57,45 60,62 57,68 54,65 56,60', c.leatherDark) +
                poly('55,46 56,46 58,61 56,65 56,59', c.leatherLight) +
                rect(37, 51, 4, 4, GOLD) + rect(38, 52, 2, 2, c.leatherDark) +
                rect(55, 54, 4, 4, GOLD) + rect(56, 55, 2, 2, c.leatherDark) +
                poly('48,47 52,47 53,50 50,53 47,50', c.goldDark) +
                poly('49,48 51,48 51,50 50,51 49,50', LIGHT) +
                poly('33,72 42,71 45,79 43,87 34,87 30,82', INK) +
                poly('34,74 41,73 43,79 41,84 35,84 33,80', c.leather) +
                poly('34,74 41,74 42,78 35,79 33,77', c.leatherLight) +
                rect(37, 78, 4, 4, c.goldDark) + rect(38, 78, 2, 3, GOLD);
        }
        if (a.outfit === 'outfit_knight') art +=
            poly('38,47 42,47 48,54 51,54 58,47 61,47 55,56 50,60 44,56', GOLD) +
            poly('48,54 51,53 53,56 50,61 47,57', c.steelDeep) +
            poly('49,55 51,55 52,57 50,59 48,57', '#72d9c5') + rect(49, 55, 1, 2, '#dcfff0');
        if (a.outfit === 'outfit_arcane') art +=
            poly('37,82 40,79 43,82 40,86', GOLD) + poly('55,82 58,79 61,82 58,86', GOLD) +
            rect(39, 81, 2, 3, '#a3e6dd') + rect(57, 81, 2, 3, '#a3e6dd');
        if (a.outfit === 'outfit_ranger') art +=
            poly('56,46 59,47 42,67 38,67', c.leatherDark) +
            poly('56,48 57,48 41,65 40,65', c.leatherLight) + rect(51, 53, 3, 4, GOLD);
        // A fitted waist and smaller shoulder plates give the female rig its own silhouette.
        if (feminine) art += poly('39,60 42,63 44,67 41,69 39,66', c.clothDeep) +
            poly('56,60 58,59 56,66 58,69 54,68 53,65', c.clothDeep);
        art += poly('35,67 42,68 59,67 62,69 61,74 43,75 35,73', INK) +
            poly('37,69 44,70 59,69 60,70 59,72 43,73 37,71', c.leather) +
            rect(38, 69, 7, 1, c.leatherLight) + rect(54, 69, 5, 1, c.leatherLight) +
            rect(46, 68, 7, 6, c.goldDark) + rect(46, 68, 6, 5, GOLD) +
            rect(47, 69, 4, 3, c.leatherDark) + rect(48, 70, 4, 1, LIGHT) +
            rect(55, 70, 1, 1, GOLD) + rect(58, 70, 1, 1, GOLD);
        return group('char-torso', feminine ? `<g transform="translate(3.92 0) scale(.92 1)">${art}</g>` : art);
    }


    function backHair(c, a, role) {
        if (a.hairStyle === 'short') return '';
        if (a.hairStyle === 'ponytail') {
            // A hooded character ties the ponytail at the nape, beneath the hood.
            if (role === 'mage') return hairLayer('char-hair-tail char-hair-tail-low',
                path('M38 34Q28 32 28 42Q30 53 25 59Q34 58 35 51Q33 42 39 39Z', c.hairDark) +
                path('M36 36Q29 37 30 44Q32 52 28 57Q33 54 32 48Q31 40 37 38Z', c.hair) +
                path('M34 38Q30 40 32 47Q33 52 30 55', 'none', `stroke="${c.hairLight}" stroke-width="1.2" stroke-linecap="round"`));
            return hairLayer('char-hair-tail',
                path('M38 20Q30 16 26 23Q22 29 25 37Q29 47 22 53Q31 52 34 43Q35 39 32 31Q31 26 38 25Z', c.hairDark) +
                path('M35 21Q28 20 27 27Q25 31 28 38Q31 46 26 50Q33 46 31 38Q27 29 32 25L36 24Z', c.hair) +
                path('M31 23Q26 28 29 36Q32 43 29 47', 'none', `stroke="${c.hairLight}" stroke-width="1.6" stroke-linecap="round"`) +
                path('M31 23Q28 25 28 29', 'none', `stroke="${c.hairHigh}" stroke-width=".6" stroke-linecap="round"`) +
                path('M34 20L38 21L38 24L35 25L33 23Z', GOLD) + path('M34 21L37 22', 'none', `stroke="${LIGHT}" stroke-width=".8"`));
        }
        if (a.hairStyle === 'braids') return hairLayer('char-hair-tail',
            path('M37 23Q37 15 49 14Q61 13 64 24L64 33Q63 40 59 43L39 42Q33 35 37 23Z', c.hairDark) +
            path('M39 24Q40 17 49 17Q59 16 61 25L62 33L58 39L41 39Q36 33 39 24Z', c.hair));
        return hairLayer('char-hair-tail',
            path('M34 24Q35 13 48 12Q63 10 65 24Q64 38 67 49Q68 57 62 61L60 58Q57 62 52 60Q46 63 42 58Q36 64 31 57Q34 49 32 40Q31 30 34 24Z', c.hairDark) +
            path('M36 25Q38 15 49 15Q60 13 62 25Q60 37 64 48Q66 56 62 58Q60 56 60 53Q56 60 51 57Q47 60 42 55Q38 61 34 56Q37 48 35 39Q33 31 36 25Z', c.hair) +
            path('M39 21Q35 29 37 39Q39 47 36 55Q41 51 39 42Q37 33 40 25Z', c.hairLight) +
            path('M61 27Q59 39 63 48Q65 55 61 58Q63 54 60 49Q57 39 60 29Z', c.hairLight) +
            path('M44 27Q40 39 43 52M55 28Q53 40 57 53', 'none', `stroke="${c.hairDark}" stroke-width="1.2" stroke-linecap="round"`));
    }

    // Locks start at the temples and fall over the clothes, with separate near/far braids.
    function frontHair(c, a) {
        if (a.hairStyle === 'braids') {
            const braid = (x, y, far) => {
                let art = path(`M${x + 1} ${y}Q${x + 5} ${y - 1} ${x + 5} ${y + 4}L${x + 3.5} ${y + 22}L${x} ${y + 22}L${x - 1} ${y + 7}Q${x - 2} ${y + 3} ${x + 1} ${y}Z`, c.hairDark);
                for (let i = 0; i < 5; i++) {
                    const top = y + 1 + i * 4;
                    const side = x + (i % 2 ? -.4 : .4);
                    art += path(`M${side + 1} ${top}Q${side + 4.5} ${top + .5} ${side + 3.8} ${top + 2.5}L${side + 1} ${top + 4.5}Q${side - 1} ${top + 3} ${side} ${top + 1.5}Z`, c.hair) +
                        path(`M${side + .7} ${top + .8}Q${side + 2.3} ${top + 1} ${side + 3} ${top + 2}L${side + 1} ${top + 3.5}Q${side} ${top + 2.5} ${side + .7} ${top + .8}Z`, far ? c.hairLight : mix(c.hairLight, c.hairHigh, .3));
                }
                return art + path(`M${x} ${y + 21}L${x + 3.5} ${y + 21.5}L${x + 3.3} ${y + 23}L${x} ${y + 22.5}Z`, GOLD) +
                    path(`M${x + .5} ${y + 23}L${x + 3} ${y + 23}L${x + 3.5} ${y + 26}Q${x + .5} ${y + 25.5} ${x - .5} ${y + 26}Z`, c.hair);
            };
            return hairLayer('char-hair-lock char-hair-lock-far', braid(61, 33, true)) +
                hairLayer('char-hair-lock char-hair-lock-near', braid(37.5, 33, false));
        }
        if (a.hairStyle !== 'long') return '';
        return hairLayer('char-hair-lock char-hair-lock-near',
            path('M38 27Q42 26 42 32Q42 39 39 47Q37 53 42 58Q38 59 35 55Q32 51 35 43Q37 36 36 31Z', c.hairDark) +
            path('M39 28Q41 33 39 40Q35 50 37 54L40 57Q34 53 36 46Q39 36 38 31Z', c.hair) +
            path('M38.5 32Q39 37 37 43Q34.5 50 37 54', 'none', `stroke="${c.hairLight}" stroke-width="1.1" stroke-linecap="round"`)) +
            hairLayer('char-hair-lock char-hair-lock-far',
                path('M61.5 27Q65 28 64 36Q62 44 64 49Q66 55 61 59Q62 54 60 49Q58 44 61 36Z', c.hairDark) +
                path('M62.5 30Q64 34 62 40Q60 46 63 51Q64 54 62 57Q63 54 61 50Q59 45 61 40Z', c.hair) +
                path('M62.6 34Q62.5 39 61.5 42Q60.5 46 62 49', 'none', `stroke="${c.hairLight}" stroke-width=".8" stroke-linecap="round"`));
    }

    // Each cut has its own hairline and direction of growth, including under headgear.
    function crownHair(c, a) {
        const strand = d => path(d, 'none', `stroke="${c.hairLight}" stroke-width=".7" stroke-linecap="round"`);
        if (a.hairStyle === 'short') return hairLayer('char-hair-crown',
            path('M38 29Q34 23 37 18Q40 12 49 12Q59 11 62 18Q64 21 62 25Q58 24 55 20Q50 25 43 24L41.5 23Q40 26 41 30L39 32Z', c.hairDark) +
            path('M37.5 23Q38 17 45 15Q52 13 56 15Q53 19 47 22L43 23L40 22Q38 24 39.5 29Q37 27 37.5 23Z', c.hair) +
            path('M40 20Q43 15 52 15Q47 17 44 20L40 22Z', c.hairLight) +
            path('M50 21Q54 17 56 15Q61 17 62 22Q58 21 55.5 18.5Q53 21 48 23Z', c.hair) +
            strand('M40 18Q44 14.5 49 15M47 21Q51 19 53 17M58 18Q60 19 61 21'));
        if (a.hairStyle === 'ponytail') return hairLayer('char-hair-crown',
            path('M37 27Q34 18 42 14Q49 10 57 14Q65 17 62 26L59.5 23Q57 19 53 19Q46 19 42 24L41 29L39.5 32L38 29Z', c.hairDark) +
            path('M38 24Q37 18 44 15Q53 11 59 18Q60 20 60 22Q57 17 52 17Q44 18 39 26L39 29Z', c.hair) +
            path('M39 21Q43 14 50 14Q46 16 43 18L39 23Z', c.hairLight) +
            strand('M41 21Q46 15 52 15M39 20Q40 17 44 16M54 15Q58 16 60 20') +
            path('M44 21Q41 25 42 30Q42.5 32 41 33Q41.5 30 40.5 29Q39.5 25 42 23Z', c.hair) +
            path('M59 22Q61.5 24 61 28L60.3 30Q60.8 26 59 24Z', c.hair));
        if (a.hairStyle === 'braids') return hairLayer('char-hair-crown',
            path('M36 28Q33 20 41 14Q46 11 52 13Q59 11 63 19Q66 25 63 34L61 35L61 26Q56 23 52 18Q47 23 42 25L40.5 33L38 35Z', c.hairDark) +
            path('M37.5 27Q35.5 20 43 15Q48 12 51 14Q49 19 42 23Q38.5 26 39.5 31L38.5 33Z', c.hair) +
            path('M53 14Q60 13 62 22Q64 27 62 32L62 26Q57 21 53 17Z', c.hair) +
            path('M38.5 23Q40 17 46 15L49 14Q47 17 42 20Z', c.hairLight) +
            path('M54 15Q59 15 61 21Q57 19 54 15Z', c.hairLight) +
            strand('M40 24Q46 21 49 17M55 18Q59 22 61.5 24M39 27L40 30M62 28L62 31'));
        return hairLayer('char-hair-crown',
            path('M36 34Q31 26 35 19Q38 12 48 11Q54 10 58 14Q65 16 65 25Q65 32 62 36Q61 30 62 26Q61 21 56 19Q53 23 43 26Q39 28 39 35L37 38Z', c.hairDark) +
            path('M37 32Q34 26 36 21Q38 14 47 13Q52 11.5 54 14Q51 20 42 24Q38 26 37.5 34Z', c.hair) +
            path('M37 24Q39 15 48 14L51 13.5Q49 16 44 19Q40 21 37 26Z', c.hairLight) +
            path('M42 24Q50 20 53 15Q52 21 46 24L41 26Z', c.hairLight) +
            path('M56 15Q62 17 63 24L62.5 31L63 34Q62 32 61 28Q63 23 58 20L55 18Z', c.hair) +
            strand('M39 21Q41 16.5 47 15M38 28Q39 25 43 23M58 17Q61 19 62 23'));
    }

    function face(c, role, a) {
        const feminine = a.body === 'female';
        const light = mix(c.skin, '#ffe9d0', .2);
        const soft = mix(c.skin, '#ffe1bd', .1);
        const shadow = mix(c.skin, '#75434a', .23);
        const deep = mix(c.skin, '#462e3c', .44);
        const contour = mix(c.skin, '#302435', .65);
        const brow = mix(c.hairDark, '#3d292b', .3);
        const lip = mix(c.skin, '#8e4652', feminine ? .42 : .24);
        const iris = { hero: '#517886', mage: '#776590', knight: '#8d733c', elf: '#497559' }[role];
        // The neck disappears into the collar; no skin-coloured ring around the shoulders.
        let art = path(feminine ? 'M47 35H54V41L56 44Q51 46 45 43L47 40Z' :
            'M45 35H55V41L58 44Q51 46 43 43L46 40Z', shadow) +
            path('M50 38L54 37V41L56 43L51 44L49 42Z', c.skin) +
            path('M44 41L48 43Q52 45 57 42L59 44L52 48L43 45Z', c.clothDeep) +
            path('M44 42L48 44L52 46L57 43', 'none', `stroke="${c.leatherLight}" stroke-width=".8" stroke-linejoin="round"`) +
            path(feminine ? 'M41.5 24Q42 18 50 17Q57 16 61 22L61 27Q61.7 29 61.3 31Q61.2 33.2 60.5 35Q59 38 54 40.5Q52 41.5 50 40L46 37Q43 35 42 31Z' :
                'M41.5 24Q42 18 50 17Q58 16 61.5 22L61.5 27Q62 29 61.8 31Q61.7 33.2 61 35.5L58 39L53 41L49 40L45 37L42 31Z', c.skin,
                `stroke="${contour}" stroke-width=".8" stroke-linejoin="round"`) +
            // One coherent light plane and one jaw shadow replace the concentric facets.
            path('M43 23Q47 18 52 19Q57 19 59 23L58 26Q54 25 52 26Q47 24 44 28Z', soft) +
            path(feminine ? 'M42 26L44 30Q44 34 47 36L51 39Q53 41 56 39.5L54 40.5Q52 41.5 50 40L46 37Q43 35 42 31Z' :
                'M42 26L44 30L44.5 34L47 37L51 39L56 39.5L53 41L49 40L45 37L42 31Z', shadow) +
            path('M59 23L61 25L60.8 28Q61.4 29.6 61.2 31.3L60.5 33L60 35L58 37L58.5 33L58 30Z', shadow) +
            path('M45 31Q48 30 51.5 31.5L50 33.7Q46.5 34 45 32Z', soft) +
            // A short bridge and a small nostril give the nose a readable profile.
            path('M55 27.5Q55 30.5 54.5 31.5Q54.4 32.5 56.3 32.8L58.2 32.5', 'none',
                `stroke="${shadow}" stroke-width=".7" stroke-linecap="round"`) +
            path('M55.9 29L56.8 31L58 31.7Q56.7 32.5 55.7 31.8Z', light) +
            path('M56.3 32.7Q57 32.3 57.6 32.5', 'none', `stroke="${deep}" stroke-width=".5" stroke-linecap="round"`) +
            // Brows taper towards the temples and follow the same perspective as the eyes.
            path(feminine ? 'M45.3 25.5Q48.2 23.9 51.7 25.7L51.5 26.3Q48.1 25.1 45.3 26.1Z' :
                'M45.2 25.1Q48 23.8 51.9 25.5L51.7 26.5Q48.1 25.4 45.3 26.3Z', brow) +
            path(feminine ? 'M57 25.7Q59 24.7 60.5 25.8L60.7 26.3Q58.9 25.7 57.2 26.3Z' :
                'M56.9 25.7Q59 24.3 60.5 25.5L60.8 26.5Q59.1 25.8 57.1 26.7Z', brow);

        const eye = far => {
            const whites = mix(c.skin, '#fff8e6', .8);
            const eyeShape = far ? 'M57 28.2Q58.7 26.8 60.5 28Q59.5 30 57.2 29.4Z' :
                feminine ? 'M45.5 28.2Q48.3 26.5 51.8 28.1Q49.3 30.6 46.3 29.6Z' :
                    'M45.7 28.1Q48.3 26.8 51.7 28.1Q49.4 30.3 46.5 29.5Z';
            const cx = far ? 58.8 : 49.1;
            const cy = far ? 28.45 : 28.55;
            return group('char-eye',
                path(eyeShape, whites) +
                ellipse(cx, cy, far ? .95 : 1.25, far ? 1.05 : 1.2, mix(iris, '#172a30', .35)) +
                ellipse(cx, cy + .15, far ? .65 : .88, far ? .8 : .95, iris) +
                ellipse(cx + .1, cy, far ? .36 : .48, .84, '#202633') +
                ellipse(cx - .35, cy - .35, .28, .3, '#fff8df') +
                path(far ? 'M56.9 28.2Q58.7 26.6 60.6 28.1' : 'M45.5 28.2Q48.3 26.4 51.8 28.1', 'none',
                    `stroke="${feminine ? brow : contour}" stroke-width="${feminine ? .7 : .55}" stroke-linecap="round"`) +
                path(far ? 'M57.5 29.5Q59.2 30 60.1 28.9' : 'M46.4 29.6Q49.2 30.6 51 29', 'none',
                    `stroke="${shadow}" stroke-width=".4" stroke-linecap="round"`) +
                (feminine ? path(far ? 'M60 27.7L60.7 27.2L60.4 28.2Z' : 'M45.8 28.3L44.9 27.3L47 27.8Z', brow) : ''));
        };
        art += group('char-eyes', eye(false) + eye(true));
        if (feminine) art +=
            path('M46 32.3Q48.3 31.8 50.5 32.5Q48.5 33.8 46.4 33.1Z', mix(c.skin, '#c87a75', .13)) +
            path('M51.1 35.5Q52.7 35.2 53.8 35.5Q55.2 35 57.6 35.1Q55.5 37 53.4 36.8Z', lip) +
            path('M52.5 36.3Q54.4 37 56.2 35.9', 'none', `stroke="${mix(c.skin, '#f0b2a3', .33)}" stroke-width=".45"`);
        // A slight lift at the far corner reads as a relaxed, attentive expression.
        art += path('M51.5 35.6Q54.5 36.3 57.5 35.2', 'none', `stroke="${feminine ? mix(lip, '#633d42', .25) : deep}" stroke-width="${feminine ? .5 : .6}" stroke-linecap="round"`) +
            path('M52.7 38Q54.7 38.5 56.2 37.8', 'none', `stroke="${soft}" stroke-width=".8" stroke-linecap="round"`) +
            path('M41.8 28Q38.5 26.2 39.4 30.6Q40.4 33.6 42.6 33.1L43 30.5Z', c.skin,
                `stroke="${contour}" stroke-width=".65"`) +
            path('M40.5 29Q42 28.5 41.6 31.2L40.9 30.8', 'none', `stroke="${shadow}" stroke-width=".65" stroke-linecap="round"`);
        if (feminine) art += ellipse(41.3, 33.3, .65, .9, GOLD) + ellipse(41.1, 33, .24, .3, LIGHT);
        if (role === 'elf') art += path('M41.5 28.8Q38 27.6 33.8 25.4Q35.7 31.7 41.3 33.4L43 31.3Z', c.skin,
            `stroke="${contour}" stroke-width=".7"`) +
            path('M36.2 28Q38.2 29 41.3 30L41.6 31.9Q38.6 31.1 36.2 28Z', shadow) +
            path('M36 27.2L40.9 29.4', 'none', `stroke="${light}" stroke-width=".6" stroke-linecap="round"`);
        return `<g class="char-face char-face-${a.body}" shape-rendering="geometricPrecision">${art}</g>`;
    }

    function head(c, role, a) {
        const feminine = a.body === 'female';
        let content = face(c, role, a) + crownHair(c, a);
        if (role === 'mage') {
            // A deep hood, open around the face so skin and hairstyle remain visible.
            content += poly('29,39 31,26 36,15 46,4 53,3 61,11 68,24 71,40 65,47 59,46 57,43 63,39 65,31 63,22 59,17 53,14 46,15 40,21 37,30 38,37 43,43 40,47 33,44', INK) +
                poly('32,39 34,27 39,16 47,7 52,6 58,12 65,25 68,39 64,44 60,44 65,38 67,30 65,21 60,15 53,11 45,13 38,20 35,30 36,38 41,43 39,44', c.clothDeep) +
                poly('33,33 36,23 41,15 48,8 51,7 47,12 42,17 38,25 35,36', c.cloth) +
                poly('55,7 59,12 65,25 67,35 64,30 61,21 57,14', c.clothDark) +
                poly('35,30 38,20 45,13 53,11 60,15 65,21 67,30 65,38 60,44 64,44 68,40 65,46 60,46 57,43 63,38 65,30 63,22 59,17 53,14 46,16 40,22 37,30 38,37 43,43 40,47 34,42 32,38 36,41 40,44 41,43 36,38', GOLD) +
                poly('36,28 39,21 46,14 51,13 46,15 40,22 37,29', LIGHT) +
                poly('47,9 50,7 52,7 49,10 48,13 46,14', GOLD) +
                rect(34, 34, 1, 3, c.clothLight) + rect(66, 34, 1, 2, c.goldDark);
            if (!feminine) content += hairLayer('char-beard',
                path('M43.5 33Q45.5 36 49 38Q53 40 56 38.5Q59 37 61 34.5Q60.4 40 57 43L54 45.5L52 44.5L50 45Q45 41 44 36Z', c.hairDark) +
                path('M46 37Q49 40 53 40Q57 40.5 59 37.5Q58 41.5 54 44L51.5 43.4L48 40.5Z', c.hair) +
                path('M51.5 34.9Q53.1 34.2 54.3 34.7Q55.7 34.1 57.4 34.7L58 35.7L55.2 35.2L54.3 35.5L53.3 35.2L51 35.7Z', c.hair) +
                path('M48 39Q49.5 41 51 41.9M52.5 40.8L53.3 43.4M55.4 41.1L56.5 40', 'none', `stroke="${c.hairLight}" stroke-width=".7" stroke-linecap="round"`));
        }
        if (role === 'hero') content += `<g class="char-headgear" transform="translate(0 -2)">${
            poly('35,23 36,16 41,10 55,9 62,13 65,21 61,24 58,20 44,21 41,25 40,32 36,31', INK) +
            poly('38,22 39,17 43,13 54,12 60,15 62,20 58,18 43,19 39,24 39,29 37,28', '#4e5b70') +
            poly('40,17 44,13 51,13 53,15 52,17 44,18', '#8f9cac') +
            poly('43,14 47,13 49,13 49,15 44,16', '#cdd7d9') +
            rect(40, 20, 21, 2, '#b3a06f') + rect(44, 19, 10, 1, LIGHT) +
            rect(45, 14, 2, 6, '#c3b288') + rect(54, 14, 2, 6, '#4a4e5c') +
            poly('44,12 45,6 49,2 54,2 59,7 60,12 56,15 53,9 50,7 48,12', INK) +
            poly('46,11 47,7 50,4 53,4 57,8 58,11 56,12 53,7 50,6 48,9 48,11', GOLD) +
            rect(49, 5, 3, 1, LIGHT) + rect(49, 10, 5, 2, c.steelLight) + rect(37, 24, 2, 4, '#7e8998') +
            rect(41, 17, 3, 1, c.steelHigh) + rect(56, 17, 3, 1, c.steelDark) +
            rect(42, 21, 1, 2, c.goldDark) + rect(58, 21, 1, 2, c.goldDark)}</g>`;
        if (role === 'knight') content += `<g class="char-headgear" transform="translate(0 -2)">${
            poly('34,26 35,16 41,10 54,8 61,12 65,19 65,28 62,27 61,22 43,23 43,32 39,39 34,35', INK) +
            poly('38,22 39,16 44,12 54,11 59,14 61,19 58,18 42,19 40,26 37,30', c.steelDark) +
            poly('40,18 43,13 51,11 54,13 54,18', c.steelLight) + rect(43, 18, 17, 2, c.steel) +
            rect(45, 13, 2, 5, '#f0f4e8') + rect(55, 14, 3, 4, '#6b8298') +
            poly('36,23 41,22 41,30 38,35 36,34', c.steel) + rect(36, 24, 1, 9, c.steelLight) +
            rect(37, 30, 1, 3, '#374157') + rect(39, 28, 1, 3, '#374157') +
            rect(39, 21, 25, 2, GOLD) + rect(49, 14, 2, 9, GOLD) + rect(49, 14, 1, 7, LIGHT) +
            rect(63, 23, 2, 4, GOLD) +
            group('char-plume',
                poly('50,12 46,8 42,7 37,10 34,16 33,23 30,29 23,30 27,22 27,14 31,6 37,2 44,1 51,4 55,9 55,13', INK) +
                poly('50,10 45,6 40,5 35,9 32,16 31,24 27,27 29,20 29,14 33,7 38,4 43,3 49,6 52,10', '#a14760') +
                poly('31,13 34,7 39,4 44,4 48,6 42,6 38,7 35,11 33,16', '#e0988e') +
                poly('42,7 46,9 49,12 52,12 52,10 46,6', '#bc6476') +
                poly('31,16 31,23 28,27 28,24 29,20', '#652f4b')) +
            rect(48, 10, 7, 3, c.goldDark) + rect(49, 10, 5, 2, GOLD) + rect(49, 10, 3, 1, LIGHT)}</g>`;
        if (role === 'elf') content +=
            poly('40,20 45,20 52,22 57,19 62,19 62,21 57,21 52,25 46,23 40,22', c.goldDark) +
            poly('41,20 45,20 52,23 57,20 61,19 61,20 57,21 52,24 46,22 41,21', GOLD) +
            poly('43,18 47,19 49,21 45,20', '#879b58') + poly('56,19 60,16 60,19 56,21', '#b2c67e') +
            poly('52,21 54,23 52,25 50,23', '#73b58a') + rect(52, 22, 1, 1, '#d6eaa1') +
            poly('36,22 32,16 32,10 37,13 40,19 39,23', '#364d44') +
            poly('36,21 34,16 34,13 37,16 38,21', '#9bad76') +
            rect(35, 16, 1, 4, '#d0d39b');
        if (a.accessory === 'acc_circlet') content +=
            poly('41,22 48,22 53,23 58,21 62,21 62,23 58,23 53,25 48,24 41,24', c.goldDark) +
            poly('41,22 48,22 53,23 58,21 62,21 62,22 58,22 53,24 48,23 41,23', GOLD) +
            poly('53,21 55,23 53,26 51,23', GOLD) + rect(52.5, 22, 1, 2, '#abf4db');
        return group('char-head', content);
    }

    function weapon(c, role, equipped) {
        const kind = String(equipped || (role === 'mage' ? 'staff' : role === 'elf' ? 'bow' : 'sword'));
        if (kind.includes('staff')) return group('char-weapon',
            poly('70,29 75,29 75,55 73,65 75,85 72,88 69,85 70,66 70,48', INK) +
            poly('72,31 73,31 73,53 71,66 73,84 72,86 71,84 72,65 71,51', c.leather) +
            rect(71, 35, 1, 17, c.leatherLight) + rect(72, 74, 1, 9, c.leatherLight) +
            poly('69,26 66,21 67,16 70,12 74,11 79,15 81,20 78,26 75,30', INK) +
            poly('69,25 68,21 69,16 72,13 75,13 78,16 79,20 77,24 74,28', c.goldDark) +
            poly('69,20 71,16 74,13 78,18 77,23 73,26 70,24', '#7066b7') +
            poly('70,19 73,15 74,15 73,21 70,23', '#d6d5ed') +
            poly('74,15 77,19 76,23 73,25 73,21', '#918cdb') +
            poly('71,20 73,18 75,21 73,24', '#bfc6fa') + rect(72, 16, 2, 2, '#fff4e1') +
            poly('67,18 68,22 71,26 74,27 77,24 78,21 80,19 79,25 75,30 70,28 66,23', GOLD) +
            poly('68,22 71,26 72,26 72,28 69,26', LIGHT) +
            rect(70, 31, 5, 3, c.goldDark) + rect(70, 31, 4, 1, LIGHT) +
            rect(70, 42, 4, 3, c.goldDark) + rect(71, 42, 2, 1, GOLD) +
            rect(70, 76, 4, 3, c.goldDark) + rect(70, 76, 3, 1, GOLD) +
            group('char-magic-glint', rect(63, 20, 2, 2, '#c7bde9') + rect(81, 13, 2, 2, '#ede4fb') + rect(78, 30, 1, 2, '#bda7e8')));
        if (kind.includes('bow')) return group('char-weapon',
            poly('73,29 77,30 78,35 83,41 85,49 83,55 77,62 77,74 82,81 82,87 78,93 73,96 72,93 76,88 76,83 71,75 71,63 78,53 79,48 77,42 73,37', INK) +
            poly('75,33 76,37 81,43 82,49 80,54 74,62 74,73 79,82 79,86 76,91 75,92 77,86 77,82 73,74 73,63 80,52 80,47 78,41 74,36', '#a57d50') +
            poly('76,38 79,42 81,47 81,50 78,56 76,58 79,52 80,48 78,43', '#e0c08a') +
            poly('74,75 78,82 78,86 76,89 77,85 77,82', '#d7b681') +
            poly('75,34 76,35 73,91 72,92', '#dacdaf') +
            rect(71, 62, 6, 12, c.leatherDark) + rect(72, 63, 4, 2, GOLD) + rect(72, 70, 4, 2, GOLD) +
            rect(64, 67, 26, 1, '#bba77d') + rect(70, 66, 20, 1, '#f5e6b6') +
            poly('89,63 96,67 89,70 90,67', c.steelDark) + poly('90,64 94,66 90,67', c.steelHigh) +
            poly('64,64 69,66 69,67 64,67 62,65', c.clothLight) +
            poly('64,68 69,68 65,70 62,69', c.clothDark));
        const enchanted = /fire|ice|magic|legend|flame/i.test(kind);
        const edge = enchanted ? '#baf3df' : '#e4e9df';
        return group('char-weapon',
            poly('73,17 77,24 77,58 75,63 70,63 68,59 69,25', INK) +
            poly('73,21 75,26 75,57 73,61 70,58 71,26', c.steelDark) +
            poly('73,22 73,58 72,60 70,57 71,27', edge) +
            poly('74,26 75,28 75,54 73,58 73,37', enchanted ? '#67b6b7' : '#9bafbd') +
            rect(71, 29, 1, 25, '#fffae6') + rect(73, 31, 1, 18, enchanted ? '#cdfce8' : '#b6cad0') +
            poly('65,60 68,61 73,62 77,61 81,59 83,62 81,65 76,65 73,67 68,65 64,65 63,63', INK) +
            poly('65,62 68,63 73,64 77,63 81,61 81,63 77,64 74,66 69,64 65,64', GOLD) +
            rect(65, 62, 3, 1, LIGHT) + rect(78, 62, 2, 1, LIGHT) +
            rect(70, 66, 6, 12, INK) + rect(71, 66, 4, 10, c.leatherDark) +
            rect(71, 67, 2, 2, c.leatherLight) + rect(72, 70, 3, 1, c.leatherLight) + rect(71, 73, 3, 1, c.leatherLight) +
            poly('71,76 75,76 77,79 74,82 70,81 69,78', c.goldDark) +
            poly('72,77 74,77 75,79 73,80 71,79', GOLD) + rect(72, 77, 1, 1, LIGHT));
    }


    function arm(c, role, a, front, avatar) {
        const armored = a.outfit === 'default' ? role === 'knight' : a.outfit === 'outfit_knight';
        const robe = a.outfit === 'default' ? role === 'mage' : a.outfit === 'outfit_arcane';
        const ranger = a.outfit === 'default' ? role === 'elf' : a.outfit === 'outfit_ranger';
        const x = front ? 61 : 28;
        const handX = a.body === 'female' ? (front ? 64 : 29) : (front ? 65 : 27);
        const mid = front ? c.cloth : c.clothDark;
        let art = poly(`${x + 1},44 ${x + 8},44 ${x + 12},50 ${x + 11},56 ${x + 8},60 ${x + 10},64 ${x + 6},69 ${x},65 ${x - 2},54 ${x - 1},48`, INK) +
            poly(`${x + 2},47 ${x + 7},47 ${x + 9},51 ${x + 8},56 ${x + 5},60 ${x + 7},64 ${x + 4},66 ${x + 1},62 ${x},53`, mid) +
            poly(`${x + 2},48 ${x + 5},47 ${x + 6},51 ${x + 3},55 ${x + 2},59 ${x},54`, front ? c.clothLight : c.cloth) +
            rect(x + 2, 49, 1, 4, c.clothHigh) +
            poly(`${x + 6},54 ${x + 8},53 ${x + 7},57 ${x + 4},60 ${x + 2},60`, c.clothDeep);
        if (armored || (!robe && !ranger)) {
            art += poly(`${x - 3},47 ${x},43 ${x + 6},41 ${x + 12},44 ${x + 15},49 ${x + 13},54 ${x + 5},56 ${x - 2},52`, INK) +
                poly(`${x - 1},47 ${x + 1},44 ${x + 6},43 ${x + 11},45 ${x + 13},49 ${x + 11},52 ${x + 5},53 ${x},51`, front ? c.steel : c.steelDark) +
                poly(`${x},47 ${x + 3},44 ${x + 6},44 ${x + 9},46 ${x + 7},49 ${x + 1},49`, c.steelLight) +
                poly(`${x + 1},46 ${x + 4},44 ${x + 6},44 ${x + 5},46`, c.steelHigh) +
                poly(`${x + 8},47 ${x + 12},48 ${x + 11},51 ${x + 6},52 ${x + 7},50`, c.steelDeep) +
                poly(`${x - 1},50 ${x + 5},52 ${x + 12},51 ${x + 12},53 ${x + 5},55 ${x - 1},52`, armored ? GOLD : c.steelDark) +
                rect(x + 1, 51, 2, 1, armored ? LIGHT : c.steelLight) +
                rect(x + 8, 52, 1, 1, LIGHT);
        }
        if (robe) art +=
            poly(`${x},47 ${x + 8},48 ${x + 8},56 ${x + 13},64 ${x + 8},70 ${x - 2},65 ${x},55`, INK) +
            poly(`${x + 2},49 ${x + 6},50 ${x + 6},57 ${x + 10},64 ${x + 7},67 ${x + 1},63 ${x + 3},55`, mid) +
            poly(`${x + 2},50 ${x + 4},50 ${x + 3},58 ${x + 3},63 ${x + 1},62`, c.clothLight) +
            poly(`${x},62 ${x + 8},66 ${x + 10},63 ${x + 12},65 ${x + 8},69 ${x - 1},65`, GOLD) +
            rect(x + 3, 63, 2, 1, LIGHT) + rect(x + 6, 60, 1, 3, c.clothHigh);
        if (ranger) art +=
            poly(`${x - 2},48 ${x + 2},43 ${x + 7},44 ${x + 12},48 ${x + 9},53 ${x + 4},51 ${x + 1},54`, c.leatherDark) +
            poly(`${x},48 ${x + 3},45 ${x + 6},46 ${x + 9},49 ${x + 7},50 ${x + 3},48 ${x + 2},51`, c.leatherLight) +
            poly(`${x + 2},46 ${x + 5},44 ${x + 7},46 ${x + 6},49 ${x + 3},49`, '#718558') +
            rect(x + 3, 45, 1, 3, '#c2c590');
        art += poly(`${x + 1},60 ${x + 8},60 ${x + 11},65 ${x + 7},69 ${x + 1},67 ${x - 1},64`, INK) +
            poly(`${x + 2},61 ${x + 7},61 ${x + 9},65 ${x + 6},67 ${x + 2},65`, armored ? c.steelDark : c.leather) +
            poly(`${x + 2},61 ${x + 4},61 ${x + 5},65 ${x + 2},64`, armored ? c.steelLight : c.leatherLight) +
            rect(x + 2, 60, 6, 1, GOLD) + rect(x + 3, 63, 5, 1, armored ? c.steel : c.leatherDark);
        if (a.outfit === 'outfit_knight') art +=
            poly(`${x - 2},47 ${x - 1},40 ${x + 2},44 ${x + 4},39 ${x + 6},44 ${x + 9},42 ${x + 10},48 ${x + 4},50`, c.goldDark) +
            poly(`${x},46 ${x + 1},43 ${x + 3},46 ${x + 4},42 ${x + 6},46 ${x + 8},44 ${x + 8},47 ${x + 4},48`, GOLD) +
            rect(x + 3, 46, 2, 1, LIGHT);
        // Keep equipment at its original size and reach while fitting the sleeves and pauldrons.
        if (a.body === 'female') art = `<g transform="translate(${front ? 6.92 : 6.08} 0) scale(.88 1)">${art}</g>`;
        if (front && avatar.equippedWeapon) art += weapon(c, role, avatar.equippedWeapon);
        art += poly(`${handX + 2},65 ${handX + 7},65 ${handX + 9},67 ${handX + 9},71 ${handX + 7},74 ${handX + 2},73 ${handX},70 ${handX},67`, INK) +
            poly(`${handX + 2},66 ${handX + 6},66 ${handX + 8},68 ${handX + 7},72 ${handX + 3},72 ${handX + 1},69`, front ? c.skin : c.skinDark) +
            poly(`${handX + 2},66 ${handX + 5},66 ${handX + 6},68 ${handX + 2},68`, c.skinLight) +
            rect(handX + 6, 69, 2, 1, c.skinDeep) + rect(handX + 5, 71, 2, 1, c.skinDark) +
            rect(handX + 1, 68, 1, 2, c.skinLight);
        if (!front && avatar.equippedShield) art += group('char-shield',
            poly('21,56 29,52 38,55 41,59 40,74 36,81 30,87 24,83 19,75 18,61', INK) +
            poly('22,58 29,55 37,58 38,61 37,73 34,79 30,83 25,79 22,73 21,62', c.goldDark) +
            poly('23,59 29,56 36,59 37,62 36,73 33,78 30,81 26,78 23,72 22,63', GOLD) +
            poly('25,61 30,58 34,60 35,63 34,72 31,77 29,78 26,74 24,68', c.clothDeep) +
            poly('25,62 29,60 29,76 26,73 25,68', c.cloth) +
            poly('30,60 33,61 34,65 33,71 31,75 30,76', c.clothDark) +
            poly('27,64 29,62 31,64 33,63 33,66 31,68 33,71 31,74 29,72 27,73 27,70 29,67 27,67', c.steelLight) +
            rect(28, 64, 1, 2, c.steelHigh) + rect(30, 69, 1, 3, GOLD) +
            poly('22,60 24,59 23,65 24,73 27,78 26,79 22,74 21,64', LIGHT) +
            rect(29, 56, 2, 1, LIGHT) + rect(35, 61, 1, 1, LIGHT) + rect(30, 79, 1, 1, LIGHT));
        return group(`char-arm char-arm-${front ? 'front' : 'back'}`, art);
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

    function classGear(c, role, a) {
        if (role !== 'elf' && a.outfit !== 'outfit_ranger') return '';
        return group('char-quiver',
            poly('24,43 34,40 43,59 34,69 29,62', INK) +
            poly('27,45 33,43 39,59 34,64 31,60', c.leatherDark) +
            poly('27,46 29,46 35,61 33,62 30,56', c.leatherLight) +
            poly('22,29 23,28 34,50 33,51', '#a89a78') +
            poly('28,26 29,26 37,48 36,49', '#a89a78') +
            poly('33,26 34,26 40,46 39,47', '#a89a78') +
            poly('20,25 23,27 25,31 22,30 20,28', '#c4d2b5') +
            poly('26,22 29,24 30,28 27,27 26,25', '#dfe0b9') +
            poly('31,22 34,24 35,28 32,27', '#9cac84') +
            poly('24,42 33,39 35,43 26,47', c.leatherLight) +
            rect(27, 44, 2, 2, GOLD));
    }

    function render(avatar = {}, options = {}) {
        avatar = avatar && typeof avatar === 'object' ? avatar : {};
        const a = normalizeAppearance(avatar.appearance);
        const c = colors(a);
        const role = ROLES.includes(avatar.avatarClass) ? avatar.avatarClass : 'hero';
        const armored = a.outfit === 'default' ? role === 'knight' : a.outfit === 'outfit_knight';
        let upper = classGear(c, role, a) + backHair(c, a, role) + arm(c, role, a, false, avatar) + torso(c, role, a) + frontHair(c, a) + head(c, role, a);
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
