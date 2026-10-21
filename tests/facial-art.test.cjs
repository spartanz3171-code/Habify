const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/characters.js'), 'utf8'), context);
const art = context.window.CharacterArt;
const plain = value => JSON.parse(JSON.stringify(value));
const variants = {
    eyeShape: ['classic', 'round', 'almond', 'focused'],
    mouthStyle: ['classic', 'smile', 'grin', 'serious'],
    noseShape: ['classic', 'button', 'straight', 'broad'],
    browStyle: ['classic', 'soft', 'arched', 'bold']
};
const roles = ['hero', 'mage', 'knight', 'elf'];

test('old avatars keep classic facial defaults and their class iris color', () => {
    assert.deepEqual(plain(art.normalizeAppearance()), plain(art.DEFAULT_APPEARANCE));
    for (const [avatarClass, color] of Object.entries({ hero: '#517886', mage: '#776590', knight: '#8d733c', elf: '#497559' })) {
        assert.equal(art.render({ avatarClass }), art.render({ avatarClass, appearance: { eyeShape: 'classic', noseShape: 'classic', mouthStyle: 'classic', browStyle: 'classic', eyeColor: 'default' } }));
        assert.ok(art.render({ avatarClass }).includes(`fill="${color}"`));
    }
});

test('facial appearance accepts only supported shapes and six digit iris colors', () => {
    const malicious = { eyeShape: '"><script>', mouthStyle: [], noseShape: '__proto__', browStyle: null, eyeColor: 'url(javascript:alert(1))' };
    const normalized = art.normalizeAppearance(malicious);
    for (const key of Object.keys(variants)) assert.equal(normalized[key], 'classic');
    assert.equal(normalized.eyeColor, 'default');
    assert.equal(art.normalizeAppearance({ eyeColor: '#45AbEF' }).eyeColor, '#45abef');
    for (const eyeColor of ['#fff', '#1234567', 'red', '#zzzzzz', '', {}, 17]) {
        assert.equal(art.normalizeAppearance({ eyeColor }).eyeColor, 'default');
    }
    assert.doesNotMatch(art.render({ appearance: malicious }), /<script|javascript|undefined|NaN/);
});

test('all facial choices produce distinct artwork for every class and body', () => {
    for (const avatarClass of roles) for (const body of ['male', 'female']) {
        for (const [field, choices] of Object.entries(variants)) {
            const renders = choices.map(choice => art.renderPortrait({ avatarClass, appearance: { body, [field]: choice } }));
            assert.equal(new Set(renders).size, choices.length, `${avatarClass}/${body}/${field}`);
            for (const svg of renders) assert.doesNotMatch(svg, /\bid=|url\(#|NaN|undefined|<script/);
        }
        const tinted = art.renderPortrait({ avatarClass, appearance: { body, eyeColor: '#12abcd' } });
        assert.equal((tinted.match(/fill="#12abcd"/g) || []).length, 2);
    }
});

test('portrait exposes the same face without changing stored equipment or appearance', () => {
    const avatar = { avatarClass: 'mage', appearance: { body: 'female', eyeShape: 'round', mouthStyle: 'grin', noseShape: 'broad', browStyle: 'bold', eyeColor: '#45abef', beardStyle: 'braided', headwear: 'headwear_guardian' } };
    const before = JSON.stringify(avatar);
    const portrait = art.renderPortrait(avatar);
    assert.equal(JSON.stringify(avatar), before);
    assert.match(portrait, /character-portrait/);
    assert.match(portrait, /viewBox="20 9 50 54"/);
    assert.match(portrait, /char-eyes-round/);
    assert.match(portrait, /char-mouth-grin/);
    assert.match(portrait, /char-nose-broad/);
    assert.match(portrait, /char-brows-bold/);
    assert.match(portrait, /data-beard="braided"/);
    assert.doesNotMatch(portrait, /char-headwear|char-weapon|char-arm|char-leg/);
    assert.match(portrait, /aria-hidden="true"/);
    assert.match(portrait, /focusable="false"/);
    assert.match(art.render(avatar), /data-headwear="headwear_guardian"/);
});

test('new facial details coexist with every hairstyle, beard, helmet and combat pose', () => {
    for (const avatarClass of roles) for (const body of ['male', 'female']) {
        for (const headwear of ['default', 'none', 'headwear_guardian', 'headwear_winged', 'headwear_arcane']) {
            for (const hairStyle of ['short', 'long', 'ponytail', 'braids']) {
                for (const beardStyle of ['default', 'none', 'short', 'goatee', 'long', 'braided']) {
                    const avatar = { avatarClass, appearance: { body, headwear, hairStyle, beardStyle, eyeShape: 'focused', mouthStyle: 'smile', noseShape: 'straight', browStyle: 'arched' } };
                    const svg = art.render(avatar, { state: 'ATTACKING', facing: 'left', phase: 'active' });
                    assert.match(svg, /data-state="ATTACKING" data-facing="left"/);
                    assert.match(svg, /char-eyes-focused/);
                    assert.match(svg, /char-mouth-smile/);
                    assert.doesNotMatch(svg, /NaN|undefined|\bid=|url\(#/);
                }
            }
        }
    }
});

test('polished monsters preserve their rig, tiers and safe ID-free SVGs', () => {
    for (const sprite of ['goblin', 'orc', 'skeleton', 'slime', 'ghost']) {
        const looks = [1, 6, 15, 30].map((level, tier) => {
            const svg = art.renderMonster(sprite, { level, state: 'RUNNING', facing: 'left' });
            assert.match(svg, new RegExp(`character-${sprite} monster-rank-${tier}`));
            assert.match(svg, /data-state="RUNNING" data-facing="left"/);
            assert.match(svg, /char-body/);
            assert.match(svg, /creature-(?:face|gel)-finish/);
            assert.doesNotMatch(svg, /\bid=|url\(#|NaN|undefined/);
            return svg;
        });
        assert.equal(new Set(looks).size, 4, sprite);
    }
});
