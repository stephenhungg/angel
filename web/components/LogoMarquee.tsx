"use client";

/**
 * LogoMarquee — infinite css-keyframe credit roll. Pure CSS, no js timers.
 * lifted from portfolio-temp/portfolio/components/LogoMarquee.tsx.
 *
 * pass `image` for an actual asset (kawaii sticker), or just `name` for a
 * sentence-case text item (no uppercase).
 */
type Logo = { name: string; image?: string };

type Props = {
  logos: Logo[];
  className?: string;
  /** seconds for one full loop */
  duration?: number;
};

export function LogoMarquee({ logos, className = "", duration = 38 }: Props) {
  return (
    <div className={`relative w-full overflow-hidden ${className}`}>
      <div
        className="flex w-max items-center"
        style={{ animation: `marquee ${duration}s linear infinite` }}
      >
        {[...logos, ...logos].map((logo, i) => (
          <div key={`${logo.name}-${i}`} className="flex shrink-0 items-center">
            {logo.image ? (
              <div className="flex h-12 items-center px-8 tablet:h-14 tablet:px-10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logo.image}
                  alt={logo.name}
                  className="h-full w-auto select-none object-contain"
                />
              </div>
            ) : (
              <span className="whitespace-nowrap px-5 font-sans text-[14px] font-medium text-muted-secondary tablet:px-7 tablet:text-[16px]">
                {logo.name}
              </span>
            )}
            <span className="select-none font-sans text-[12px] text-muted-tertiary">·</span>
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes marquee {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
}
