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
        if (!response.ok) throw new Error('Combat was not confirmed');
        const result = await response.json();
        if (!current()) throw new Error('Session changed');
        return result;
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