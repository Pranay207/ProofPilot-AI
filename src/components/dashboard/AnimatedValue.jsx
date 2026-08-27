import React, { useEffect, useMemo, useState } from "react";

function formatNumber(value, template) {
  const rounded = Math.round(value);
  return template.includes(",") ? rounded.toLocaleString("en-IN") : String(rounded);
}

export default function AnimatedValue({ value, className, duration = 900 }) {
  const text = String(value ?? "");
  const targets = useMemo(() => {
    const matches = [...text.matchAll(/\d[\d,]*/g)];
    return matches.map((match) => ({
      raw: match[0],
      value: Number(match[0].replace(/,/g, "")),
    }));
  }, [text]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!targets.length) {
      setProgress(1);
      return undefined;
    }

    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReducedMotion) {
      setProgress(1);
      return undefined;
    }

    let frame = 0;
    const start = performance.now();
    setProgress(0);

    const tick = (now) => {
      const elapsed = now - start;
      const next = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - next, 3);
      setProgress(eased);
      if (next < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, text, targets.length]);

  let index = 0;
  const display = text.replace(/\d[\d,]*/g, (match) => {
    const target = targets[index++];
    return formatNumber(target.value * progress, match);
  });

  return <span className={className}>{display}</span>;
}
