const { createMatch, verifyReplay, engineVersion } = require('../server/combat.cjs');
const maxBodyBytes = 2 * 1024 * 1024;

function failure(status, message) { return Object.assign(new Error(message), { status }); }

async function readBody(request) {
    if (Number(request.headers['content-length']) > maxBodyBytes) throw failure(413, 'Replay too large');
    if (request.body !== undefined) {
        const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
        if (Buffer.byteLength(body) > maxBodyBytes) throw failure(413, 'Replay too large');
        return JSON.parse(body);
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        const buffer = Buffer.from(chunk);
        size += buffer.length;
        if (size > maxBodyBytes) throw failure(413, 'Replay too large');
        chunks.push(buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function createHandler({ env = process.env, fetcher = fetch, now = Date.now } = {}) {
    return async function handler(request, response) {
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        try {
            if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); throw failure(405, 'POST required'); }
            const base = env.SUPABASE_URL?.replace(/\/$/, '');
            if (!base || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) throw failure(503, 'Combat server is not configured');
            const authorization = request.headers.authorization || '';
            if (!/^Bearer \S+$/.test(authorization) || authorization.length > 8192) throw failure(401, 'Authentication required');
            const auth = await fetcher(`${base}/auth/v1/user`, {
                headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization }, signal: AbortSignal.timeout(10000)
            });
            if (!auth.ok) throw failure(401, 'Session expired');
            const user = await auth.json();
            if (!user.id || !user.email_confirmed_at) throw failure(401, 'Confirmed account required');
            let body;
            try { body = await readBody(request); } catch (error) { throw error.status ? error : failure(400, 'Invalid JSON'); }
            if (!body || !['start', 'finish'].includes(body.action)) throw failure(400, 'Invalid action');
            const rpc = async (name, args) => {
                const result = await fetcher(`${base}/rest/v1/rpc/${name}`, {
                    method: 'POST', headers: {
                        apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                        'Content-Type': 'application/json'
                    }, body: JSON.stringify(args), signal: AbortSignal.timeout(10000)
                });
                if (!result.ok) throw failure(409, 'Could not confirm combat; sync your account and retry');
                return result.json();
            };
            let result;
            if (body.action === 'start') {
                if (body.opponentSprite != null && (typeof body.opponentSprite !== 'string' || body.opponentSprite.length > 40)) throw failure(400, 'Invalid opponent');
                const row = await rpc('combat_open', { p_user: user.id, p_engine_version: engineVersion, p_opponent_sprite: body.opponentSprite || null });
                result = createMatch(row);
            } else {
                if (typeof body.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) throw failure(400, 'Invalid battle id');
                const row = await rpc('combat_read', { p_user: user.id, p_id: body.id });
                if (!row) throw failure(404, 'Battle not found');
                let outcome;
                let opponent;
                if (row.result) {
                    outcome = row.result;
                    opponent = row.result.opponent;
                } else {
                    if (body.engineVersion !== engineVersion) throw failure(409, 'Combat version changed; reload');
                    const match = createMatch(row);
                    try { outcome = verifyReplay(match, body.replay, body.fled, (now() - Date.parse(row.created_at)) / 1000); }
                    catch { throw failure(422, 'Combat replay could not be verified'); }
                    opponent = match.opponent.name;
                }
                result = await rpc('combat_settle', {
                    p_user: user.id, p_id: row.id, p_won: outcome.won, p_fled: outcome.fled,
                    p_frames: row.result ? 0 : body.replay.frames, p_xp: outcome.xp, p_gold: outcome.gold, p_opponent: opponent
                });
            }
            response.statusCode = 200;
            response.end(JSON.stringify(result));
        } catch (error) {
            response.statusCode = error.status || 503;
            response.end(JSON.stringify({ error: error.status ? error.message : 'Combat service unavailable; retry later' }));
        }
    };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;