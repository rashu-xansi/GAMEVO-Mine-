/* ============================================================================================
   gfx.js  —  Graphics engine for Blocky Village (GameVo Mine)            (16 Nov 2026)

   WHAT THIS FILE DOES
   1) Detects how strong the phone is and picks a quality level:
        smooth  = for weak / old phones (30 fps, light effects)           <- lag-free on low-end phones
        high    = for normal phones   (60 fps, all the nice effects)
        ultra   = for strong phones   (60 fps, sharp picture, drifting clouds, all glows, more snow/ships/cars)
      The player can also choose by hand (🎮 button in the game). The choice is remembered.
   2) If the game still lags on the chosen phone (Auto mode only) it quietly goes one level down.
   3) "Tile cache": the world is NOT redrawn block by block 60 times a second any more.
      It is painted once into small picture tiles, and every frame only those tiles are copied.
      Only the tile that really changed (a new house, a tree...) is painted again.
      That is why even the full unlocked map no longer hangs.

   Nothing here needs any editing. Put this file next to village.html (same folder).
   ============================================================================================ */
(function (w) {
    'use strict';

    var LSget = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
    var LSset = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };

    // ------------------------------------------------------------------ quality presets
    //   fps      frames per second the game is allowed to paint
    //   dprCap   sharpness: 1 = normal picture, 2 = twice as sharp (more GPU work)
    //   water    0 = still water · 1 = moving waves · 2 = two moving wave layers
    //   decor    flowers / grass tufts on the ground
    //   glow     night lights: 0 none · 1 street lamps · 2 lamps + windows
    //   snow     falling snow flakes (winter)            pcap  most villagers painted at once
    //   rings    rings of clouds around the island        vessels / cars  how many ships+boats / cars
    //   budget   ms per frame the tile painter may use    tpf  tiles painted per frame    tcap  tiles kept in memory
    //   lod      below this zoom the villagers are painted in a simpler (faster) way
    var PRESETS = {
        smooth: { id: 'smooth', fps: 30, dprCap: 1,   water: 0, decor: false, glow: 0, snow: 0,  pcap: 60,  rings: 2, cloudAnim: false, vessels: 1, cars: 4, budget: 5, tpf: 2, tcap: 200,  lod: .85 },
        high:   { id: 'high',   fps: 60, dprCap: 1.5, water: 1, decor: true,  glow: 1, snow: 35, pcap: 140, rings: 3, cloudAnim: true,  vessels: 2, cars: 6, budget: 6, tpf: 3, tcap: 280, lod: .5  },
        ultra:  { id: 'ultra',  fps: 60, dprCap: 2,   water: 2, decor: true,  glow: 2, snow: 90, pcap: 300, rings: 4, cloudAnim: true,  vessels: 3, cars: 8, budget: 8, tpf: 4, tcap: 420, lod: 0   }
    };
    var ORDER = ['smooth', 'high', 'ultra'];

    // texts for the 7 languages of the app: [ar, ru, es, hi, zh, bn]
    var DICT = {
        '🎮 Graphics quality': ['🎮 جودة الرسومات', '🎮 Качество графики', '🎮 Calidad gráfica', '🎮 ग्राफ़िक्स क्वालिटी', '🎮 画质', '🎮 গ্রাফিক্স কোয়ালিটি'],
        'Auto (best for my phone)': ['تلقائي (الأنسب لهاتفي)', 'Авто (лучшее для моего телефона)', 'Auto (lo mejor para mi móvil)', 'ऑटो (मेरे फ़ोन के लिए बेस्ट)', '自动（适合我的手机）', 'অটো (আমার ফোনের জন্য সেরা)'],
        'Smooth (weak phones)': ['سلس (للهواتف الضعيفة)', 'Плавно (слабые телефоны)', 'Fluido (móviles lentos)', 'स्मूद (कमज़ोर फ़ोन)', '流畅（低配手机）', 'স্মুথ (দুর্বল ফোন)'],
        'High': ['عالية', 'Высокое', 'Alta', 'हाई', '高', 'হাই'],
        'Ultra (strong phones)': ['ألترا (للهواتف القوية)', 'Ультра (мощные телефоны)', 'Ultra (móviles potentes)', 'अल्ट्रा (दमदार फ़ोन)', '极致（高配手机）', 'আল্ট্রা (শক্তিশালী ফোন)'],
        'Smooth': ['سلس', 'Плавно', 'Fluido', 'स्मूद', '流畅', 'স্মুথ'],
        'Ultra': ['ألترا', 'Ультра', 'Ultra', 'अल्ट्रा', '极致', 'আল্ট্রা'],
        'Auto': ['تلقائي', 'Авто', 'Auto', 'ऑटो', '自动', 'অটো'],
        'Now: ': ['الحالي: ', 'Сейчас: ', 'Ahora: ', 'अभी: ', '当前：', 'এখন: '],
        'Graphics: ': ['الرسومات: ', 'Графика: ', 'Gráficos: ', 'ग्राफ़िक्स: ', '画质：', 'গ্রাফিক্স: '],
        '⚡ The game was lagging, switched to ': ['⚡ اللعبة كانت بطيئة، تم التبديل إلى ', '⚡ Игра тормозила, включено: ', '⚡ El juego iba lento, cambiado a ', '⚡ गेम लैग कर रहा था, बदला: ', '⚡ 游戏卡顿，已切换到 ', '⚡ গেম ল্যাগ করছিল, বদলে দিলাম: '],
        '👷 All builders are busy. Wait until a building is finished.': ['👷 جميع البنائين مشغولون. انتظر حتى ينتهي بناء.', '👷 Все строители заняты. Дождитесь окончания стройки.', '👷 Todos los constructores están ocupados. Espera a que termine una obra.', '👷 सभी बिल्डर व्यस्त हैं। एक निर्माण पूरा होने तक रुकें।', '👷 所有建筑工人都在忙。请等当前建筑完成。', '👷 সব বিল্ডার ব্যস্ত। একটা বিল্ডিং শেষ হওয়া পর্যন্ত অপেক্ষা করো।'],
        'Tip: choose Smooth in the 🎮 menu if the game feels slow.': ['نصيحة: اختر «سلس» من قائمة 🎮 إذا كانت اللعبة بطيئة.', 'Совет: если игра тормозит, выберите «Плавно» в меню 🎮.', 'Consejo: si va lento, elige «Fluido» en el menú 🎮.', 'टिप: गेम धीमा लगे तो 🎮 मेन्यू में "स्मूद" चुनें।', '提示：如果游戏卡顿，请在 🎮 菜单选择“流畅”。', 'টিপ: গেম স্লো লাগলে 🎮 মেনুতে "স্মুথ" বেছে নাও।']
    };

    // ------------------------------------------------------------------ device detection
    function gpuName() {
        try {
            var c = document.createElement('canvas');
            var gl = c.getContext('webgl') || c.getContext('experimental-webgl');
            if (!gl) return '';
            var ext = gl.getExtension('WEBGL_debug_renderer_info');
            var r = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
            var lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
            return r;
        } catch (e) { return ''; }
    }
    function benchMs() {            // tiny canvas speed test (about 10 ms)
        try {
            var c = document.createElement('canvas'); c.width = c.height = 256;
            var g = c.getContext('2d');
            var s = document.createElement('canvas'); s.width = s.height = 16;
            var sg = s.getContext('2d'); sg.fillStyle = '#4a8'; sg.fillRect(0, 0, 16, 16); sg.fillStyle = '#fc4'; sg.fillRect(4, 4, 8, 8);
            var run = function () {
                var t0 = performance.now();
                for (var i = 0; i < 500; i++) { g.setTransform(1.9, .6, -1.9, .6, 128 + (i % 7), 20 + (i % 11) * 10); g.drawImage(s, 0, 0); }
                g.getImageData(0, 0, 1, 1);
                return performance.now() - t0;
            };
            run(); return Math.min(run(), run());
        } catch (e) { return 12; }
    }
    function detect() {
        var nav = navigator, ua = nav.userAgent || '', info = {}, score = 0;
        var mem = nav.deviceMemory || 0, cores = nav.hardwareConcurrency || 4;
        info.mem = mem; info.cores = cores;
        if (mem) score += mem >= 8 ? 3 : mem >= 6 ? 2 : mem >= 4 ? 1 : mem >= 3 ? 0 : mem >= 2 ? -2 : -3;
        score += cores >= 8 ? 1 : cores <= 2 ? -2 : cores <= 4 ? -1 : 0;
        if (/iPhone|iPad|iPod/i.test(ua)) score += 2;
        var am = /Android (\d+)/i.exec(ua);
        if (am) { var av = +am[1]; score += av <= 8 ? -2 : av <= 10 ? -1 : av >= 13 ? 1 : 0; info.android = av; }
        var gpu = gpuName(); info.gpu = gpu;
        if (gpu) {
            var m;
            if (/swiftshader|llvmpipe|software|softpipe/i.test(gpu)) score -= 3;
            else if (/apple/i.test(gpu)) score += 3;
            else if ((m = /adreno[^0-9]*(\d{3})/i.exec(gpu))) { var a = +m[1]; score += a >= 730 ? 3 : a >= 650 ? 2 : a >= 620 ? 1 : a >= 610 ? -1 : -2; }
            else if ((m = /mali-g(\d+)/i.exec(gpu))) { var g = +m[1]; score += g >= 78 ? 2 : g >= 76 ? 1 : g >= 68 ? 0 : g >= 52 ? -1 : -2; }
            else if (/mali-(t|4)/i.test(gpu)) score -= 3;
            else if (/powervr/i.test(gpu)) score -= 1;
        }
        var b = benchMs(); info.bench = Math.round(b * 10) / 10;
        score += b < 7 ? 2 : b < 14 ? 1 : b < 28 ? 0 : b < 50 ? -1 : -2;
        info.score = score;
        var tier = score >= 6 ? 'ultra' : score >= 2 ? 'high' : 'smooth';
        return { tier: tier, info: info };
    }

    // ------------------------------------------------------------------ main object
    var G = {
        DICT: DICT,
        mode: 'auto',        // what the player chose: auto | smooth | high | ultra
        P: PRESETS.high,     // the preset in use
        rs: 1,               // extra resolution factor (0.8 when even Smooth is too slow)
        info: {},
        tiles: true,         // use the tile cache
        ratio: 1,            // how heavy the game is compared with its target speed (1 = perfect)
        ema: 16,
        listeners: [],
        _last: 0, _slowT: 0, _warm: 0, _tip: false
    };

    G.dpr = function () { return Math.max(.6, Math.min(w.devicePixelRatio || 1, G.P.dprCap) * G.rs); };
    G.onChange = function (fn) { G.listeners.push(fn); };
    function fire(why) { for (var i = 0; i < G.listeners.length; i++) { try { G.listeners[i](why); } catch (e) {} } }

    function setTier(t, why) {
        if (!PRESETS[t]) t = 'high';
        var changed = G.P.id !== t;
        G.P = PRESETS[t]; G._warm = performance.now() + 5000; G._slowT = 0; G.ema = 1000 / G.P.fps; G.ratio = 1;
        if (changed || why) fire(why || 'tier');
    }
    G.setMode = function (m) {
        if (m !== 'auto' && !PRESETS[m]) m = 'auto';
        G.mode = m; LSset('bv_gfx', m);
        G.rs = 1;
        if (m === 'auto') { LSset('bv_gfx_auto', ''); var d = detect(); G.info = d.info; LSset('bv_gfx_auto', d.tier); setTier(d.tier, 'mode'); }
        else setTier(m, 'mode');
    };
    G.name = function (t) { return t === 'smooth' ? 'Smooth' : t === 'ultra' ? 'Ultra' : 'High'; };

    // start-up: choose the quality
    (function boot() {
        var saved = LSget('bv_gfx');
        try { if (LSget('bv_low') !== null) localStorage.removeItem('bv_low'); } catch (e) {}   // the old battery flag came from the old slow renderer: forget it
        if (saved === 'smooth' || saved === 'high' || saved === 'ultra') { G.mode = saved; G.P = PRESETS[saved]; }
        else {
            G.mode = 'auto';
            var learned = LSget('bv_gfx_auto');
            if (learned && PRESETS[learned]) G.P = PRESETS[learned];
            else { var d = detect(); G.info = d.info; G.P = PRESETS[d.tier]; LSset('bv_gfx_auto', d.tier); }
        }
        G._warm = performance.now() + 6000;
        G.ema = 1000 / G.P.fps;
    })();

    // ------------------------------------------------------------------ frame pacing + automatic lag protection
    // false = skip this screen refresh (keeps the phone at 30 fps in Smooth mode: half the work, half the heat)
    G.gate = function (now) {
        var gap = 1000 / G.P.fps * .86;
        if (now - G._last < gap) return false;
        return true;
    };
    // call once per painted frame with the real time since the previous painted frame (ms)
    G.tick = function (now, ms) {
        G._last = now;
        if (document.hidden) return;
        if (ms > 250) ms = 250;
        G.ema = G.ema * .92 + ms * .08;
        G.ratio = G.ema / (1000 / G.P.fps);
        if (now < G._warm) { G._slowT = 0; return; }
        if (G.ratio > 1.45) {
            G._slowT += ms;
            if (G._slowT > 2800) {
                G._slowT = 0;
                if (G.mode === 'auto') {
                    var i = ORDER.indexOf(G.P.id);
                    if (i > 0) { var t = ORDER[i - 1]; LSset('bv_gfx_auto', t); setTier(t, 'lag'); }
                    else if (G.rs > .75) { G.rs = .8; G._warm = now + 5000; fire('res'); }
                } else if (!G._tip) { G._tip = true; fire('tip'); }
            }
        } else G._slowT = Math.max(0, G._slowT - ms * 2);
    };
    G.pcap = function () { return Math.round(G.P.pcap * (G.ratio > 1.5 ? .4 : G.ratio > 1.25 ? .65 : 1)); };

    // ------------------------------------------------------------------ TILE CACHE
    // The still world is painted into small square pictures ("tiles"). Every frame only the tiles that are on screen are copied.
    //  - frame(ctx, v, now) paints a few missing / outdated tiles per frame (nearest to the screen centre first) and copies the visible ones.
    //    It returns false when the screen is not covered yet (first start, after a rotation): the caller then paints the world the slow way
    //    for those few frames, while the tiles are being prepared in the background. Nothing ever freezes.
    //  - markRect(x0,y0,x1,y1) tells the cache which part of the world changed, so only those tiles are painted again.
    var TC = (function () {
        var TPX = 128, cfg = null, cur = null, prev = null, gen = 0, pool = [], lastS = 0, zT = 0;

        function newSet(v) {
            var X0 = Math.round(cfg.bx0 * v.S) / v.S, Y0 = Math.round(cfg.by0 * v.S) / v.S;   // grid corner lands on a whole pixel
            return { S: v.S, ang: v.ang, mode: v.mode, sm: v.sm, Tw: TPX / v.S, X0: X0, Y0: Y0, map: new Map() };
        }
        function key(i, j) { return j * 4096 + i; }
        function grab() { return pool.pop() || document.createElement('canvas'); }
        function free(t) { if (t.c) { if (pool.length < 40) pool.push(t.c); t.c = null; t.g = null; } }
        function freeSet(s) { if (!s) return; s.map.forEach(free); s.map.clear(); }

        function build(set, t) {
            var c = t.c || (t.c = grab());
            if (c.width !== TPX || c.height !== TPX) { c.width = TPX; c.height = TPX; }
            var g = t.g || (t.g = c.getContext('2d'));
            g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, TPX, TPX);
            var x0 = set.X0 + t.i * set.Tw, y0 = set.Y0 + t.j * set.Tw, S = set.S;
            var drew = cfg.render(g, S, -x0 * S, -y0 * S, x0, x0 + set.Tw, y0, y0 + set.Tw, set.mode, set.sm);
            t.gen = gen;
            if (!drew) { t.empty = true; free(t); } else t.empty = false;
        }
        // tile index range that touches the screen (m = extra tiles around the screen)
        function range(set, v, m) {
            var Tw = set.Tw, S = v.S;
            var wx0 = (0 - v.TX) / S, wx1 = (v.W - v.TX) / S, wy0 = (0 - v.TY) / S, wy1 = (v.H - v.TY) / S;
            var i0 = Math.floor((wx0 - set.X0) / Tw) - m, i1 = Math.floor((wx1 - set.X0) / Tw) + m;
            var j0 = Math.floor((wy0 - set.Y0) / Tw) - m, j1 = Math.floor((wy1 - set.Y0) / Tw) + m;
            var imax = Math.floor((cfg.bx1 - set.X0) / Tw), jmax = Math.floor((cfg.by1 - set.Y0) / Tw);
            return { i0: Math.max(0, i0), i1: Math.min(imax, i1), j0: Math.max(0, j0), j1: Math.min(jmax, j1) };
        }
        function blit(ctx, set, t, v) {
            if (!t.c) return;
            var x0 = set.X0 + t.i * set.Tw, y0 = set.Y0 + t.j * set.Tw, S = v.S;
            var a = Math.round(v.TX + x0 * S), b = Math.round(v.TY + y0 * S),
                a2 = Math.round(v.TX + (x0 + set.Tw) * S), b2 = Math.round(v.TY + (y0 + set.Tw) * S);
            if (a2 <= 0 || a >= v.W || b2 <= 0 || b >= v.H) return;
            ctx.drawImage(t.c, a, b, a2 - a, b2 - b);
        }

        var api = {
            init: function (c) { cfg = c; },
            invalidateAll: function () { gen++; },
            reset: function () { freeSet(cur); freeSet(prev); cur = null; prev = null; gen++; },
            // world rectangle changed: repaint the tiles that touch it
            markRect: function (x0, y0, x1, y1) {
                var sets = [cur, prev];
                for (var s = 0; s < 2; s++) {
                    var set = sets[s]; if (!set) continue;
                    var i0 = Math.max(0, Math.floor((x0 - set.X0) / set.Tw)), i1 = Math.floor((x1 - set.X0) / set.Tw);
                    var j0 = Math.max(0, Math.floor((y0 - set.Y0) / set.Tw)), j1 = Math.floor((y1 - set.Y0) / set.Tw);
                    for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) { var t = set.map.get(key(i, j)); if (t) t.gen = -1; }
                }
            },
            hasSet: function () { return !!cur; },
            stats: function () { var n = 0, e = 0; if (cur) cur.map.forEach(function (t) { if (t.c) n++; else if (t.empty) e++; }); return { tiles: n, empty: e, hasPrev: !!prev, S: cur ? cur.S : 0, gen: gen }; },
            // paint the cached world. v = {S,TX,TY,W,H,ang,mode,sm}. Returns true when the picture is complete (false = caller paints the world itself this frame)
            frame: function (ctx, v, now) {
                if (!cfg) return false;
                // zoom still moving? then no repaint, only scale what we have
                if (Math.abs(v.S - lastS) > 1e-6) { lastS = v.S; zT = now; }
                var settled = now - zT > 140;
                if (cur && Math.abs(cur.ang - v.ang) > 1e-6) { freeSet(cur); freeSet(prev); cur = null; prev = null; }   // other view angle: nothing can be reused
                if (cur && cur.mode !== v.mode) { freeSet(prev); prev = cur; cur = null; }
                if (!cur) cur = newSet(v);
                else {
                    var f = v.S / cur.S;
                    if ((settled && Math.abs(f - 1) > .004) || f < .55 || f > 1.8) { freeSet(prev); prev = cur; cur = newSet(v); }
                }
                var R = range(cur, v, 0), RM = range(cur, v, 1), cx = v.W / 2, cy = v.H / 2;
                // 1) which tiles do we need?
                var need = [], i, j, t, miss = 0;
                for (j = R.j0; j <= R.j1; j++) for (i = R.i0; i <= R.i1; i++) {
                    t = cur.map.get(key(i, j));
                    var x0 = cur.X0 + i * cur.Tw + cur.Tw / 2, y0 = cur.Y0 + j * cur.Tw + cur.Tw / 2;
                    var dx = v.TX + x0 * v.S - cx, dy = v.TY + y0 * v.S - cy;
                    need.push({ i: i, j: j, t: t, d: dx * dx + dy * dy });
                    if (!t) miss++;
                }
                need.sort(function (a, b) { return a.d - b.d; });
                // 2) paint what is missing / old (nearest to the screen centre first). A few per frame, so nothing hitches.
                var rush = miss > 0 && !prev;                       // nothing to show yet: hurry up (the caller paints the slow way meanwhile)
                var maxT = G.P.tpf * (rush ? 2 : 1), tmax = G.P.budget * (rush ? 2 : 1);
                var t0 = performance.now(), built = 0;
                for (var q = 0; q < need.length; q++) {
                    var n = need[q];
                    if (n.t && n.t.gen === gen) continue;
                    if (built >= maxT || (built > 0 && performance.now() - t0 > tmax)) break;
                    if (!n.t) { n.t = { i: n.i, j: n.j, c: null, g: null, gen: -1, empty: false }; cur.map.set(key(n.i, n.j), n.t); miss--; }
                    build(cur, n.t); built++;
                }
                // 3) spare time: paint tiles just outside the screen so scrolling never waits
                if (built === 0) {
                    outer: for (j = RM.j0; j <= RM.j1; j++) for (i = RM.i0; i <= RM.i1; i++) {
                        if (i >= R.i0 && i <= R.i1 && j >= R.j0 && j <= R.j1) continue;
                        t = cur.map.get(key(i, j));
                        if (t && t.gen === gen) continue;
                        if (!t) { t = { i: i, j: j, c: null, g: null, gen: -1, empty: false }; cur.map.set(key(i, j), t); }
                        build(cur, t); break outer;
                    }
                }
                var ready = miss <= 0 || !!prev;
                // 4) draw: old picture underneath while the new one is still being painted, then the tiles
                {   // always copy what exists: missing tiles just show water for a few frames (the slow full redraw would freeze the phone)
                    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true;
                    if (prev) {
                        var PR = range(prev, v, 0);
                        for (j = PR.j0; j <= PR.j1; j++) for (i = PR.i0; i <= PR.i1; i++) { t = prev.map.get(key(i, j)); if (t && !t.empty) blit(ctx, prev, t, v); }
                    }
                    for (j = R.j0; j <= R.j1; j++) for (i = R.i0; i <= R.i1; i++) { t = cur.map.get(key(i, j)); if (t && !t.empty) blit(ctx, cur, t, v); }
                    ctx.restore();
                }
                // all visible tiles up to date -> the old picture is not needed any more
                if (prev) { var allOk = true; for (j = R.j0; j <= R.j1 && allOk; j++) for (i = R.i0; i <= R.i1; i++) { t = cur.map.get(key(i, j)); if (!t || t.gen !== gen) { allOk = false; break; } } if (allOk) { freeSet(prev); prev = null; } }
                // 5) memory limit: forget tiles far away from the screen
                if (cur.map.size > G.P.tcap) {
                    var far = [];
                    cur.map.forEach(function (tt, k) { if (tt.i < RM.i0 - 1 || tt.i > RM.i1 + 1 || tt.j < RM.j0 - 1 || tt.j > RM.j1 + 1) far.push(k); });
                    for (var z = 0; z < far.length; z++) { free(cur.map.get(far[z])); cur.map.delete(far[z]); }
                }
                return true;
            }
        };
        return api;
    })();
    G.TC = TC;

    w.GFX = G;
})(window);
