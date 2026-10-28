/** In-place line list rendering by line id. */

import { formatMs, lineMainText, lineFr, lineEn, isLyric } from "./sync.js";

/**
 * Update #line-list rows in place (create/update/remove by data-id).
 */
export function renderLineListInPlace(
  listEl,
  { lines, selectedIndex, tapIndex, reviewMode = false, onSelect, onMenu, onNudge, onReplay }
) {
  if (!listEl) return;

  const wanted = new Set(lines.map((l) => l.id));
  [...listEl.children].forEach((child) => {
    if (!wanted.has(child.dataset.id)) child.remove();
  });

  lines.forEach((line, i) => {
    let li = [...listEl.querySelectorAll(".line-item")].find((el) => el.dataset.id === line.id);
    const isNew = !li;
    if (isNew) {
      li = document.createElement("li");
      li.className = "line-item";
      li.setAttribute("role", "option");
      li.dataset.id = line.id;
      li.innerHTML = `
        <span class="time"></span>
        <span class="text">
          <p class="text-main"></p>
          <p class="text-tr"></p>
        </span>
        <span class="line-actions">
          <button type="button" class="line-menu-btn" aria-label="Line menu">⋯</button>
          <span class="line-review-tools">
            <button type="button" class="line-nudge" data-dir="-1" aria-label="Nudge earlier">◀</button>
            <button type="button" class="line-nudge" data-dir="1" aria-label="Nudge later">▶</button>
            <button type="button" class="line-replay" aria-label="Replay line">↺</button>
          </span>
        </span>`;
      let pressTimer = null;
      li.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".line-actions")) return;
        if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
        pressTimer = window.setTimeout(() => {
          pressTimer = null;
          onMenu?.(i);
        }, 480);
      });
      const clearPress = () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      };
      li.addEventListener("pointerup", clearPress);
      li.addEventListener("pointercancel", clearPress);
      li.addEventListener("pointermove", clearPress);
    }

    li.dataset.index = String(i);
    li.tabIndex = i === selectedIndex ? 0 : -1;
    li.classList.toggle("untimed", isLyric(line) && line.startMs == null);
    li.classList.toggle("is-section", line.type === "section");
    li.classList.toggle("selected", i === selectedIndex);
    li.classList.toggle("next-tap", i === tapIndex && tapIndex < lines.length);
    if (i === selectedIndex) li.setAttribute("aria-selected", "true");
    else li.removeAttribute("aria-selected");

    const timeEl = li.querySelector(".time");
    const mainEl = li.querySelector(".text-main");
    const trEl = li.querySelector(".text-tr");
    if (line.type === "section") {
      timeEl.textContent = "§";
      mainEl.textContent = line.label || "";
      trEl.textContent = "";
    } else {
      timeEl.textContent = line.startMs != null ? formatMs(line.startMs) : "—:—";
      mainEl.textContent = lineMainText(line);
      const trParts = [lineFr(line), lineEn(line)].filter(Boolean);
      trEl.textContent = trParts.join(" · ");
    }

    li.onclick = (e) => {
      if (e.target.closest(".line-actions")) return;
      onSelect?.(i, true);
    };

    const menuBtn = li.querySelector(".line-menu-btn");
    if (menuBtn) {
      menuBtn.onclick = (e) => {
        e.stopPropagation();
        onMenu?.(i);
      };
    }

    li.querySelectorAll(".line-nudge").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        onNudge?.(i, Number(btn.dataset.dir) * 50);
      };
      btn.style.display = reviewMode && isLyric(line) && line.startMs != null ? "" : "none";
    });
    const replay = li.querySelector(".line-replay");
    if (replay) {
      replay.onclick = (e) => {
        e.stopPropagation();
        onReplay?.(i);
      };
      replay.style.display = reviewMode && isLyric(line) && line.startMs != null ? "" : "none";
    }

    if (isNew) {
      const ref = listEl.children[i];
      if (ref) listEl.insertBefore(li, ref);
      else listEl.appendChild(li);
    } else {
      const ref = listEl.children[i];
      if (ref !== li) {
        if (ref) listEl.insertBefore(li, ref);
        else listEl.appendChild(li);
      }
    }
  });
}
