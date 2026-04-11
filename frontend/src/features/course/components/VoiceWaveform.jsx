/**
 * VoiceWaveform — Animated 12-bar waveform visualization.
 */
export function VoiceWaveform() {
  return (
    <div className="flex items-center gap-[2px] h-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="w-[3px] bg-current rounded-full animate-pulse"
          style={{
            height: `${4 + Math.random() * 12}px`,
            animationDelay: `${i * 50}ms`,
            animationDuration: `${400 + Math.random() * 400}ms`,
          }}
        />
      ))}
    </div>
  );
}
