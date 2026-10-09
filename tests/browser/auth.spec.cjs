const { test, expect } = require('@playwright/test');

test('verification resend is absent from ordinary login and appears after registration', async ({page}) => {
    await bootAuth(page);
    await expect(page.locator('#auth-request-verification')).toHaveCount(0);
    await expect(page.locator('#verification-resend')).toHaveCount(0);
    await submitRegistration(page);
    await expect(page.locator('#verification-resend')).toBeVisible();
    await page.evaluate(()=>App.showAuth('login'));
    await expect(page.locator('#verification-resend')).toHaveCount(0);
    await expect(page.locator('#auth-request-verification')).toHaveCount(0);
});

for (const fresh of [false,true]) test(`welcome tutorial ${fresh ? 'appears once for a new account and stays dismissed on another device' : 'does not appear for a returning account with no habits or local storage'}`,async({page})=>{
    await bootAuth(page);
    await page.clock.install();
    await page.evaluate(async fresh=>{
        localStorage.clear();
        GameState.user=authMock.user;
        GameState.user.user_metadata=fresh ? {habify_tutorial_pending:true} : {};
        loadGameFromDB=async()=>{GameState.habits=[];return true;};
        Engine.checkDailyPenalties=async()=>[];
        App.showMainApp=()=>{document.body.dataset.view='dashboard';};
        App.startCooldownTimer=()=>{};
        await actualLoadUserData.call(App);
    },fresh);
    await page.clock.runFor(800);
    if(fresh) {
        await expect(page.locator('#tutorial-modal')).toBeVisible();
        expect(await page.evaluate(()=>authMock.user.user_metadata.habify_tutorial_seen)).toBe(true);
        await page.evaluate(async()=>{
            App.closeTutorial();localStorage.clear();
            GameState.user=JSON.parse(JSON.stringify(authMock.user));
            await actualLoadUserData.call(App);
        });
        await page.clock.runFor(800);
    }
    await expect(page.locator('#tutorial-modal')).toHaveCount(0);
});

test('password recovery requests are generic, use the public return URL and throttle repeated sends', async ({page}) => {
    await bootAuth(page);
    await page.evaluate(() => {
        supabase.auth.resetPasswordForEmail = async (email, options) => {
            authCalls.push({method:'recover', email, options}); return {data:{},error:null};
        };
    });
    await page.locator('#forgot-password').click();
    await page.locator('#recovery-email').fill('student@example.edu');
    await page.locator('#recovery-send').click();
    await expect(page.locator('#recovery-status')).toContainText('Si existe una cuenta');
    await page.locator('#recovery-send').click();
    expect(await page.evaluate(()=>authCalls.filter(x=>x.method==='recover'))).toEqual([{method:'recover',email:'student@example.edu',options:{redirectTo:'https://habify-ten.vercel.app/'}}]);
    await page.evaluate(()=>I18N.setLang('en'));
    await expect(page.locator('#recovery-request')).toBeVisible();
    await expect(page.locator('#recovery-status')).toContainText('If an account');
    expect(await page.evaluate(()=>authCalls.some(x=>x.method==='loadUserData'))).toBe(false);
});

test('a recovery event verifies the session and changes the password before returning to sign in', async ({page}) => {
    await bootAuth(page);
    await page.evaluate(async()=>{
        authMock.user.email_confirmed_at='2026-10-08T00:00:00Z';
        authMock.user.app_metadata={providers:['email']};
        await App.init();
        authMock.listener('PASSWORD_RECOVERY',{user:authMock.user});
    });
    await expect(page.locator('#recovery-password')).toBeVisible();
    await page.locator('#new-password').fill('new-password-123');
    await page.locator('#repeat-password').fill('different-123');
    await page.locator('#recovery-save').click();
    await expect(page.locator('#auth-error')).toContainText('no coinciden');
    expect(await page.evaluate(()=>authCalls.some(x=>x.method==='updateUser'))).toBe(false);
    await page.locator('#repeat-password').fill('new-password-123');
    await page.locator('#recovery-save').click();
    await expect(page.locator('#password-updated')).toContainText('Contraseña actualizada');
    expect(await page.evaluate(()=>authCalls.filter(x=>x.method==='updateUser').length)).toBe(1);
    expect(await page.evaluate(()=>authCalls.find(x=>x.method==='updateUser').args)).toEqual({password:'new-password-123'});
    expect(await page.evaluate(()=>authCalls.some(x=>x.method==='signOut'))).toBe(true);
    expect(await page.evaluate(()=>authCalls.some(x=>x.method==='loadUserData'))).toBe(false);
    expect(await page.evaluate(()=>GameState.user)).toBeNull();
});

