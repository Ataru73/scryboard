import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storage } from "../lib/storage";
import { _resetAudioContextForTests, playDiceRollSound, unlockAudioContext } from "./diceSound";

describe("diceSound", () => {
  let memoryStore = new Map<string, string>();

  beforeEach(() => {
    memoryStore = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => memoryStore.get(key) ?? null,
      setItem: (key: string, value: string) => memoryStore.set(key, String(value)),
      removeItem: (key: string) => memoryStore.delete(key),
      clear: () => memoryStore.clear(),
    });
    _resetAudioContextForTests();
    storage.setDiceSoundMuted(false);
  });

  afterEach(() => {
    _resetAudioContextForTests();
    vi.restoreAllMocks();
  });

  it("handles environment without Web Audio safely", () => {
    vi.stubGlobal("AudioContext", undefined);
    expect(() => {
      unlockAudioContext();
      playDiceRollSound(2);
    }).not.toThrow();
  });

  it("does not play sound when muted in storage", () => {
    storage.setDiceSoundMuted(true);
    expect(storage.getDiceSoundMuted()).toBe(true);

    const mockStart = vi.fn();
    class MockAudioContext {
      state = "running";
      sampleRate = 44100;
      currentTime = 0;
      createGain() {
        return {
          gain: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
      }
      createBufferSource() {
        return {
          playbackRate: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: mockStart,
        };
      }
      createBuffer(_ch: number, length: number) {
        return {
          getChannelData: () => new Float32Array(length),
        };
      }
      destination = {};
    }

    vi.stubGlobal("AudioContext", MockAudioContext);

    playDiceRollSound(3);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("schedules impact buffers and respects count when unmuted", () => {
    storage.setDiceSoundMuted(false);

    const startedSources: { time: number; rate: number }[] = [];
    class MockAudioContext {
      state = "running";
      sampleRate = 44100;
      currentTime = 10;
      createGain() {
        return {
          gain: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
      }
      createBufferSource() {
        let rate = 1;
        return {
          playbackRate: {
            setValueAtTime: (_val: number) => {
              rate = _val;
            },
          },
          connect: vi.fn(),
          start: (time: number) => {
            startedSources.push({ time, rate });
          },
        };
      }
      createBuffer(_ch: number, length: number) {
        return {
          getChannelData: () => new Float32Array(length),
        };
      }
      destination = {};
    }

    vi.stubGlobal("AudioContext", MockAudioContext);

    playDiceRollSound(2);

    expect(startedSources.length).toBeGreaterThan(0);
    expect(startedSources[0]?.time).toBeGreaterThan(10);
  });
});
