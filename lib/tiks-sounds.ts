import { tiks } from "@rexa-developer/tiks";

let ready = false;

/** Glass-theme UI sounds — init lazily on the first user gesture. */
export function ensureTiks() {
  if (ready) return;
  tiks.init({ theme: "glass" });
  ready = true;
}

export function initTiksOnFirstGesture() {
  if (typeof window === "undefined") return;
  const boot = () => {
    ensureTiks();
    window.removeEventListener("pointerdown", boot);
    window.removeEventListener("keydown", boot);
  };
  window.addEventListener("pointerdown", boot, { once: true, passive: true });
  window.addEventListener("keydown", boot, { once: true });
}

export function playOverlayOpen() {
  ensureTiks();
  tiks.error();
}

export function playOverlayClose() {
  ensureTiks();
  tiks.error();
}

export function playPostSwitch() {
  ensureTiks();
  tiks.pop();
}

export function playMediaSwitch() {
  ensureTiks();
  tiks.swoosh();
}
