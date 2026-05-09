// registration-mark decor — moment.framer.photos signature visual element.
// crosshair, dot, dots, snow markers placed at hero edges as corner registration.
// see /Users/stephenhung/Documents/GitHub/angel/reference/moment/page-structure.md.

type DecorProps = { className?: string };

export function Crosshair({ className }: DecorProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`decor-stroke pointer-events-none ${className ?? ""}`}
      aria-hidden
    >
      <line x1="8" y1="0" x2="8" y2="16" />
      <line x1="0" y1="8" x2="16" y2="8" />
    </svg>
  );
}

export function Dot({ className }: DecorProps) {
  return (
    <svg
      viewBox="0 0 8 8"
      className={`pointer-events-none ${className ?? ""}`}
      aria-hidden
    >
      <circle cx="4" cy="4" r="3" fill="currentColor" />
    </svg>
  );
}

export function Dots({ className }: DecorProps) {
  return (
    <svg
      viewBox="0 0 32 8"
      className={`pointer-events-none ${className ?? ""}`}
      aria-hidden
    >
      <circle cx="4" cy="4" r="2" fill="currentColor" />
      <circle cx="16" cy="4" r="2" fill="currentColor" />
      <circle cx="28" cy="4" r="2" fill="currentColor" />
    </svg>
  );
}

export function Snow({ className }: DecorProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`decor-stroke pointer-events-none ${className ?? ""}`}
      aria-hidden
    >
      <line x1="12" y1="2" x2="12" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="5" y1="5" x2="19" y2="19" />
      <line x1="19" y1="5" x2="5" y2="19" />
    </svg>
  );
}
