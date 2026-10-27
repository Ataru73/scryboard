import type { Point, Viewport } from "./viewport";
import { pinchTransform } from "./viewport";

export interface TouchPointer {
  id: number;
  screen: Point;
  pointerType: string;
}

export interface PinchState {
  startVp: Viewport;
  startDist: number;
  startCenter: Point;
  currentDist: number;
  currentCenter: Point;
  maxMovement: number;
  startTime: number;
}

export interface GestureCallbacks {
  onViewportChange: (vp: Viewport) => void;
  onTwoFingerTap?: () => void;
  onThreeFingerTap?: () => void;
  onCancelActiveInteraction?: () => void;
}

const TAP_MAX_DURATION_MS = 280;
const TAP_MAX_DISTANCE_PX = 12;
const GRACE_PERIOD_MS = 200;

export class TouchGestureTracker {
  private pointers = new Map<number, TouchPointer>();
  private pinch: PinchState | null = null;
  private tapCandidate: { fingerCount: number; startTime: number; maxMovement: number } | null =
    null;
  private graceUntil = 0;

  constructor(private callbacks: GestureCallbacks) {}

  get activePointerCount(): number {
    return this.pointers.size;
  }

  get isPinching(): boolean {
    return this.pinch !== null;
  }

  get inGracePeriod(): boolean {
    return Date.now() < this.graceUntil;
  }

  onPointerDown(pointer: TouchPointer, currentViewport: Viewport): boolean {
    // Il mouse non usa i gesti multi-touch.
    if (pointer.pointerType === "mouse") return false;

    this.pointers.set(pointer.id, pointer);
    const count = this.pointers.size;

    if (count === 2) {
      // Secondo dito: cancella subito tratti a 1 dito e avvia il pinch/pan.
      this.callbacks.onCancelActiveInteraction?.();
      const [p1, p2] = Array.from(this.pointers.values());
      if (p1 && p2) {
        const dist = Math.hypot(p2.screen.x - p1.screen.x, p2.screen.y - p1.screen.y);
        const center = {
          x: (p1.screen.x + p2.screen.x) / 2,
          y: (p1.screen.y + p2.screen.y) / 2,
        };
        const now = Date.now();
        this.pinch = {
          startVp: currentViewport,
          startDist: dist,
          startCenter: center,
          currentDist: dist,
          currentCenter: center,
          maxMovement: 0,
          startTime: now,
        };
        this.tapCandidate = {
          fingerCount: 2,
          startTime: now,
          maxMovement: 0,
        };
      }
      return true;
    }

    if (count === 3) {
      this.callbacks.onCancelActiveInteraction?.();
      this.pinch = null;
      this.tapCandidate = {
        fingerCount: 3,
        startTime: Date.now(),
        maxMovement: 0,
      };
      return true;
    }

    if (count > 3) {
      this.pinch = null;
      this.tapCandidate = null;
      return true;
    }

    return false;
  }

  onPointerMove(id: number, screen: Point): boolean {
    const existing = this.pointers.get(id);
    if (!existing) return false;
    existing.screen = screen;

    if (this.pointers.size === 2 && this.pinch) {
      const [p1, p2] = Array.from(this.pointers.values());
      if (p1 && p2) {
        const dist = Math.hypot(p2.screen.x - p1.screen.x, p2.screen.y - p1.screen.y);
        const center = {
          x: (p1.screen.x + p2.screen.x) / 2,
          y: (p1.screen.y + p2.screen.y) / 2,
        };
        const moveDist = Math.hypot(
          center.x - this.pinch.startCenter.x,
          center.y - this.pinch.startCenter.y,
        );
        const distDelta = Math.abs(dist - this.pinch.startDist);
        const totalMovement = Math.max(moveDist, distDelta);
        this.pinch.maxMovement = Math.max(this.pinch.maxMovement, totalMovement);
        if (this.tapCandidate) {
          this.tapCandidate.maxMovement = Math.max(this.tapCandidate.maxMovement, totalMovement);
        }

        this.pinch.currentDist = dist;
        this.pinch.currentCenter = center;

        const nextVp = pinchTransform(
          this.pinch.startVp,
          this.pinch.startDist,
          dist,
          this.pinch.startCenter,
          center,
        );
        this.callbacks.onViewportChange(nextVp);
      }
      return true;
    }

    if (this.tapCandidate && this.pointers.size >= 2) {
      return true;
    }

    return false;
  }

  onPointerUp(id: number): boolean {
    const wasTracking = this.pointers.has(id);
    this.pointers.delete(id);
    const countAfter = this.pointers.size;

    if (wasTracking && this.tapCandidate) {
      const elapsed = Date.now() - this.tapCandidate.startTime;
      if (elapsed < TAP_MAX_DURATION_MS && this.tapCandidate.maxMovement < TAP_MAX_DISTANCE_PX) {
        if (this.tapCandidate.fingerCount === 2) {
          this.callbacks.onTwoFingerTap?.();
        } else if (this.tapCandidate.fingerCount === 3) {
          this.callbacks.onThreeFingerTap?.();
        }
      }
      this.tapCandidate = null;
    }

    if (this.pinch) {
      // Uscita dal pinch: attiva il grace period per evitare click/tratti fantasma col dito rimanente
      this.pinch = null;
      this.graceUntil = Date.now() + GRACE_PERIOD_MS;
      return true;
    }

    if (countAfter === 0) {
      this.tapCandidate = null;
    }

    return false;
  }

  reset(): void {
    this.pointers.clear();
    this.pinch = null;
    this.tapCandidate = null;
  }
}
