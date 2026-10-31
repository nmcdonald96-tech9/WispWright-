/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  X,
  Volume2,
  VolumeX,
  Video,
  Eye,
  Subtitles,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import {
  FlightCameraPreference,
  PresentationSettings,
} from '../game/presentation/presentationTypes';

interface PresentationSettingsModalProps {
  isOpen: boolean;
  settings: PresentationSettings;
  onClose: () => void;
  onUpdateSettings: (partial: Partial<PresentationSettings>) => void;
  onResetSettings: () => void;
}

export const PresentationSettingsModal: React.FC<PresentationSettingsModalProps> = ({
  isOpen,
  settings,
  onClose,
  onUpdateSettings,
  onResetSettings,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700/80 rounded-2xl p-4 shadow-2xl text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-extrabold tracking-tight text-white">
              Presentation &amp; Camera Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
            aria-label="Close presentation settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          {/* 0. Player vs Developer Presentation Mode */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Presentation Mode</span>
              </span>
              <span className="text-[10px] text-slate-400">Default: Player Presentation</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'PLAYER', label: 'Player Presentation' },
                  { id: 'DEVELOPER', label: 'Developer Presentation' },
                ] as const
              ).map((opt) => {
                const active = settings.presentationMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => onUpdateSettings({ presentationMode: opt.id })}
                    className={`py-1.5 px-2 rounded-lg font-bold text-[11px] border transition-all cursor-pointer ${
                      active
                        ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 shadow'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-400">
              Player Presentation hides raw target IDs, corridor debug boundaries, and piece text tags (`CRK`/`DEBRIS`). Switching modes never alters gameplay.
            </p>
          </div>

          {/* 1. Flight Camera Mode Preference */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-300 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                <span>Projectile Flight Camera</span>
              </span>
              <span className="text-[10px] text-slate-400">Default: Follow</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'TACTICAL_WIDE', label: 'Tactical' },
                  { id: 'SIDE_FOLLOW', label: 'Follow' },
                  { id: 'EXPERIMENTAL_POV', label: 'POV Experimental' },
                ] as { id: FlightCameraPreference; label: string }[]
              ).map((opt) => {
                const active = settings.preferredFlightCamera === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() =>
                      onUpdateSettings({
                        preferredFlightCamera: opt.id,
                        enableExperimentalPOV: opt.id === 'EXPERIMENTAL_POV',
                      })
                    }
                    className={`py-1.5 px-2 rounded-lg font-bold text-[11px] border transition-all cursor-pointer ${
                      active
                        ? 'bg-amber-500/25 border-amber-400 text-amber-200 shadow'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-400">
              Follow shows an external close character view; POV Experimental places the camera inside the projectile&apos;s forward viewpoint from launcher seat through slowed flight and cuts to the impact camera before collision.
            </p>

            {/* POV Comfort & Motion Controls */}
            <div className="pt-2 mt-2 border-t border-slate-800/80 space-y-2">
              <div className="text-[10.5px] font-bold text-amber-200">
                POV Experimental Comfort Controls
              </div>

              {/* POV Motion: Full / Reduced */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-300">POV Motion</span>
                <div className="flex gap-1">
                  {(['FULL', 'REDUCED'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => onUpdateSettings({ povMotion: m })}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                        settings.povMotion === m
                          ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {m === 'FULL' ? 'Full' : 'Reduced'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Camera Roll: Full / Reduced / Off */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-300">Camera Roll</span>
                <div className="flex gap-1">
                  {(['FULL', 'REDUCED', 'OFF'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => onUpdateSettings({ povCameraRoll: r })}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                        settings.povCameraRoll === r
                          ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {r === 'FULL' ? 'Full' : r === 'REDUCED' ? 'Reduced' : 'Off'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Launch Jolt: Full / Reduced / Off */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-300">Launch Jolt</span>
                <div className="flex gap-1">
                  {(['FULL', 'REDUCED', 'OFF'] as const).map((j) => (
                    <button
                      key={j}
                      onClick={() => onUpdateSettings({ povLaunchJolt: j })}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                        settings.povLaunchJolt === j
                          ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {j === 'FULL' ? 'Full' : j === 'REDUCED' ? 'Reduced' : 'Off'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Speed Lines & Auto Fallback Toggles */}
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <label className="flex items-center justify-between bg-slate-900/90 px-2 py-1 rounded border border-slate-800 cursor-pointer">
                  <span className="text-[10.5px] text-slate-300">Speed Lines</span>
                  <input
                    type="checkbox"
                    checked={settings.povSpeedLines}
                    onChange={(e) => onUpdateSettings({ povSpeedLines: e.target.checked })}
                    className="w-3.5 h-3.5 accent-amber-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between bg-slate-900/90 px-2 py-1 rounded border border-slate-800 cursor-pointer">
                  <span className="text-[10.5px] text-slate-300">Auto Fallback</span>
                  <input
                    type="checkbox"
                    checked={settings.povAutoFallback}
                    onChange={(e) => onUpdateSettings({ povAutoFallback: e.target.checked })}
                    className="w-3.5 h-3.5 accent-amber-500 cursor-pointer"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* 2. Audio Controls */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                {settings.isMuted ? (
                  <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                )}
                <span>Synthesized Audio &amp; Voices</span>
              </span>
              <button
                onClick={() => onUpdateSettings({ isMuted: !settings.isMuted })}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] border cursor-pointer ${
                  settings.isMuted
                    ? 'bg-rose-950/60 border-rose-500/50 text-rose-300'
                    : 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                }`}
              >
                {settings.isMuted ? 'Muted' : 'Audio Active'}
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300">Sound Effects (SFX) Volume</span>
                <span className="font-mono text-amber-300">
                  {Math.round(settings.sfxVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(settings.sfxVolume * 100)}
                onChange={(e) =>
                  onUpdateSettings({ sfxVolume: Number(e.target.value) / 100 })
                }
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300">Character Vocalizations Volume</span>
                <span className="font-mono text-cyan-300">
                  {Math.round(settings.voiceVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(settings.voiceVolume * 100)}
                onChange={(e) =>
                  onUpdateSettings({ voiceVolume: Number(e.target.value) / 100 })
                }
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>
          </div>

          {/* 3. Cinematics, Motion, Intensity & Subtitles Toggles */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 space-y-2">
            <label className="flex items-center justify-between py-1 cursor-pointer">
              <div>
                <div className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Cinematic Camera Moments</span>
                </div>
                <div className="text-[10px] text-slate-400">
                  Focuses on Enemy Intro and Target Reveal before launch
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.enableCinematics}
                onChange={(e) => onUpdateSettings({ enableCinematics: e.target.checked })}
                className="w-4 h-4 accent-amber-500 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between py-1 border-t border-slate-800/80 cursor-pointer">
              <div>
                <div className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Subtitles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Subtitles &amp; Character Captions</span>
                </div>
                <div className="text-[10px] text-slate-400">
                  Displays non-blocking character quips and sanctuary alerts
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.enableSubtitles}
                onChange={(e) => onUpdateSettings({ enableSubtitles: e.target.checked })}
                className="w-4 h-4 accent-emerald-500 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between py-1 border-t border-slate-800/80 cursor-pointer">
              <div>
                <div className="font-bold text-slate-200">Reduced Motion</div>
                <div className="text-[10px] text-slate-400">
                  Disables screen shake, rapid camera cuts, and ambient motion
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.reducedMotion}
                onChange={(e) => onUpdateSettings({ reducedMotion: e.target.checked })}
                className="w-4 h-4 accent-cyan-500 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between py-1 border-t border-slate-800/80 cursor-pointer">
              <div>
                <div className="font-bold text-slate-200">Reduced Impact Intensity</div>
                <div className="text-[10px] text-slate-400">
                  Softens collision audio spikes and halves cosmetic impact particles
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.reducedIntensity}
                onChange={(e) => onUpdateSettings({ reducedIntensity: e.target.checked })}
                className="w-4 h-4 accent-purple-500 cursor-pointer"
              />
            </label>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={onResetSettings}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
