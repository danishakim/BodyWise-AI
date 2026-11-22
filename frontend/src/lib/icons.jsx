// Icon set (24px stroke icons), ported from the original app.
// PATHS are static constants defined here; never put user or AI text into them.
const PATHS = {
  home: "<path d=\"M3 11l9-7 9 7\"/><path d=\"M5 10v10h14V10\"/><path d=\"M10 20v-6h4v6\"/>",
  plan: "<path d=\"M7 3v8a2 2 0 0 0 4 0V3\"/><path d=\"M9 11v10\"/><path d=\"M17 3c-2 2-2.5 5-2 8h2v10\"/>",
  camera: "<path d=\"M4 8h3l2-3h6l2 3h3v12H4z\"/><circle cx=\"12\" cy=\"13.5\" r=\"3.5\"/>",
  chart: "<path d=\"M4 20V4\"/><path d=\"M4 20h16\"/><path d=\"M7 15l4-4 3 3 5-6\"/>",
  chat: "<path d=\"M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z\"/>",
  user: "<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6\"/>",
  sparkle: "<path d=\"M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z\"/><path d=\"M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z\"/>",
  flame: "<path d=\"M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-5 5-5 8-1-1-2-2-2-4-2 2-2 5-2 8 0 4 3 7 7 7z\"/>",
  scale: "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"4\"/><path d=\"M8 9a5 5 0 0 1 8 0l-3 3\"/>",
  swap: "<path d=\"M4 8h13l-3-3\"/><path d=\"M20 16H7l3 3\"/>",
  cloud: "<path d=\"M7 18a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z\"/>",
  plus: "<path d=\"M12 5v14M5 12h14\"/>",
  trash: "<path d=\"M4 7h16\"/><path d=\"M9 7V4h6v3\"/><path d=\"M6 7l1 13h10l1-13\"/>",
  check: "<path d=\"M5 12l5 5 9-10\"/>",
  moon: "<path d=\"M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z\"/>",
  alert: "<path d=\"M12 3l10 18H2z\"/><path d=\"M12 10v4M12 17.5v.5\"/>",
  info: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v6M12 7.5v.5\"/>",
  arrowR: "<path d=\"M5 12h14M13 6l6 6-6 6\"/>",
  arrowL: "<path d=\"M19 12H5M11 6l-6 6 6 6\"/>",
  refresh: "<path d=\"M20 11a8 8 0 0 0-14-5L4 8\"/><path d=\"M4 4v4h4\"/><path d=\"M4 13a8 8 0 0 0 14 5l2-2\"/><path d=\"M20 20v-4h-4\"/>",
  search: "<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"M20 20l-4-4\"/>",
  menu: "<rect x=\"5\" y=\"3\" width=\"14\" height=\"18\" rx=\"2\"/><path d=\"M9 8h6M9 12h6M9 16h4\"/>",
  party: "<path d=\"M4 20l5-14 9 9z\"/><path d=\"M14 4v2M19 9h2M17 5l-1.5 1.5\"/>",
  target: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"12\" cy=\"12\" r=\"5\"/><circle cx=\"12\" cy=\"12\" r=\"1\"/>",
  walk: "<circle cx=\"13\" cy=\"4\" r=\"2\"/><path d=\"M9 21l3-7 3 3v4\"/><path d=\"M8 11l3-3 3 2 3 1\"/>",
  bolt: "<path d=\"M13 2L4 14h7l-1 8 9-12h-7z\"/>",
  sofa: "<path d=\"M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3\"/><path d=\"M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2z\"/>",
  bike: "<circle cx=\"6\" cy=\"17\" r=\"3.5\"/><circle cx=\"18\" cy=\"17\" r=\"3.5\"/><path d=\"M6 17l4-8h5l3 8M10 9l2 8\"/>",
  run: "<circle cx=\"15\" cy=\"4\" r=\"2\"/><path d=\"M6 21l4-6 3 2 1-6 4 3\"/><path d=\"M8 9l4-2 2 4\"/>",
  down: "<path d=\"M12 4v16M6 14l6 6 6-6\"/>",
  up: "<path d=\"M12 20V4M6 10l6-6 6 6\"/>",
  equal: "<path d=\"M5 9h14M5 15h14\"/>",
  send: "<path d=\"M4 12l16-8-6 16-2-6z\"/>",
  download: "<path d=\"M12 4v11M7 10l5 5 5-5\"/><path d=\"M5 20h14\"/>",
  leaf: "<path d=\"M5 19c0-9 5-14 15-15-1 10-6 15-15 15z\"/><path d=\"M5 19l7-7\"/>",
  wallet: "<rect x=\"3\" y=\"6\" width=\"18\" height=\"14\" rx=\"3\"/><path d=\"M16 13h2\"/><path d=\"M3 10h18\"/>",
  settings: "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z\"/>",
  logout: "<path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\"/><path d=\"m16 17 5-5-5-5\"/><path d=\"M21 12H9\"/>",
  shield: "<path d=\"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z\"/>",
  mail: "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"m3 7 9 6 9-6\"/>",
  edit: "<path d=\"M12 20h9\"/><path d=\"M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z\"/>",
  phone: "<rect x=\"6\" y=\"2\" width=\"12\" height=\"20\" rx=\"3\"/><path d=\"M11 18h2\"/>",
  calendar: "<rect x=\"3\" y=\"4\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M16 2v4M8 2v4M3 10h18\"/>",
  chevron: "<path d=\"m9 18 6-6-6-6\"/>",
  back: "<path d=\"m15 18-6-6 6-6\"/>",
};

export function Icon({ name, size, className, style }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" className={className} style={size ? { width: size, height: size, ...style } : style}
      dangerouslySetInnerHTML={{ __html: d }} />
  );
}
