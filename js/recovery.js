// Supabase owns recovery tokens and password storage. Only PASSWORD_RECOVERY
// opens the password form; a query string or a normal cached session cannot.
const PasswordRecovery = {
    expected: false, received: false, userId: null, busy: false, sent: false,
    text(es, en) { return I18N.current === 'en' ? en : es; },
    clear() { this.expected=false; this.received=false; this.userId=null; },
    requestView() {
        App.showAuth('login');
        App.authMode='recovery-request';
        const t=this.text.bind(this);
        document.getElementById('app-content').innerHTML=`<section class="auth-container verification-container" id="recovery-request"><div class="auth-title">HABIFY</div><h1>${t('Restablecer contraseña','Reset password')}</h1><p>${t('Escribe el correo de tu cuenta para recibir un enlace seguro.','Enter your account email to receive a secure link.')}</p><div id="auth-error" class="auth-error" role="alert"></div><form id="recovery-request-form" onsubmit="PasswordRecovery.request(event)"><label for="recovery-email">${t('Correo electrónico','Email')}</label><input class="form-input" id="recovery-email" type="email" maxlength="254" autocomplete="email" required><button class="btn btn-primary btn-block" id="recovery-send" type="submit">${t('ENVIAR ENLACE','SEND LINK')}</button></form><p id="recovery-status" role="status">${this.sent ? this.sentMessage() : ''}</p><p class="form-help">${t('Si tu cuenta usa exclusivamente Google u otro proveedor, recupera el acceso desde ese proveedor.','If your account uses only Google or another provider, recover access through that provider.')}</p><button class="auth-text-button" onclick="App.showAuth('login')">${t('Volver a iniciar sesión','Back to sign in')}</button></section>`;
        if(App.pendingVerificationEmail) document.getElementById('recovery-email').value=App.pendingVerificationEmail;
    },
    sentMessage() { return this.text('Si existe una cuenta que permita recuperar su contraseña con ese correo, recibirás un enlace. Revisa también spam.', 'If an account eligible for password recovery exists for that email, you will receive a link. Check spam too.'); },
    async request(event) {
        event.preventDefault();
        if(this.busy || !event.target.reportValidity()) return;
        let until=this.nextSendAt || 0;
        try {until=Math.max(until,Number(localStorage.getItem('habify_recovery_cooldown')) || 0);} catch (_) {}
        if(Date.now()<until) { App.showAuthError({code:'over_request_rate_limit'}); return; }
        const email=document.getElementById('recovery-email').value.trim();
        const btn=document.getElementById('recovery-send');
        this.busy=true; btn.disabled=true;
        this.nextSendAt=Date.now()+60000;
        try {localStorage.setItem('habify_recovery_cooldown',String(this.nextSendAt));} catch (_) {}
        try {
            // Use the same allowed public root as signup. PASSWORD_RECOVERY, not a
            // controllable redirect query, distinguishes the callback.
            const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:App.confirmationRedirect()});
            if(error && !['user_not_found','email_not_found'].includes(error.code)) throw error;
            this.sent=true;
            if(btn.isConnected) { document.getElementById('recovery-status').textContent=this.sentMessage(); document.getElementById('auth-error').classList.remove('show'); }
        } catch(error) { if(btn.isConnected) App.showAuthError(error); }
        finally {this.busy=false;if(btn.isConnected) btn.disabled=false;}
    },
    async authorize(session) {
        if(!this.received || !session?.user?.id) return this.invalid();
        if(this.userId===session.user.id) return;
        const version=App.authSessionVersion;
        try {
            const {data,error}=await supabase.auth.getUser();
            if(version!==App.authSessionVersion || !this.received) return;
            if(error || !data?.user || data.user.id!==session.user.id) return this.invalid();
            const providers=data.user.app_metadata?.providers;
            if(Array.isArray(providers) && providers.length && !providers.includes('email')) return this.invalid(this.text('Recupera el acceso desde tu proveedor de inicio de sesión.', 'Recover access through your sign-in provider.'));
            this.userId=data.user.id;
            history.replaceState(null,'',location.pathname);
            App.clearAccountView(); GameState.user=null;
            this.passwordView();
        } catch (_) {if(version===App.authSessionVersion) this.invalid();}
    },
    invalid(message) {
        this.clear();
        history.replaceState(null,'',location.pathname);
        this.requestView();
        const el=document.getElementById('auth-error');
        el.textContent=message || this.text('El enlace de recuperación venció o no es válido. Solicita uno nuevo.', 'The recovery link expired or is invalid. Request a new one.');el.classList.add('show');
    },
    passwordView() {
        if(!this.userId || !this.received) return this.invalid();
        App.showAuth('login'); App.authMode='recovery-password';
        const t=this.text.bind(this);
        document.getElementById('app-content').innerHTML=`<section class="auth-container verification-container" id="recovery-password"><div class="auth-title">HABIFY</div><h1>${t('Elige una contraseña nueva','Choose a new password')}</h1><div class="auth-error" id="auth-error" role="alert"></div><form id="recovery-password-form" onsubmit="PasswordRecovery.update(event)"><label for="new-password">${t('Nueva contraseña','New password')}</label><input id="new-password" class="form-input" type="password" autocomplete="new-password" minlength="6" maxlength="128" required><label for="repeat-password">${t('Repetir contraseña','Repeat password')}</label><input id="repeat-password" class="form-input" type="password" autocomplete="new-password" minlength="6" maxlength="128" required><p class="form-help">${t('Al menos 6 caracteres. El servicio comprobará también la política de seguridad de tu cuenta.','At least 6 characters. The service also checks your account password policy.')}</p><button id="recovery-save" class="btn btn-primary btn-block" type="submit">${t('GUARDAR CONTRASEÑA','SAVE PASSWORD')}</button></form></section>`;
    },
    async update(event) {
        event.preventDefault();
        if(this.busy || !this.userId || !this.received || !event.target.reportValidity()) return;
        const password=document.getElementById('new-password').value;
        const repeated=document.getElementById('repeat-password');
        if(password!==repeated.value) {
            const el=document.getElementById('auth-error');el.textContent=this.text('Las contraseñas no coinciden.','Passwords do not match.');el.classList.add('show');return;
        }
        const uid=this.userId, version=App.authSessionVersion, btn=document.getElementById('recovery-save');
        this.busy=true; App.authBusy=true; btn.disabled=true;
        try {
            const {data,error}=await supabase.auth.getUser();
            if(error || data?.user?.id!==uid || version!==App.authSessionVersion) throw {code:'recovery_expired'};
            const result=await supabase.auth.updateUser({password});
            if(result.error) throw result.error;
            if(version!==App.authSessionVersion) return;
            document.getElementById('new-password').value=''; repeated.value='';
            this.clear();
            const signedOut=await supabase.auth.signOut({scope:'global'});
            if(signedOut.error) await supabase.auth.signOut({scope:'local'});
            GameState.user=null; App.showAuth('login');
            const message=document.createElement('p');message.id='password-updated';message.setAttribute('role','status');
            message.textContent=this.text('Contraseña actualizada. Inicia sesión con tu nueva contraseña.','Password updated. Sign in with your new password.');
            document.getElementById('auth-form').before(message);
        } catch(error) {
            if(!btn.isConnected) return;
            if(['recovery_expired','session_not_found','refresh_token_not_found'].includes(error.code)) this.invalid();
            else if(error.code==='same_password') {const el=document.getElementById('auth-error');el.textContent=this.text('Elige una contraseña diferente de la anterior.','Choose a different password from your previous one.');el.classList.add('show');}
            else App.showAuthError(error);
        } finally {this.busy=false;App.authBusy=false;if(btn.isConnected)btn.disabled=false;}
    }
};
window.PasswordRecovery=PasswordRecovery;
