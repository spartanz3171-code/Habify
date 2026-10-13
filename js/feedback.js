// Optional effects. No autoplay, downloads, tracking or required device permissions.
const Feedback = (() => {
    const key = 'habify_feedback_v1';
    let sound = false, vibration = false, context = null, lastPlayed = -Infinity, returnFocus = null;
    try { const saved = JSON.parse(localStorage.getItem(key) || '{}'); sound = saved.sound === true; vibration = saved.vibration === true; } catch (_) { /* Defaults are quiet. */ }
    const text = (es, en) => I18N.current === 'en' ? en : es;
    const supportsVibration = () => typeof navigator.vibrate === 'function';
    function unlock() {
        if (!sound) return;
        try {
            const Audio = window.AudioContext || window.webkitAudioContext;
            if (!Audio) return;
            context ||= new Audio();
            if (context.state === 'suspended') context.resume().catch(() => {});
        } catch (_) { /* Unsupported or blocked audio must never interrupt play. */ }
    }
    document.addEventListener('pointerdown', unlock, { passive: true });
    document.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) return;
        try { if (supportsVibration()) navigator.vibrate(0); context?.suspend().catch(() => {}); } catch (_) { /* Optional APIs. */ }
    });
    function play(kind = 'success') {
        if (document.hidden || (!sound && !vibration)) return;
        const now = performance.now();
        if (now - lastPlayed < 220) return;
        lastPlayed = now;
        if (vibration && supportsVibration()) {
            try { navigator.vibrate(kind === 'level' ? [30, 60, 40] : kind === 'hit' ? 15 : 25); } catch (_) { /* Some browsers ignore vibration. */ }
        }
        if (!sound || !context || context.state !== 'running') return;
        const notes = { success: [523.25, 659.25, 783.99], level: [523.25, 659.25, 783.99, 1046.5], save: [659.25, 783.99], hit: [145] }[kind] || [659.25];
        try {
            notes.forEach((frequency, i) => {
                const oscillator = context.createOscillator(), gain = context.createGain();
                const at = context.currentTime + i * .075;
                oscillator.type = kind === 'hit' ? 'triangle' : 'sine';
                oscillator.frequency.setValueAtTime(frequency, at);
                gain.gain.setValueAtTime(0, at);
                gain.gain.linearRampToValueAtTime(.055, at + .008);
                gain.gain.exponentialRampToValueAtTime(.001, at + .12);
                oscillator.connect(gain); gain.connect(context.destination);
                oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
                oscillator.start(at); oscillator.stop(at + .14);
            });
        } catch (_) { /* Gameplay remains independent of audio support. */ }
    }
    function change(field, value) {
        if (field === 'sound') sound = value === true;
        else if (field === 'vibration') vibration = value === true && supportsVibration();
        else return;
        try { localStorage.setItem(key, JSON.stringify({ sound, vibration })); } catch (_) { /* Session preference only. */ }
        if (!vibration && supportsVibration()) { try { navigator.vibrate(0); } catch (_) {} }
        if (sound) unlock();
        else { try { context?.suspend().catch(() => {}); } catch (_) {} }
    }
    function close() { document.getElementById('modal-root').innerHTML = ''; returnFocus?.focus(); }
    function open() {
        returnFocus = document.activeElement;
        document.getElementById('modal-root').innerHTML = `<div class="modal-overlay"><section class="card device-settings" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
            <h2 id="feedback-title">${text('Sonido y vibración', 'Sound and vibration')}</h2>
            <p>${text('Elige cómo celebrar tus logros. Estas opciones se guardan en este dispositivo.', 'Choose how to celebrate your progress. These options are saved on this device.')}</p>
            <label><input type="checkbox" id="feedback-sound" ${sound ? 'checked' : ''} onchange="Feedback.change('sound',this.checked)">${text('Sonidos suaves', 'Gentle sounds')}</label>
            <label><input type="checkbox" id="feedback-vibration" ${vibration ? 'checked' : ''} ${supportsVibration() ? '' : 'disabled'} onchange="Feedback.change('vibration',this.checked)">${text('Vibración breve', 'Short vibration')}</label>
            <p>${supportsVibration() ? text('La vibración depende del celular y sus ajustes. El modo silencio puede bloquear los efectos.', 'Vibration depends on your device and settings. Silent mode may block effects.') : text('Este navegador no ofrece vibración. Puedes seguir usando los sonidos.', 'This browser does not support vibration. You can still use sounds.')}</p>
            <div class="settings-actions">${GameState.isAdmin ? `<button class="btn btn-secondary" onclick="Feedback.close();App.openAdminPanel()">${text('ADMINISTRACIÓN', 'ADMINISTRATION')}</button>` : ''}<button class="btn btn-primary" onclick="Feedback.preview()">${text('PROBAR', 'TEST')}</button><button class="btn btn-secondary" onclick="Feedback.close()">${text('CERRAR', 'CLOSE')}</button></div>
        </section></div>`;
        document.getElementById('feedback-sound').focus();
    }
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.getElementById('feedback-title')) close(); });
    return { play, change, open, close, preview() { unlock(); play('success'); } };
})();
window.Feedback = Feedback;
