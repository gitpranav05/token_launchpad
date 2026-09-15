import confetti from "canvas-confetti";

export function triggerSuccessConfetti() {
  // Fire 3 staggered waves of festive Solana-themed confetti
  const colors = ["#9945FF", "#14F195", "#00C2FF", "#FFD700", "#EC4899"];

  // Wave 1: Center blast
  confetti({
    particleCount: 80,
    spread: 70,
    origin: { y: 0.6 },
    colors,
    disableForReducedMotion: true,
  });

  // Wave 2: Left cannon
  setTimeout(() => {
    confetti({
      particleCount: 50,
      angle: 60,
      spread: 55,
      origin: { x: 0.1, y: 0.7 },
      colors,
      disableForReducedMotion: true,
    });
  }, 250);

  // Wave 3: Right cannon
  setTimeout(() => {
    confetti({
      particleCount: 50,
      angle: 120,
      spread: 55,
      origin: { x: 0.9, y: 0.7 },
      colors,
      disableForReducedMotion: true,
    });
  }, 450);
}

export function triggerMintConfetti() {
  // Continuous rain of celebratory stars and sparkles
  const end = Date.now() + 1200;
  const colors = ["#14F195", "#00C2FF", "#7C3AED", "#FACC15"];

  (function frame() {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 60,
      origin: { x: 0, y: 0.7 },
      colors,
    });
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 60,
      origin: { x: 1, y: 0.7 },
      colors,
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();
}