test('a recovery marker with an ordinary cached session cannot authorize a password change', async ({page}) => {
    await bootAuth(page);
    await page.evaluate(async()=>{
        history.replaceState(null,'','/#type=recovery');
        authMock.user.email_confirmed_at='2026-10-08T00:00:00Z';
        authMock.session={user:authMock.user};
        await App.init();
    });
    await expect(page.locator('#recovery-request')).toBeVisible();
    await expect(page.locator('#recovery-password')).toHaveCount(0);
    expect(await page.evaluate(()=>authCalls.some(x=>x.method==='updateUser'))).toBe(false);
    expect(new URL(page.url()).hash).toBe('');
});

test('an invalid recovery session never opens the password form and never logs callback tokens', async ({page}) => {
    await bootAuth(page);
    await page.evaluate(async()=>{
        authMock.userError={code:'session_not_found'};
        await App.init();
        authMock.listener('PASSWORD_RECOVERY',{user:authMock.user});
    });
    await expect(page.locator('#recovery-request')).toBeVisible();
    await expect(page.locator('#auth-error')).toContainText('no es válido');
    expect(await page.evaluate(()=>authCalls.some(x=>x.method==='updateUser'))).toBe(false);
});

// Exercise the real auth forms and controller without sending email or writing to Supabase.
async function bootAuth(page) {
    await page.route('**/*.supabase.co/**', route => route.abort());
    await page.route('**/auth/v1/settings', route => route.fulfill({
        json: { mailer_autoconfirm: false, external: { email: true } }
    }));
    await page.goto('/');
    await expect(page.locator('#auth-form')).toBeVisible();
    await page.evaluate(() => {
        window.authCalls = [];
        window.actualLoadUserData = App.loadUserData;
        window.authMock = {
            user: { id: 'auth-test-user', email: 'student@example.edu', email_confirmed_at: null, user_metadata: {} },
            session: null,
            signupError: null,
            loginError: null,
            resendError: null,
            userError: null
        };
        supabase = {
            auth: {
                async signUp(args) {
                    authCalls.push({ method: 'signUp', args });
                    return { data: { user: authMock.user, session: authMock.session }, error: authMock.signupError };
                },
                async signInWithPassword(args) {
                    authCalls.push({ method: 'signInWithPassword', args });
                    return { data: { user: authMock.user, session: authMock.session }, error: authMock.loginError };
                },
                async resend(args) {
                    authCalls.push({ method: 'resend', args });
                    return { data: {}, error: authMock.resendError };
                },
                async getUser() {
                    authCalls.push({ method: 'getUser' });
                    return { data: { user: authMock.user }, error: authMock.userError };
                },
                async getSession() {
                    authCalls.push({ method: 'getSession' });
                    return { data: { session: authMock.session }, error: null };
                },
                async signOut() {
                    authCalls.push({ method: 'signOut' });
                    return { error: null };
                },
                async updateUser(args) {
                    authCalls.push({ method: 'updateUser', args });
                    authMock.user.user_metadata = { ...authMock.user.user_metadata, ...args.data };
                    return { data: { user: authMock.user }, error: null };
                },
                onAuthStateChange(callback) {
                    authMock.listener = callback;
                    return { data: { subscription: { unsubscribe() {} } } };
                }
            },
            from(table) {
                authCalls.push({ method: 'from', table });
                throw new Error('Auth must not write account data before email confirmation');
            }
        };
        initSupabase = async () => {};
        App.loadUserData = async () => {
            authCalls.push({ method: 'loadUserData', userId: GameState.user?.id });
            document.getElementById('app-content').innerHTML = '<div id="confirmed-account">Cuenta confirmada</div>';
        };
        GameState.user = null;
    });
}

async function submitLogin(page) {
    await page.locator('#auth-email').fill('student@example.edu');
    await page.locator('#auth-password').fill('A-test-password-123!');
    await page.locator('#auth-submit').click();
}

