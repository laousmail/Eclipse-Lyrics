/** Demo project loader ("Try with a demo song"). */

import { migrateProject } from "./core/project.js";

export async function fetchDemoProject() {
  const res = await fetch("./demo/demo-project.json", { cache: "force-cache" });
  if (!res.ok) throw new Error("DEMO_MISSING");
  const raw = await res.json();
  return migrateProject({
    ...raw,
    id: `p_demo_${Date.now().toString(36)}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export async function fetchDemoAudioFile() {
  const res = await fetch("./demo/demo.wav", { cache: "force-cache" });
  if (!res.ok) throw new Error("DEMO_AUDIO_MISSING");
  const blob = await res.blob();
  return new File([blob], "demo.wav", { type: "audio/wav" });
}
