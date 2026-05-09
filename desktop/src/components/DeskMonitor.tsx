/**
 * components/DeskMonitor.tsx — drei <Html transform> portal that pastes a
 * monospace task-stream onto the desk monitor mesh.
 *
 * Reads `useConversationStore.taskLog` (codex stdout) and `currentTask`
 * (status badge). Auto-scrolls. Persona-tinted CRT vibe — green-on-dark
 * by default, accent border, scanline overlay.
 *
 * Wiring:
 *   - The monitor mesh in the room model is named `monitor_screen` (or the
 *     renderer plan picks the actual mesh name). Pass its world position +
 *     rotation as props. We render an `<Html transform>` block on top of it
 *     so the text sits flat on the screen surface.
 *   - When `task:status` events stream from main, the App-level wiring (or
 *     a local listener) pushes lines into store.taskLog via `appendTaskLog`.
 *
 * If the desk monitor mesh isn't yet anchored in the room, the component
 * still renders — just floats at the provided default world position.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useConversationStore } from '../stores/conversation';
import { useAngelStore } from '../stores/angel';
import { onTaskStatus } from '../lib/ipcEvents';
import type { AngelTask } from '@angel/shared';

const MAX_VISIBLE_LINES = 14;
const SCREEN_WIDTH_CSS = 360;
const SCREEN_HEIGHT_CSS = 220;

const STATUS_LABEL: Record<AngelTask['status'], string> = {
  pending: 'pending',
  running: 'running',
  verifying: 'verifying',
  success: 'success',
  failed: 'failed',
};

const STATUS_COLOR: Record<AngelTask['status'], string> = {
  pending: 'rgba(255,255,255,0.5)',
  running: '#9eff8c',
  verifying: '#ffd166',
  success: '#9eff8c',
  failed: '#ff6b6b',
};

export interface DeskMonitorProps {
  /** world position of the monitor's screen surface */
  position?: [number, number, number];
  /** Y rotation in radians — usually faces toward the room center */
  rotationY?: number;
  /** scale uniform — tune to match the mesh size */
  scale?: number;
}

