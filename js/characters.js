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
        outfitColor: '#8256c6', outfit: 'default', accessory: 'none', headwear: 'default', beardStyle: 'default'
    });

    function normalizeAppearance(value) {
        const source = value && typeof value === 'object' ? value : {};
        const pick = (key, choices) => choices.includes(source[key]) ? source[key] : DEFAULT_APPEARANCE[key];
        const color = key => typeof source[key] === 'string' && /^#[0-9a-f]{6}$/i.test(source[key]) ? source[key].toLowerCase() : DEFAULT_APPEARANCE[key];
        return {
            body: pick('body', ['male', 'female']), skin: color('skin'),
            hairStyle: pick('hairStyle', ['short', 'long', 'ponytail', 'braids']),
            beardStyle: pick('beardStyle', ['default', 'none', 'short', 'goatee', 'long', 'braided']),
            hairColor: color('hairColor'), outfitColor: color('outfitColor'),
            outfit: pick('outfit', ['default', 'outfit_ranger', 'outfit_knight', 'outfit_arcane']),
            accessory: pick('accessory', ['none', 'acc_scarf', 'acc_circlet', 'acc_cape']),
            headwear: pick('headwear', ['default', 'none', 'headwear_guardian', 'headwear_winged', 'headwear_arcane'])
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
            if ((a.headwear === 'default' && role === 'mage') || a.headwear === 'headwear_arcane') return hairLayer('char-hair-tail char-hair-tail-low',
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

    function classHeadwear(c, role) {
        let content = '';
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
        }
        if (role === 'hero') content += `<g class="char-headgear" transform="translate(0 -2)">${
            poly('35,23 36,16 41,10 55,9 62,13 65,21 61,24 58,20 44,21 41,25 40,32 36,31', INK) +
            poly('38,22 39,17 43,13 54,12 60,15 62,20 58,18 43,19 39,24 39,29 37,28', '#4e5b70') +
            poly('40,17 44,13 51,13 53,15 52,17 44,18', '#8f9cac') +
            poly('43,14 47,13 49,13 49,15 44,16', '#cdd7d9') +
            poly('39,20 44,19 56,19 62,21 60,22 55,21 44,21 39,22', c.goldDark) +
            poly('40,20 45,19 55,19 60,20 55,20 45,20 40,21', GOLD) +
            poly('48,11 51,10 54,12 54,18 51,19 49,18', c.steelDark) +
            poly('49,12 51,11 52,12 52,18 50,18', c.steelLight) +
            rect(50, 12, 1, 5, c.steelHigh) + rect(37, 24, 2, 4, '#7e8998') +
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
        return content;
    }

    function purchasedHeadwear(c, style) {
        // An open hood leaves the hairline and facial features uncovered.
        if (style === 'headwear_arcane') return poly('31,39 32,25 38,14 49,4 55,7 63,16 68,29 68,40 62,46 59,42 63,37 63,26 58,19 52,15 44,18 39,26 38,37 42,43 37,46', INK) +
            poly('34,37 35,25 40,16 49,7 54,10 61,18 65,29 65,39 62,42 64,35 62,25 58,18 52,13 44,16 38,25 36,36 39,42 37,42', '#514476') +
            poly('36,29 39,20 45,13 49,9 48,14 42,20 39,29 38,36 36,38', '#83719e') +
            poly('54,10 60,18 64,29 64,35 61,27 57,20 52,15', '#3a325a') +
            path('M38 39L37 35L39 25L44 18L52 14L58 19L63 27L64 36L61 42', 'none', 'stroke="#c3a26b" stroke-width="1.2" stroke-linejoin="round"') +
            poly('49,10 52,12 51,16 48,14', c.goldDark) +
            poly('49,11 51,12 50,14 49,13', '#9ce1d9') + rect(49, 11, 1, 1, '#e5fff0');
        const winged = style === 'headwear_winged';
        const metal = winged ? '#b5ad94' : c.steel;
        const light = winged ? '#f0e2b5' : c.steelLight;
        const dark = winged ? '#726d62' : c.steelDark;
        let art = poly('34,27 35,17 40,10 49,7 57,9 63,15 66,23 63,27 61,23 44,22 42,29 40,35 35,33', INK) +
            poly('37,25 38,17 43,12 49,10 56,12 60,17 62,21 57,19 44,19 40,24 39,31 37,31', dark) +
            poly('40,17 44,12 49,10 52,12 50,18 43,19 39,22', metal) +
            poly('42,16 45,12 48,11 47,16 42,18', light) +
            poly('53,12 57,13 60,18 57,17 53,18', metal) +
            poly('49,10 51,9 54,12 53,19 51,21 49,19', dark) +
            poly('50,11 51,10 52,12 51,19 50,18', light) +
            poly('39,21 44,19 56,19 63,22 62,24 56,21 45,21 40,23', winged ? GOLD : c.steelDeep) +
            poly('40,21 45,20 55,20 60,22 55,21 45,21 40,22', winged ? LIGHT : c.steelLight) +
            poly('36,25 40,23 40,28 38,33 36,31', metal) + rect(37, 26, 1, 4, light) +
            ellipse(39, 23, .7, .7, winged ? GOLD : c.steelHigh);
        if (winged) art +=
            poly('38,23 33,23 28,18 26,10 30,11 29,5 33,7 39,15 40,21', INK) +
            poly('37,21 33,21 30,17 29,13 32,15 31,9 34,12 38,17', light) +
            poly('33,20 31,17 33,18 35,18 33,13 37,18 38,21', '#b8a875') +
            poly('60,17 63,10 68,6 68,12 71,10 70,18 66,22 63,22', INK) +
            poly('63,17 65,12 66,10 66,16 68,14 68,18 65,20 63,20', light) +
            poly('50,17 53,20 51,24 48,21', c.goldDark) +
            poly('50,18 52,20 51,22 49,21', '#6baaaa') + rect(50, 19, 1, 1, '#d7ffeb');
        return art;
    }

    function beard(c, role, a) {
        const style = a.beardStyle === 'default' ? (role === 'mage' && a.body === 'male' ? 'short' : 'none') : a.beardStyle;
        if (style === 'none') return '';
        const moustache = path('M51.4 35.1Q53.2 34.3 54.5 35Q56.2 34.2 57.7 35L59 36.3Q56.6 36.1 54.5 35.7Q52.8 36.3 50.7 36.4Z', c.hair) +
            path('M52 35.3L53.6 35.1M55.2 35.1L57 35.4', 'none', `stroke="${c.hairLight}" stroke-width=".45" stroke-linecap="round"`);
        let art;
        if (style === 'goatee') art = moustache +
            path('M50.4 38.4Q54 39.3 57.3 38.2L56.6 42.4L54.1 45L51.6 42.7Z', c.hairDark) +
            path('M51.8 39.1L55.7 39.2L55.1 42.1L54 43.1L52.8 41.9Z', c.hair) +
            path('M52.7 39.7L53.5 41.5', 'none', `stroke="${c.hairLight}" stroke-width=".65" stroke-linecap="round"`);
        else {
            art = path('M43.5 32.6Q45.2 36.1 48.6 37.7Q52.2 40.5 56.6 38.8Q59.9 37 61 33.6L61.3 38.5Q60.2 42.1 57.5 44L51.6 44.6Q46.2 42.2 44 37.7Z', c.hairDark) +
                path('M45.5 36.3Q49.2 40.2 53.1 40.3Q57 40.8 59.5 37.9Q58.7 41.4 56 43.1L52 43.6L48.4 41Z', c.hair) + moustache;
            if (style === 'short') art += path('M47.1 38.9L49.3 41M51.1 40.8L52.2 42.7M55.3 41.3L56 40.7', 'none', `stroke="${c.hairLight}" stroke-width=".65" stroke-linecap="round"`);
            if (style === 'long') art +=
                path('M46.1 38.9Q50.9 43.2 59.8 38.1Q59.1 44.9 57.5 48.8L54.8 53.4L52.8 52.1L51.1 53Q47.5 49.3 46.1 38.9Z', c.hairDark) +
                path('M48 41.5Q52 44 57.8 40.9Q57.2 47 54.5 50.9L53.3 49.8L51.8 51.1Q49.6 48 48 41.5Z', c.hair) +
                path('M49.2 43L51.2 47.7M52.1 44L53.8 48.9M55.6 43.1L55 46.6', 'none', `stroke="${c.hairLight}" stroke-width=".7" stroke-linecap="round"`);
            if (style === 'braided') art +=
                path('M47.8 40.5Q52.1 43.1 58.4 40.2L57.3 44L55.7 46.1L57.1 48.4L55.7 50.9L56.6 53.1L54 57L51.3 54.5L51.7 51.9L50.2 49.7L51.2 47.4L49.2 45Z', c.hairDark) +
                path('M49.9 42.9L55.7 43L53.6 45.7L55.2 48L53.4 50.4L55 52.6L53.7 54.7L52.8 53.8L53.4 51.8L51.8 49.5L53.2 47.3L51 45.7Z', c.hairLight) +
                path('M50.6 43.8L54.1 45.5M52 47.7L54.6 49.2M52.5 51.7L54.6 53.2', 'none', `stroke="${c.hair}" stroke-width="1"`) +
                path('M51.7 53.4L55.8 52.9L56.2 55L52.1 55.4Z', GOLD) + path('M52.3 53.6L55.2 53.3L55.2 54L52.4 54.3Z', LIGHT);
        }
        return `<g class="char-beard" data-beard="${style}" shape-rendering="geometricPrecision">${art}</g>`;
    }

    function head(c, role, a) {
        let content = face(c, role, a) + crownHair(c, a);
        if (a.headwear !== 'none') content += `<g class="char-headwear" data-headwear="${a.headwear}">${
            a.headwear === 'default' ? classHeadwear(c, role) : purchasedHeadwear(c, a.headwear)}</g>`;
        content += beard(c, role, a);
        // Circlets stay in inventory while a helmet covers them; no doubled brow bands.
        if (a.accessory === 'acc_circlet' && a.headwear === 'none') content +=
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

    // The creatures share animation anchors, but each has its own silhouette and materials.
    const contour = (d, fill, width = 1.8) => path(d, fill, `stroke="${INK}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"`);
    const stroke = (d, color, width = 1) => path(d, 'none', `stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"`);

    function creatureLeg(front, orc) {
        const x = front ? 53 : 35;
        const w = orc ? 12 : 9;
        const thigh = contour(`M${x} 73 L${x+w} 73 L${x+w-1} 91 Q${x+4} 96 ${x-1} 91 Z`, front ? '#64533e' : '#403b37') +
            path(`M${x+2} 77 L${x+6} 78 L${x+5} 87 L${x+2} 90 Z`, '#88704b') +
            contour(`M${x-1} 86 L${x+7} 84 L${x+w} 88 L${x+w-2} 94 L${x+1} 93 Z`, orc ? '#68757c' : '#87734f', 1.2) +
            path(`M${x} 87 L${x+6} 86 L${x+4} 90 L${x} 91 Z`, orc ? '#adb6ad' : '#b29a69');
        const foot = contour(`M${x+1} 93 L${x+w-2} 93 L${x+w-2} 99 Q${x+w+7} 100 ${x+w+6} 106 L${x-2} 106 Q${x-3} 102 ${x+1} 93 Z`, '#4b3933') +
            path(`M${x+2} 94 L${x+5} 94 L${x+3} 102 L${x+w+2} 102 L${x+w+4} 104 L${x} 104 Z`, '#9d7a50') +
            stroke(`M${x} 97 L${x+w-2} 98 M${x+2} 94 L${x+w-1} 95`, '#c5a46a', 1.1) +
            stroke(`M${x-1} 105 L${x+w+4} 105`, '#2c2a2d', 1.4);
        return group(`char-leg char-leg-${front ? 'front' : 'back'}`, thigh + group('char-shin', foot));
    }

    function creatureArm(front, orc) {
        const x = front ? 63 : 26;
        const skin = orc ? (front ? '#8b9658' : '#566448') : (front ? '#6e9f65' : '#466d52');
        let art = contour(`M${x+1} 46 Q${x+7} 42 ${x+11} 49 L${x+14} 59 L${x+12} 72 Q${x+7} 77 ${x+2} 70 L${x+3} 61 Q${x-4} 54 ${x+1} 46 Z`, skin) +
            path(`M${x+2} 48 Q${x+7} 46 ${x+9} 52 L${x+9} 57 Q${x+4} 59 ${x+2} 54 Z`, orc ? '#b2b475' : '#a5c17d') +
            stroke(`M${x+4} 60 Q${x+7} 62 ${x+10} 59`, orc ? '#667041' : '#4f7b4f', 1.3) +
            contour(`M${x+2} 63 L${x+13} 63 L${x+12} 70 L${x+3} 71 Z`, '#4b3934', 1.2) +
            stroke(`M${x+3} 64 L${x+12} 65 M${x+3} 68 L${x+11} 69`, '#af8c58', 1.3);
        if (orc && !front) art +=
            contour('M24 44 L30 39 L38 41 L42 49 L39 56 L25 55 L21 50 Z', '#586574') +
            poly('24,46 30,41 35,43 34,48 24,49', '#adb8b8') +
            poly('25,50 38,47 40,50 37,53 27,53', '#343d50') +
            contour('M26 44 L26 35 L30 41 M34 42 L38 35 L38 45', '#e6d3aa', 1.1) +
            ellipse(26, 51, 1, 1, GOLD) + ellipse(36, 51, 1, 1, GOLD);
        if (front) art += group('char-weapon', orc ?
            contour('M77 30 L81 30 L78 83 L74 83 Z', '#79513a', 1.4) + stroke('M78 36 L76 77', '#bb9460', 1.1) +
            contour('M75 31 L68 32 L63 26 Q59 34 64 43 L75 45 L80 42 Q90 46 91 35 L88 26 Q86 31 80 29 Z', '#7f929a') +
            path('M65 29 Q63 35 66 41 L76 42 L75 36 L68 35 Z', '#bbced0') +
            path('M89 29 Q92 39 83 42 L81 36 Q86 36 89 29 Z', '#d6ddcf') +
            poly('76,31 80,31 80,42 76,43', '#404c61') + ellipse(78, 35, 1.1, 1.1, GOLD) +
            stroke('M76 75 L79 74 M76 78 L78 77', '#d8b781', 1.4) :
            contour('M73 68 Q78 52 86 49 Q82 58 82 65 L77 73 Z', '#93adb0', 1.4) +
            path('M75 67 Q80 54 84 52 Q79 63 78 68 Z', '#e7edce') +
            contour('M69 68 L80 72 L79 75 L69 71 Z', '#b89657', 1) +
            contour('M71 72 L75 73 L73 81 L69 79 Z', '#66473b', 1.2));
        art += contour(`M${x+4} 70 Q${x+7} 68 ${x+10} 71 L${x+12} 74 L${x+10} 78 L${x+4} 77 L${x+2} 74 Z`, skin, 1.2) +
            stroke(`M${x+6} 74 L${x+10} 74 M${x+6} 76 L${x+9} 76`, orc ? '#556041' : '#3f6548', .7);
        return group(`char-arm char-arm-${front ? 'front' : 'back'}`, art);
    }

    function goblin() {
        const torso = contour('M34 49 Q42 42 53 45 L63 50 L61 64 L63 76 L56 81 L47 78 L36 81 L32 72 Z', '#604d38') +
            path('M36 51 L42 48 L46 56 L43 69 L37 74 L35 68 Z', '#9a7b4c') +
            path('M52 48 L59 52 L57 68 L61 74 L54 77 L48 73 L50 60 Z', '#3f3b32') +
            contour('M42 47 L49 44 L55 47 L49 54 Z', '#60875a', 1) +
            contour('M34 49 L38 47 L59 70 L56 74 Z', '#b19864', 1) +
            rect(45, 59, 6, 5, '#e2bd71') + rect(47, 60, 2, 3, '#5d503a') +
            contour('M33 71 Q46 75 62 70 L63 76 Q49 82 34 77 Z', '#44352f', 1.2) +
            contour('M48 73 L54 73 L54 78 L48 78 Z', '#d1aa60', .7) + rect(50, 74, 2, 3, '#504431') +
            contour('M34 75 L42 75 L44 82 L39 87 L33 83 Z', '#927448', 1.2) +
            path('M34 76 L41 76 L40 79 L35 80 Z', '#c3a26a') + ellipse(38, 79, 1, 1, GOLD) +
            stroke('M56 57 L60 59 M56 61 L59 63', '#b79f76', .8);
        const headArt =
            contour('M38 29 Q30 25 21 22 Q23 36 37 39 L43 35 Z', '#729d61') +
            path('M25 26 L36 32 L37 36 Q29 33 25 26 Z', '#a1b97b') +
            contour('M62 27 Q69 26 77 20 Q75 33 64 36 Z', '#577b50') +
            path('M66 30 L73 25 L69 32 L65 33 Z', '#9ab377') +
            contour('M36 28 Q37 17 52 18 Q64 19 67 30 L65 39 Q61 47 49 47 Q38 45 35 37 Z', '#7fa66a') +
            path('M38 28 Q40 22 49 22 L56 23 L50 28 L42 30 L39 34 Z', '#b2c987') +
            path('M38 35 Q42 42 51 42 L60 39 L64 39 Q60 45 49 45 L40 42 Z', '#54774d') +
            contour('M38 26 L37 20 L42 21 L44 15 L49 19 L55 16 L62 21 L61 25 Q51 21 44 27 Z', '#3d4137', 1.3) +
            path('M43 21 L45 19 L48 21 L55 20 L52 23 L45 23 Z', '#737350') +
            path('M41 30 Q46 28 51 32 L50 35 L43 35 Z', '#29362f') +
            path('M56 31 L63 28 L64 32 L58 34 Z', '#29362f') +
            path('M43 32 L49 32 L48 34 L44 34 Z', '#efd479') +
            path('M58 31 L62 30 L62 32 L58 33 Z', '#efd479') +
            ellipse(47.6, 32.8, .85, 1.2, INK) + ellipse(61, 31.5, .7, 1.1, INK) +
            contour('M53 30 Q55 34 62 35 L59 38 L52 37 L51 35', '#a1b777', .8) +
            stroke('M49 41 Q56 43 61 39', '#303e30', 1.2) +
            poly('52,42 54,42 53,39', '#f5e1b2') +
            ellipse(33, 37, 1.8, 2.3, GOLD) + ellipse(33, 36.5, .9, 1.4, '#56764e');
        return creatureLeg(false, false) + creatureLeg(true, false) + group('char-upper-body',
            creatureArm(false, false) + group('char-torso', torso) + group('char-head', headArt) + creatureArm(true, false) + effects());
    }

    function orc() {
        const torso = contour('M31 46 L42 41 L58 41 L69 48 L65 62 L65 76 L56 83 L46 79 L34 82 L30 73 Z', '#7e8850') +
            path('M35 48 L45 45 L47 53 L43 60 L35 57 Z', '#b2b778') +
            path('M50 45 L59 46 L64 50 L60 57 L51 57 Z', '#9ea468') +
            stroke('M38 60 L44 61 M53 60 L58 59 M44 65 L56 65', '#596742', 1.3) +
            contour('M33 44 L38 43 L63 68 L60 73 Z', '#553a30', 1.3) +
            stroke('M35 46 L61 71', '#b18d53', 1.4) +
            contour('M47 55 L53 58 L50 63 L45 59 Z', '#c7ac69', .8) +
            contour('M32 70 Q48 73 65 69 L65 77 Q47 82 32 77 Z', '#43342e') +
            stroke('M34 73 Q45 76 63 72', '#96724d', 1.5) +
            contour('M45 73 L53 72 L55 78 L50 83 L44 79 Z', '#afac91', 1) +
            poly('46,75 49,75 49,78 46,78', '#3b3935') + poly('51,74 53,75 53,77 51,77', '#3b3935') +
            contour('M35 79 L43 80 L44 89 L38 87 L33 89 Z M55 80 L63 78 L66 88 L59 91 Z', '#775044', 1.2);
        const headArt =
            contour('M36 25 L27 23 L29 33 L37 36 M64 23 L72 19 L71 29 L65 32', '#79854f', 1.7) +
            contour('M35 22 Q39 15 52 15 L63 20 L67 30 L66 39 Q62 46 48 47 L37 43 L33 33 Z', '#8c9758') +
            path('M37 24 L41 20 L51 19 L56 22 L50 27 L39 29 Z', '#bbc07c') +
            path('M36 32 L41 35 L42 40 L54 43 L63 38 L64 41 L57 45 L45 44 L37 40 Z', '#63733f') +
            contour('M44 19 L44 12 L48 14 L50 9 L54 13 L57 11 L59 20 L54 23 Z', '#47302f', 1.5) +
            poly('47,17 50,13 51,18 56,16 56,20 50,21', '#986342') +
            path('M39 28 L49 29 L50 33 L41 33 Z M55 28 L63 25 L64 30 L57 32 Z', '#3d4932') +
            path('M42 30 L48 31 L48 33 L42 32 Z M57 29 L62 28 L62 30 L57 31 Z', '#efbc61') +
            rect(46, 31, 1.2, 2, INK) + rect(60, 28.8, 1, 2, INK) +
            contour('M51 28 L56 30 L58 35 L51 37 L48 34 Z', '#a3ac69', .8) +
            ellipse(51, 34, 1, .6, '#657343') + ellipse(55.5, 34, .9, .6, '#657343') +
            path('M42 37 Q52 40 63 35 L62 40 Q51 45 43 41 Z', '#3e3b30') +
            contour('M44 41 Q39 38 41 33 Q43 37 47 38 Z M58 40 Q64 36 63 31 Q60 36 57 37 Z', '#e6d8ae', .7) +
            path('M42 34 L44 39 L45 40 L44 37 Z M62 33 L60 38 L59 38 Z', '#fff1c9') +
            stroke('M38 26 L41 24 M39 28 L42 26', '#6c7945', .8) +
            ellipse(31, 33, 1.7, 2, GOLD) + ellipse(31, 32.5, .8, 1.1, '#79854f');
        return creatureLeg(false, true) + creatureLeg(true, true) + group('char-upper-body',
            creatureArm(false, true) + group('char-torso', torso) + group('char-head', headArt) + creatureArm(true, true) + effects());
    }

    function skeleton() {
        const bone = '#d4cbb0', high = '#f5e9cc', dark = '#8d8c7d';
        const limb = (d, front) => stroke(d, INK, 5.8) + stroke(d, front ? bone : dark, 3.2) + stroke(d, front ? high : bone, .85);
        const legs = [false, true].map(front => {
            const x = front ? 56 : 38;
            return group(`char-leg char-leg-${front ? 'front' : 'back'}`, limb(`M${x} 77 Q${x+1} 84 ${x+2} 91`, front) +
                ellipse(x+2, 91, 3.3, 2.5, INK) + ellipse(x+2, 90.7, 2.1, 1.5, bone) +
                group('char-shin', limb(`M${x+1} 94 L${x} 101 M${x+4} 94 L${x+3} 101`, front) +
                    contour(`M${x-1} 101 L${x+4} 100 L${x+12} 104 L${x+11} 106 L${x-2} 106 Z`, bone, 1.4) +
                    stroke(`M${x+5} 102 L${x+4} 105 M${x+8} 103 L${x+7} 105`, dark, .8)));
        }).join('');
        const arm = front => {
            const x = front ? 63 : 30;
            let art = limb(`M${x} 47 Q${x-1} 53 ${x+3} 58 M${x+2} 61 L${x+4} 69 M${x+5} 60 L${x+7} 69`, front) +
                contour(`M${x+1} 56 Q${x+6} 54 ${x+6} 59 L${x+2} 61 Z`, bone, 1.1);
            if (front) art += group('char-weapon',
                contour('M73 32 L77 37 L77 63 L73 66 L70 63 L71 38 Z', '#798f99', 1.5) +
                poly('73,36 74,39 74,62 72,62 72,40', '#dce0c8') +
                poly('75,44 77,44 77,48 75,50', '#4c6276') +
                contour('M67 65 Q73 67 80 64 L81 67 L76 70 L76 79 L71 79 L71 70 L67 68 Z', '#8c704e', 1.3) +
                stroke('M73 71 L75 72 M73 74 L75 75', '#d9ba83', 1));
            art += contour(`M${x+2} 69 L${x+8} 69 L${x+10} 73 L${x+8} 77 L${x+3} 76 Z`, bone, 1.2) +
                stroke(`M${x+4} 72 L${x+8} 72 M${x+4} 74 L${x+8} 74`, dark, .8);
            return group(`char-arm char-arm-${front ? 'front' : 'back'}`, art);
        };
        let ribs = limb('M49 43 L49 68', true) + contour('M47 44 Q37 42 32 48 L36 51 L46 48 L51 48 L61 49 L64 46 Q57 42 51 44 Z', bone, 1.2);
        for (let y = 51; y <= 63; y += 5) ribs +=
            contour(`M46 ${y} Q37 ${y-3} 35 ${y} Q36 ${y+5} 46 ${y+4} L46 ${y+2} Q39 ${y+2} 38 ${y} Z M51 ${y} Q59 ${y-3} 61 ${y} Q60 ${y+4} 51 ${y+4} L51 ${y+2} Q57 ${y+2} 58 ${y} Z`, bone, .7) +
            stroke(`M38 ${y} Q41 ${y-1} 44 ${y} M53 ${y} L57 ${y-1}`, high, .8);
        ribs += contour('M36 68 L42 67 L47 70 L51 70 L57 67 L62 69 L60 76 L53 80 L49 76 L44 81 L36 76 Z', bone, 1.5) +
            path('M39 70 L43 71 L44 75 L39 74 Z M54 72 L59 70 L58 74 L54 76 Z', '#32333c') +
            contour('M35 77 L43 78 L41 86 L35 90 L36 85 L32 85 Z M53 80 L59 77 L64 84 L60 90 L59 86 L56 90 Z', '#6b4750', 1) +
            stroke('M35 80 L39 81 M57 81 L60 84', '#a27670', 1);
        const skull = contour('M35 28 Q34 17 47 15 Q60 12 66 23 L66 31 L62 37 L61 44 Q52 48 44 44 L42 38 L36 35 Z', bone) +
            path('M37 27 Q39 19 48 18 Q58 16 61 22 L52 22 L45 25 L40 30 Z', high) +
            path('M37 31 L43 34 L47 38 L45 42 L43 37 L38 35 Z M61 34 L65 29 L63 36 L59 40 L59 44 L55 45 L56 38 Z', dark) +
            contour('M41 28 Q46 26 50 29 L50 34 Q45 38 41 33 Z M55 28 L62 25 L63 30 Q61 34 56 33 Z', '#30323e', .8) +
            ellipse(47, 31.5, 1.4, 1.1, '#d99468') + ellipse(60, 29.7, 1.1, 1, '#d99468') +
            poly('53,32 56,37 51,37', '#4a4944') +
            path('M46 39 Q54 41 61 37 L60 42 Q54 45 47 42 Z', '#6a695e') +
            [47, 50, 53, 56, 59].map((x, i) => path(`M${x} ${i>2?39:40} L${x+1.8} ${i>2?38.5:40} L${x+1.5} 43 L${x} 43 Z`, high)).join('') +
            stroke('M51 16 L49 21 L52 24 L50 27 M38 24 L41 24', '#9e9c86', .8);
        return legs + group('char-upper-body', arm(false) + group('char-torso', ribs) + group('char-head', skull) + arm(true) + effects());
    }

    function slime() {
        return group('char-slime',
            contour('M17 98 Q18 90 24 83 Q28 57 47 54 Q68 51 74 77 Q76 89 83 95 Q89 105 71 107 L30 107 Q13 107 17 98 Z', '#479d6c', 2.2) +
            path('M23 95 Q29 85 31 74 Q36 60 49 59 Q61 57 67 70 Q54 62 43 76 Q36 87 39 98 Z', '#85c88c') +
            path('M69 72 Q72 90 80 97 Q84 103 68 104 L33 104 Q27 104 23 101 Q49 106 61 94 Q67 86 69 72 Z', '#286650') +
            path('M35 91 Q39 76 51 76 Q63 75 67 89 L62 99 Q46 105 35 96 Z', '#58955e') +
            path('M40 88 Q45 82 54 83 L59 89 L55 98 L43 96 Z', '#8bba6d', 'opacity=".65"') +
            stroke('M31 78 Q36 64 47 63', '#d8f6be', 3.1) +
            stroke('M28 86 L27 90 M52 62 L56 63', '#c5edab', 1.9) +
            ellipse(35, 72, 1.5, 2, '#f1fbd2') + ellipse(72, 97, 2.7, 1.2, '#8ed49a') +
            ellipse(32, 97, 1.7, 1.1, '#b4e5a4') + ellipse(63, 71, 1.4, 1.8, '#a2d794') +
            ellipse(41, 88, 3.7, 5.6, '#213e35') + ellipse(61, 85, 3.3, 5.2, '#213e35') +
            ellipse(40.1, 86.1, 1.1, 1.7, '#f2fbd9') + ellipse(60.3, 83.3, 1, 1.5, '#f2fbd9') +
            path('M48 94 Q52 97 57 92 Q55 99 50 98 Z', '#244737') +
            ellipse(35, 92, 3, 1.3, '#6bb784') + ellipse(66, 89, 2.4, 1.1, '#6bb784'));
    }

    function ghost() {
        const arm = front => group(`char-arm char-arm-${front ? 'front' : 'back'}`, front ?
            contour('M61 46 Q71 45 73 60 L81 60 L86 57 L85 63 L89 65 L85 68 L80 67 L81 72 L76 70 L68 68 Q63 60 61 46 Z', '#aba6d1', 1.5) +
            path('M66 49 Q70 52 71 63 L78 65 L76 67 L70 66 L67 60 Z', '#eeE3f1') + stroke('M80 64 L84 63', '#605c88', .7) :
            contour('M36 45 Q26 48 25 61 L19 62 L14 58 L14 63 L11 66 L15 68 L19 67 L18 72 L23 69 L31 67 L40 49 Z', '#7d80ad', 1.5) +
            path('M33 48 L29 60 L25 65 L20 65 L26 67 L32 63 L37 50 Z', '#b5b5d6'));
        const tail = group('char-cape',
            contour('M34 59 L64 58 Q62 79 72 88 Q80 93 86 85 Q84 100 70 98 L65 96 Q62 104 53 106 L54 99 Q48 104 41 103 L44 97 Q33 103 22 96 Q34 96 31 85 Q28 74 34 59 Z', '#767cac', 1.8) +
            path('M37 64 L46 66 Q38 87 46 94 Q38 99 28 96 Q38 93 34 83 Z', '#c1bfdc') +
            path('M52 64 L60 62 Q55 83 65 92 Q69 98 80 93 Q73 100 63 93 L59 99 L60 91 Q52 94 49 98 Q57 84 52 64 Z', '#525b8b') +
            stroke('M38 71 Q34 83 40 89 M66 91 Q75 97 81 91', '#ece0ef', 1.1));
        const torso = contour('M33 44 L64 43 L65 59 L59 75 L48 83 L35 77 L29 65 Z', '#8f94c1', 1.7) +
            path('M34 47 L43 53 Q37 65 39 74 L34 72 L32 63 Z', '#d7d0e7') +
            path('M55 53 L63 48 L61 62 L53 77 L47 79 Q55 65 55 53 Z', '#606b9d') +
            stroke('M35 48 L46 59 L58 47', '#d8cca4', 1.2) +
            contour('M46 57 L51 59 L51 65 L47 69 L43 65 L43 60 Z', '#555b83', 1) +
            poly('46,60 49,61 49,64 47,66 45,64 45,62', '#b6ecbd') +
            poly('46,60 47,61 46,64 45,63', '#f4ffe1');
        const hood = contour('M32 34 Q32 21 46 16 L55 12 Q53 17 60 20 Q68 25 66 36 L62 47 L53 54 L41 51 L32 45 Z', '#aeb0d2') +
            path('M35 34 Q35 23 46 20 L51 18 L49 23 Q39 27 40 40 L37 45 L34 42 Z', '#ede3ef') +
            path('M53 21 Q63 25 63 34 L59 44 L52 49 L45 47 L55 39 L56 30 Z', '#6b749f') +
            contour('M42 29 Q48 24 56 28 Q61 31 58 40 L53 47 L44 45 L39 39 Z', '#2e374f', 1.1) +
            path('M43 30 L46 29 L43 39 L46 44 L42 41 L40 37 Z', '#464e72') +
            path('M42 34 Q46 32 49 35 L47 39 L43 38 Z M53 34 L59 31 L58 36 L53 38 Z', '#72c49e') +
            path('M43 34 L47 35 L46 37 L43 36 Z M54 34 L57 33 L57 35 L54 36 Z', '#e3ffce') +
            path('M49 41 Q52 38 53 42 L51 45 L49 44 Z', '#151c32');
        return group('char-ghost', tail + group('char-upper-body', arm(false) + group('char-torso', torso) + group('char-head', hood) + arm(true) + effects()));
    }

    function renderMonster(sprite = 'goblin', options = {}) {
        const creatures = { goblin, skeleton, slime, orc, ghost };
        const kind = Object.hasOwn(creatures, sprite) ? sprite : 'goblin';
        return shell(hairLayer('creature-detail', creatures[kind]()), options, kind, `character-monster character-${kind}`);
    }


    window.CharacterArt = Object.freeze({ render, renderMonster, normalizeAppearance, DEFAULT_APPEARANCE, PALETTES });
})();
