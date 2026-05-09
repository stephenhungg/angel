/**
 * Onboarding — phase router for the title → swipe → reveal flow.
 *
 * Mounted by App.tsx when no persona is loaded. Reads phase from useSwipeStore
 * and renders the matching screen. Once the user commits a persona at the end
 * of Reveal, applyClaim fires inside Reveal itself — App.tsx's persona-presence
 * check flips and this component unmounts on the next render.
 */

import { useSwipeStore } from '@/lib/swipeStore';
import { TitleScreen } from './TitleScreen';
import { SwipeFlow } from './SwipeFlow';
import { Reveal } from './Reveal';

export function Onboarding() {
  const phase = useSwipeStore((s) => s.phase);

  if (phase === 'swipe') return <SwipeFlow />;
  if (phase === 'reveal') return <Reveal />;
  // 'title' OR 'done' (defensive — App.tsx should have unmounted us by now)
  return <TitleScreen />;
}
