import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import { useCountdown } from "@/hooks/use-countdown";

interface CountdownTimerProps {
  durationSeconds: number | null | undefined;
  openedAt: Date | string | null | undefined;
  isLive: boolean;
  onExpire?: () => void;
}

export function CountdownTimer({ durationSeconds, openedAt, isLive, onExpire }: CountdownTimerProps) {
  const remaining = useCountdown(durationSeconds, openedAt, isLive);
  const hasExpiredRef = useRef(false);

  useEffect(() => {
    if (remaining !== null && remaining <= 0 && onExpire && !hasExpiredRef.current) {
      hasExpiredRef.current = true;
      onExpire();
    }
    if (remaining !== null && remaining > 0) {
      hasExpiredRef.current = false;
    }
  }, [remaining, onExpire]);

  if (remaining === null || remaining === undefined) {
    if (durationSeconds) {
      return (
        <Badge variant="outline">
          <Clock className="w-3 h-3 mr-1" />
          {durationSeconds}s
        </Badge>
      );
    }
    return null;
  }

  const isUrgent = remaining <= 10;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const display = minutes > 0 
    ? `${minutes}:${seconds.toString().padStart(2, '0')}`
    : `${seconds}s`;

  return (
    <Badge 
      variant={isUrgent ? "destructive" : "default"}
      className={isUrgent ? "animate-pulse" : ""}
    >
      <Clock className="w-3 h-3 mr-1" />
      {display}
    </Badge>
  );
}
