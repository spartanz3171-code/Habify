// ==========================================
// HABIFY - Main App Controller
// With Supabase Auth + Cooldown Timers
// ==========================================

const App = {
    shopBusy: false,
    authBusy: false,
    pendingVerificationEmail: '',
    verificationResendAt: 0,
    authSessionVersion: 0,

    async init() {
        I18N.updateStaticUI();
        document.getElementById('lang-switch').value = I18N.current;
        const callback = new URLSearchParams(location.hash.slice(1));
        PasswordRecovery.expected = callback.get('type') === 'recovery';
        const query = new URLSearchParams(location.search);
        const callbackError = callback.get('error_code') || query.get('error_code') || callback.get('error') || query.get('error');
        try {
            await initSupabase();
        } catch (e) {
            console.error('Supabase init failed:', e);
            this.showAuth('login');
            return;
        }

        this._authSubscription?.unsubscribe();
        // SDK callbacks run under an auth lock. Schedule network work after they return.
        const subscription = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                PasswordRecovery.clear();
                this.authSessionVersion++;
                this.clearAccountView();
                GameState.user = null;
                if (!this.authBusy) this.showAuth('login');
            } else if (event === 'PASSWORD_RECOVERY') {
                PasswordRecovery.expected = true;
                PasswordRecovery.received = true;
                this.authSessionVersion++;
                setTimeout(() => PasswordRecovery.authorize(session), 0);
            } else if (event === 'SIGNED_IN' && session && !this.authBusy && !PasswordRecovery.expected) {
                const version = this.authSessionVersion;
                setTimeout(() => { if (version === this.authSessionVersion) this.acceptAuthSession(session); }, 0);
            }
        });
        this._authSubscription = subscription?.data?.subscription;

        if (callbackError) {
            // Never keep callback tokens/errors in links, screenshots or browser history.
            history.replaceState(null, '', location.pathname);
            if (PasswordRecovery.expected) PasswordRecovery.invalid();
            else { this.showAuth('login'); this.showAuthError({ code: callbackError === 'otp_expired' ? 'otp_expired' : 'invalid_confirmation' }); }
        } else {
            try {
                const { data, error } = await supabase.auth.getSession();
                if (error) throw error;
                if (PasswordRecovery.expected || PasswordRecovery.received) {
                    if (PasswordRecovery.received) await PasswordRecovery.authorize(data?.session);
                    else PasswordRecovery.invalid();
                } else if (data?.session) await this.acceptAuthSession(data.session);
                else {
                    let pending = '';
                    try { pending = sessionStorage.getItem('habify_pending_verification') || ''; } catch (_) { /* Storage can be unavailable. */ }
                    if (pending) this.showEmailVerification(pending);
                    else this.showAuth('login');
                }
            } catch (error) { this.showAuth('login'); this.showAuthError(error); }
        }

        this.initInput();
    },

    clearAccountView() {
        HabitProgress.ready = false;
        HabitProgress.installed = false;
        GameState._avatarBalance = null;
        GameState.habits = [];
        Engine.stopGameLoop();
        Wardrobe.reset();
        Atelier.draft = null;
        Atelier.previewItem = null;
        Atelier.savedMessage = '';
        document.getElementById('modal-root').innerHTML = '';
        GameState.currentBattle = null;
        GameState._currentOpponent = null;
        GameState._lastBattleResult = null;
    },

    initInput() {
        if (this._inputReady) return;
        this._inputReady = true;
        const sources = new Map();
        const pointers = new Map();
        const keys = new Map();
        const active = () => GameState.currentView === 'arena' && GameState.currentBattle && !GameState.currentBattle.isFinished && !document.querySelector('[role="dialog"]');
        const input = (action, source, pressed) => {
            const held = sources.get(action) || new Set();
            const wasPressed = held.size > 0;
            if (pressed) held.add(source); else held.delete(source);
            sources.set(action, held);
            if (wasPressed !== (held.size > 0)) Engine.handleInput(action, held.size > 0);
        };
        const keyAction = code => ({ ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', Space: 'attack', KeyZ: 'attack', KeyV: 'heavy', KeyC: 'guard', KeyH: 'heal', KeyX: GameState.avatar.equippedSpell?.includes('spell_fire') ? 'fire' : (GameState.avatar.equippedSpell?.includes('spell_heal') ? 'heal' : 'magic') })[code];
        window.addEventListener('keydown', event => {
            if (!active() || event.target.closest?.('input,select,textarea,[contenteditable="true"]')) return;
            if (event.code === 'Space' && event.target.closest?.('button:not([data-action])')) return;
            const action = keyAction(event.code);
            if (!action) return;
            event.preventDefault();
            if (event.repeat) return;
            keys.set(event.code, action);
            input(action, event.code, true);
        });
        window.addEventListener('keyup', event => {
            const action = keys.get(event.code);
            if (!action) return;
            input(action, event.code, false);
            keys.delete(event.code);
        });
        document.addEventListener('pointerdown', event => {
            const button = event.target.closest?.('[data-action]');
            if (!button || !active() || button.disabled) return;
            event.preventDefault();
            button.setPointerCapture?.(event.pointerId);
            pointers.set(event.pointerId, { button, action: button.dataset.action });
            button.classList.add('active');
            input(button.dataset.action, event.pointerId, true);
        });
        const release = event => {
            const pointer = pointers.get(event.pointerId);
            if (!pointer) return;
            pointers.delete(event.pointerId);
            input(pointer.action, event.pointerId, false);
            if (![...pointers.values()].some(p => p.button === pointer.button)) pointer.button.classList.remove('active');
        };
        document.addEventListener('pointerup', release);
        document.addEventListener('pointercancel', release);
        document.addEventListener('lostpointercapture', release);
        this.releaseBattleInputs = () => {
            sources.clear(); keys.clear(); pointers.clear();
            Engine.resetInputs();
            document.querySelectorAll('[data-action].active').forEach(b => b.classList.remove('active'));
        };
        const pause = () => { this.releaseBattleInputs(); Engine.stopGameLoop(); };
        const resume = () => { if (!document.hidden && active()) Engine.startGameLoop(); };
        window.addEventListener('blur', pause);
        window.addEventListener('focus', resume);
        document.addEventListener('visibilitychange', () => document.hidden ? pause() : resume());
    },

    updateRegistrationPreview() {
        const root = document.getElementById('registration-preview');
        if (!root) return;
        const body = document.getElementById('auth-avatar-body').value;
        root.innerHTML = CharacterArt.render({ avatarClass: document.getElementById('auth-avatar-class').value, appearance: { body, hairStyle: body === 'female' ? 'ponytail' : 'short' } });
    },

    async loadUserData() {
        const userId = GameState.user?.id;
        const isCurrentUser = () => !!userId && GameState.user?.id === userId;
        if (!isCurrentUser()) return;
        const content = document.getElementById('app-content');
        content.innerHTML = Views.renderLoading();

        const loaded = await loadGameFromDB();
        if (!isCurrentUser()) return;
        if (!loaded) {
            // If avatar wasn't created yet (trigger may be slow), wait and retry
            await new Promise(r => setTimeout(r, 1500));
            if (!isCurrentUser()) return;
            await loadGameFromDB();
            if (!isCurrentUser()) return;
        }

        // Check daily penalties
        const penalties = await Engine.checkDailyPenalties();
        if (!isCurrentUser()) return;
        if (penalties.length > 0) {
            const totalHp = penalties.reduce((sum, p) => sum + p.hpLost, 0);
            setTimeout(() => {
                if (!isCurrentUser()) return;
                this.showToast(`PENALIZACION: -${totalHp}HP por habitos no cumplidos`, 'error');
            }, 500);
        }

        // Show main app
        this.showMainApp();

        // Start cooldown timer
        this.startCooldownTimer();

        // Auto-show tutorial if first time or 0 habits
        const seenTutorial = localStorage.getItem('habify_tutorial_seen_' + GameState.user.id);
        if (!seenTutorial || GameState.habits.length === 0) {
            setTimeout(() => {
                if (!isCurrentUser()) return;
                this.openTutorial();
            }, 600);
        }
    },

    showMainApp() {
        I18N.updateStaticUI();
        // Show header and nav
        const header = document.getElementById('app-header');
        const nav = document.getElementById('bottom-nav');
        if (header) header.style.display = 'flex';
        if (nav) nav.style.display = 'flex';

        this.setupNavigation();
        this.navigate('dashboard');
        this.updateHeader();
    },

    // --- Auth ---

    authText(es, en) { return I18N.current === 'en' ? en : es; },

    confirmationRedirect() {
        // A confirmation opened on another device cannot reach this computer's local server.
        const current = new URL(location.href);
        if (!['http:', 'https:'].includes(current.protocol) ||
            ['localhost', '127.0.0.1', '[::1]'].includes(current.hostname)) {
            return 'https://habify-ten.vercel.app/';
        }
        // Preserve hosted subdirectories without forwarding a token or query.
        return new URL('./', current).href;
    },

    async requireEmailConfirmation() {
        const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY }, cache: 'no-store' });
        if (!response.ok) throw new Error('Could not check authentication settings');
        const settings = await response.json();
        if (settings.mailer_autoconfirm !== false) throw { code: 'confirmation_not_enabled' };
    },

    authErrorMessage(error) {
        const code = error?.code || '';
        const message = error?.message || '';
        if (code === 'otp_expired' || code === 'invalid_confirmation') return this.authText('El enlace venció o ya fue utilizado. Solicita uno nuevo con tu correo.', 'The link expired or was already used. Request a new one with your email.');
        if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) return this.authText('Confirma tu correo antes de iniciar sesión.', 'Confirm your email before signing in.');
        if (code === 'invalid_credentials' || /Invalid login credentials/i.test(message)) return this.authText('Correo o contraseña incorrectos.', 'Incorrect email or password.');
        if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || /rate limit|too many|security purposes/i.test(message)) return this.authText('Se alcanzó el límite de envíos. Espera unos minutos antes de volver a intentarlo.', 'The sending limit was reached. Wait a few minutes before trying again.');
        if (code === 'email_address_not_authorized' || /error sending|smtp|not authorized/i.test(message)) return this.authText('No pudimos enviar la verificación. El administrador debe revisar el servicio de correo.', 'We could not send the verification. The administrator needs to check the email service.');
        if (code === 'confirmation_not_enabled') return this.authText('El registro está temporalmente cerrado mientras se activa la verificación por correo. Inténtalo más tarde.', 'Registration is temporarily closed while email verification is being enabled. Please try again later.');
        if (code === 'user_already_exists' || /already registered/i.test(message)) return this.authText('Este correo ya está registrado. Inicia sesión.', 'This email is already registered. Sign in.');
        if (code === 'weak_password') return this.authText('Elige una contraseña más segura de al menos 6 caracteres.', 'Choose a stronger password with at least 6 characters.');
        if (code === 'email_address_invalid' || code === 'validation_failed') return this.authText('Escribe una dirección de correo válida.', 'Enter a valid email address.');
        return this.authText('No se pudo completar la solicitud. Revisa tu conexión y vuelve a intentarlo.', 'The request could not be completed. Check your connection and try again.');
    },

    showAuthError(error) {
        const root = document.getElementById('auth-error');
        if (root) { root.textContent = this.authErrorMessage(error); root.classList.add('show'); }
    },

    async acceptAuthSession(session) {
        if (PasswordRecovery.expected || PasswordRecovery.received) return false;
        if (!session?.user?.id || this.authBusy && this._registering) return false;
        if (this._acceptingUser === session.user.id) return this._acceptingPromise;
        const version = this.authSessionVersion;
        this._acceptingUser = session.user.id;
        this._acceptingPromise = (async () => {
            // Confirmation comes from Supabase, never from editable metadata or local storage.
            const { data, error } = await supabase.auth.getUser();
            if (version !== this.authSessionVersion) return false;
            if (error) throw error;
            const user = data?.user;
            if (!user || user.id !== session.user.id) throw new Error('Session changed');
            if (!user.email || !user.email_confirmed_at) {
                await supabase.auth.signOut({ scope: 'local' });
                this.clearAccountView();
                GameState.user = null;
                this.showEmailVerification(user.email || '', { error: this.authErrorMessage({ code: 'email_not_confirmed' }) });
                return false;
            }
            if (GameState.user?.id === user.id) return true;
            await this.finishRegistration(user);
            if (version !== this.authSessionVersion) return false;
            this.clearAccountView();
            GameState.user = user;
            this.pendingVerificationEmail = '';
            try { sessionStorage.removeItem('habify_pending_verification'); } catch (_) { /* Optional storage. */ }
            await this.loadUserData();
            return true;
        })();
        try { return await this._acceptingPromise; }
        catch (error) {
            if (version === this.authSessionVersion) {
                this.clearAccountView();
                GameState.user = null;
                this.showAuth('login');
                this.showAuthError(error);
            }
            return false;
        }
        finally { this._acceptingUser = null; this._acceptingPromise = null; }
    },

    async finishRegistration(user) {
        // Confirmation may happen on another device. Preserve the choices in server metadata.
        const initial = user.user_metadata;
        if (initial?.habify_profile_pending !== true) return;
        const avatarClass = ['hero', 'mage', 'knight', 'elf'].includes(initial.avatar_class) ? initial.avatar_class : 'hero';
        const name = String(initial.avatar_name || 'Héroe').trim().slice(0, 16);
        const { data, error } = await supabase.from('avatars').update({ name, avatar_class: avatarClass }).eq('user_id', user.id).select('id');
        if (error || !data?.length) throw error || new Error('Avatar not ready');
        const result = await supabase.auth.updateUser({ data: { habify_profile_pending: false } });
        if (result.error) throw result.error;
        user.user_metadata = { ...initial, habify_profile_pending: false };
    },

    showAuth(mode) {
        clearInterval(this._verificationTimer);
        this.authMode = mode;
        GameState.currentView = 'auth';
        Engine.stopGameLoop();
        document.body.dataset.view = 'auth';
        // Hide header and nav
        const header = document.getElementById('app-header');
        const nav = document.getElementById('bottom-nav');
        if (header) header.style.display = 'none';
        if (nav) nav.style.display = 'none';

        const content = document.getElementById('app-content');
        content.innerHTML = Views.renderAuth(mode);
        if (this.pendingVerificationEmail) document.getElementById('auth-email').value = this.pendingVerificationEmail;
    },

    showEmailVerification(email, options = {}) {
        this.pendingVerificationEmail = String(email || '').trim();
        try { sessionStorage.setItem('habify_pending_verification', this.pendingVerificationEmail); } catch (_) { /* Optional storage. */ }
        this.showAuth('login');
        document.getElementById('app-content').innerHTML = Views.renderEmailVerification(this.pendingVerificationEmail, options);
        this.updateVerificationCooldown();
        this._verificationTimer = setInterval(() => this.updateVerificationCooldown(), 1000);
    },

    updateVerificationCooldown() {
        const button = document.getElementById('verification-resend');
        if (!button) { clearInterval(this._verificationTimer); return; }
        const seconds = Math.max(0, Math.ceil((this.verificationResendAt - Date.now()) / 1000));
        button.disabled = this._resending || seconds > 0;
        button.textContent = this._resending ? this.authText('ENVIANDO…', 'SENDING…') : seconds > 0
            ? this.authText(`REENVIAR EN ${seconds} s`, `RESEND IN ${seconds} s`)
            : this.authText('REENVIAR VERIFICACIÓN', 'RESEND VERIFICATION');
    },

    requestVerificationFromLogin() {
        const input = document.getElementById('auth-email');
        if (!input.reportValidity()) return;
        this.showEmailVerification(input.value);
    },

    async resendVerification() {
        if (this._resending || Date.now() < this.verificationResendAt || !this.pendingVerificationEmail) return;
        this._resending = true;
        this.updateVerificationCooldown();
        const email = this.pendingVerificationEmail;
        const status = document.getElementById('verification-status');
        const errorRoot = document.getElementById('auth-error');
        errorRoot?.classList.remove('show');
        try {
            const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: this.confirmationRedirect() } });
            if (error) throw error;
            this.verificationResendAt = Date.now() + 60000;
            if (status?.isConnected && email === this.pendingVerificationEmail) status.textContent = this.authText('Si tu cuenta está pendiente de confirmar, recibirás un nuevo enlace. Revisa también spam.', 'If your account is awaiting confirmation, you will receive a new link. Check spam too.');
        } catch (error) {
            if (/rate_limit/.test(error.code || '')) this.verificationResendAt = Date.now() + 60000;
            if (errorRoot?.isConnected) this.showAuthError(error);
        } finally { this._resending = false; this.updateVerificationCooldown(); }
    },

    async handleAuth(event, mode) {
        event.preventDefault();
        if (this.authBusy || !document.getElementById('auth-form').reportValidity()) return;
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        const errorEl = document.getElementById('auth-error');
        const submitBtn = document.getElementById('auth-submit');

        this.authBusy = true;
        this._registering = mode === 'register';
        submitBtn.textContent = this.authText('CARGANDO…', 'LOADING…');
        submitBtn.disabled = true;
        errorEl.classList.remove('show');

        try {
            if (mode === 'register') {
                // Do not create an automatically confirmed account while the server is misconfigured.
                await this.requireEmailConfirmation();
                const avatarName = document.getElementById('auth-avatar-name').value.trim() || 'Héroe';
                const avatarClass = document.getElementById('auth-avatar-class').value || 'hero';
                const body = document.getElementById('auth-avatar-body').value;
                const initialAppearance = CharacterArt.normalizeAppearance({ body, hairStyle: body === 'female' ? 'ponytail' : 'short' });

                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: this.confirmationRedirect(),
                        data: { avatar_name: avatarName, avatar_class: avatarClass, appearance: initialAppearance, habify_profile_pending: true }
                    }
                });

                if (error) throw error;

                if (data?.session) {
                    // A server with automatic confirmation enabled cannot promise mailbox verification.
                    await supabase.auth.signOut({ scope: 'local' });
                    throw { code: 'confirmation_not_enabled' };
                }
                this.verificationResendAt = Date.now() + 60000;
                this.showEmailVerification(email, { sent: true });
            } else {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password
                });
                if (error) throw error;
                if (data?.session) await this.acceptAuthSession(data.session);
            }
        } catch (err) {
            if (err.code === 'email_not_confirmed' || /email not confirmed/i.test(err.message || '')) this.showEmailVerification(email, { error: this.authErrorMessage(err) });
            else this.showAuthError(err);
        } finally {
            this.authBusy = false;
            this._registering = false;
            if (submitBtn.isConnected) {
                submitBtn.textContent = `>> ${I18N.t(mode === 'login' ? 'auth.login' : 'auth.register')} <<`;
                submitBtn.disabled = false;
            }
        }
    },

    async logout() {
        if (confirm('Cerrar sesion?')) {
            // Clear cooldown timer
            if (GameState._cooldownInterval) {
                clearInterval(GameState._cooldownInterval);
            }
            await supabase.auth.signOut();
        }
    },

    // --- Navigation ---

    setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.onclick = event => { event.preventDefault(); this.navigate(item.dataset.view); };
        });
    },

    navigate(viewName) {
        const previous = GameState.currentView;
        this.releaseBattleInputs?.();
        Engine.stopGameLoop();
        GameState.currentView = viewName;
        if (viewName === 'character' && (previous !== 'character' || !Atelier.draft)) Atelier.begin();
        const content = document.getElementById('app-content');
        const renderers = { dashboard: () => Views.renderDashboard(), habits: () => Views.renderHabits(), store: () => Views.renderStore(), arena: () => Views.renderArena(), character: () => Atelier.render() };
        content.innerHTML = (renderers[viewName] || renderers.dashboard)();
        content.style.opacity = '1';
        document.body.dataset.view = viewName;
        document.querySelectorAll('.nav-item').forEach(item => {
            const selected = item.dataset.view === viewName;
            item.classList.toggle('active', selected);
            if (selected) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
        });
        this.updateHeader();
        if (viewName === 'arena' && GameState.currentBattle && !GameState.currentBattle.isFinished && !document.hidden) Engine.startGameLoop();
        if (previous !== viewName) window.scrollTo({ top: 0, behavior: 'instant' });
    },

    updateHeader() {
        const goldEl = document.getElementById('header-gold');
        const levelEl = document.getElementById('header-level');
        if (goldEl) goldEl.textContent = GameState.avatar.gold;
        if (levelEl) levelEl.textContent = `LV${GameState.avatar.level}`;
    },

    // --- Cooldown Timer ---

    startCooldownTimer() {
        if (GameState._cooldownInterval) clearInterval(GameState._cooldownInterval);

        GameState._cooldownInterval = setInterval(() => {
            if (HabitProgress.ready) { HabitProgress.refreshDay(); return; }
            if (GameState.currentView !== 'dashboard') return;

            // Update all cooldown displays
            GameState.habits.forEach(h => {
                const el = document.querySelector(`[data-habit-id="${h.id}"]`);
                if (el && isOnCooldown(h)) {
                    const remaining = getRemainingCooldown(h);
                    if (remaining) {
                        el.textContent = remaining;
                    } else {
                        // Cooldown expired, re-render
                        this.navigate('dashboard');
                    }
                }
            });
        }, 1000);
    },

    // --- Habit Actions ---

    async toggleHabit(id) {
        if (HabitProgress.installed && !HabitProgress.ready) return this.showToast(this.authText('Recarga para sincronizar tus hábitos antes de registrar progreso.', 'Reload to sync your habits before recording progress.'), 'error');
        if (HabitProgress.ready) return HabitProgress.complete(id);
        const habit = GameState.habits.find(h => h.id === id);
        if (!habit || isOnCooldown(habit)) return;

        const result = await Engine.completeHabit(id);
        if (result) {
            if (result.type === 'reward') {
                this.showToast(result.message, 'success');
            } else if (result.type === 'penalty') {
                this.showToast(result.message, 'error');
                if (result.gameOver) {
                    setTimeout(() => {
                        this.showToast('TU AVATAR HA CAIDO! -20XP', 'error');
                    }, 1500);
                }
            }
        }

        this.navigate('dashboard');
    },

    filterCatalog(category) {
        GameState._catalogFilter = category;
        this.navigate('habits');
    },

    async activateCatalogHabit(catalogId) {
        if (GameState.habits.length >= 20) {
            this.showToast('Límite de 20 misiones alcanzado', 'error');
            return;
        }
        const selectEl = document.getElementById(`freq-select-${catalogId}`);
        const chosenFreq = selectEl ? selectEl.value : 'daily';
        const res = await Engine.addHabitFromCatalog(catalogId, chosenFreq);
        if (res.success) {
            this.showToast(res.message || '¡MISIÓN ACTIVADA!', 'success');
            this.navigate('habits');
        } else {
            this.showToast(res.message, 'error');
        }
    },

    async deleteHabit(id) {
        if (HabitProgress.ready) return HabitProgress.confirmDelete(id);
        if (HabitProgress.installed) return this.showToast(this.authText('Recarga para sincronizar tus hábitos.', 'Reload to sync your habits.'), 'error');
        if (!confirm(this.authText('¿Estás seguro de que deseas eliminar este hábito? Esta acción eliminará su configuración y dejará de aparecer en tu lista.', 'Delete this habit? Its configuration will be removed and it will disappear from your list.'))) return;
        if (getHabitEditCooldown()) return;
        await Engine.removeHabit(id);
        this.showToast('MISIÓN ELIMINADA', 'gold');
        this.navigate('habits');
    },

    async loadDefaults() {
        await Engine.loadDefaultHabits();
        this.showToast('HÁBITOS PRECARGADOS!', 'success');
        this.navigate('habits');
    },

    // --- Tutorial & Onboarding Handlers ---

    openTutorial(step = 0) {
        GameState.tutorialStep = step;
        const root = document.getElementById('modal-root');
        if (root) root.innerHTML = Views.renderTutorialModal(step);
    },

    nextTutorialStep() {
        GameState.tutorialStep = (GameState.tutorialStep || 0) + 1;
        const root = document.getElementById('modal-root');
        if (root) root.innerHTML = Views.renderTutorialModal(GameState.tutorialStep);
    },

    prevTutorialStep() {
        GameState.tutorialStep = Math.max(0, (GameState.tutorialStep || 0) - 1);
        const root = document.getElementById('modal-root');
        if (root) root.innerHTML = Views.renderTutorialModal(GameState.tutorialStep);
    },

    closeTutorial() {
        if (GameState.user) {
            localStorage.setItem('habify_tutorial_seen_' + GameState.user.id, 'true');
        }
        const root = document.getElementById('modal-root');
        if (root) root.innerHTML = '';
    },

    finishTutorialAndGoToHabits() {
        this.closeTutorial();
        this.navigate('habits');
    },

    // --- Admin & Developer Handlers ---

    async openAdminPanel() {
        if (GameState.isAdmin) {
            await loadAllUsersForAdmin();
            const root = document.getElementById('modal-root');
            if (root) root.innerHTML = Views.renderAdminDashboard();
        } else {
            const root = document.getElementById('modal-root');
            if (root) root.innerHTML = Views.renderAdminLoginModal();
        }
    },

    closeAdminLogin() {
        const root = document.getElementById('modal-root');
        if (root) root.innerHTML = '';
    },

    closeAdminDashboard() {
        const root = document.getElementById('modal-root');
        if (root) root.innerHTML = '';
    },

    async handleAdminLogin(e) {
        e.preventDefault();
        const user = document.getElementById('admin-login-user').value.trim();
        const pass = document.getElementById('admin-login-pass').value;

        if ((user.toLowerCase().includes('admin') || user === 'admin@habify.dev') && pass.length >= 4) {
            GameState.isAdmin = true;
            this.showToast('¡ACCESO ADMINISTRADOR CONCEDIDO!', 'gold');
            this.closeAdminLogin();
            await this.openAdminPanel();
        } else {
            this.showToast('Credenciales administrativas incorrectas', 'error');
        }
    },

    async enterAdminDevMode() {
        GameState.isAdmin = true;
        this.showToast('⚡ MODO DESARROLLADOR ACTIVADO', 'gold');
        this.closeAdminLogin();
        await this.openAdminPanel();
    },

    async setAdminTab(tab) {
        GameState.adminTab = tab;
        if (tab === 'users') {
            await loadAllUsersForAdmin();
        }
        const root = document.getElementById('modal-root');
        if (root) root.innerHTML = Views.renderAdminDashboard();
    },

    async adminReviveUser(userId) {
        await Engine.adminReviveUser(userId);
        this.showToast('¡USUARIO REVIVIDO CON 100 HP!', 'success');
        await this.setAdminTab('users');
        if (userId === GameState.avatarId) {
            this.updateHeader();
        }
    },

    async adminGrantGold(userId, amount) {
        await Engine.adminGrantGold(userId, amount);
        this.showToast(`+${amount} ORO OTORGADO`, 'gold');
        await this.setAdminTab('users');
        this.updateHeader();
    },

    async adminGrantXP(userId, amount) {
        await Engine.adminGrantXP(userId, amount);
        this.showToast(`+${amount} XP OTORGADA`, 'success');
        await this.setAdminTab('users');
        this.updateHeader();
    },

    async adminSaveShopPrice(itemId) {
        const input = document.getElementById(`admin-cost-${itemId}`);
        if (!input) return;
        const newCost = parseInt(input.value);
        await Engine.adminUpdateShopItemPrice(itemId, newCost);
        this.showToast('¡PRECIO DE TIENDA ACTUALIZADO!', 'gold');
        await this.setAdminTab('store');
    },

    async adminCreateShopItem(e) {
        e.preventDefault();
        const id = document.getElementById('new-item-id').value.trim();
        const name = document.getElementById('new-item-name').value.trim();
        const cost = parseInt(document.getElementById('new-item-cost').value);
        const icon = document.getElementById('new-item-icon').value.trim();
        const type = document.getElementById('new-item-type').value;
        const description = document.getElementById('new-item-desc').value.trim();

        await adminSaveShopItem({ id, name, cost, icon, type, description });
        this.showToast('¡NUEVO ÍTEM CREADO EN LA TIENDA!', 'success');
        await this.setAdminTab('store');
    },

    async adminSaveMonsterStats(monsterId) {
        const lvl = parseInt(document.getElementById(`m-lvl-${monsterId}`).value);
        const hp = parseInt(document.getElementById(`m-hp-${monsterId}`).value);
        const atk = parseInt(document.getElementById(`m-atk-${monsterId}`).value);
        const xp = parseInt(document.getElementById(`m-xp-${monsterId}`).value);
        const gold = parseInt(document.getElementById(`m-gold-${monsterId}`).value);

        await Engine.adminUpdateMonsterStats(parseInt(monsterId), {
            base_level: lvl, base_hp: hp, base_attack: atk, xp_reward: xp, gold_reward: gold
        });
        this.showToast('¡STATS DEL MONSTRUO ACTUALIZADOS!', 'success');
        await this.setAdminTab('arena');
    },

    async adminCreateMonster(e) {
        e.preventDefault();
        const name = document.getElementById('new-m-name').value.trim();
        const sprite = document.getElementById('new-m-sprite').value;
        const base_level = parseInt(document.getElementById('new-m-lvl').value);
        const base_hp = parseInt(document.getElementById('new-m-hp').value);
        const base_attack = parseInt(document.getElementById('new-m-atk').value);
        const xp_reward = parseInt(document.getElementById('new-m-xp').value);
        const gold_reward = parseInt(document.getElementById('new-m-gold').value);

        await adminSaveMonster({ name, sprite, base_level, base_hp, base_attack, xp_reward, gold_reward });
        this.showToast('¡NUEVO MONSTRUO EN LA ARENA!', 'success');
        await this.setAdminTab('arena');
    },

    async adminAddCatalogHabit(e) {
        e.preventDefault();
        const title = document.getElementById('new-cat-title').value.trim();
        const icon = document.getElementById('new-cat-icon').value.trim();
        const category = document.getElementById('new-cat-category').value;
        const type = document.getElementById('new-cat-type').value;
        const val = parseInt(document.getElementById('new-cat-val').value) || 20;
        const defaultFrequency = document.getElementById('new-cat-freq').value;
        const description = document.getElementById('new-cat-desc').value.trim();

        const newHabit = {
            id: 'hab_custom_' + Date.now(),
            title,
            icon,
            category,
            type,
            xpReward: type === 'positive' ? val : 0,
            hpPenalty: type === 'negative' ? val : 0,
            goldReward: type === 'positive' ? Math.floor(val / 2) : 0,
            defaultFrequency,
            description
        };

        if (HabitProgress.ready) {
            const { error } = await supabase.rpc('save_habit_catalog', { p_definition: newHabit });
            if (error) { this.showToast(this.authText('No se pudo guardar. Revisa los valores y tus permisos de administrador.', 'Could not save. Check the values and your administrator permissions.'), 'error'); return; }
        }
        GameState.presetCatalog.unshift(newHabit);
        this.showToast('¡HÁBITO AÑADIDO AL CATÁLOGO GLOBAL!', 'success');
        await this.setAdminTab('catalog');
    },

    confirmReset() {
        if (confirm(this.authText('¿Recargar la aplicación? Los hábitos, personajes y recompensas guardados se conservarán.', 'Reload the app? Saved habits, characters and rewards will be kept.'))) {
            location.reload();
        }
    },

    // --- Store ---

    filterStore(filter) {
        GameState._storeFilter = filter;
        this.navigate('store');
    },

    async buyItem(itemId) {
        await this.performShopAction(async isCurrentUser => {
            const result = await Engine.buyItem(itemId);
            if (!isCurrentUser()) return;
            this.showToast(result.message, result.success ? 'gold' : 'error');
            if (result.success) await Engine.equipItem(itemId);
        });
    },

    async equipItem(itemId) {
        await this.performShopAction(async isCurrentUser => {
            const result = await Engine.equipItem(itemId);
            if (isCurrentUser() && result?.status === 'success') {
                this.showToast(result.equipped ? 'EQUIPADO!' : 'DESEQUIPADO', result.equipped ? 'success' : 'gold');
            }
        });
    },

    async performShopAction(action) {
        if (this.shopBusy || Atelier.busy || HabitProgress.busy) return;
        const userId = GameState.user?.id;
        if (!userId) return;
        const isCurrentUser = () => GameState.user?.id === userId;
        this.shopBusy = true;
        Atelier.refresh();
        try { await action(isCurrentUser); }
        catch {
            if (isCurrentUser()) this.showToast(Atelier.text('No se pudo completar. Inténtalo de nuevo.', 'Could not complete. Please try again.'), 'error');
        } finally {
            this.shopBusy = false;
            if (isCurrentUser()) { Atelier.refresh(); this.updateHeader(); }
        }
    },

    // --- Battle ---

    async startBattle(mode) {
        if (HabitProgress.busy || this.shopBusy || Atelier.busy) return;
        if (mode === 'pvp') {
            this.startPvP();
            return;
        }

        // ⚠️ DEAD AVATAR CHECK — must complete habits to revive
        if (GameState.avatar.isDead || GameState.avatar.hp <= 0) {
            this.showToast('☠ Tu avatar ha caído. ¡Completa Hábitos para poder revivir y volver a combatir!', 'error');
            return;
        }

        const btn = document.getElementById('battle-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'PREPARANDO...';
        }

        setTimeout(() => {
            if (GameState.currentView !== 'arena') return;
            const opponent = GameState._currentOpponent || Engine.generateOpponent();
            Engine.startPvEBattle(opponent);
            GameState._lastBattleResult = null;
            this.navigate('arena');
        }, 300);
    },


    async attackPvE(type) {
        // Run player animation
        const heroElem = document.querySelector('.player .pixel-hero');
        let delayBeforeHit = 300;
        
        if (heroElem) {
            heroElem.classList.remove('anim-attack-basic', 'anim-spell-fire', 'anim-spell-heal', 'attack');
            
            if (type === 'basic') {
                heroElem.classList.add('anim-attack-basic');
                delayBeforeHit = 400;
            } else if (type === 'spell_fire') {
                heroElem.classList.add('anim-spell-fire');
                const pWrapper = document.querySelector('.player .sprite-wrapper');
                if (pWrapper) {
                    const fireball = document.createElement('div');
                    fireball.className = 'fireball-projectile';
                    pWrapper.appendChild(fireball);
                    setTimeout(() => fireball.remove(), 400);
                }
                delayBeforeHit = 600;
            } else if (type === 'spell_heal') {
                heroElem.classList.add('anim-spell-heal');
                const pWrapper = document.querySelector('.player .sprite-wrapper');
                if (pWrapper) {
                    for(let i=0; i<3; i++) {
                        const spark = document.createElement('div');
                        spark.className = 'heal-sparkle';
                        spark.style.left = (15 + i*15) + 'px';
                        spark.style.top = (40 + (i%2)*10) + 'px';
                        pWrapper.appendChild(spark);
                        setTimeout(() => spark.remove(), 500);
                    }
                }
                delayBeforeHit = 600;
            } else {
                heroElem.classList.add('attack');
            }
            
            setTimeout(() => {
                heroElem.classList.remove('anim-attack-basic', 'anim-spell-fire', 'anim-spell-heal', 'attack');
            }, delayBeforeHit);
        }

        if (type === 'spell_fire') {
            setTimeout(() => {
                const enemyElem = document.querySelector('.enemy .pixel-enemy');
                if (enemyElem) {
                    enemyElem.classList.add('anim-damage-fire');
                    setTimeout(() => enemyElem.classList.remove('anim-damage-fire'), 500);
                }
            }, 300);
        }

        setTimeout(async () => {
            const result = await Engine.executePvETurn(type);
            this.navigate('arena');
            if (result && result.won !== undefined) {
                this.showToast(result.message, result.won ? 'gold' : 'error');
            } else if (result) {
                // Opponent attack animation
                setTimeout(() => {
                    const enemyElem = document.querySelector('.enemy .pixel-enemy');
                    if (enemyElem) {
                        enemyElem.classList.add('anim-attack-enemy-basic');
                        setTimeout(() => enemyElem.classList.remove('anim-attack-enemy-basic'), 400);
                    }
                    this.navigate('arena'); // Update player HP display after enemy hits
                }, 100);
            }
        }, 300);
    },

    surrenderBattle() {
        if (!GameState.currentBattle || GameState.currentBattle.isFinished) return;
        Engine.fleeBattle();
    },

    async startPvP() {
        this.showToast('Buscando oponente...', 'gold');
        const channel = supabase.channel('matchmaking', {
            config: { presence: { key: GameState.avatar.name } }
        });

        channel.on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState();
            const keys = Object.keys(state);
            if (keys.length > 1) {
                const opponentName = keys.find(k => k !== GameState.avatar.name);
                this.showToast('Oponente encontrado: ' + opponentName, 'success');
                const opponent = {
                    name: opponentName, sprite: 'skeleton', level: GameState.avatar.level,
                    hp: 150, maxHp: 150, attack: 15, xp: 50, goldRaw: 30
                };
                Engine.startPvEBattle(opponent); // Reuse local logic for demo
                this.navigate('arena');
                channel.unsubscribe();
            }
        });

        channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track({ name: GameState.avatar.name, ready: true });
            }
        });
    },

    newOpponent() {
        GameState._currentOpponent = Engine.generateOpponent();
        GameState._lastBattleResult = null;
        this.navigate('arena');
    },

    // --- Toast ---

    showToast(message, type = 'success') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

window.App = App;
