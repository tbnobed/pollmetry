import { useState, useEffect } from "react";

export function useCountdown(
  durationSeconds: number | null | undefined,
  openedAt: Date | string | null | undefined,
  isActive: boolean
): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!durationSeconds || !openedAt || !isActive) {
      setRemaining(null);
      return;
    }

    const openedTime = typeof openedAt === "string" ? new Date(openedAt).getTime() : openedAt.getTime();
    
    const calculateRemaining = () => {
      const elapsed = Math.floor((Date.now() - openedTime) / 1000);
      const left = Math.max(0, durationSeconds - elapsed);
      return left;
    };

    setRemaining(calculateRemaining());

    const interval = setInterval(() => {
      const left = calculateRemaining();
      setRemaining(left);
      
      if (left <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [durationSeconds, openedAt, isActive]);

  return remaining;
}