async function submitRegistration(page) {
    await page.evaluate(() => App.showAuth('register'));
    await page.locator('#auth-email').fill('student@example.edu');
    await page.locator('#auth-password').fill('A-test-password-123!');
    await page.locator('#auth-avatar-name').fill('Aria');
    await page.locator('#auth-avatar-class').selectOption('knight');
    await page.locator('#auth-avatar-body').selectOption('female');
    await page.locator('#auth-submit').click();
}

test('registration sends confirmation and keeps the chosen character without automatic login', async ({ page }, testInfo) => {
    await bootAuth(page);
    await submitRegistration(page);

    await expect(page.locator('#email-verification')).toBeVisible();
    await expect(page.locator('#verification-email')).toContainText('student@example.edu');
    await expect(page.locator('#app-header')).toBeHidden();
    await expect(page.locator('#bottom-nav')).toBeHidden();
    const calls = await page.evaluate(() => authCalls);
    const signup = calls.find(call => call.method === 'signUp');
    expect(signup.args).toMatchObject({
        email: 'student@example.edu',
        options: {
            emailRedirectTo: 'https://habify-ten.vercel.app/',
            data: { avatar_name: 'Aria', avatar_class: 'knight', appearance: { body: 'female', hairStyle: 'ponytail' }, habify_profile_pending: true }
        }
    });
    expect(calls.some(call => ['signInWithPassword', 'from', 'loadUserData'].includes(call.method))).toBe(false);
    expect(await page.evaluate(() => GameState.user)).toBeNull();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('email-verification.png'), fullPage: true });
});

test('signup refuses an automatically confirmed session instead of claiming a verification email was sent', async ({ page }) => {
    await bootAuth(page);
    await page.evaluate(() => {
        authMock.user.email_confirmed_at = '2026-10-06T00:00:00Z';
        authMock.session = { access_token: 'autoconfirm-test-token', user: authMock.user };
    });
    await submitRegistration(page);
    await expect(page.locator('#auth-error')).toBeVisible();
    await expect(page.locator('#auth-error')).toContainText(/registro.*cerrado|registration.*closed/i);
    await expect(page.locator('#email-verification')).toHaveCount(0);
    await expect(page.locator('#auth-submit')).toBeEnabled();
    const calls = await page.evaluate(() => authCalls.map(call => call.method));
    expect(calls).toContain('signOut');
    expect(calls).not.toContain('loadUserData');
    expect(calls).not.toContain('from');
    expect(await page.evaluate(() => GameState.user)).toBeNull();
});

test('registration stops before creating an account if server email confirmation is disabled', async ({ page }) => {
    await bootAuth(page);
    await page.route('**/auth/v1/settings', route => route.fulfill({
        json: { mailer_autoconfirm: true, external: { email: true } }
    }));
    await submitRegistration(page);
    await expect(page.locator('#auth-error')).toBeVisible();
    await expect(page.locator('#auth-error')).toContainText(/registro.*cerrado|registration.*closed/i);
    await expect(page.locator('#email-verification')).toHaveCount(0);
    await expect(page.locator('#auth-submit')).toBeEnabled();
    expect(await page.evaluate(() => authCalls.some(call => ['signUp', 'loadUserData', 'from'].includes(call.method)))).toBe(false);
    expect(await page.evaluate(() => GameState.user)).toBeNull();
});

test('unconfirmed login offers resend and blocks duplicate sends during the cooldown', async ({ page }) => {
    await bootAuth(page);
    await page.evaluate(() => { authMock.loginError = { code: 'email_not_confirmed', message: 'Email not confirmed' }; });
    await submitLogin(page);
    await expect(page.locator('#email-verification')).toBeVisible();
    await expect(page.locator('#verification-email')).toContainText('student@example.edu');
    await expect(page.locator('#verification-resend')).toBeEnabled();
    await page.locator('#verification-resend').click();
    await expect(page.locator('#verification-resend')).toBeDisabled();
    await expect(page.locator('#verification-status')).not.toBeEmpty();
    // Also guard programmatic/repeated submissions, beyond the disabled UI button.
    await page.evaluate(() => Promise.all([App.resendVerification(), App.resendVerification()]));
    const calls = await page.evaluate(() => authCalls.filter(call => call.method === 'resend'));
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual({
        type: 'signup', email: 'student@example.edu',
        options: { emailRedirectTo: 'https://habify-ten.vercel.app/' }
    });
    expect(await page.evaluate(() => authCalls.some(call => call.method === 'loadUserData'))).toBe(false);
});

