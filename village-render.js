/* village-render.js — Blocky Village renderer (17 Nov 2026)
 *
 * WHY THIS FILE EXISTS
 *   The old renderer drew every visible block of the world again in every frame (thousands of drawImage calls), and when it
 *   cached the world it rebuilt ONE huge canvas for the whole island whenever something changed.  On a fully unlocked map
 *   (104x104 tiles) that was a 0.3-0.7 s freeze on every build / tree cut / road tile, and 150+ ms per frame on weak phones.
 *
 *   Now the island is cut into square CHUNKS (13x13 tiles).  Each chunk is drawn into its own small canvas ONCE and then
 *   simply copied to the screen (about 10 drawImage calls per frame instead of thousands).  When you build something only
 *   the chunk(s) touched are redrawn, a few ms each, spread over several frames, and chunks that are far off-screen are never
 *   drawn at all.  A memory budget per graphics mode throws away chunks that have not been seen for a while.
 *   While the camera is rotating (or in ULTRA when zoomed in) the exact old "live" renderer is used, so nothing looks different.
 *
 * Everything here is called from village.js (draw, markT, chunksDirtyAll).  Only function declarations at top level — the game
 * state (N, B, TOP, cam, ...) is read lazily so the load order does not matter.
 */

// ------------------------------------------------------------------ view basis (depends on camera angle)
var FA = 1, FB = 0, UX = 32, UY = 16, VX = -32, VY = 16, SXF = 1, SZF = 1, LX = 2, LZ = 2, XB = 0, YB = 0;
var NN = 0, COMB = null, ENTL = [];
var LITE = false;   // far-away zoom / SMOOTH mode: people are drawn with fewer rectangles
function rwInit() {
    if (COMB) return;
    NN = N * N; COMB = new Float64Array(NN + 4096);
}
function frameBasis() {
    var a = cam.ang, ca = Math.cos(a), sa = Math.sin(a);
    FA = ca; FB = sa; UX = (ca - sa) * 32; UY = (ca + sa) * 16; VX = -(ca + sa) * 32; VY = (ca - sa) * 16;
    SXF = (ca + sa) >= 0 ? 1 : -1; SZF = (ca - sa) >= 0 ? 1 : -1;
    var lv = function (q) { return Math.max(0, Math.min(4, Math.round((Math.max(.6, Math.min(.84, q)) - .6) / .06))); };
    LX = lv(.73 + .09 * SXF * (sa - ca)); LZ = lv(.73 + .09 * SZF * (ca + sa));
    var o = projXY(0, 0, 1); XB = o[0]; YB = o[1];
}
var RGAP = 3;   // locked land that is still drawn (dark) around your land; clouds hide everything behind it

