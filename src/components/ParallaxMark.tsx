import { useEffect, useRef } from "react";

// The Parallax mark: a triangle split into shards fanning out from one point.
// `depth` is how far each shard drifts when the mark is interactive, and
// `from` is where it flies in from when the mark assembles on load.
const SHARDS: { points: string; depth: number; from: [number, number] }[] = [
  { points: "926,525 948,525 948,1165 842,653", depth: 14, from: [-30, -120] },
  { points: "991,590 1019,590 1129,757 991,1270", depth: 14, from: [30, -120] },
  { points: "834,729 950,1296 655,998", depth: 9, from: [-110, -60] },
  { points: "1149,728 1303,962 1005,1260", depth: 9, from: [110, -60] },
  { points: "657,1053 918,1314 822,1314 535,1237", depth: 5, from: [-140, 20] },
  { points: "1273,1062 1408,1266 1180,1314 1021,1314", depth: 5, from: [140, 20] },
  { points: "496,1240 778,1314 446,1314", depth: 2, from: [-170, 60] },
  { points: "1464,1267 1495,1314 1235,1314", depth: 2, from: [170, 60] },
];

type Props = {
  className?: string;
  /** Shards drift with the pointer and fly together on first paint. */
  interactive?: boolean;
};

export function ParallaxMark({ className, interactive = false }: Props) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!interactive || !svg) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        svg.style.setProperty("--px", ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3));
        svg.style.setProperty("--py", ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, [interactive]);

  return (
    <svg
      ref={ref}
      viewBox="430 505 1082 830"
      fill="currentColor"
      role="img"
      aria-label="Parallax"
      className={`${interactive ? "mark-assemble overflow-visible" : ""} ${className ?? ""}`}
    >
      {SHARDS.map((s, i) => (
        <polygon
          key={s.points}
          points={s.points}
          className={interactive ? "mark-shard" : undefined}
          style={
            interactive
              ? ({ "--depth": s.depth, "--i": i, "--from-x": s.from[0], "--from-y": s.from[1] } as React.CSSProperties)
              : undefined
          }
        />
      ))}
    </svg>
  );
}
