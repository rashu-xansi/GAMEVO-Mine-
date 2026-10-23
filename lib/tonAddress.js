// lib/tonAddress.js - checks a TON (Tonkeeper) wallet address WITHOUT any extra package (23 Oct 2026).
// Accepts the normal "friendly" form (48 characters, starts with UQ / EQ) and the raw form (0:<64 hex>).
// The friendly form carries a 2-byte checksum (CRC16-XMODEM), so a mistyped address is rejected before any money is reserved.
// Test-network addresses are rejected. Returns the cleaned address string, or null if it is not valid.
function crc16(bytes) {
    let crc = 0;
    for (const b of bytes) {
        crc ^= b << 8;
        for (let i = 0; i < 8; i++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc;
}
export function cleanTonAddress(input) {
    const s = String(input || '').trim();
    if (/^-?[01]:[0-9a-fA-F]{64}$/.test(s)) return s.toLowerCase();               // raw form: workchain:hash
    if (!/^[A-Za-z0-9_\-+/]{48}$/.test(s)) return null;                            // friendly form is exactly 48 base64 characters
    const buf = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (buf.length !== 36) return null;
    const flag = buf[0];
    if (flag !== 0x11 && flag !== 0x51) return null;                                // 0x11 bounceable, 0x51 non-bounceable (0x80 bit = testnet -> rejected)
    if (buf[1] !== 0x00 && buf[1] !== 0xff) return null;                            // workchain 0 or -1
    const crc = crc16(buf.subarray(0, 34));
    if (((crc >> 8) & 0xff) !== buf[34] || (crc & 0xff) !== buf[35]) return null;
    return s;
}
