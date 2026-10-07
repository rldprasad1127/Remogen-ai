import wave
import sys
sys.path.insert(0, ".")
from server_dia import _trim_wav_start

def make_wav(path, seconds, rate=22050, tone_hz_marker=None):
    """Writes a WAV where sample values encode which second they're in
    (value = second index), so we can verify EXACTLY which part got cut."""
    n = int(seconds * rate)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        frames = bytearray()
        for i in range(n):
            second_index = int(i / rate)
            frames += (second_index).to_bytes(2, "little", signed=True)
        w.writeframes(bytes(frames))

def read_first_sample_value(path):
    with wave.open(path, "rb") as r:
        data = r.readframes(1)
        return int.from_bytes(data, "little", signed=True)

def read_duration(path):
    with wave.open(path, "rb") as r:
        return r.getnframes() / r.getframerate()

path = "/tmp/trim_test.wav"

print("--- Trim 2 seconds off a 5-second file ---")
make_wav(path, 5)
before = read_duration(path)
_trim_wav_start(path, 2.0)
after = read_duration(path)
first_val = read_first_sample_value(path)
print(f"before={before:.2f}s after={after:.2f}s first_sample_second_index={first_val}")
assert abs(after - 3.0) < 0.02, f"FAIL: expected ~3.0s remaining, got {after}"
assert first_val == 2, f"FAIL: expected remaining audio to start at second 2, got {first_val}"
print("OK")

print("\n--- Trim MORE than the file's length (must not crash or go negative) ---")
make_wav(path, 2)
_trim_wav_start(path, 10.0)
after = read_duration(path)
print(f"after={after:.2f}s (expect 0)")
assert after == 0, f"FAIL: expected 0s remaining, got {after}"
print("OK")

print("\n--- Trim exactly 0 seconds (should leave the file unchanged) ---")
make_wav(path, 3)
before = read_duration(path)
_trim_wav_start(path, 0.0)
after = read_duration(path)
print(f"before={before:.2f}s after={after:.2f}s")
assert abs(before - after) < 0.02, "FAIL: 0s trim should not change duration"
print("OK")

print("\nALL TRIM TESTS PASSED")
