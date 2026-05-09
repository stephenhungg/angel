/**
 * Scene action vocabulary — the contract between desktop main process (orchestrator)
 * and renderer (r3f scene). Both sides code against this. New actions only by mutual
 * agreement (Stephen + Matthew).
 */

export type AnchorId =
  | 'desk_sit'
  | 'desk_stand'
  | 'bookshelf'
  | 'window'
  | 'couch_sit'
  | 'couch_stand'
  | 'door'
  | 'center';

export type Emotion =
  | 'neutral'
  | 'happy'
  | 'thinking'
  | 'excited'
  | 'smug'
  | 'soft'
  | 'focused'
  | 'concerned';

export type AnimationClip =
  | 'idle'
  | 'walking'
  | 'sitting'
  | 'sitting_playful'
  | 'sit_to_type'
  | 'typing'
  | 'type_to_sit'
  | 'reading'
  | 'wave'
  | 'thinking';

export type Expression =
  | 'smile'
  | 'smirk'
  | 'wink'
  | 'concentrate'
  | 'surprise'
  | 'yawn'
  | 'nod';

/**
 * Verbs an interactable can support. The renderer translates these into the
 * appropriate animation chain (sit → typing flow → exit) without the brain
 * needing to know the underlying clips.
 */
export type InteractableVerb =
  | 'sit'
  | 'sit_playful'
  | 'sit_and_type'
  | 'look_out'
  | 'browse'
  | 'open'
  | 'lay_down';

export type SceneAction =
  | { id: string; type: 'walk_to'; anchor: AnchorId; speed?: 'slow' | 'normal' | 'urgent' }
  | { id: string; type: 'sit_at'; anchor: AnchorId }
  | { id: string; type: 'stand' }
  | { id: string; type: 'play_clip'; clip: AnimationClip; loop?: boolean; durationMs?: number }
  | { id: string; type: 'face'; target: 'user' | AnchorId }
  | { id: string; type: 'speak'; text: string; emotion?: Emotion }
  | { id: string; type: 'set_state'; mood?: string; energy?: number; trust?: number; currentTask?: string | null }
  | { id: string; type: 'set_expression'; expression: Expression; weight: number; durationMs?: number }
  | { id: string; type: 'delegate'; taskId: string; summary: string }
  | { id: string; type: 'wait'; ms: number }
  | { id: string; type: 'cancel_queue' }
  /** macro: walk to an interactable's approach anchor and execute its verb.
   * The renderer handles the underlying choreography (walk → face → sit →
   * typing flow etc.) so the brain only needs to name the prop + verb. */
  | { id: string; type: 'interact_with'; interactableId: string; verb: InteractableVerb; durationMs?: number };

export type SceneActionComplete = {
  id: string;
  success: boolean;
  error?: string;
};