// ------------------------------------------------------------------ the column renderer (same drawing as the old renderWorld)
// draws the tile rectangle [xa,xb) x [za,zb) of the island into g.  ents = null for a cached chunk.
function renderCols(g, S, TX, TY, xa, za, xb, zb, vx0, vx1, vy0, vy1, ents, sm) {
    rwInit();
    var c = N / 2, KX = FA + FB, KZ = FA - FB, R = LR(land), decor = !!GFX.q.decor, n = 0;
    var Rg = R + RGAP, lo = Math.max(0, Math.floor(c - Rg - 1)), hi = Math.min(N - 1, Math.ceil(c + Rg + 1));
    var zA = Math.max(za, lo), zB = Math.min(zb - 1, hi), xA = Math.max(xa, lo), xB = Math.min(xb - 1, hi);
    for (var wz = zA; wz <= zB; wz++) for (var wx = xA; wx <= xB; wx++) {
        if (Math.abs(wx + .5 - c) > Rg || Math.abs(wz + .5 - c) > Rg) continue;
        var ty0 = TOP[wz * N + wx], Xc = XB + (wx + .5) * UX + (wz + .5) * VX, Yc = YB + (wx + .5) * UY + (wz + .5) * VY;
        if (Xc < vx0 - 48 || Xc > vx1 + 48 || Yc - ty0 * 32 - 64 > vy1 || Yc + 64 < vy0) continue;
        COMB[n++] = Math.floor((KX * (wx + .5 - c) + KZ * (wz + .5 - c) + N + 8) * 8) * 32768 + wz * N + wx;
    }
    var ne = 0;
    if (ents) for (var ei = 0; ei < ents.length; ei++) {
        if (ne >= 4000) break;
        var it = ents[ei], e = it[0];
        pj(e.x, e.z, 2);
        if (_sx < vx0 || _sx > vx1 || _sy < vy0 || _sy > vy1 + 100) continue;
        var tx = Math.floor(e.x), tz = Math.floor(e.z), key = KX * (tx + .5 - c) + KZ * (tz + .5 - c) + N + .07;
        COMB[n++] = Math.floor((key + 8) * 8) * 32768 + NN + ne; ENTL[ne++] = it;
    }
    var sub = COMB.subarray(0, n); sub.sort();
    g.imageSmoothingEnabled = sm;
    for (var q = 0; q < n; q++) {
        var id = sub[q] % 32768;
        if (id >= NN) { g.setTransform(S, 0, 0, S, TX, TY); drawEnt(g, ENTL[id - NN]); continue; }
        var wx2 = id % N, wz2 = (id / N) | 0, ty = TOP[id];
        var dark = (Math.abs(wx2 + .5 - c) > R || Math.abs(wz2 + .5 - c) > R) ? 1 : 0, ox = XB + wx2 * UX + wz2 * VX, oy = YB + wx2 * UY + wz2 * VY;
        for (var y = 0; y <= ty; y++) {
            var i = (y * N + wz2) * N + wx2, t = B[i]; if (!t) continue;
            var base = oy - y * 32;
            if (y + 1 >= HM || !B[i + NN]) { g.setTransform(UX * 1.04 / 16 * S, UY * 1.04 / 16 * S, VX * 1.04 / 16 * S, VY * 1.04 / 16 * S, (ox - .02 * (UX + VX)) * S + TX, (base - .02 * (UY + VY)) * S + TY); g.drawImage(getTex(t, 0, 0, dark), 0, 0); }
            var nx = SXF > 0 ? (wx2 + 1 < N ? B[i + 1] : 0) : (wx2 > 0 ? B[i - 1] : 0);
            if (!nx) { var fx = SXF > 0 ? ox + UX : ox, fy = SXF > 0 ? base + UY : base; g.setTransform(VX * 1.04 / 16 * S, VY * 1.04 / 16 * S, 0, 2.08 * S, (fx - .02 * VX) * S + TX, (fy - .02 * VY - .64) * S + TY); g.drawImage(getTex(t, 1, LX, dark), 0, 0); }
            var nzz = SZF > 0 ? (wz2 + 1 < N ? B[i + N] : 0) : (wz2 > 0 ? B[i - N] : 0);
            if (!nzz) { var fx2 = SZF > 0 ? ox + VX : ox, fy2 = SZF > 0 ? base + VY : base; g.setTransform(UX * 1.04 / 16 * S, UY * 1.04 / 16 * S, 0, 2.08 * S, (fx2 - .02 * UX) * S + TX, (fy2 - .02 * UY - .64) * S + TY); g.drawImage(getTex(t, 1, LZ, dark), 0, 0); }
        }
        var fn = FNC.get(id), dl = decor ? DECT.get(id) : null, gold = !dark && ty <= 1 && Math.max(Math.abs(wx2 + .5 - c), Math.abs(wz2 + .5 - c)) > R - 1.01;
        if (dl || gold || fn) {
            g.setTransform(S, 0, 0, S, TX, TY);
            if (gold) {
                g.strokeStyle = '#ffd54a'; g.lineWidth = 3; g.lineCap = 'round';
                var hh = ty * 32, px = function (a, b) { return XB + a * UX + b * VX; }, py = function (a, b) { return YB + a * UY + b * VY - hh; };
                var ed = [[wx2, wz2, wx2 + 1, wz2, wx2, wz2 - 1], [wx2 + 1, wz2, wx2 + 1, wz2 + 1, wx2 + 1, wz2], [wx2, wz2 + 1, wx2 + 1, wz2 + 1, wx2, wz2 + 1], [wx2, wz2, wx2, wz2 + 1, wx2 - 1, wz2]];
                for (var k = 0; k < 4; k++) {
                    var e4 = ed[k]; if (!inb(e4[4], e4[5])) continue;
                    if (!own(e4[4], e4[5])) { g.beginPath(); g.moveTo(px(e4[0], e4[1]), py(e4[0], e4[1])); g.lineTo(px(e4[2], e4[3]), py(e4[2], e4[3])); g.stroke(); }
                }
            }
            if (fn) drawFence(g, fn);
            if (dl) for (var di = 0; di < dl.length; di++) drawDecor(g, dl[di]);
        }
    }
    g.setTransform(S, 0, 0, S, TX, TY);
}

// allocation-free projection: result in _sx,_sy
var _sx = 0, _sy = 0;
function pj(fx, fz, fh) {
    _tg(cam.ang);
    var dx = fx - N / 2, dz = fz - N / 2, q0 = dx * _rc - dz * _rs + N / 2, q1 = dx * _rs + dz * _rc + N / 2;
    _sx = (q0 - q1) * 32; _sy = (q0 + q1) * 16 - (fh - 1) * 32;
}

