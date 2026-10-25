import { describe, expect, it } from "vitest";
import { initiativeOrder, stepTurn } from "./initiative";

const t = (id: string, initiative?: number | null) => ({ id, initiative });

describe("initiativeOrder", () => {
  it("sorts high to low, skips tokens outside the order, breaks ties by id", () => {
    const order = initiativeOrder([t("c", 12), t("a", 18), t("x"), t("n", null), t("b", 12)]);
    expect(order.map((o) => o.id)).toEqual(["a", "b", "c"]);
  });
});

describe("stepTurn", () => {
  const order = [t("a", 18), t("b", 12), t("c", 3)];

  it("starts from the first token when nobody is active", () => {
    expect(stepTurn(order, { activeId: null, round: 1 })).toEqual({ activeId: "a", round: 1 });
    expect(stepTurn(order, { activeId: "gone", round: 4 })).toEqual({ activeId: "a", round: 4 });
  });

  it("advances and wraps into the next round", () => {
    expect(stepTurn(order, { activeId: "a", round: 1 })).toEqual({ activeId: "b", round: 1 });
    expect(stepTurn(order, { activeId: "c", round: 1 })).toEqual({ activeId: "a", round: 2 });
  });

  it("goes back, stopping at the very first turn", () => {
    expect(stepTurn(order, { activeId: "a", round: 2 }, -1)).toEqual({ activeId: "c", round: 1 });
    expect(stepTurn(order, { activeId: "a", round: 1 }, -1)).toEqual({ activeId: "a", round: 1 });
  });

  it("clears the turn when the order is empty", () => {
    expect(stepTurn([], { activeId: "a", round: 3 })).toEqual({ activeId: null, round: 3 });
  });
});
