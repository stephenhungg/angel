"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";

/**
 * moment's signature card pattern: image is permanently scaled to 1.15 inside
 * an overflow:hidden container. on hover, the image SCALES DOWN to 1.0 — the
 * effect feels like the camera pulls back to reveal more of the scene. opposite
 * of the typical hover-zoom-in. ease curve [0,0,0,1] over ~600ms.
 *
 * source: live audit of moment.framer.photos `Pexels 1..4` cards.
 *   rest:  matrix(1.15, 0, 0, 1.15, 0, 0)
 *   hover: none (i.e. matrix(1, 0, 0, 1, 0, 0))
 */
type ImageCardProps = {
  children: React.ReactNode;
  className?: string;
  /** override the rest scale (default 1.15) */
  restScale?: number;
  /** override hover scale (default 1.0) */
  hoverScale?: number;
  /** disable the hover effect — element stays at restScale */
  staticOnly?: boolean;
};

export function ImageCard({
  children,
  className,
  restScale = 1.15,
  hoverScale = 1,
  staticOnly = false,
}: ImageCardProps) {
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  return (
    <div
      ref={ref}
      onMouseEnter={() => !staticOnly && setHover(true)}
      onMouseLeave={() => !staticOnly && setHover(false)}
      className={`relative overflow-hidden ${className ?? ""}`}
    >
      <motion.div
        className="h-full w-full"
        animate={{ scale: hover ? hoverScale : restScale }}
        transition={{ duration: 0.6, ease: [0, 0, 0, 1] }}
      >
        {children}
      </motion.div>
    </div>
  );
}