test('resend failures explain the problem without opening the account', async ({ page }) => {
    await bootAuth(page);
    await page.evaluate(() => {
        authMock.resendError = { status: 429, code: 'over_email_send_rate_limit', message: 'Email rate limit exceeded' };
        App.showEmailVerification('student@example.edu');
    });
    await page.locator('#verification-resend').click();
    await expect(page.locator('#auth-error')).toBeVisible();
    await expect(page.locator('#auth-error')).not.toBeEmpty();
    await expect(page.locator('#email-verification')).toBeVisible();
    expect(await page.evaluate(() => authCalls.filter(call => call.method === 'resend').length)).toBe(1);
    expect(await page.evaluate(() => GameState.user)).toBeNull();
});

test('server confirmation is required even when cached session and editable metadata claim verification', async ({ page }) => {
    await bootAuth(page);
    await page.evaluate(async () => {
        authMock.user.user_metadata = { email_verified: true, email_confirmed_at: '2026-10-06T00:00:00Z' };
        await App.acceptAuthSession({
            access_token: 'test-token',
            user: { ...authMock.user, email_confirmed_at: '2026-10-06T00:00:00Z' }
        });
    });
    await expect(page.locator('#email-verification')).toBeVisible();
    expect(await page.evaluate(() => authCalls.some(call => call.method === 'getUser'))).toBe(true);
    expect(await page.evaluate(() => authCalls.some(call => call.method === 'loadUserData'))).toBe(false);
    expect(await page.evaluate(() => GameState.user)).toBeNull();
});

test('an unavailable server identity cannot load private account data', async ({ page }) => {
    await bootAuth(page);
    await page.evaluate(async () => {
        authMock.user = null;
        authMock.userError = { message: 'Invalid token', status: 401 };
        await App.acceptAuthSession({ access_token: 'invalid-test-token', user: { id: 'auth-test-user', email_confirmed_at: '2026-10-06T00:00:00Z' } });
    });
    await expect(page.locator('#auth-form')).toBeVisible();
    expect(await page.evaluate(() => GameState.user)).toBeNull();
    expect(await page.evaluate(() => authCalls.some(call => call.method === 'loadUserData'))).toBe(false);
});

test('confirmation callback loads the account only after checking the user with Supabase', async ({ page }) => {
    await bootAuth(page);
    await page.evaluate(async () => {
        authMock.user.email_confirmed_at = '2026-10-06T00:00:00Z';
        authMock.session = { access_token: 'confirmed-test-token', user: { ...authMock.user, email_confirmed_at: null } };
        history.replaceState({}, '', '/#access_token=confirmed-test-token&type=signup');
        await App.init();
    });
    await expect(page.locator('#confirmed-account')).toBeVisible();
    const calls = await page.evaluate(() => authCalls);
    const verifiedAt = calls.findIndex(call => call.method === 'getUser');
    const loadedAt = calls.findIndex(call => call.method === 'loadUserData');
    expect(verifiedAt).toBeGreaterThanOrEqual(0);
    expect(loadedAt).toBeGreaterThan(verifiedAt);
    expect(calls.filter(call => call.method === 'loadUserData')).toHaveLength(1);
    expect(await page.evaluate(() => GameState.user.email_confirmed_at)).toBe('2026-10-06T00:00:00Z');
});

