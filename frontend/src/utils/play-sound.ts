// One short UI sound at a time. A plain HTMLAudioElement covers every sound in
// the app (no sprites, no looping, no Web Audio graph), so there is no need for
// a sound library here.
let currentSound: HTMLAudioElement | null = null

// Element cache - each source is constructed once and replayed after that.
const soundCache = new Map<string, HTMLAudioElement>()

export function playSound(soundSrc: string, soundOn = true, volume = 0.1) {
  if (!soundOn) return

  // Stop the previous sound so blips never overlap.
  if (currentSound) {
    currentSound.pause()
    currentSound.currentTime = 0
  }

  let sound = soundCache.get(soundSrc)
  if (!sound) {
    sound = new Audio(soundSrc)
    sound.preload = "auto"
    soundCache.set(soundSrc, sound)
  }

  sound.volume = volume
  currentSound = sound
  // Autoplay can be refused; a missing blip is not worth a console error.
  void sound.play().catch(() => { })
}
