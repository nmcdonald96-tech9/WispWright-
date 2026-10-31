/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaterialType } from '../types';

class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  public isMuted = false;
  public sfxVolume = 0.85;
  public voiceVolume = 0.85;
  public reducedIntensity = false;

  // Telemetry & rate-limiting
  public activeSoundCount = 0;
  public lastSoundTrigger = 'NONE';
  private lastImpactSoundTimeMs = 0;
  private readonly IMPACT_RATE_LIMIT_MS = 75;

  private getContext(): AudioContext | null {
    if (this.isMuted) return null;
    if (typeof window === 'undefined') return null;
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  private trackSound(name: string, durationSec: number): void {
    this.lastSoundTrigger = name;
    this.activeSoundCount++;
    if (typeof setTimeout !== 'undefined') {
      setTimeout(() => {
        this.activeSoundCount = Math.max(0, this.activeSoundCount - 1);
      }, Math.max(50, Math.round(durationSec * 1000)));
    } else {
      this.activeSoundCount = Math.max(0, this.activeSoundCount - 1);
    }
  }

  private getGainMultiplier(isVoice = false): number {
    if (this.isMuted) return 0;
    const base = isVoice ? this.voiceVolume : this.sfxVolume;
    const intensityScale = this.reducedIntensity ? 0.5 : 1.0;
    return Math.max(0, Math.min(1, base * intensityScale));
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setVolumes(sfx: number, voice: number, reducedIntensity?: boolean): void {
    this.sfxVolume = Math.max(0, Math.min(1, sfx));
    this.voiceVolume = Math.max(0, Math.min(1, voice));
    if (reducedIntensity !== undefined) {
      this.reducedIntensity = reducedIntensity;
    }
  }

  public setReducedIntensity(reduced: boolean): void {
    this.reducedIntensity = reduced;
  }

  public getSfxVolume(): number {
    return this.sfxVolume;
  }

  public getVoiceVolume(): number {
    return this.voiceVolume;
  }

  // --- Construction Cues ---

  public playSnap(): void {
    this.trackSound('SNAP', 0.1);
    const ctx = this.getContext();
    const mult = this.getGainMultiplier(false);
    if (!ctx || mult <= 0.001) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);

    gain.gain.setValueAtTime(0.15 * mult, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playPlace(type: MaterialType): void {
    this.trackSound(`PLACE_${type.toUpperCase()}`, 0.2);
    const ctx = this.getContext();
    const mult = this.getGainMultiplier(false);
    if (!ctx || mult <= 0.001) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (type === 'stone_block') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.15);
      gain.gain.setValueAtTime(0.3 * mult, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.12);
      gain.gain.setValueAtTime(0.25 * mult, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.14);
    }
  }

  public playRotate(): void {
    this.trackSound('ROTATE', 0.08);
    const ctx = this.getContext();
    const mult = this.getGainMultiplier(false);
    if (!ctx || mult <= 0.001) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.setValueAtTime(880, now + 0.04);

    gain.gain.setValueAtTime(0.12 * mult, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playRemove(): void {
    this.trackSound('REMOVE', 0.12);
    const ctx = this.getContext();
    const mult = this.getGainMultiplier(false);
    if (!ctx || mult <= 0.001) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.12);

    gain.gain.setValueAtTime(0.18 * mult, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playTestStart(): void {
    this.trackSound('TEST_START', 0.45);
    const ctx = this.getContext();
    const mult = this.getGainMultiplier(false);
    if (!ctx || mult <= 0.001) return;

    const notes = [261.63, 329.63, 392.0];
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);
      gain.gain.setValueAtTime(0.15 * mult, now + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35 + idx * 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.04);
      osc.stop(now + 0.4 + idx * 0.04);
    });
  }

  public playSettledFanfare(): void {
    this.trackSound('SETTLED_FANFARE', 0.7);
    const ctx = this.getContext();
    const mult = this.getGainMultiplier(false);
    if (!ctx || mult <= 0.001) return;

    const notes = [392.0, 523.25, 659.25, 783.99];
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      gain.gain.setValueAtTime(0.2 * mult, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6 + idx * 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + 0.65 + idx * 0.08);
    });
  }

  // --- Phase 4 Original Siege & Character Sound Cues (15 Required Cues) ---

  /** 1. Launcher Tension (ratchet & pneumatic groan) */
  public playLauncherTension(isHeavy = false): void {
    this.trackSound(isHeavy ? 'LAUNCHER_STRAIN_HEAVY' : 'LAUNCHER_TENSION', 0.3);
    const ctx = this.getContext();
    const mult = this.getGainMultiplier(false);
    if (!ctx || mult <= 0.001) return;

    const now = ctx.currentTime;
    const steps = isHeavy ? 5 : 3;
    for (let i = 0; i < steps; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isHeavy ? 'sawtooth' : 'triangle';
      const baseFreq = isHeavy ? 95 + i * 12 : 210 + i * 35;
      osc.frequency.setValueAtTime(baseFreq, now + i * 0.05);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.8, now + i * 0.05 + 0.04);
      gain.gain.setValueAtTime(0.14 * mult, now + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.045);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 0.05);
    }
  }

  /** 2. Standard Launch */
  public playStandardLaunch(): void {
    this.trackSound('STANDARD_LAUNCH', 0.28);
    const ctx = this.getContext();
    const mult = this.getGainMultiplier(false);
    if (!ctx || mult <= 0.001) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(740, now + 0.22);
    gain.gain.setValueAtTime(0.22 * mult, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  /** 3. Heavy Launch */
  public playHeavyLaunch(): void {
    this.trackSound('HEAVY_LAUNCH', 0.42);
    const ctx = this.getContext();
    const mult = this.getGainMultiplier(false);
    if (!ctx || mult <= 0.001) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(85, now);
    osc.frequency.exponentialRampToValueAtTime(290, now + 0.32);
    gain.gain.setValueAtTime(0.32 * mult, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.38);
  }

  public playLaunchWhoosh(isHeavy = false): void {
    if (isHeavy) {
      this.playHeavyLaunch();
    } else {
      this.playStandardLaunch();
    }
  }

  /** 4. Projectile Wind */
  public playProjectileWind(isHeavy = false): void {
    this.trackSound('PROJECTILE_WIND', 0.22);
    const ctx = this.getContext();
    const mult = this.getGainMultiplier(false);
    if (!ctx || mult <= 0.001) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isHeavy ? 140 : 310, now);
    osc.frequency.exponentialRampToValueAtTime(isHeavy ? 95 : 220, now + 0.2);
    gain.gain.setValueAtTime(0.08 * mult, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.21);
  }

  /** 5. Wood Impact (rate-limited) */
  public playWoodImpact(severity = 0.5): void {
    const nowMs = Date.now();
    if (nowMs - this.lastImpactSoundTimeMs < this.IMPACT_RATE_LIMIT_MS) return;
    this.lastImpactSoundTimeMs = nowMs;

    this.trackSound('WOOD_IMPACT', 0.18);
    const ctx = this.getContext();
    const mult = this.getGainMultiplier(false);
    if (!ctx || mult <= 0.001) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260 + severity * 80, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.16);
    gain.gain.setValueAtTime(Math.min(0.4, (0.18 + severity * 0.18) * mult), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  /** 6. Stone Impact (rate-limited) */
  public playStoneImpact(severity = 0.7): void {
    const nowMs = Date.now();
    if (nowMs - this.lastImpactSoundTimeMs < this.IMPACT_RATE_LIMIT_MS) return;
    this.lastImpactSoundTimeMs = nowMs;

    this.trackSound('STONE_IMPACT', 0.3);
    const ctx = this.getContext();
    const mult = this.getGainMultiplier(false);
    if (!ctx || mult <= 0.001) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.28);
    gain.gain.setValueAtTime(Math.min(0.48, (0.24 + severity * 0.22) * mult), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  public playImpactThud(isHeavy = false): void {
    if (isHeavy) {
      this.playStoneImpact(0.85);
    } else {
      this.playWoodImpact(0.6);
    }
  }

  /** 7. Structural Crack */
  public playCrack(): void {
    this.trackSound('STRUCTURAL_CRACK', 0.12);
    const ctx = this.getContext();
    const mult = this.getGainMultiplier(false);
    if (!ctx || mult <= 0.001) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.setValueAtTime(1200, now + 0.03);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.09);

    gain.gain.setValueAtTime(0.18 * mult, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /** 8. Major Break */
  public playMajorBreak(): void {
    this.trackSound('MAJOR_BREAK', 0.28);
    const ctx = this.getContext();
    const mult = this.getGainMultiplier(false);
    if (!ctx || mult <= 0.001) return;

    const now = ctx.currentTime;
    [480, 220, 95].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + idx * 0.03);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.22 + idx * 0.02);
      gain.gain.setValueAtTime(0.2 * mult, now + idx * 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25 + idx * 0.02);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.03);
      osc.stop(now + 0.26 + idx * 0.02);
    });
  }

  /** 9. Wisp Warning (expressive high elemental squeak) */
  public playWispWarning(): void {
    this.trackSound('WISP_WARNING', 0.18);
    const ctx = this.getContext();
    const mult = this.getGainMultiplier(true);
    if (!ctx || mult <= 0.001) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(780, now);
    osc.frequency.exponentialRampToValueAtTime(1120, now + 0.07);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.16);
    gain.gain.setValueAtTime(0.14 * mult, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  /** 10. Wisp Relief / Happy */
  public playWispRelief(): void {
    this.trackSound('WISP_RELIEF', 0.22);
    const ctx = this.getContext();
    const mult = this.getGainMultiplier(true);
    if (!ctx || mult <= 0.001) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(580, now);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.18);
    gain.gain.setValueAtTime(0.13 * mult, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playWispHappy(): void {
    this.playWispRelief();
  }

  /** 11. Wisp Dispersal */
  public playWispDispersal(): void {
    this.trackSound('WISP_DISPERSAL', 0.4);
    const ctx = this.getContext();
    const mult = this.getGainMultiplier(true);
    if (!ctx || mult <= 0.001) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.35);

    gain.gain.setValueAtTime(0.24 * mult, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  /** 12. Standard-Attacker Boast (fictional energetic gibberish chatter) */
  public playStandardAttackerBoast(): void {
    this.trackSound('STANDARD_BOAST_VOICE', 0.36);
    const ctx = this.getContext();
    const mult = this.getGainMultiplier(true);
    if (!ctx || mult <= 0.001) return;

    const now = ctx.currentTime;
    const syllables = [420, 560, 490, 680];
    syllables.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.075;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.18, t + 0.055);
      gain.gain.setValueAtTime(0.16 * mult, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.07);
    });
  }

  /** 13. Heavy-Attacker Effort (deep resonant slag-brute rumble/chuckle) */
  public playHeavyAttackerEffort(): void {
    this.trackSound('HEAVY_EFFORT_VOICE', 0.45);
    const ctx = this.getContext();
    const mult = this.getGainMultiplier(true);
    if (!ctx || mult <= 0.001) return;

    const now = ctx.currentTime;
    const syllables = [115, 98, 128];
    syllables.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      const t = now + idx * 0.12;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.82, t + 0.1);
      gain.gain.setValueAtTime(0.2 * mult, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.115);
    });
  }

  /** 14. Embarrassed Miss */
  public playEmbarrassedMiss(): void {
    this.trackSound('EMBARRASSED_MISS', 0.35);
    const ctx = this.getContext();
    const mult = this.getGainMultiplier(true);
    if (!ctx || mult <= 0.001) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(175, now + 0.32);
    gain.gain.setValueAtTime(0.18 * mult, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  /** 15. Results Celebration */
  public playResultsCelebration(survived = true): void {
    this.trackSound(survived ? 'RESULTS_CELEBRATION' : 'RESULTS_SOMBER', 0.85);
    const ctx = this.getContext();
    const mult = this.getGainMultiplier(false);
    if (!ctx || mult <= 0.001) return;

    const notes = survived ? [440, 554.37, 659.25, 880] : [330, 293.66, 261.63, 220];
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      gain.gain.setValueAtTime(0.2 * mult, now + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75 + idx * 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.1);
      osc.stop(now + 0.8 + idx * 0.1);
    });
  }

  public playVictory(): void {
    this.playResultsCelebration(true);
  }
}

export const soundSynth = new SoundSynthesizer();
