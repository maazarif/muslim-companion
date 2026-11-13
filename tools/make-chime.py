# Makes native/sounds/chime.wav: three soft bell strikes (B4, G#4, E4), about 4.5 seconds.
# Synthesised from sine partials, so it is original and free of any licence. Run: python3 tools/make-chime.py
import math, struct, wave, os
RATE = 22050
DUR = 4.6
PARTIALS = [(1.0, 1.0, 1.6), (2.0, 0.45, 1.1), (2.76, 0.25, 0.8), (5.4, 0.09, 0.45)]  # ratio, amplitude, decay seconds
STRIKES = [(0.00, 493.88, 1.0), (0.55, 415.30, 0.9), (1.10, 329.63, 1.0)]
n = int(RATE * DUR)
buf = [0.0] * n
for start, f0, amp in STRIKES:
    s0 = int(start * RATE)
    for i in range(s0, n):
        t = (i - s0) / RATE
        attack = min(1.0, t / 0.004)
        v = 0.0
        for ratio, a, d in PARTIALS:
            v += a * math.exp(-t / d) * math.sin(2 * math.pi * f0 * ratio * t)
        buf[i] += amp * attack * v
fade = int(0.25 * RATE)
for i in range(fade):
    buf[n - 1 - i] *= i / fade
peak = max(abs(x) for x in buf)
gain = 0.7 / peak  # about -3 dB
out = os.path.join(os.path.dirname(__file__), "..", "native", "sounds", "chime.wav")
with wave.open(out, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
    w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, x * gain)) * 32767)) for x in buf))
print(out, os.path.getsize(out), "bytes")