// ------------------------------------------------------------------ chunks
var CK = null;
function ckInit() {
    if (CK) return;
    var CT = N, ds = [13, 12, 14, 16, 11, 10, 8];
    for (var i = 0; i < ds.length; i++) if (N % ds[i] === 0) { CT = ds[i]; break; }
    var CN = Math.ceil(N / CT);
    CK = { CT: CT, CN: CN, list: [], mem: 0, frame: 0, SC: [.3, .42, .6, .85, 1.2, 1.7, 2.4], rendered: 0, live: 0 };
    for (var k = 0; k < CN * CN; k++) CK.list.push({ ci: k % CN, cj: (k / CN) | 0, cv: null, g: null, ang: NaN, sc: 0, dirty: 1, used: 0, ox: 0, oy: 0, w: 0, h: 0, mty: 9, key: 0 });
}
// a block / decoration / fence in tile (x,z) changed -> that chunk (and the neighbour when it is on the border) must be redrawn
function markT(x, z) {
    if (!CK) ckInit();
    if (x < 0 || z < 0 || x >= N || z >= N) return;
    var CT = CK.CT, CN = CK.CN, ci = (x / CT) | 0, cj = (z / CT) | 0, L = CK.list, rx = x - ci * CT, rz = z - cj * CT;
    L[cj * CN + ci].dirty = 1;
    if (rx === 0 && ci > 0) L[cj * CN + ci - 1].dirty = 1;
    if (rx === CT - 1 && ci < CN - 1) L[cj * CN + ci + 1].dirty = 1;
    if (rz === 0 && cj > 0) L[(cj - 1) * CN + ci].dirty = 1;
    if (rz === CT - 1 && cj < CN - 1) L[(cj + 1) * CN + ci].dirty = 1;
}
function chunksDirtyAll() { if (!CK) ckInit(); for (var i = 0; i < CK.list.length; i++) CK.list[i].dirty = 1; }
function chunksFreeAll() { if (!CK) return; for (var i = 0; i < CK.list.length; i++) { var c = CK.list[i]; c.cv = null; c.g = null; c.dirty = 1; c.ang = NaN; } CK.mem = 0; }

// screen box (world px) of a chunk at the current camera angle; mty = tallest column in it
function ckBox(c, mty, o) {
    var CT = CK.CT, x0 = c.ci * CT, z0 = c.cj * CT, x1 = Math.min(N, x0 + CT), z1 = Math.min(N, z0 + CT);
    var ax = XB + x0 * UX + z0 * VX, bx = XB + x1 * UX + z0 * VX, cx = XB + x0 * UX + z1 * VX, dx = XB + x1 * UX + z1 * VX;
    var ay = YB + x0 * UY + z0 * VY, by = YB + x1 * UY + z0 * VY, cy = YB + x0 * UY + z1 * VY, dy = YB + x1 * UY + z1 * VY;
    o.l = Math.min(ax, bx, cx, dx) - 8; o.r = Math.max(ax, bx, cx, dx) + 8;
    o.t = Math.min(ay, by, cy, dy) - mty * 32 - 24; o.b = Math.max(ay, by, cy, dy) + 44;
    o.x0 = x0; o.z0 = z0; o.x1 = x1; o.z1 = z1;
}
var _bx = { l: 0, r: 0, t: 0, b: 0, x0: 0, z0: 0, x1: 0, z1: 0 };

function ckRender(c, s) {
    var CT = CK.CT, x0 = c.ci * CT, z0 = c.cj * CT, x1 = Math.min(N, x0 + CT), z1 = Math.min(N, z0 + CT), mty = 1;
    for (var z = z0; z < z1; z++) for (var x = x0; x < x1; x++) { var t = TOP[z * N + x]; if (t > mty) mty = t; }
    c.mty = mty; ckBox(c, mty, _bx);
    var left = Math.floor(_bx.l), top = Math.floor(_bx.t), W = Math.ceil((_bx.r - left) * s) + 2, H = Math.ceil((_bx.b - top) * s) + 2;
    if (!c.cv) { c.cv = document.createElement('canvas'); c.cv.width = 1; c.cv.height = 1; c.g = c.cv.getContext('2d'); CK.mem += 4; }
    var cv0 = c.cv;
    if (cv0.width < W || cv0.height < H) {
        CK.mem -= cv0.width * cv0.height * 4;
        cv0.width = Math.max(W, cv0.width); cv0.height = Math.max(H, cv0.height);
        CK.mem += cv0.width * cv0.height * 4;
    } else { c.g.setTransform(1, 0, 0, 1, 0, 0); c.g.clearRect(0, 0, cv0.width, cv0.height); }
    renderCols(c.g, s, -left * s, -top * s, x0, z0, x1, z1, -1e9, 1e9, -1e9, 1e9, null, s < 1.25);
    c.g.setTransform(1, 0, 0, 1, 0, 0);
    c.ox = left; c.oy = top; c.w = W; c.h = H; c.sc = s; c.ang = cam.ang; c.dirty = 0; CK.rendered++;
}
function ckTrim() {
    var lim = GFX.q.memMB * 1048576;
    if (CK.mem <= lim) return;
    var L = CK.list.filter(function (c) { return c.cv && c.used < CK.frame - 2; }).sort(function (a, b) { return a.used - b.used; });
    for (var i = 0; i < L.length && CK.mem > lim; i++) {
        var c = L[i]; CK.mem -= c.cv.width * c.cv.height * 4; c.cv.width = c.cv.height = 1; c.cv = null; c.g = null; c.ang = NaN; c.dirty = 1;
    }
}
function ckScale(T) {            // the chunk resolution for a wanted device-pixels-per-world-pixel
    var m = Math.min(T, GFX.q.sMax), SC = CK.SC, best = SC[0], bd = 1e9;
    for (var i = 0; i < SC.length; i++) { var d = Math.abs(Math.log(m / SC[i])); if (d < bd) { bd = d; best = SC[i]; } }
    return best;
}

