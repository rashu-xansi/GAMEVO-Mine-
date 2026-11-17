/* village-gfx.js — Blocky Village graphics quality (17 Nov 2026)
 *
 * Three modes:
 *   SMOOTH  🔋  weak / old phones      — 30 fps, 1x resolution, no water animation, no glow/snow/shadows, few clouds & people
 *   HIGH    ✨  normal phones          — 60 fps, up to 1.25x resolution, animated water, lamps glow, light snow
 *   ULTRA   🚀  flagship phones / PC   — display refresh rate, up to 2x resolution, everything on, exact depth-sorted live view when zoomed in
 *
 * AUTO (default): the device is guessed at start (memory / cores / platform), then a small governor watches the real frame
 * time: if the game stutters it drops one mode by itself, and if a device is clearly idle for a while it goes up one mode.
 * A mode that failed right after going up is remembered (bv_gcap) so the game never flips back and forth.
 * The 🔋 button in the game cycles  SMOOTH → HIGH → ULTRA → AUTO.  A hand-picked mode is never changed by the governor.
 *
 * Stored in localStorage:  bv_gq = auto|smooth|high|ultra   bv_gt = last auto mode   bv_gcap = highest mode the device handled
 */
(function () {
    var ORDER = ['smooth', 'high', 'ultra'];
    var P = {
        smooth: {
            name: 'smooth', icon: '🔋', dpr: 1, fps: 30,
            memMB: 36, sMax: 0.75, budget: 9, live: 0,
            water: 0, decor: 0, snow: 0, glow: 0, night: 1, shadow: 0, lite: 1,
            clouds: 2, cloudStep: 3.2, people: 40, cars: 3, vess: 3, bubbles: 1, blur: 0
        },
        high: {
            name: 'high', icon: '✨', dpr: 1.25, fps: 60,
            memMB: 80, sMax: 1.2, budget: 12, live: 0,
            water: 1, decor: 1, snow: 36, glow: 1, night: 2, shadow: 1, lite: 0,
            clouds: 3, cloudStep: 2.5, people: 120, cars: 6, vess: 4, bubbles: 1, blur: 0
        },
        ultra: {
            name: 'ultra', icon: '🚀', dpr: 2, fps: 0,
            memMB: 150, sMax: 1.8, budget: 16, live: 0.85,
            water: 2, decor: 1, snow: 80, glow: 2, night: 2, shadow: 1, lite: 0,
            clouds: 4, cloudStep: 2.0, people: 300, cars: 10, vess: 5, bubbles: 1, blur: 1
        }
    };
    var LSG = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
    var LSS = function (k, v) { try { localStorage.setItem(k, v); } catch (e) { } };

    // ---- first guess from the device -------------------------------------------------------------------------------
    function guess() {
        var n = navigator, ua = n.userAgent || '', mem = n.deviceMemory, cores = n.hardwareConcurrency || 4;
        var ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && n.maxTouchPoints > 1);
        var mobile = /Android|iPhone|iPad|iPod|Mobile/.test(ua) || ios;
        var and = /Android (\d+)/.exec(ua), av = and ? +and[1] : 99;
        if (!mobile) return 'high';                                  // desktop browser: starts High, may climb to Ultra
        if (ios) return cores >= 6 ? 'high' : 'smooth';              // iPhone 8 and older have 2-4 cores
        if (av <= 8) return 'smooth';                                // Android 8 or older = very old phone
        if (mem !== undefined && mem <= 4) return 'smooth';          // 4 GB or less (Chrome reports 4 for many 4-6 GB phones)
        if (mem !== undefined && mem >= 8 && cores >= 8) return 'high';
        return 'smooth';                                             // unknown phone: start light, the governor lifts it if it is idle
    }
    function clampTier(t) { return ORDER.indexOf(t) < 0 ? 'smooth' : t; }

    var mode = LSG('bv_gq');
    if (mode !== 'auto' && ORDER.indexOf(mode) < 0) mode = 'auto';
    var cap = ORDER.indexOf(LSG('bv_gcap')); if (cap < 0) cap = 2;           // highest allowed index for AUTO
    var start = LSG('bv_gt');
    if (ORDER.indexOf(start) < 0) start = (LSG('bv_low') === '1') ? 'smooth' : guess();   // old saves that were auto-switched to "low" start light
    var tier = mode === 'auto' ? clampTier(start) : mode;
    if (mode === 'auto' && ORDER.indexOf(tier) > cap) tier = ORDER[cap];

    var G = {
        q: P[tier], tier: tier, mode: mode, profiles: P, order: ORDER,
        fpsEma: 0, workEma: 0, _cb: []
    };

    function apply(t, why) {
        if (t === G.tier && G.q === P[t]) return;
        G.tier = t; G.q = P[t];
        try { document.documentElement.setAttribute('data-q', t); } catch (e) { }
        if (mode === 'auto') LSS('bv_gt', t);
        G._since = performance.now(); G._slow = 0; G._fast = 0; G._why = why || '';
        for (var i = 0; i < G._cb.length; i++) { try { G._cb[i](t, why); } catch (e) { } }
    }
    try { document.documentElement.setAttribute('data-q', tier); } catch (e) { }
    G._since = performance.now(); G._slow = 0; G._fast = 0; G._warm = 0; G._upAt = 0; G._upFrom = null;

    G.onChange = function (f) { G._cb.push(f); };

    // user choice: SMOOTH -> HIGH -> ULTRA -> AUTO -> ...
    G.cycle = function () {
        var seq = ['smooth', 'high', 'ultra', 'auto'], i = seq.indexOf(mode);
        var next = seq[(i + 1) % seq.length];
        G.setMode(next);
        return next;
    };
    G.setMode = function (m) {
        mode = (m === 'auto' || ORDER.indexOf(m) >= 0) ? m : 'auto';
        G.mode = mode; LSS('bv_gq', mode);
        if (mode === 'auto') { G._upFrom = null; G._warm = 0; LSS('bv_gt', G.tier); }   // keep the current look, the governor takes over from here
        else apply(mode, 'manual');
        G._since = performance.now(); G._slow = 0; G._fast = 0;
    };

    // ---- governor: called once per rendered frame ------------------------------------------------------------------
    //   dtMs   = real time since the last rendered frame     workMs = how long our own JS took for this frame
    //   ignore = true while something heavy but short is happening (camera rotating, loading, hidden tab)
    G.tick = function (dtMs, workMs, ignore) {
        if (dtMs > 400) { G._slow = 0; return; }                    // tab was in the background — not a real measurement
        G.fpsEma = G.fpsEma ? G.fpsEma * 0.93 + dtMs * 0.07 : dtMs;
        G.workEma = G.workEma ? G.workEma * 0.93 + workMs * 0.07 : workMs;
        if (mode !== 'auto' || ignore) return;
        G._warm += dtMs; if (G._warm < 2500) return;                // let the game finish loading first (2.5 s)
        var q = G.q, target = q.fps ? 1000 / q.fps : 16.7, now = performance.now(), i = ORDER.indexOf(G.tier);
        // ---- too slow -> go down one mode
        var badDt = G.fpsEma > target * 1.42 + 2, badWork = G.workEma > target * 0.92;
        if (badDt || badWork) { G._slow += dtMs; if ((G._slow > 2200 || (G.fpsEma > 90 && G._slow > 900)) && i > 0) {
            if (G._upFrom === G.tier && now - G._upAt < 40000) { cap = Math.min(cap, i - 1); LSS('bv_gcap', ORDER[cap]); }   // it failed right after going up: never go there again
            G._upFrom = null; apply(ORDER[i - 1], 'slow'); G._warm = 1200; return; } }
        else G._slow = Math.max(0, G._slow - dtMs * 2);
        // ---- clearly idle for a long time -> try one mode higher
        var nextT = i < 2 ? P[ORDER[i + 1]] : null, nextTarget = nextT && nextT.fps ? 1000 / nextT.fps : 16.7;
        var fine = G.fpsEma < target * 1.1 + 1 && G.workEma < nextTarget * 0.33;
        if (fine && i < 2 && i < cap && now - G._since > 14000) { G._fast += dtMs; if (G._fast > 5000) {
            G._upFrom = ORDER[i + 1]; G._upAt = now; apply(ORDER[i + 1], 'idle'); G._warm = 1200; } }
        else G._fast = 0;
    };
    G.label = function () {
        return (G.mode === 'auto' ? 'AUTO · ' : '') + G.tier.toUpperCase();
    };
    window.GFX = G;
})();
