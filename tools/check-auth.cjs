// Read-only checks: no accounts are created and no emails are sent.
const fs = require('node:fs');
const path = require('node:path');

(async () => {
    const source = fs.readFileSync(path.join(__dirname, '../js/data.js'), 'utf8');
    const base = source.match(/const SUPABASE_URL = '([^']+)'/)?.[1];
    const publicKey = source.match(/const SUPABASE_KEY = '([^']+)'/)?.[1];
    if (!base || !publicKey) throw new Error('No se encontró la configuración pública de Supabase.');
    const destination = new URL(process.argv[2] || 'https://habify-ten.vercel.app/');
    if (!['http:', 'https:'].includes(destination.protocol) || destination.username || destination.password) throw new Error('La URL de retorno debe ser una dirección web sin credenciales.');
    destination.search = '';
    destination.hash = '';
    const response = await fetch(`${base}/auth/v1/settings`, { headers: { apikey: publicKey }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`No se pudieron consultar los ajustes (${response.status}).`);
    const settings = await response.json();
    const requiresConfirmation = settings.external?.email === true && settings.mailer_autoconfirm === false;
    console.log(`Confirmación de correo obligatoria: ${requiresConfirmation ? 'SÍ' : 'NO'}`);

    // An intentionally invalid token reveals the error return URL without verifying a user.
    const check = new URL(`${base}/auth/v1/verify`);
    check.searchParams.set('token', '0'.repeat(64));
    check.searchParams.set('type', 'signup');
    check.searchParams.set('redirect_to', destination.href);
    const redirect = await fetch(check, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const location = redirect.headers.get('location');
    const returned = location ? new URL(location) : null;
    const actual = returned ? returned.origin + returned.pathname : '(sin redirección)';
    const expected = destination.origin + destination.pathname;
    console.log(`Retorno solicitado: ${expected}`);
    console.log(`Retorno autorizado: ${actual}`);
    console.log('La entrega al buzón y el SMTP se verifican registrando una cuenta de prueba con autorización de su propietario.');
    if (!requiresConfirmation || actual !== expected) process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
