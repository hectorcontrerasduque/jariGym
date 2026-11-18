import { cn } from "@/lib/utils";

const STAR_POINTS =
  "0,-1 0.2245,-0.309 0.9511,-0.309 0.3633,0.1181 0.5878,0.809 0,0.382 -0.5878,0.809 -0.3633,0.1181 -0.9511,-0.309 -0.2245,-0.309";

const STARS: Array<[number, number]> = [
  [11.05, 10.06],
  [11.78, 8.8],
  [12.9, 7.86],
  [14.27, 7.36],
  [15.73, 7.36],
  [17.1, 7.86],
  [18.22, 8.8],
  [18.95, 10.06],
];

export function FlagVe({ className = "w-5 h-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 30 20"
      role="img"
      aria-label="Bandera de Venezuela"
      className={cn("inline-block shrink-0 align-middle rounded-[2px]", className)}
    >
      <rect width="30" height="20" fill="#FFCC00" />
      <rect y="6.67" width="30" height="6.66" fill="#003893" />
      <rect y="13.33" width="30" height="6.67" fill="#CE1126" />
      {STARS.map(([x, y]) => (
        <polygon
          key={`${x}-${y}`}
          points={STAR_POINTS}
          fill="#fff"
          transform={`translate(${x} ${y}) scale(0.85)`}
        />
      ))}
    </svg>
  );
}
