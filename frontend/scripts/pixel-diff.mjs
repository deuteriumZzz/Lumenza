export function summarizePixelDiff(
  reference,
  current,
  { channels = 4, threshold = 16 } = {},
) {
  if (reference.length !== current.length) {
    throw new RangeError("Pixel buffers must have the same length");
  }
  if (!Number.isInteger(channels) || channels < 1) {
    throw new RangeError("Channels must be a positive integer");
  }
  if (reference.length % channels !== 0) {
    throw new RangeError("Pixel buffer length must be divisible by channels");
  }
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 255) {
    throw new RangeError("Threshold must be between 0 and 255");
  }

  const visibleChannels = channels === 4 ? 3 : channels;
  const totalPixels = reference.length / channels;
  let changedPixels = 0;
  let maxChannelDelta = 0;
  let totalChannelDelta = 0;

  for (let offset = 0; offset < reference.length; offset += channels) {
    let pixelChanged = false;
    for (let channel = 0; channel < visibleChannels; channel += 1) {
      const delta = Math.abs(reference[offset + channel] - current[offset + channel]);
      totalChannelDelta += delta;
      maxChannelDelta = Math.max(maxChannelDelta, delta);
      if (delta > threshold) pixelChanged = true;
    }
    if (pixelChanged) changedPixels += 1;
  }

  return {
    changedPixels,
    changedRatio: totalPixels === 0 ? 0 : changedPixels / totalPixels,
    maxChannelDelta,
    meanChannelDelta:
      totalPixels === 0 ? 0 : totalChannelDelta / (totalPixels * visibleChannels),
    totalPixels,
  };
}
