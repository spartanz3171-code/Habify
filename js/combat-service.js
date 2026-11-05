const CombatService = {
    async request(body) {
        const userId = GameState.user?.id;
        const avatar = GameState.avatar;
        const current = () => !!userId && GameState.user?.id === userId && GameState.avatar === avatar;
        const { data, error } = await supabase.auth.getSession();
        if (error || !current() || data?.session?.user?.id !== userId || !data.session.access_token) throw new Error('Session changed');
        const response = await fetch('/api/combat', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
            body: JSON.stringify(body), signal: AbortSignal.timeout(30000)
        });
        if (!current()) throw new Error('Session changed');
        if (!response.ok) {
            const failure = await response.json().catch(() => null);
            throw Object.assign(new Error('Combat was not confirmed'), {
                status: response.status, code: failure?.code || (response.status === 401 ? 'session_expired' : 'combat_unavailable')
            });
        }
        const result = await response.json();
        if (!current()) throw new Error('Session changed');
        return result;
    },

    startErrorMessage(error) {
        const messages = {
            combat_not_configured: ['La arena no está configurada en el servidor. Falta completar la configuración de combate.', 'The arena is not configured on the server. Combat setup must be completed.'],
            combat_schema_missing: ['Falta una actualización de la base de datos de combate. La arena estará disponible cuando se aplique.', 'A combat database update is missing. The arena will be available once it is applied.'],
            combat_access_denied: ['El servidor no pudo acceder a los datos de combate. Hay que revisar sus permisos y configuración.', 'The server could not access combat data. Its permissions and configuration need to be checked.'],
            session_expired: ['Tu sesión venció. Vuelve a iniciar sesión para luchar.', 'Your session expired. Sign in again to fight.'],
            avatar_dead: ['Tu avatar ha caído. Completa hábitos para revivir y volver a combatir.', 'Your avatar has fallen. Complete habits to revive and fight again.']
        };
        const message = Object.hasOwn(messages, error?.code) ? messages[error.code] :
            ['No se pudo preparar el combate. Revisa la conexión y vuelve a intentarlo.', 'Could not prepare combat. Check your connection and try again.'];
        return App.authText(...message);
    },

    async start() {
        const match = await this.request({ action: 'start', opponentSprite: GameState._currentOpponent?.sprite });
        if (!match?.id || !match.engineVersion || !match.opponent || !match.avatar || !Array.isArray(match.inventory)) throw new Error('Invalid match');
        return match;
    },

    async finish(battle, fled) {
        const receipt = await this.request({ action: 'finish', id: battle.verification.id,
            engineVersion: battle.verification.engineVersion, replay: battle.replay, fled });
        if (receipt?.status !== 'settled' || receipt.battle_id !== battle.verification.id ||
            typeof receipt.won !== 'boolean' || !Number.isFinite(receipt.avatar?.gold) ||
            !Number.isFinite(receipt.avatar?.current_xp)) throw new Error('Invalid settlement');
        return receipt;
    }
};