// draw the world with chunks: returns nothing; entities are drawn by the caller afterwards
function rwChunks(S, TX, TY, vx0, vx1, vy0, vy1) {
    ckInit(); rwInit();
    frameBasis();
    var CT = CK.CT, c = N / 2, KX = FA + FB, KZ = FA - FB, R = LR(land), Rg = R + RGAP, lo = Math.max(0, Math.floor(c - Rg - 1)), hi = Math.min(N - 1, Math.ceil(c + Rg + 1));
    var want = ckScale(S), L = CK.list, vis = [], ang = cam.ang, angMov = Math.abs(ang - prevAng) > 1e-5;
    CK.frame++;
    for (var i = 0; i < L.length; i++) {
        var ch = L[i], x0 = ch.ci * CT, z0 = ch.cj * CT;
        if (x0 > hi || z0 > hi || x0 + CT <= lo || z0 + CT <= lo) continue;
        ckBox(ch, ch.mty, _bx);
        if (_bx.r < vx0 || _bx.l > vx1 || _bx.b < vy0 || _bx.t > vy1) continue;
        ch.key = KX * (x0 + CT / 2 - c) + KZ * (z0 + CT / 2 - c); vis.push(ch);
    }
    vis.sort(function (a, b) { return a.key - b.key; });
    var t0 = performance.now(), budget = GFX.q.budget, done = 0, sm = true;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (var v = 0; v < vis.length; v++) {
        var ch2 = vis[v], same = !!ch2.cv && ch2.ang === ang, scOk = same && ch2.sc > 0 && (want / ch2.sc) > .62 && (want / ch2.sc) < 1.65;
        var need = !same || ch2.dirty || !scOk;
        if (need && !angMov && (done === 0 || performance.now() - t0 < budget)) { ckRender(ch2, want); done++; same = true; }
        if (same) {
            ch2.used = CK.frame;
            var k = S / ch2.sc, dx = ch2.ox * S + TX, dy = ch2.oy * S + TY;
            if (Math.abs(k - 1) < .004) { dx = Math.round(dx); dy = Math.round(dy); ctx.imageSmoothingEnabled = false; } else ctx.imageSmoothingEnabled = true;
            ctx.drawImage(ch2.cv, 0, 0, ch2.w, ch2.h, dx, dy, ch2.w * k, ch2.h * k);
        } else {   // not cached yet at this angle: draw its columns directly (old live way) at the right depth position
            ckBox(ch2, ch2.mty, _bx);
            renderCols(ctx, S, TX, TY, _bx.x0, _bx.z0, _bx.x1, _bx.z1, vx0, vx1, vy0, vy1, null, S < 1.25);
            ctx.setTransform(1, 0, 0, 1, 0, 0); CK.live++;
        }
    }
    ctx.setTransform(S, 0, 0, S, TX, TY);
    ckTrim();
}

// ------------------------------------------------------------------ water
var WPM = null;
function rwWater(z, tms, vx0, vx1, vy0, vy1) {
    var q = GFX.q;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = mixC([8, 22, 66], [36, 132, 196], light); ctx.fillRect(0, 0, VW, VH);
    ctx.setTransform(z * DPR, 0, 0, z * DPR, Math.round(DPR * (VW / 2 - cX * z)), Math.round(DPR * (VH / 2 - cY * z)));
    if (q.water > 0) {
        if (!WPa) { WPa = ctx.createPattern(WP0, 'repeat'); WPb = ctx.createPattern(WP0, 'repeat'); }
        try {
            if (!WPM) WPM = new DOMMatrix();
            WPM.a = 1; WPM.d = 1; WPM.e = tms * 7; WPM.f = tms * 3; WPa.setTransform(WPM);
            if (q.water > 1) { WPM.a = 1.6; WPM.d = 1.6; WPM.e = -tms * 4; WPM.f = tms * 5; WPb.setTransform(WPM); }
        } catch (_) { }
        ctx.fillStyle = WPa; ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
        if (q.water > 1) { ctx.globalAlpha = .6; ctx.fillStyle = WPb; ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0); ctx.globalAlpha = 1; }
    }
    var offs = [[2.4, .26], [1.1, .3]];
    for (var oi = 0; oi < 2; oi++) {
        var o = offs[oi], A = N / 2 - LR(land) - RGAP - 1, Z = N / 2 + LR(land) + RGAP + 1;
        var cs = [[A - o[0], A - o[0]], [Z + o[0], A - o[0]], [Z + o[0], Z + o[0]], [A - o[0], Z + o[0]]].map(function (p) { return projXY(p[0], p[1], 1.25); });
        ctx.fillStyle = 'rgba(170,240,238,' + o[1] + ')'; ctx.beginPath();
        cs.forEach(function (a, i) { i ? ctx.lineTo(a[0], a[1]) : ctx.moveTo(a[0], a[1]); }); ctx.closePath(); ctx.fill();
    }
}

