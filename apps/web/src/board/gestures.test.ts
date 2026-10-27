import { describe, expect, it, vi } from "vitest";
import { TouchGestureTracker } from "./gestures";
import { pinchTransform, screenToWorld } from "./viewport";

describe("pinchTransform", () => {
  const startVp = { x: 100, y: 50, scale: 1 };

  it("handles pure pan when distance does not change", () => {
    const startCenter = { x: 200, y: 200 };
    const currentCenter = { x: 250, y: 220 };
    const next = pinchTransform(startVp, 100, 100, startCenter, currentCenter);
    expect(next.scale).toBe(1);
    expect(next.x).toBe(150); // 100 + (250 - 200)
    expect(next.y).toBe(70); // 50 + (220 - 200)
  });

  it("handles pure zoom when center does not move", () => {
    const center = { x: 300, y: 200 };
    const worldBefore = screenToWorld(startVp, center);
    const next = pinchTransform(startVp, 100, 200, center, center);
    expect(next.scale).toBe(2);
    const worldAfter = screenToWorld(next, center);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y);
  });

  it("combines pan and zoom simultaneously", () => {
    const startCenter = { x: 100, y: 100 };
    const currentCenter = { x: 150, y: 150 };
    const next = pinchTransform(startVp, 100, 150, startCenter, currentCenter);
    expect(next.scale).toBe(1.5);
    // World point at startCenter should be at currentCenter in the new viewport
    const world = screenToWorld(startVp, startCenter);
    const screenAfter = { x: world.x * next.scale + next.x, y: world.y * next.scale + next.y };
    expect(screenAfter.x).toBeCloseTo(currentCenter.x);
    expect(screenAfter.y).toBeCloseTo(currentCenter.y);
  });
});

describe("TouchGestureTracker", () => {
  const startVp = { x: 0, y: 0, scale: 1 };

  it("ignores mouse pointers", () => {
    const callbacks = {
      onViewportChange: vi.fn(),
      onCancelActiveInteraction: vi.fn(),
    };
    const tracker = new TouchGestureTracker(callbacks);

    const handled = tracker.onPointerDown(
      { id: 1, screen: { x: 10, y: 10 }, pointerType: "mouse" },
      startVp,
    );
    expect(handled).toBe(false);
    expect(tracker.activePointerCount).toBe(0);
  });

  it("cancels active single-touch interaction when a second touch arrives", () => {
    const callbacks = {
      onViewportChange: vi.fn(),
      onCancelActiveInteraction: vi.fn(),
    };
    const tracker = new TouchGestureTracker(callbacks);

    tracker.onPointerDown({ id: 1, screen: { x: 10, y: 10 }, pointerType: "touch" }, startVp);
    expect(callbacks.onCancelActiveInteraction).not.toHaveBeenCalled();

    const handled2 = tracker.onPointerDown(
      { id: 2, screen: { x: 110, y: 10 }, pointerType: "touch" },
      startVp,
    );
    expect(handled2).toBe(true);
    expect(callbacks.onCancelActiveInteraction).toHaveBeenCalledOnce();
    expect(tracker.isPinching).toBe(true);
  });

  it("emits viewport changes on 2-finger move", () => {
    const onViewportChange = vi.fn();
    const tracker = new TouchGestureTracker({ onViewportChange });

    tracker.onPointerDown({ id: 1, screen: { x: 100, y: 100 }, pointerType: "touch" }, startVp);
    tracker.onPointerDown({ id: 2, screen: { x: 200, y: 100 }, pointerType: "touch" }, startVp);

    // Fingers move apart: dist 100 -> 200 (scale 2x)
    tracker.onPointerMove(1, { x: 50, y: 100 });
    tracker.onPointerMove(2, { x: 250, y: 100 });

    expect(onViewportChange).toHaveBeenCalled();
    const lastVp = onViewportChange.mock.calls.at(-1)?.[0];
    expect(lastVp.scale).toBe(2);
  });

  it("triggers two-finger tap (undo)", () => {
    const onTwoFingerTap = vi.fn();
    const tracker = new TouchGestureTracker({
      onViewportChange: vi.fn(),
      onTwoFingerTap,
    });

    tracker.onPointerDown({ id: 1, screen: { x: 100, y: 100 }, pointerType: "touch" }, startVp);
    tracker.onPointerDown({ id: 2, screen: { x: 150, y: 100 }, pointerType: "touch" }, startVp);

    // Release both without moving much
    tracker.onPointerUp(1);
    tracker.onPointerUp(2);

    expect(onTwoFingerTap).toHaveBeenCalledOnce();
  });

  it("triggers three-finger tap (redo)", () => {
    const onThreeFingerTap = vi.fn();
    const tracker = new TouchGestureTracker({
      onViewportChange: vi.fn(),
      onThreeFingerTap,
    });

    tracker.onPointerDown({ id: 1, screen: { x: 100, y: 100 }, pointerType: "touch" }, startVp);
    tracker.onPointerDown({ id: 2, screen: { x: 150, y: 100 }, pointerType: "touch" }, startVp);
    tracker.onPointerDown({ id: 3, screen: { x: 200, y: 100 }, pointerType: "touch" }, startVp);

    tracker.onPointerUp(1);
    tracker.onPointerUp(2);
    tracker.onPointerUp(3);

    expect(onThreeFingerTap).toHaveBeenCalledOnce();
  });

  it("enters grace period on pinch exit to suppress single finger ghost actions", () => {
    const tracker = new TouchGestureTracker({ onViewportChange: vi.fn() });

    tracker.onPointerDown({ id: 1, screen: { x: 100, y: 100 }, pointerType: "touch" }, startVp);
    tracker.onPointerDown({ id: 2, screen: { x: 200, y: 100 }, pointerType: "touch" }, startVp);
    expect(tracker.isPinching).toBe(true);

    tracker.onPointerUp(1);
    expect(tracker.isPinching).toBe(false);
    expect(tracker.inGracePeriod).toBe(true);
  });
});

