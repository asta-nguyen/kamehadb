import { describe, it, expect } from "vitest";

type KeyDownEvent = {
  repeat: boolean;
  key: string;
  shiftKey: boolean;
  nativeEvent: { isComposing: boolean };
};

function shouldSendMessage(e: KeyDownEvent): boolean {
  if (e.repeat) return false;
  if (e.nativeEvent.isComposing) return false;
  if (e.key === "Enter" && !e.shiftKey) return true;
  return false;
}

describe("chat send guard", () => {
  function makeEvent(overrides: Partial<KeyDownEvent> = {}): KeyDownEvent {
    return {
      repeat: false,
      key: "Enter",
      shiftKey: false,
      nativeEvent: { isComposing: false },
      ...overrides,
    };
  }

  it("sends on Enter without Shift when no guard conditions are active", () => {
    expect(shouldSendMessage(makeEvent())).toBe(true);
  });

  it("does not send when key is held down (e.repeat)", () => {
    expect(shouldSendMessage(makeEvent({ repeat: true }))).toBe(false);
  });

  it("does not send during IME composition (isComposing)", () => {
    expect(
      shouldSendMessage(makeEvent({ nativeEvent: { isComposing: true } })),
    ).toBe(false);
  });

  it("does not send on Shift+Enter", () => {
    expect(shouldSendMessage(makeEvent({ shiftKey: true }))).toBe(false);
  });

  it("does not send on non-Enter keys", () => {
    expect(shouldSendMessage(makeEvent({ key: "Escape" }))).toBe(false);
    expect(shouldSendMessage(makeEvent({ key: "Tab" }))).toBe(false);
  });

  it("does not send on Shift+Enter even during IME", () => {
    expect(
      shouldSendMessage(
        makeEvent({ shiftKey: true, nativeEvent: { isComposing: true } }),
      ),
    ).toBe(false);
  });

  it("does not send on held Enter even without IME", () => {
    expect(
      shouldSendMessage(
        makeEvent({ repeat: true, nativeEvent: { isComposing: false } }),
      ),
    ).toBe(false);
  });
});