// ------------------------------------------------------------------ clouds over the locked land
// 17 Nov 2026: the old clouds were 165-235 px wide, floated 2.25 blocks high and started only 1.6 tiles outside your border, so on the
// screen they rose over your own village.  Now they are small, low, start 3 tiles outside the border, the half in front of the island is
// clipped so it can NEVER paint over land you own, and the half behind the island is drawn before the buildings (so houses stay on top).
var CLS = [];
function cloudSpr(v) {
    if (CLS[v]) return CLS[v];
    var c = document.createElement('canvas'); c.width = 200; c.height = 120; var g = c.getContext('2d');
    var Bs = [[100, 74, 46], [60, 80, 34], [142, 80, 36], [80, 50, 32], [120, 52, 30], [36, 90, 22], [166, 90, 22], [100, 40, 24]].map(function (b, i) { return [b[0] + ((v * 13 + i * 7) % 9 - 4), b[1] + ((v * 5 + i * 11) % 7 - 3), b[2] + ((v * 3 + i) % 5 - 2)]; });
    g.fillStyle = '#c9d6e6'; for (var i = 0; i < Bs.length; i++) { var b = Bs[i]; g.beginPath(); g.arc(b[0], b[1] + 7, b[2], 0, 6.3); g.fill(); }
    g.fillStyle = '#f4f8fd'; for (i = 0; i < Bs.length; i++) { b = Bs[i]; g.beginPath(); g.arc(b[0], b[1], b[2], 0, 6.3); g.fill(); }
    g.fillStyle = '#fff'; for (i = 0; i < Bs.length; i++) { b = Bs[i]; g.beginPath(); g.arc(b[0] - b[2] * .15, b[1] - b[2] * .22, b[2] * .62, 0, 6.3); g.fill(); }
    return CLS[v] = c;
}
var cR = -1, cT = 0;
function rwCloudStep(tms) {
    var R = LR(land); if (cR < 0) cR = R;
    var dt = Math.min(.1, Math.max(0, tms - cT)); cT = tms; cR += (R - cR) * Math.min(1, dt * 1.6); if (Math.abs(R - cR) < .02) cR = R;
}
function rwClouds(tms, vx0, vx1, vy0, vy1, front) {
    var q = GFX.q, L = q.clouds, c = N / 2;
    var offs = L <= 2 ? [3.2, 5.4] : L == 3 ? [3, 4.6, 6.4] : [2.9, 4.3, 5.7, 7.2];
    if (front) {   // never paint over the ground you own
        var A = c - cR + .02, Z = c + cR - .02, d = [[A, A], [Z, A], [Z, Z], [A, Z]].map(function (p) { return projXY(p[0], p[1], 2); });
        ctx.save(); ctx.beginPath();
        ctx.rect(vx0 - 400, vy0 - 400, vx1 - vx0 + 800, vy1 - vy0 + 800);
        d.forEach(function (a, i) { i ? ctx.lineTo(a[0], a[1]) : ctx.moveTo(a[0], a[1]); }); ctx.closePath();
        ctx.clip('evenodd');
    }
    for (var k = 0; k < offs.length; k++) {
        var rk = cR + offs[k], cnt = Math.max(8, Math.round(8 * rk / q.cloudStep));
        ctx.globalAlpha = k < 2 ? 1 : k == 2 ? .9 : .75;
        for (var i = 0; i < cnt; i++) {
            var t = i / cnt * 4, sd = t | 0, u = (t - sd) * 2 - 1, x, zz;
            if (sd == 0) { x = u * rk; zz = -rk; } else if (sd == 1) { x = rk; zz = u * rk; } else if (sd == 2) { x = -u * rk; zz = rk; } else { x = -rk; zz = -u * rk; }
            var hs = Math.abs(Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453) % 1;
            var fx = c + x + Math.sin(tms * .25 + hs * 6) * .45, fz = c + zz + Math.cos(tms * .2 + hs * 5) * .45;
            var r = rot(fx, fz, cam.ang), isFront = (r[0] + r[1]) >= N;
            if (isFront !== front) continue;
            var P = projXY(fx, fz, 1.7 + k * .22 + Math.sin(tms * .5 + hs * 9) * .07);
            if (P[0] < vx0 - 120 || P[0] > vx1 + 120 || P[1] < vy0 - 90 || P[1] > vy1 + 120) continue;
            var w = 118 + hs * 54, h = w * .52;
            ctx.drawImage(cloudSpr((i + k) % 3), P[0] - w / 2, P[1] - h * .62, w, h);
        }
    }
    ctx.globalAlpha = 1;
    if (front) ctx.restore();
}

