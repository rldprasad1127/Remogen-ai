/**
 * Reads a WAV file's real duration by walking its RIFF chunks. (A fixed
 * "byte 40 is the data size" shortcut breaks whenever a file has extra
 * chunks like LIST/fact before the audio, which many encoders add.)
 */
export function wavDurationSeconds(buf) {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("TTS engine returned something that isn't a WAV file");
  }
  let offset = 12;
  let byteRate = 0;
  let dataStart = -1;
  let dataSize = 0;

  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      byteRate = buf.readUInt32LE(offset + 8 + 8); // after format(2) channels(2) sampleRate(4)
    } else if (id === "data") {
      dataStart = offset + 8;
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }

  if (!byteRate || dataStart < 0) throw new Error("Could not read audio length from WAV header");
  const available = buf.length - dataStart;
  // Streamed encoders write 0 / 0xFFFFFFFF as the size - trust the real length then.
  const bytes = dataSize === 0 || dataSize === 0xffffffff || dataSize > available ? available : dataSize;
  return bytes / byteRate;
}
