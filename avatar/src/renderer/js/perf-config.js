/**
 * perf-config.js — Konfigurasi performa rendering & framerate avatar.
 *
 * Prinsip: saat idle (tidak ada aktivitas), turunkan FPS DAN resolusi render (DPR)
 * agar GPU/CPU hampir nol tanpa mengubah tampilan saat sedang aktif.
 */

export const PERF = {
  ACTIVE_FPS: 30,
  // Idle lebih hemat: 12 → 8 FPS (avatar diam, nyaris tak terlihat bedanya).
  IDLE_FPS: 8,
  // Menunggu diam selama ini sebelum turun ke mode idle.
  IDLE_AFTER_MS: 8000,
  // DPR maksimum saat aktif (resolusi render tertinggi).
  MAX_DPR: 1.5,
  // DPR saat idle — turunkan resolusi render untuk hemat GPU/fill-rate (~44% piksel).
  IDLE_DPR: 1.0,
  // Saat window tidak fokus/blur dalam waktu lama: FPS super-rendah (hampir beku).
  UNFOCUSED_FPS: 4
}
