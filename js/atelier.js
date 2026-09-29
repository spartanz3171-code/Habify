// Character editor. The draft stays separate until the player chooses to save.
const Atelier = {
    draft: null,
    busy: false,
    previewState: 'IDLE',
    previewItem: null,
    savedMessage: '',
    returnFocus: null,
    text(es, en) { return I18N.current === 'en' ? en : es; },
    escape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    begin() {
        this.draft = CharacterArt.normalizeAppearance(GameState.avatar.appearance);
        this.previewItem = null;
        this.savedMessage = '';
        this.previewState = 'IDLE';
    },
    render() {
        if (!this.draft) this.begin();
        const t = this.text.bind(this);
        const a = { ...GameState.avatar, appearance: this.draft };
        const role = Views.classLabel(a);
        const option = (field, value, label) => `<button type="button" class="choice-chip ${this.draft[field] === value ? 'selected' : ''}" aria-pressed="${this.draft[field] === value}" onclick="Atelier.choose('${field}', '${value}')">${label}</button>`;
        const swatches = (field, colors) => {
            if (!colors.some(([value]) => value === this.draft[field])) colors.unshift([this.draft[field], t('Actual', 'Current')]);
            return colors.map(([value, label]) => `<button type="button" class="color-swatch ${this.draft[field] === value ? 'selected' : ''}" style="--swatch:${value}" aria-label="${label}" title="${label}" aria-pressed="${this.draft[field] === value}" onclick="Atelier.choose('${field}', '${value}')"><span aria-hidden="true">${this.draft[field] === value ? '✓' : ''}</span></button>`).join('');
        };
        return `<section class="page-heading"><div><span class="eyebrow">${t('TU AVENTURA, TU ESTILO', 'YOUR QUEST, YOUR STYLE')}</span><h1>${t('Tu personaje', 'Your character')}</h1><p>${t('Dale una identidad propia a tu héroe.', 'Give your hero an identity of their own.')}</p></div><span class="section-badge">LV ${a.level}</span></section>
            <div class="atelier-layout">
                <section class="atelier-preview card">
                    <div class="preview-caption"><span class="live-dot"></span>${t('VISTA PREVIA', 'PREVIEW')}</div>
                    <div class="character-pedestal" id="character-preview">${CharacterArt.render(a, { state: this.previewState })}${Views.renderCompanion(a.equippedPet, 'preview-companion')}</div>
                    <h2 class="character-name">${this.escape(a.name)}</h2><p id="character-role" class="role-label">${role}</p>
                    <div class="preview-actions" aria-label="${t('Probar animación', 'Try animation')}">
                        ${[['IDLE', t('Reposo', 'Idle')], ['RUNNING', t('Caminar', 'Walk')], ['ATTACKING', t('Golpe', 'Attack')], ['JUMPING', t('Salto', 'Jump')]].map(([s, l]) => `<button class="preview-action ${this.previewState === s ? 'selected' : ''}" aria-pressed="${this.previewState === s}" onclick="Atelier.animate('${s}')">${l}</button>`).join('')}
                    </div>
                    <p class="character-note">${t('Misma clase y habilidades. Un estilo que es tuyo.', 'Same class and abilities. A style of your own.')}</p>
                </section>
                <section class="atelier-options card"><div class="panel-title"><span>01</span><h2>${t('Apariencia', 'Appearance')}</h2><span class="free-label">${t('GRATIS', 'FREE')}</span></div>
                    <fieldset><legend>${t('Personaje', 'Character')}</legend><div class="choice-row">${option('body', 'female', t('Mujer', 'Woman'))}${option('body', 'male', t('Hombre', 'Man'))}</div></fieldset>
                    <fieldset><legend>${t('Tono de piel', 'Skin tone')}</legend><div class="swatch-row">${swatches('skin', [['#f3c6a0', t('Claro', 'Fair')], ['#dca078', t('Cálido', 'Warm')], ['#b87854', t('Bronce', 'Bronze')], ['#8c543b', t('Moreno', 'Brown')], ['#59382e', t('Oscuro', 'Deep')]])}</div></fieldset>
                    <fieldset><legend>${t('Peinado', 'Hairstyle')}</legend><div class="choice-row">${option('hairStyle', 'short', t('Corto', 'Short'))}${option('hairStyle', 'long', t('Largo', 'Long'))}${option('hairStyle', 'ponytail', t('Coleta', 'Ponytail'))}${option('hairStyle', 'braids', t('Trenzas', 'Braids'))}</div></fieldset>
                    <fieldset><legend>${t('Color de cabello', 'Hair color')}</legend><div class="swatch-row">${swatches('hairColor', [['#332c42', t('Negro', 'Black')], ['#684333', t('Castaño', 'Brown')], ['#c99044', t('Dorado', 'Golden')], ['#b84c41', t('Cobrizo', 'Copper')], ['#ded6e4', t('Plata', 'Silver')], ['#8251b5', t('Violeta', 'Violet')]])}</div></fieldset>
                    <fieldset><legend>${t('Color de atuendo', 'Outfit color')}</legend><div class="swatch-row">${swatches('outfitColor', [['#29adff', t('Azul', 'Blue')], ['#a855f7', t('Violeta', 'Violet')], ['#00a878', t('Verde', 'Green')], ['#d84969', t('Carmesí', 'Crimson')], ['#d99a36', t('Ámbar', 'Amber')], ['#8996b0', t('Acero', 'Steel')]])}</div></fieldset>
                    <div class="atelier-save-row"><button id="save-appearance" class="btn btn-primary" onclick="Atelier.save()" ${this.busy || App.shopBusy ? 'disabled' : ''}>${t('GUARDAR APARIENCIA', 'SAVE APPEARANCE')}</button><button class="btn btn-secondary" onclick="Atelier.resetDraft()" ${this.busy || App.shopBusy ? 'disabled' : ''}>${t('DESHACER', 'RESET')}</button></div>
                    <p id="appearance-status" class="save-status" role="status" aria-live="polite">${this.escape(this.savedMessage)}</p>
                </section>
            </div>
            ${this.renderWardrobe()}`;
    },
    renderWardrobe() {
        const t = this.text.bind(this);
        const items = Wardrobe.listCosmetics();
        return `<section class="wardrobe-section"><div class="page-heading compact"><div><span class="eyebrow">${t('VISTE TU PROGRESO', 'WEAR YOUR PROGRESS')}</span><h2>${t('Guardarropa', 'Wardrobe')}</h2><p>${t('Gana oro con tus hábitos y desbloquea nuevos atuendos.', 'Earn gold with your habits and unlock new outfits.')}</p></div><span class="wallet">${GameState.avatar.gold} <small>G</small></span></div>
            <div class="wardrobe-tools"><button class="choice-chip" onclick="Atelier.unequip('outfit')" ${this.busy || App.shopBusy ? 'disabled' : ''}>${t('Atuendo de clase', 'Class outfit')}</button><button class="choice-chip" onclick="Atelier.unequip('accessory')" ${this.busy || App.shopBusy ? 'disabled' : ''}>${t('Sin accesorio', 'No accessory')}</button></div>
            ${this.renderCosmeticCards(items)}</section>`;
    },
    previewAppearance() {
        return GameState.currentView === 'character' && this.draft ? this.draft : GameState.avatar.appearance;
    },
    renderCosmeticCards(items = Wardrobe.listCosmetics()) {
        const t = this.text.bind(this);
        return `<div class="cosmetics-grid">${items.map(item => {
                const appearance = { ...this.previewAppearance(), [item.slot]: item.id };
                const owned = Wardrobe.owns(item.id);
                const equipped = Wardrobe.isEquipped(item.id);
                const available = GameState.cosmeticsReady && item.available;
                const name = I18N.t(`cosmetic.${item.id}`) === `cosmetic.${item.id}` ? item.name : I18N.t(`cosmetic.${item.id}`);
                const canAfford = GameState.avatar.gold >= item.cost;
                const buttonText = owned ? (equipped ? t('EQUIPADO', 'EQUIPPED') : t('EQUIPAR', 'EQUIP')) : (!available ? t('PRONTO', 'SOON') : canAfford ? t('COMPRAR', 'BUY') : t('FALTA ORO', 'NEED GOLD'));
                return `<article class="cosmetic-card ${equipped ? 'equipped' : ''}" data-cosmetic-id="${item.id}"><div class="cosmetic-art">${CharacterArt.render({ ...GameState.avatar, appearance })}<span class="cosmetic-kind">${item.slot === 'outfit' ? t('ATUENDO', 'OUTFIT') : t('ACCESORIO', 'ACCESSORY')}</span></div>
                    <div class="cosmetic-info"><h3>${this.escape(name)}</h3><p>${item.slot === 'outfit' ? t('Compatible con todas las clases', 'Fits every class') : t('Un detalle para hacerte único', 'A detail to make you unique')}</p><div class="cosmetic-price">${owned ? (equipped ? t('EQUIPADO', 'EQUIPPED') : t('EN TU COLECCIÓN', 'IN YOUR COLLECTION')) : `${item.cost} G`}</div>
                    <div class="cosmetic-buttons"><button class="btn btn-secondary" onclick="Atelier.tryOn('${item.id}')">${t('PROBAR', 'TRY ON')}</button><button class="btn ${owned ? 'btn-primary' : 'btn-gold'}" onclick="Atelier.${owned ? 'equip' : 'buy'}('${item.id}')" ${this.busy || App.shopBusy || equipped || (!owned && (!available || !canAfford)) ? 'disabled' : ''}>${buttonText}</button></div></div></article>`;
            }).join('')}</div>`;
    },
    refresh(focusId) {
        if (!['character', 'store'].includes(GameState.currentView)) return;
        document.getElementById('app-content').innerHTML = GameState.currentView === 'store' ? Views.renderStore() : this.render();
        if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
        App.updateHeader();
    },
    choose(field, value) {
        if (this.busy || !['body', 'skin', 'hairStyle', 'hairColor', 'outfitColor'].includes(field)) return;
        this.draft = CharacterArt.normalizeAppearance({ ...this.draft, [field]: value });
        this.savedMessage = this.text('Cambios sin guardar', 'Unsaved changes');
        const focused = document.activeElement?.getAttribute('onclick');
        this.refresh();
        [...document.querySelectorAll('.atelier-options button')].find(b => b.getAttribute('onclick') === focused)?.focus({ preventScroll: true });
    },
    animate(state) {
        this.previewState = state;
        const art = document.querySelector('#character-preview .character-art');
        if (art) { art.dataset.state = 'IDLE'; requestAnimationFrame(() => { art.dataset.state = state; }); }
        document.querySelectorAll('.preview-action').forEach(b => { const selected = b.getAttribute('onclick') === `Atelier.animate('${state}')`; b.classList.toggle('selected', selected); b.setAttribute('aria-pressed', selected); });
    },
    resetDraft() { if (this.busy) return; this.begin(); this.refresh('save-appearance'); },
    async save() {
        if (this.busy || App.shopBusy) return;
        const userId = GameState.user?.id;
        this.busy = true; this.refresh();
        try {
            const result = await Wardrobe.saveAppearance(this.draft);
            if (GameState.user?.id !== userId) return;
            this.savedMessage = result.message;
            if (result.ok) this.draft = CharacterArt.normalizeAppearance(GameState.avatar.appearance);
        } catch { if (GameState.user?.id === userId) this.savedMessage = this.text('No se pudo guardar. Vuelve a intentarlo.', 'Could not save. Please try again.'); }
        finally { this.busy = false; if (GameState.user?.id === userId) this.refresh('save-appearance'); }
    },
    tryOn(id) {
        const item = Wardrobe.listCosmetics().find(i => i.id === id);
        if (!item) return;
        this.returnFocus = document.activeElement;
        const appearance = { ...this.previewAppearance(), [item.slot]: id };
        this.previewItem = id;
        document.getElementById('modal-root').innerHTML = `<div class="pixel-modal-backdrop fitting-backdrop" onclick="if(event.target===this) Atelier.closePreview()"><section class="fitting-modal card" role="dialog" aria-modal="true" aria-labelledby="fitting-title"><button class="pixel-modal-close" onclick="Atelier.closePreview()" aria-label="${this.text('Cerrar', 'Close')}">×</button><span class="eyebrow">${this.text('PROBADOR', 'FITTING ROOM')}</span><h2 id="fitting-title">${this.escape(item.name)}</h2><div class="character-pedestal">${CharacterArt.render({ ...GameState.avatar, appearance })}</div><p>${this.text('Así se verá en tu personaje.', 'How it will look on your character.')}</p><button id="close-fitting" class="btn btn-secondary" onclick="Atelier.closePreview()">${this.text('VOLVER', 'BACK')}</button></section></div>`;
        document.getElementById('close-fitting').focus();
    },
    closePreview() { document.getElementById('modal-root').innerHTML = ''; this.previewItem = null; this.returnFocus?.focus({ preventScroll: true }); },
    async buy(id) { await this.perform(() => Wardrobe.purchase(id)); },
    async equip(id) { await this.perform(() => Wardrobe.equip(id)); },
    async unequip(slot) { await this.perform(() => Wardrobe.unequip(slot)); },
    async perform(action) {
        if (this.busy || App.shopBusy) return;
        const userId = GameState.user?.id;
        if (!userId) return;
        App.shopBusy = true;
        this.busy = true; this.refresh();
        try {
            const result = await action();
            if (GameState.user?.id !== userId) return;
            if (result.ok && this.draft) {
                this.draft.outfit = GameState.avatar.appearance.outfit;
                this.draft.accessory = GameState.avatar.appearance.accessory;
            }
            this.savedMessage = result.message;
            App.showToast(result.message, result.ok ? 'success' : 'error');
        } catch { if (GameState.user?.id === userId) App.showToast(this.text('No se pudo completar. Inténtalo de nuevo.', 'Could not complete. Please try again.'), 'error'); }
        finally {
            this.busy = false;
            App.shopBusy = false;
            if (GameState.user?.id === userId) this.refresh();
        }
    }
};
window.Atelier = Atelier;

document.addEventListener('keydown', event => {
    if (!Atelier.previewItem) return;
    if (event.key === 'Escape') { event.preventDefault(); Atelier.closePreview(); }
    if (event.key === 'Tab') {
        const buttons = [...document.querySelectorAll('.fitting-modal button')];
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
});
