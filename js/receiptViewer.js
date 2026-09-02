/* 收據看大圖。全螢幕、點哪裡都關掉。

   每次開都重新建 object URL、關掉就 revoke——留著的話那張圖會一直佔記憶體，
   而收據可能有幾十張。 */
import { icon } from "./icons.js";
import { openModal, closeModal } from "./ui.js";

let currentURL = null;
let wired = false;

function wire() {
  if (wired) return;
  wired = true;
  const backdrop = document.getElementById("receipt-viewer");
  backdrop.querySelector(".receipt-viewer-close").innerHTML = icon("close", { size: 22 });
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !backdrop.hidden) close();
  });
}

function close() {
  closeModal("receipt-viewer");
  const img = document.getElementById("receipt-viewer-image");
  img.removeAttribute("src");
  if (currentURL) URL.revokeObjectURL(currentURL);
  currentURL = null;
}

export function openReceiptViewer(blob) {
  wire();
  if (currentURL) URL.revokeObjectURL(currentURL);
  currentURL = URL.createObjectURL(blob);
  document.getElementById("receipt-viewer-image").src = currentURL;
  openModal("receipt-viewer");
}
