"use client";

import { useRef, useState, type CSSProperties } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

/**
 * TiltedCard — 3d perspective tilt on mouse-move with spring physics.
 *
 * The card rotates around X/Y based on cursor offset from center. A floating
 * tooltip caption follows the cursor with velocity-based rotation.
 *
 * lifted from portfolio-temp/portfolio/components/TiltedCard.tsx, swapped
 * `motion/react` import to `framer-motion` (v11 compat).
 */
type Props = {
  children?: React.ReactNode;
  captionText?: string;
  containerHeight?: string;
  containerWidth?: string;
  scaleOnHover?: number;
  /** how much the card tilts at the edges (degrees) */
  rotateAmplitude?: number;
  showTooltip?: boolean;
  className?: string;
};

const springValues = { damping: 30, stiffness: 100, mass: 2 };

export function TiltedCard({
  children,
  captionText = "",
  containerHeight = "100%",
  containerWidth = "100%",
  scaleOnHover = 1.06,
  rotateAmplitude = 12,
  showTooltip = false,
  className,
}: Props) {
  const ref = useRef<HTMLElement>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useMotionValue(0), springValues);
  const rotateY = useSpring(useMotionValue(0), springValues);
  const scale = useSpring(1, springValues);
  const opacity = useSpring(0);
  const rotateFigcaption = useSpring(0, { stiffness: 350, damping: 30, mass: 1 });
  const [lastY, setLastY] = useState(0);

  const handleMouse: React.MouseEventHandler = (e) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;
    rotateX.set((offsetY / (rect.height / 2)) * -rotateAmplitude);
    rotateY.set((offsetX / (rect.width / 2)) * rotateAmplitude);
    x.set(e.clientX - rect.left);
    y.set(e.clientY - rect.top);
    rotateFigcaption.set(-(offsetY - lastY) * 0.6);
    setLastY(offsetY);
  };

  const handleEnter = () => {
    scale.set(scaleOnHover);
    opacity.set(1);
  };
  const handleLeave = () => {
    opacity.set(0);
    scale.set(1);
    rotateX.set(0);
    rotateY.set(0);
    rotateFigcaption.set(0);
  };

  const figureStyle: CSSProperties = {
    height: containerHeight,
    width: containerWidth,
    perspective: 800,
  };

  return (
    <figure
      ref={ref}
      onMouseMove={handleMouse}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className={`relative flex items-center justify-center ${className ?? ""}`}
      style={figureStyle}
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d", rotateX, rotateY, scale }}
      >
        {children}
      </motion.div>

      {showTooltip && captionText && (
        <motion.figcaption
          className="pointer-events-none absolute left-0 top-0 z-[3] rounded-[4px] bg-white px-2.5 py-1 font-sans text-[11px] text-ink-near"
          style={{ x, y, opacity, rotate: rotateFigcaption }}
        >
          {captionText}
        </motion.figcaption>
      )}
    </figure>
  );
}