test('an expired confirmation link returns to login with a useful explanation', async ({ page }) => {
    await bootAuth(page);
    await page.evaluate(async () => {
        history.replaceState({}, '', '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
        await App.init();
    });
    await expect(page.locator('#auth-form')).toBeVisible();
    await expect(page.locator('#auth-error')).toBeVisible();
    await expect(page.locator('#auth-error')).toContainText(/enlace|link/i);
    await expect(page.locator('#auth-error')).toContainText(/venc|caduc|expir|invalid/i);
    expect(await page.evaluate(() => authCalls.some(call => call.method === 'loadUserData'))).toBe(false);
    expect(await page.evaluate(() => location.hash)).toBe('');
});

test('first confirmed login on another device restores character metadata once', async ({ page }) => {
    await bootAuth(page);
    await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
        authMock.user.email_confirmed_at = '2026-10-06T00:00:00Z';
        authMock.user.user_metadata = {
            habify_profile_pending: true, avatar_name: 'Aria', avatar_class: 'knight',
            appearance: { body: 'female', hairStyle: 'ponytail', hairColor: '#684333' }
        };
        authMock.session = { access_token: 'confirmed-test-token', user: authMock.user };
        supabase.from = table => {
            authCalls.push({ method: 'from', table });
            const query = {
                update(data) { authCalls.push({ method: 'updateAvatar', data }); return query; },
                eq(column, value) { authCalls.push({ method: 'avatarFilter', column, value }); return query; },
                async select() { return { data: [{ id: 'auth-test-avatar' }], error: null }; }
            };
            return query;
        };
    });
    await submitLogin(page);
    await expect(page.locator('#confirmed-account')).toBeVisible();
    // A later login uses the server's completed marker and does not overwrite the character again.
    await page.evaluate(async () => { GameState.user = null; await App.acceptAuthSession(authMock.session); });
    const calls = await page.evaluate(() => authCalls);
    expect(calls.filter(call => call.method === 'updateAvatar')).toEqual([
        { method: 'updateAvatar', data: { name: 'Aria', avatar_class: 'knight' } }
    ]);
    expect(calls.find(call => call.method === 'avatarFilter')).toMatchObject({ column: 'user_id', value: 'auth-test-user' });
    expect(calls.filter(call => call.method === 'updateUser')).toEqual([
        { method: 'updateUser', args: { data: { habify_profile_pending: false, habify_tutorial_pending: true } } }
    ]);
    expect(calls.findIndex(call => call.method === 'getUser')).toBeLessThan(calls.findIndex(call => call.method === 'updateAvatar'));
    expect(calls.findIndex(call => call.method === 'updateAvatar')).toBeLessThan(calls.findIndex(call => call.method === 'loadUserData'));
    expect(await page.evaluate(() => GameState.user.user_metadata.appearance)).toEqual({ body: 'female', hairStyle: 'ponytail', hairColor: '#684333' });
});

test('changing language preserves the verification screen and the pending email', async ({ page }) => {
    await bootAuth(page);
    await page.evaluate(() => App.showEmailVerification('student@example.edu'));
    // The account header is hidden during auth; exercise its language handler directly.
    await page.evaluate(() => I18N.setLang('en'));
    await expect(page.locator('#email-verification')).toBeVisible();
    await expect(page.locator('#verification-email')).toContainText('student@example.edu');
    await expect(page.locator('#verification-resend')).toHaveText('RESEND VERIFICATION');
    await expect(page.locator('#bottom-nav')).toBeHidden();
    expect(await page.evaluate(() => GameState.currentView)).toBe('auth');
    expect(await page.evaluate(() => authCalls.some(call => call.method === 'loadUserData'))).toBe(false);
});

test('confirmation destinations work across devices and preserve hosted subdirectories without callback tokens', async ({ page }) => {
    await bootAuth(page);
    const destinations = await page.evaluate(() => {
        // Evaluate the production method with a scoped Location stand-in;
        // no navigation, email, or request is sent to these example origins.
        const redirectFrom = new Function('location', `return ({${App.confirmationRedirect.toString()}}).confirmationRedirect();`);
        return [
            'http://localhost:4173/?code=test-code',
            'http://127.0.0.1:4173/tools/index.html#access_token=test-token',
            'http://[::1]:4173/',
            'file:///C:/Habify/index.html',
            'https://habify-ten.vercel.app/?code=test-code#access_token=test-token',
            'https://school.example/habify/index.html?code=test-code#access_token=test-token',
            'https://school.example/habify/?code=test-code'
        ].map(href => redirectFrom({ href }));
    });
    expect(destinations).toEqual([
        'https://habify-ten.vercel.app/',
        'https://habify-ten.vercel.app/',
        'https://habify-ten.vercel.app/',
        'https://habify-ten.vercel.app/',
        'https://habify-ten.vercel.app/',
        'https://school.example/habify/',
        'https://school.example/habify/'
    ]);
});
