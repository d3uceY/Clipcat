import { Howl } from "howler";

let currentSound: Howl | null = null;

// Preloaded sound cache — sounds are loaded lazily on first play.
const soundCache = new Map<string, Howl>();

// Preload a single sound into memory. Called from the App mount effect
// so most sounds are ready before the user interacts, but each is only
// loaded once and only when actually needed.
export function preloadSounds() {
  // We no longer eagerly decode all sounds at startup.
  // Instead, playSound loads on first use.
}

export function playSound(soundSrc: string, soundOn = true, volume = 0.1) {
  if (!soundOn) return;

  // Stop previous sound
  if (currentSound) {
    currentSound.stop();
  }

  // Use cached sound or create new one
  let sound = soundCache.get(soundSrc);

  if (!sound) {
    sound = new Howl({
      src: [soundSrc],
      volume: volume,
    });
    soundCache.set(soundSrc, sound);
  } else {
    sound.volume(volume);
  }

  currentSound = sound;
  sound.play();
}
