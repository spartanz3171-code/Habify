// Battle presentation only. Pausing and rotation never finish a match or pay rewards.
const BattleScreen = {
    battle: null,
    needsResume: false,
    focusPaused: false,
    fullscreenRoot: null,
    locked: false,
    generation: 0,
    text(es, en) { return I18N.current === 'en' ? en : es; },
    mobile() { return (navigator.maxTouchPoints > 0 || matchMedia('(any-pointer: coarse)').matches) && Math.min(innerWidth, innerHeight) <= 900; },
    portrait() { return this.mobile() && innerHeight > innerWidth; },
    active() { return GameState.currentView === 'arena' && GameState.currentBattle && !GameState.currentBattle.isFinished; },
    init() {
        if (this.initialized) return;
        this.initialized = true;
        window.addEventListener('resize', () => this.sync());
        window.visualViewport?.addEventListener('resize', () => this.sync());
        document.addEventListener('fullscreenchange', () => this.sync());
        document.addEventListener('keydown', event => {
            if (!this.active()) return;
            const overlay = document.getElementById('battle-pause-screen');
            if (event.key === 'Escape' && !this.portrait()) {
                event.preventDefault();
                this.needsResume ? this.resume() : this.pause();
            }
            if (event.key === 'Tab' && overlay && !overlay.hidden) {
                const buttons = [...overlay.querySelectorAll('button:not([hidden])')];
                const first = buttons[0], last = buttons.at(-1);
                if (event.shiftKey && (document.activeElement === first || !buttons.includes(document.activeElement))) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && (document.activeElement === last || !buttons.includes(document.activeElement))) { event.preventDefault(); first?.focus(); }
            }
        });
    },
    stop() { App.releaseBattleInputs?.(); Engine.stopGameLoop(); },
    canPlay() {
        return !!this.active() && !this.portrait() && !this.needsResume && !this.focusPaused && !document.hidden && !document.querySelector('[role="dialog"]:not([hidden])');
    },
    sync() {
        this.init();
        const active = this.active();
        document.body.classList.toggle('battle-immersive', !!active && (this.mobile() || document.fullscreenElement === document.getElementById('app-content')));
        if (!active) {
            this.stop();
            // Keep a paused match ready to resume when returning from another page.
            if (!GameState.currentBattle || GameState.currentBattle.isFinished) { this.battle = null; this.needsResume = false; }
            this.leaveFullscreen();
            return;
        }
        if (this.battle !== GameState.currentBattle) {
            this.battle = GameState.currentBattle;
            this.needsResume = false;
        }
        const rotate = this.portrait();
        if (rotate) this.needsResume = true;
        const overlay = document.getElementById('battle-pause-screen');
        const show = rotate || this.needsResume;
        const wasShown = overlay && !overlay.hidden;
        if (overlay) {
            overlay.hidden = !show;
            overlay.dataset.rotate = String(rotate);
            document.getElementById('battle-pause-title').textContent = rotate ? this.text('Gira tu celular', 'Turn your phone') : this.text('Batalla en pausa', 'Battle paused');
            document.getElementById('battle-pause-description').textContent = rotate
                ? this.text('Ponlo de lado para jugar con más espacio. La pelea espera: no perderás vida mientras giras.', 'Turn it sideways for more room. The fight is paused: you will not lose health while turning.')
                : this.text('Todo listo. Continúa cuando estés preparado.', 'Ready when you are. Continue whenever you are ready.');
            document.getElementById('battle-rotation-help').hidden = !rotate;
            document.getElementById('battle-resume').hidden = rotate;
        }
        document.getElementById('battle-gameplay').inert = show;
        const fullscreen = document.getElementById('battle-fullscreen');
        if (fullscreen) {
            fullscreen.hidden = !document.fullscreenEnabled || !!document.fullscreenElement;
            fullscreen.disabled = !!this.requestingFullscreen;
        }
        if (show || !this.canPlay()) this.stop();
        else Engine.startGameLoop();
        if (show && !wasShown) (rotate ? document.getElementById('battle-pause-title') : document.getElementById('battle-resume'))?.focus({ preventScroll: true });
        if (show && wasShown && !rotate && document.activeElement?.id === 'battle-pause-title') document.getElementById('battle-resume')?.focus({ preventScroll: true });
    },
    pause() { this.needsResume = true; this.sync(); },
    resume() {
        if (this.portrait()) return;
        this.needsResume = false;
        this.focusPaused = false;
        this.sync();
        document.getElementById('battle-pause-button')?.focus({ preventScroll: true });
    },
    blur() { this.focusPaused = true; this.stop(); },
    focus() { this.focusPaused = false; this.sync(); },
    leave() { this.stop(); this.leaveFullscreen(); document.body.classList.remove('battle-immersive'); },
    leaveFullscreen() {
        this.generation++;
        if (this.locked) { try { screen.orientation?.unlock(); } catch (_) {} this.locked = false; }
        const root = this.fullscreenRoot;
        this.fullscreenRoot = null;
        if (root && document.fullscreenElement === root) document.exitFullscreen().catch(() => {});
    },
    async fullscreen() {
        const root = document.getElementById('app-content');
        if (!this.active() || this.requestingFullscreen || !root.requestFullscreen || !document.fullscreenEnabled) return;
        const generation = this.generation;
        this.requestingFullscreen = true;
        this.fullscreenRoot = root;
        try {
            // This call is made directly from the player's button press.
            await root.requestFullscreen();
            if (!this.active() || generation !== this.generation) {
                if (document.fullscreenElement === root) await document.exitFullscreen();
                return;
            }
            if (this.mobile() && screen.orientation?.lock) {
                try {
                    await screen.orientation.lock('landscape');
                    if (!this.active() || generation !== this.generation) screen.orientation.unlock();
                    else this.locked = true;
                } catch (_) { /* Rotation prompt remains available when locking is unsupported. */ }
            }
        } catch (_) {
            const hint = document.getElementById('battle-screen-hint');
            if (hint) hint.textContent = this.text('Puedes seguir jugando sin pantalla completa.', 'You can keep playing without fullscreen.');
        } finally { this.requestingFullscreen = false; this.sync(); }
    }
};
