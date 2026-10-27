import { useEffect, useState } from "react";

export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia("(pointer: coarse)").matches
  );
}

export function useIsTouchDevice(): boolean {
  const [touch, setTouch] = useState(() => isTouchDevice());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(pointer: coarse)");
    const update = () => setTouch(isTouchDevice());
    mql.addEventListener("change", update);
    window.addEventListener("touchstart", update, { once: true, passive: true });
    return () => {
      mql.removeEventListener("change", update);
      window.removeEventListener("touchstart", update);
    };
  }, []);

  return touch;
}

