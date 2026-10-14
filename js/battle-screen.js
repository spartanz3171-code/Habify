// Battle presentation only. Pausing and rotation never finish a match or pay rewards.
const BattleScreen = {
    battle: null,
    needsResume: false,
    focusPaused: false,
    fullscreenRoot: null,
    locked: false,
    generation: 0,
    rotated: false,
    sessionActive: false,
    portraitLocked: false,
    restoringPortrait: null,
    text(es, en) { return I18N.current === 'en' ? en : es; },
    mobile() { return (navigator.maxTouchPoints > 0 || matchMedia('(any-pointer: coarse)').matches) && Math.min(innerWidth, innerHeight) <= 900; },
    portrait() { return this.mobile() && innerHeight > innerWidth; },
    waitingForTurn() { return this.portrait() && !this.rotated; },
    active() { return GameState.currentView === 'arena' && GameState.currentBattle && !GameState.currentBattle.isFinished; },
    init() {
        if (this.initialized) return;
        this.initialized = true;
        const resize = () => {
            if (this.resizeFrame) return;
            this.resizeFrame = requestAnimationFrame(() => { this.resizeFrame = null; this.sync(); });
        };
        window.addEventListener('resize', resize);
        window.visualViewport?.addEventListener('resize', resize);
        window.addEventListener('orientationchange', resize);
        screen.orientation?.addEventListener('change', resize);
        // iOS can pan the document despite overflow:hidden. Only the pause dialog may scroll.
        document.addEventListener('touchmove', event => {
            if (document.body.classList.contains('battle-immersive') && event.target.closest?.('#battle-gameplay')) event.preventDefault();
        }, { passive: false });
        document.addEventListener('fullscreenchange', () => this.sync());
        document.addEventListener('keydown', event => {
            if (!this.active()) return;
            const overlay = document.getElementById('battle-pause-screen');
            if (event.key === 'Escape' && !this.waitingForTurn()) {
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
    updateViewport() {
        if (!this.active()) return;
        const viewport = window.visualViewport;
        const style = document.getElementById('app-content').style;
        const width = Math.round(Math.min(innerWidth, viewport?.width || innerWidth));
        const height = Math.round(Math.min(innerHeight, viewport?.height || innerHeight));
        style.setProperty('--battle-width', `${width}px`);
        style.setProperty('--battle-height', `${height}px`);
        // A fixed, scroll-locked root must not follow visualViewport scroll offsets.
    },
    canPlay() {
        return !!this.active() && !this.waitingForTurn() && !this.needsResume && !this.focusPaused && !document.hidden && !document.querySelector('[role="dialog"]:not([hidden])');
    },
    sync() {
        this.init();
        const active = this.active();
        if (active && !this.sessionActive) {
            this.sessionActive = true;
            this.generation++;
            if (this.portraitLocked) { try { screen.orientation?.unlock(); } catch (_) {} this.portraitLocked = false; }
        }
        if (!this.portrait()) this.rotated = false;
        const immersive = !!active && (this.mobile() || document.fullscreenElement === document.getElementById('app-content'));
        if (immersive && !document.body.classList.contains('battle-immersive')) window.scrollTo(0, 0);
        document.documentElement.classList.toggle('battle-immersive', immersive);
        document.body.classList.toggle('battle-immersive', immersive);
        document.body.classList.toggle('battle-rotated', !!active && this.rotated);
        if (!active) {
            this.leave();
            const hint = document.getElementById('battle-portrait-hint');
            if (hint) hint.hidden = !this.mobile() || this.portrait();
            // Keep a paused match ready to resume when returning from another page.
            if (!GameState.currentBattle || GameState.currentBattle.isFinished) { this.battle = null; this.needsResume = false; }
            return;
        }
        this.updateViewport();
        if (this.battle !== GameState.currentBattle) {
            this.battle = GameState.currentBattle;
            this.needsResume = false;
        }
        const rotate = this.waitingForTurn();
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
            document.getElementById('battle-rotate-fallback').hidden = !rotate;
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
    rotateArena() {
        if (!this.active() || !this.portrait()) return;
        this.rotated = true;
        this.resume();
    },
    resume() {
        if (this.waitingForTurn()) return;
        this.needsResume = false;
        this.focusPaused = false;
        this.sync();
        document.getElementById('battle-pause-button')?.focus({ preventScroll: true });
    },
    blur() { this.focusPaused = true; this.stop(); },
    focus() { this.focusPaused = false; this.sync(); },
    leave() {
        this.stop();
        const restore = this.sessionActive && this.mobile();
        this.sessionActive = false;
        this.rotated = false;
        document.body.classList.remove('battle-immersive', 'battle-rotated');
        document.documentElement.classList.remove('battle-immersive');
        const style = document.getElementById('app-content')?.style;
        ['width', 'height', 'left', 'top'].forEach(key => style?.removeProperty(`--battle-${key}`));
        // Remove the visual rotation immediately; native orientation is best effort.
        if (restore || this.fullscreenRoot || this.locked || this.requestingFullscreen) this.leaveFullscreen(restore);
    },
    leaveFullscreen(restorePortrait = false) {
        const generation = ++this.generation;
        if (this.locked) { try { screen.orientation?.unlock(); } catch (_) {} this.locked = false; }
        const root = this.fullscreenRoot;
        this.fullscreenRoot = null;
        const exit = root && document.fullscreenElement === root ? document.exitFullscreen().catch(() => {}) : Promise.resolve();
        if (restorePortrait && screen.orientation?.lock) {
            const restore = exit.then(async () => {
                if (this.active() || generation !== this.generation) return;
                try {
                    await screen.orientation.lock('portrait');
                    if (this.active() || generation !== this.generation) screen.orientation.unlock();
                    else this.portraitLocked = true;
                } catch (_) { /* Safari can refuse native rotation; normal page layout is already restored. */ }
            });
            this.restoringPortrait = restore;
            restore.finally(() => { if (this.restoringPortrait === restore) this.restoringPortrait = null; });
        }
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
                    // A late portrait request from the last fight must settle first.
                    await this.restoringPortrait;
                    if (!this.active() || generation !== this.generation) return;
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
