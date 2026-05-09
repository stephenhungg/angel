// stock-image scene helper. takes a seed + dimensions, returns a picsum
// image with a uniform warm-monochrome filter (sepia + saturate + brightness)
// so randomly-picked stock photos feel cohesive with moment's tonal palette.
//
// usage: <StockScene seed="hero" w={1440} h={800} className="absolute inset-0" />
//
// CSS filter values were tuned to push everything toward moment's warm-cream-
// monochrome look regardless of the underlying picsum image's original colors.

type StockSceneProps = {
  seed: string;
  w?: number;
  h?: number;
  className?: string;
  /** css filter override — defaults to warm-monochrome */
  filter?: string;
};

// pink-tint filter — pulls random photos toward sakura-pink monochrome.
// hue-rotate after sepia shifts amber to pink; saturate boosts the pink;
// brightness keeps photos legible on the white bg.
const DEFAULT_FILTER =
  "sepia(0.7) hue-rotate(295deg) saturate(1.6) brightness(1.05) contrast(0.95)";

export function StockScene({
  seed,
  w = 1200,
  h = 800,
  className,
  filter = DEFAULT_FILTER,
}: StockSceneProps) {
  return (
    <img
      src={`https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      className={`h-full w-full object-cover ${className ?? ""}`}
      style={{ filter }}
    />
  );
}
