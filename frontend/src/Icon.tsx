// Lucide interface glyphs, resolved by design-taste-frontend (@iconify-json/lucide@1.2.100).
// Lucide ISC and derived Feather MIT notices: public/lucide-license.txt.
// These describe controls and categories, not individual application logos.
const paths = {
 app: <><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M9 21V9"/></>,
 file: <><path d="M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"/><path d="M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706zM5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1"/></>,
 scheme: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
 search: <><path d="m21 21l-4.34-4.34"/><circle cx="11" cy="11" r="8"/></>,
 refresh: <><path d="M3 12a9 9 0 0 1 9-9a9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5m5 4a9 9 0 0 1-9 9a9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5"/></>,
 plus: <path d="M5 12h14m-7-7v14"/>,
 close: <path d="M18 6L6 18M6 6l12 12"/>,
 check: <path d="M20 6L9 17l-5-5"/>,
 chevron: <path d="m9 18l6-6l-6-6"/>,
 folder: <path d="m6 14l1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>,
}

export function Icon({name}: {name:keyof typeof paths}) {
 return <svg className="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}
