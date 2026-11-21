/**
 * csp-policy.js — Kebijakan Keamanan Konten (Content Security Policy).
 *
 * Mengunci permukaan serangan renderer terhadap injeksi script jahat (XSS)
 * dan membatasi koneksi jaringan hanya ke endpoint daemon lokal yang sah.
 */

export const CSP_POLICY =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-eval'; " +                       // UTANG sementara: Pixi v6 memakai new Function
  "style-src 'self' 'unsafe-inline'; " +                      // UTANG: banyak style inline
  "img-src 'self' data: blob: model: https:; " +              // https: untuk thumbnail & artwork audio online
  "media-src 'self' data: blob: model: https:; " +            // https: untuk stream radio & audio online arbitrer
  "font-src 'self' data:; " +
  "connect-src 'self' ws://127.0.0.1:9119 http://127.0.0.1:9119 http://127.0.0.1:8880 http://127.0.0.1:20128 http://localhost:20128 http://127.0.0.1:9124 http://localhost:9124 model: data: blob:; " +
  "object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'self' blob:"
