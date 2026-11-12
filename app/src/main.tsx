import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";

// Khi phát triển: chuyển lỗi JS về terminal của `tauri dev` để dễ thấy.
if (import.meta.env.DEV) {
  const send = (level: string, msg: string) => invoke("js_log", { level, msg }).catch(() => {});
  window.addEventListener("error", (e) => send("error", `${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => send("rejection", String(e.reason)));
  window.addEventListener("securitypolicyviolation", (e) => send("csp", `${e.violatedDirective} blocked ${e.blockedURI}`));
  const orig = console.error;
  console.error = (...a: unknown[]) => { send("console.error", a.map(String).join(" ")); orig(...a); };
  send("info", "frontend loaded");
  // Smoke-test: HSK_SMOKE=1 npm run tauri dev -> tự bấm qua từng tab trên thanh trái, ghi kết quả vào log.
  invoke<boolean>("smoke_enabled").then(async (on) => {
    if (!on) return;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await sleep(2500);
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".nav button"));
    for (const b of buttons) {
      b.click();
      await sleep(3500);
      const main = document.querySelector<HTMLElement>(".main");
      send("smoke", `${b.textContent} -> ${main?.innerText.trim().length ?? -1} ký tự`);
    }
    send("smoke", "XONG");
  });
}

// VITE_MOCK: giả lập Tauri khi xem giao diện trong trình duyệt (xem devMock.ts)
const mount = () => ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (import.meta.env.VITE_MOCK) import("./devMock").then(mount);
else mount();