// ------------------------------------------------------------------ the frame
var _snow = null;
function draw() {
    var q = GFX.q, z = cam.zoom, P0 = projXY(cam.fx, cam.fz, 2); cX = P0[0]; cY = P0[1] - 20; var tms = performance.now() / 1000;
    var vx0 = cX - VW / 2 / z - 40, vx1 = cX + VW / 2 / z + 40, vy0 = cY - VH / 2 / z - 70, vy1 = cY + VH / 2 / z + 40;
    var S = z * DPR, TX = Math.round(DPR * (VW / 2 - cX * z)), TY = Math.round(DPR * (VH / 2 - cY * z));
    var angMov = Math.abs(cam.ang - prevAng) > 1e-5;
    rwWater(z, tms, vx0, vx1, vy0, vy1);
    screens.length = 0;
    rwCloudStep(tms);
    drawVess(false, z);
    rwClouds(tms, vx0, vx1, vy0, vy1, false);        // clouds behind the island: the buildings are drawn over them
    var live = angMov || (q.live > 0 && z >= q.live);
    LITE = q.lite ? z < .62 : z < .3;
    // ---- entities visible on screen (cull first, then cap)
    var ents = [], pn = 0, pcap = q.people;
    var add = function (e, kind, fx, fz) {
        pj(fx, fz, 2); if (_sx < vx0 || _sx > vx1 || _sy < vy0 || _sy > vy1 + 100) return;
        if (live) ents.push([e, kind]); else { var r = rot(fx, fz, cam.ang); ents.push([e, kind, r[0] + r[1]]); }
    };
    for (var i = 0; i < furnL.length; i++) add(furnL[i], 'f', furnL[i].x, furnL[i].z);
    for (i = 0; i < people.length; i++) { var p = people[i]; if (!p.hidden && p.alpha > .02) { if (pn >= pcap) break; var n0 = ents.length; add(p, 'p', p.x, p.z); if (ents.length > n0) pn++; } }
    for (i = 0; i < chickens.length; i++) add(chickens[i], 'c', chickens[i].x, chickens[i].z);
    for (i = 0; i < cars.length; i++) add(cars[i], 'v', cars[i].x, cars[i].z);
    if (live) {
        frameBasis();
        rwInit();
        var c = N / 2, Rg = LR(land) + RGAP, lo = Math.max(0, Math.floor(c - Rg - 1)), hi = Math.min(N - 1, Math.ceil(c + Rg + 1));
        renderCols(ctx, S, TX, TY, lo, lo, hi + 1, hi + 1, vx0, vx1, vy0, vy1, ents, z < 1.25);
    } else {
        rwChunks(S, TX, TY, vx0, vx1, vy0, vy1);
        ents.sort(function (a, b) { return a[2] - b[2]; });
        ctx.imageSmoothingEnabled = true;
        for (i = 0; i < ents.length; i++) drawEnt(ctx, ents[i]);
    }
    prevAng = cam.ang;
    drawVess(true, z); drawNeed(); rwClouds(tms, vx0, vx1, vy0, vy1, true);
    // ---- placing / selecting / road preview
    if (pend) {
        var it = pend.it, bk = blockers(it, pend.x, pend.z, facing), fr = frontOf(it, pend.x, pend.z, facing), bm = new Set(bk.map(function (q2) { return q2.z * N + q2.x; }));
        var hl = function (x, zz, col) { var p = projXY(x + .5, zz + .5, 2), X = p[0], Y = p[1]; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(X, Y - 16); ctx.lineTo(X + 32, Y); ctx.lineTo(X, Y + 16); ctx.lineTo(X - 32, Y); ctx.fill(); };
        for (var zz = pend.z; zz < pend.z + it.d; zz++) for (var x = pend.x; x < pend.x + it.w; x++) hl(x, zz, bm.has(zz * N + x) ? 'rgba(255,70,70,.6)' : 'rgba(80,255,110,.55)');
        for (i = 0; i < bk.length; i++) { var q3 = bk[i]; if (q3.x < pend.x || q3.x >= pend.x + it.w || q3.z < pend.z || q3.z >= pend.z + it.d) hl(q3.x, q3.z, 'rgba(255,70,70,.45)'); }
        if (fr) hl(fr[0], fr[1], 'rgba(255,220,60,.7)');
        ctx.font = '22px serif'; ctx.textAlign = 'center'; bk.slice(0, 14).forEach(function (q4) { var p = projXY(q4.x + .5, q4.z + .5, 2.2); ctx.fillText(Array.from(q4.w)[0], p[0], p[1] + 8); });
    }
    if (sel && !pend && bl.includes(sel)) {
        var it2 = ITEM[sel.t];
        for (var z2 = sel.z; z2 < sel.z + it2.d; z2++) for (var x2 = sel.x; x2 < sel.x + it2.w; x2++) { var p2 = projXY(x2 + .5, z2 + .5, 2), X2 = p2[0], Y2 = p2[1]; ctx.fillStyle = 'rgba(255,220,60,.5)'; ctx.beginPath(); ctx.moveTo(X2, Y2 - 16); ctx.lineTo(X2 + 32, Y2); ctx.lineTo(X2, Y2 + 16); ctx.lineTo(X2 - 32, Y2); ctx.closePath(); ctx.fill(); }
    }
    if (rline) {
        for (i = 0; i < rline.tiles.length; i++) { var qq = rline.tiles[i], p5 = projXY(qq.x + .5, qq.z + .5, 2), X5 = p5[0], Y5 = p5[1]; ctx.fillStyle = !qq.ok ? 'rgba(255,70,70,.6)' : qq.same ? 'rgba(140,150,255,.5)' : 'rgba(80,255,110,.55)'; ctx.beginPath(); ctx.moveTo(X5, Y5 - 16); ctx.lineTo(X5 + 32, Y5); ctx.lineTo(X5, Y5 + 16); ctx.lineTo(X5 - 32, Y5); ctx.closePath(); ctx.fill(); }
        var A0 = rline.tiles[0], Zt = rline.tiles[rline.tiles.length - 1], a = projXY(A0.x + .5, A0.z + .5, 2.12), e = projXY(Zt.x + .5, Zt.z + .5, 2.12);
        if (rline.tiles.length > 1) {
            var ang = Math.atan2(e[1] - a[1], e[0] - a[0]), h = 18; ctx.lineCap = 'round'; ctx.strokeStyle = '#3a2a00'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(e[0], e[1]); ctx.stroke(); ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
            ctx.fillStyle = '#ffe066'; ctx.strokeStyle = '#3a2a00'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(e[0] + Math.cos(ang) * h * .8, e[1] + Math.sin(ang) * h * .8); ctx.lineTo(e[0] + Math.cos(ang + 2.5) * h, e[1] + Math.sin(ang + 2.5) * h); ctx.lineTo(e[0] + Math.cos(ang - 2.5) * h, e[1] + Math.sin(ang - 2.5) * h); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.fillStyle = '#3a8a2c'; ctx.beginPath(); ctx.arc(a[0], a[1], 5, 0, 6.3); ctx.fill();
    }
    // ---- screen-space overlays
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (night > .02) {
        var dusk = 1 - Math.abs(light - .5) * 2, base = mixA([92, 108, 168], [255, 255, 255], light), tint = mixA(base, [255, 176, 120], Math.max(0, dusk) * .38 * (light < 1 ? 1 : 0));
        if (q.night < 2) {       // SMOOTH: a plain translucent colour instead of the (slower) multiply blend
            var al = Math.max(0, 1 - (tint[0] + tint[1] + tint[2]) / 765);
            ctx.fillStyle = 'rgba(16,26,70,' + (al * .95).toFixed(3) + ')'; ctx.fillRect(0, 0, VW, VH);
        } else {
            ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgb(' + (tint[0] | 0) + ',' + (tint[1] | 0) + ',' + (tint[2] | 0) + ')'; ctx.fillRect(0, 0, VW, VH);
            ctx.globalCompositeOperation = 'lighter';
            var gl = 0, glMax = q.glow > 1 ? 160 : q.glow > 0 ? 40 : 0, a2 = Math.min(1, night * 1.3);
            for (i = 0; i < lights.length && gl < glMax; i++) {
                var l = lights[i]; if (!l.big && (night < .25 || q.glow < 2)) continue;
                var s = toScr(l.x, l.z, l.h + 1); if (s[0] < -80 || s[0] > VW + 80 || s[1] < -80 || s[1] > VH + 80) continue;
                var rad = (l.big ? 90 : 34) * z; ctx.globalAlpha = a2 * (l.big ? .85 : .55); ctx.drawImage(glowSpr(l.big), s[0] - rad, s[1] - rad, rad * 2, rad * 2); gl++;
            }
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        }
    }
    // coin / GM bubbles above buildings (only the ones on screen)
    coinSpots.length = 0;
    var m = 60;
    for (i = 0; i < bl.length; i++) {
        var b = bl[i]; if (!(b.cash >= 1)) continue;
        var sp = toScr(b.cx, b.cz, b.ih); if (sp[0] < -m || sp[0] > VW + m || sp[1] < -m || sp[1] > VH + m) continue;
        var by = Math.sin(tms * 3 + b.cx) * 3, rd2 = 12 * Math.max(.8, z * 1.3); coinSpots.push({ s: b, x: sp[0], y: sp[1] + by, r: rd2 });
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(sp[0], sp[1] + by + rd2 + 3, rd2 * .8, rd2 * .3, 0, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#8a5a10'; ctx.beginPath(); ctx.arc(sp[0], sp[1] + by, rd2 + 1.5, 0, 6.3); ctx.fill(); ctx.fillStyle = '#ffd54a'; ctx.beginPath(); ctx.arc(sp[0], sp[1] + by, rd2, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#fff3a0'; ctx.beginPath(); ctx.arc(sp[0] - rd2 * .25, sp[1] + by - rd2 * .25, rd2 * .45, 0, 6.3); ctx.fill(); ctx.fillStyle = '#7a4a00'; ctx.font = 'bold ' + Math.round(rd2 * .9) + 'px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText(Math.floor(b.cash), sp[0], sp[1] + by + rd2 * .32);
    }
    ctx.font = 'bold 13px ui-monospace,monospace'; ctx.textAlign = 'center';
    for (i = 0; i < screens.length; i++) {
        var e2 = screens[i].e; if (!e2.bub) continue;
        var s2 = toScr(e2.x, e2.z, 2), tw = ctx.measureText(tt(e2.bub.text)).width + 16, bx = s2[0] - tw / 2, by2 = s2[1] - (e2.merch ? 62 : 56) * z - 26;
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by2, tw, 24, 6) : ctx.rect(bx, by2, tw, 24); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s2[0] - 5, by2 + 24); ctx.lineTo(s2[0], by2 + 31); ctx.lineTo(s2[0] + 5, by2 + 24); ctx.fillStyle = '#fff'; ctx.fill(); ctx.fillStyle = '#222'; ctx.fillText(tt(e2.bub.text), s2[0], by2 + 17);
    }
    for (i = floaters.length - 1; i >= 0; i--) { var f = floaters[i]; f.t -= 1 / 60; f.y -= .7; if (f.t <= 0) { floaters.splice(i, 1); continue; } ctx.globalAlpha = Math.min(1, f.t * 2); ctx.fillStyle = '#ffd54a'; ctx.strokeStyle = '#5a3a00'; ctx.lineWidth = 3; ctx.font = 'bold 18px ui-monospace,monospace'; ctx.strokeText(f.s, f.x, f.y); ctx.fillText(f.s, f.x, f.y); ctx.globalAlpha = 1; }
    if (rline) {
        var Zt2 = rline.tiles[rline.tiles.length - 1], s3 = toScr(Zt2.x + .5, Zt2.z + .5, 2.6), txt = '🪙' + rline.cost + ' · ' + rline.tiles.length + tt(' tiles') + (rline.tiles.some(function (q5) { return !q5.ok; }) ? ' · 🔴 ' + rline.tiles.find(function (q5) { return !q5.ok; }).why : '');
        ctx.font = 'bold 13px ui-monospace,monospace'; ctx.textAlign = 'center'; var tw3 = ctx.measureText(txt).width + 16, bx3 = s3[0] - tw3 / 2, by3 = s3[1] - 30; ctx.fillStyle = '#fff7c2'; ctx.strokeStyle = '#3a2a00'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx3, by3, tw3, 24, 6) : ctx.rect(bx3, by3, tw3, 24); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#3a2a00'; ctx.fillText(txt, s3[0], by3 + 17);
    }
    if (pend) {
        var it3 = pend.it, bk3 = blockers(it3, pend.x, pend.z, facing);
        if (bk3.length) { var s4 = toScr(pend.x + it3.w / 2, pend.z + it3.d / 2, 3.4), txt4 = '✖ ' + bk3[0].w; ctx.font = 'bold 13px ui-monospace,monospace'; ctx.textAlign = 'center'; var tw4 = ctx.measureText(txt4).width + 16, bx4 = s4[0] - tw4 / 2, by4 = s4[1] - 34; ctx.fillStyle = '#ffe3e3'; ctx.strokeStyle = '#7a0000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx4, by4, tw4, 24, 6) : ctx.rect(bx4, by4, tw4, 24); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#5a0000'; ctx.fillText(txt4, s4[0], by4 + 17); }
    }
    gmSpots.length = 0;
    for (i = 0; i < bl.length; i++) {
        var b3 = bl[i]; if (b3.t != 'mine' || b3.bt || !(b3.bank > 0)) continue;
        var sp3 = toScr(b3.cx, b3.cz, b3.ih + 1), by5 = Math.sin(tms * 3) * 3, rd3 = 14 * Math.max(.8, z * 1.3); gmSpots.push({ b: b3, x: sp3[0], y: sp3[1] + by5, r: rd3 });
        ctx.fillStyle = '#0a4a6a'; ctx.beginPath(); ctx.arc(sp3[0], sp3[1] + by5, rd3 + 1.5, 0, 6.3); ctx.fill(); ctx.fillStyle = '#4fe3e0'; ctx.beginPath(); ctx.arc(sp3[0], sp3[1] + by5, rd3, 0, 6.3); ctx.fill(); ctx.fillStyle = '#043'; ctx.font = 'bold ' + Math.round(rd3 * .8) + 'px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText('GM', sp3[0], sp3[1] + by5 + rd3 * .3);
    }
    // construction timers (the list of buildings in progress is built once per frame, not once per building)
    var bq = null;
    for (i = 0; i < bl.length; i++) { if (bl[i].bt > 0) (bq || (bq = [])).push(bl[i]); }
    if (bq) {
        ctx.font = 'bold 12px ui-monospace,monospace'; ctx.textAlign = 'center'; var nb = builders();
        for (i = 0; i < bq.length; i++) {
            var b4 = bq[i]; if (b4.cx === undefined) continue;
            var sp4 = toScr(b4.cx, b4.cz, (b4.ih || 4) + .5); if (sp4[0] < -m || sp4[0] > VW + m || sp4[1] < -m || sp4[1] > VH + m) continue;
            var t5 = (i < nb ? '🔨 ' : '⏳ ') + fmtT(b4.bt), w5 = ctx.measureText(t5).width + 12;
            ctx.fillStyle = '#000a'; ctx.fillRect(sp4[0] - w5 / 2, sp4[1] - 14, w5, 20); ctx.fillStyle = '#fff'; ctx.fillText(t5, sp4[0], sp4[1] + 1);
        }
    }
    if (incs.length) { ctx.font = '26px serif'; for (i = 0; i < incs.length; i++) { var c6 = incs[i], sp6 = toScr(c6.b.cx, c6.b.cz, (c6.b.ih || 7) + 1); ctx.fillText({ thief: '🦹', fire: '🔥', sick: '🤒' }[c6.k], sp6[0], sp6[1] - 6); } }
    if (WINTER && q.snow > 0) {
        var T = tms; ctx.fillStyle = 'rgba(255,255,255,.85)';
        for (i = 0; i < q.snow; i++) { var spd = .05 + (i % 5) * .02, X = (((i * 97 % 100) / 100 * VW + Math.sin(T * .7 + i) * 18) % VW + VW) % VW, Y = ((i * 53 % 100) / 100 * VH + T * spd * VH) % VH, qs = i % 3 ? 2 : 3; ctx.fillRect(X, Y, qs, qs); }
    }
}
