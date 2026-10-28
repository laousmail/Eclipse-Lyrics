/** Web Worker: compute waveform peaks from channel data transferred as ArrayBuffers. */

function computePeaksFromChannels(ch0, ch1, targetPeaks = 4000) {
  const length = ch0.length;
  const peaksCount = Math.min(targetPeaks, Math.max(256, Math.floor(length / 64)));
  const block = Math.max(1, Math.floor(length / peaksCount));
  const peaks = new Float32Array(peaksCount * 3);
  for (let i = 0; i < peaksCount; i++) {
    const start = i * block;
    const end = Math.min(start + block, length);
    let min = 1;
    let max = -1;
    let sumSq = 0;
    let n = 0;
    for (let j = start; j < end; j++) {
      let v = ch0[j];
      if (ch1) v = (v + ch1[j]) * 0.5;
      if (v < min) min = v;
      if (v > max) max = v;
      sumSq += v * v;
      n += 1;
    }
    const rms = n ? Math.sqrt(sumSq / n) : 0;
    const idx = i * 3;
    peaks[idx] = min;
    peaks[idx + 1] = max;
    peaks[idx + 2] = rms;
  }
  return peaks;
}

self.onmessage = (e) => {
  const { ch0, ch1, targetPeaks, id } = e.data || {};
  try {
    const peaks = computePeaksFromChannels(
      new Float32Array(ch0),
      ch1 ? new Float32Array(ch1) : null,
      targetPeaks || 4000
    );
    self.postMessage({ id, peaks }, [peaks.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