export function DeskMonitor({
  position = [0.55, 0.72, -0.62],
  rotationY = 0,
  scale = 0.32,
}: DeskMonitorProps = {}) {
  const taskLog = useConversationStore((s) => s.taskLog);
  const currentTask = useConversationStore((s) => s.currentTask);
  const setTask = useConversationStore((s) => s.setTask);
  const appendTaskLog = useConversationStore((s) => s.appendTaskLog);
  const persona = useAngelStore((s) => s.persona);
  const accent = persona?.paletteHex ?? 'var(--angel-accent)';

  // wire ipcEvents.onTaskStatus → store
  useEffect(() => {
    return onTaskStatus((task) => {
      setTask(task);
      // synthesize a log line for the status transition
      const summary = task.output?.summary;
      const line = summary ? `[${task.status}] ${summary}` : `[${task.status}] ${task.intent}`;
      appendTaskLog(line);
    });
  }, [setTask, appendTaskLog]);

  // wire main-process delegate/verify streams → store. Each codex stdout
  // chunk lands as a fresh log line so the monitor paints live.
  //
  // The preload bridge can lag behind the renderer when Electron is
  // started off a stale dist-electron build (before HMR picked up new
  // bridge functions). Guard each subscriber so a missing channel
  // becomes a console warn instead of unmounting the whole canvas.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.angel) return;
    const angel = window.angel as Partial<typeof window.angel>;

    const offs: Array<() => void> = [];
    const safeOn = <T,>(name: string, fn: ((cb: (e: T) => void) => () => void) | undefined, cb: (e: T) => void) => {
      if (typeof fn !== 'function') {
        // surface a one-time hint so the dev knows the preload is stale,
        // but don't throw — DeskMonitor still renders without streams.
        console.warn(`[DeskMonitor] window.angel.${name} unavailable — preload may be stale, restart Electron`);
        return;
      }
      offs.push(fn(cb));
    };

    safeOn<{ jobId: string; chunk: string }>('onCodexStream', angel.onCodexStream, ({ chunk }) => {
      if (typeof chunk === 'string' && chunk.length > 0) appendTaskLog(chunk);
    });
    safeOn<{ jobId: string; result: unknown }>('onCodexComplete', angel.onCodexComplete, ({ result }) => {
      const r = result as { exitCode?: number; durationMs?: number; mocked?: boolean } | null;
      if (!r) return;
      const tag = r.mocked ? 'mock' : 'codex';
      appendTaskLog(
        `[${tag}] complete — exit ${r.exitCode ?? '?'} in ${Math.round((r.durationMs ?? 0) / 100) / 10}s`,
      );
    });
    safeOn<{ check: string; ok: boolean; evidence: string }>('onVerifyResult', angel.onVerifyResult, ({ check, ok, evidence }) => {
      const badge = ok ? 'verify ok' : 'verify FAIL';
      appendTaskLog(`[${badge}] ${check}: ${evidence}`);
    });

    return () => {
      offs.forEach((off) => off());
    };
  }, [appendTaskLog]);

  // visible tail
  const visible = useMemo(() => taskLog.slice(-MAX_VISIBLE_LINES), [taskLog]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [visible.length]);

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      <Html
        transform
        distanceFactor={1}
        occlude={false}
        zIndexRange={[5, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <div
          style={{
            width: SCREEN_WIDTH_CSS,
            height: SCREEN_HEIGHT_CSS,
            background: '#040404',
            border: `2px solid ${accent}66`,
            borderRadius: 6,
            overflow: 'hidden',
            position: 'relative',
            boxShadow: `0 0 0 2px rgba(0,0,0,0.6), inset 0 0 26px rgba(0,255,170,0.06)`,
            fontFamily: 'var(--font-ui)',
          }}
        >
          {/* status bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 10px',
              fontSize: 9,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.55)',
              borderBottom: `1px solid ${accent}22`,
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <span>codex.stdout</span>
            {currentTask ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  color: STATUS_COLOR[currentTask.status],
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: STATUS_COLOR[currentTask.status],
                    animation:
                      currentTask.status === 'running' || currentTask.status === 'verifying'
                        ? 'angel-pulse 1.2s ease-in-out infinite'
                        : 'none',
                  }}
                />
                {STATUS_LABEL[currentTask.status]}
              </span>
            ) : (
              <span style={{ opacity: 0.4 }}>idle</span>
            )}
          </div>

          {/* log scrollback */}
          <div
            ref={scrollRef}
            style={{
              padding: '8px 10px',
              fontSize: 11,
              lineHeight: 1.45,
              color: '#9eff8c',
              height: SCREEN_HEIGHT_CSS - 26,
              overflowY: 'hidden',
              fontFamily: 'var(--font-ui)',
              textShadow: '0 0 6px rgba(158,255,140,0.5)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {visible.length === 0 ? (
              <div style={{ opacity: 0.35, fontStyle: 'italic' }}>
                $ awaiting task…
              </div>
            ) : (
              visible.map((line, i) => (
                <div key={`${i}-${line}`} style={{ opacity: i === visible.length - 1 ? 1 : 0.78 }}>
                  <span style={{ color: 'rgba(158,255,140,0.55)' }}>$</span> {line}
                </div>
              ))
            )}
          </div>

          {/* scanline overlay */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background: `repeating-linear-gradient(
                0deg,
                rgba(0,0,0,0) 0,
                rgba(0,0,0,0) 2px,
                rgba(0,0,0,0.18) 3px,
                rgba(0,0,0,0) 4px
              )`,
              mixBlendMode: 'multiply',
            }}
          />
        </div>
      </Html>
    </group>
  );
}

export default DeskMonitor;
