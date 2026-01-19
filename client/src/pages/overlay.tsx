import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { connectSocket } from "@/lib/socket";
import type { Session, QuestionWithTally, VoteTally } from "@shared/schema";

export default function Overlay() {
  const params = useParams<{ code: string }>();
  const code = params.code?.toUpperCase() || "";

  const [currentQuestion, setCurrentQuestion] = useState<QuestionWithTally | null>(null);

  const { data: session } = useQuery<Session>({
    queryKey: ["/api/sessions/code", code],
    enabled: !!code,
  });

  useEffect(() => {
    if (!session) return;

    const socket = connectSocket();

    socket.on("connect", () => {
      socket.emit("overlay:join", { code });
    });

    socket.on("session:current_question", (question: QuestionWithTally | null) => {
      setCurrentQuestion(question);
    });

    socket.on("session:question_state", (data: { questionId: string; state: string; isRevealed: boolean; isFrozen: boolean }) => {
      setCurrentQuestion((prev) => {
        if (prev && prev.id === data.questionId) {
          return { ...prev, state: data.state as any, isRevealed: data.isRevealed, isFrozen: data.isFrozen };
        }
        return prev;
      });
    });

    socket.on("session:results", (data: { questionId: string; tally: VoteTally }) => {
      setCurrentQuestion((prev) => {
        if (prev && prev.id === data.questionId) {
          return { ...prev, tally: data.tally };
        }
        return prev;
      });
    });

    return () => {
      socket.off("connect");
      socket.off("session:current_question");
      socket.off("session:question_state");
      socket.off("session:results");
      socket.disconnect();
    };
  }, [session, code]);

  // Show overlay for LIVE questions, CLOSED questions that are revealed, or DRAFT questions that are revealed (survey mode)
  const shouldShow = currentQuestion && (
    currentQuestion.state === "LIVE" || 
    (currentQuestion.state === "CLOSED" && currentQuestion.isRevealed) ||
    (currentQuestion.state === "DRAFT" && currentQuestion.isRevealed)
  );

  if (!shouldShow) {
    return (
      <div className="h-screen bg-black flex items-center justify-center overflow-hidden">
      </div>
    );
  }

  const tally = currentQuestion.tally;
  const totalVotes = tally?.total || 0;

  const getOptionData = () => {
    if (!tally) return [];

    if (currentQuestion.type === "multiple_choice" && currentQuestion.optionsJson) {
      const options = currentQuestion.optionsJson as string[];
      return options.map((label, index) => {
        const votes = tally.byOption?.[index.toString()] || 0;
        const percentage = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
        return { label, votes, percentage };
      });
    }

    if (currentQuestion.type === "emoji") {
      const emojis = ["👍", "❤️", "😂", "😮", "😢", "👎"];
      return emojis.map((emoji) => {
        const votes = tally.byOption?.[emoji] || 0;
        const percentage = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
        return { label: emoji, votes, percentage };
      });
    }

    return [];
  };

  const optionData = getOptionData();
  const optionCount = optionData.length;

  return (
    <div className="h-screen bg-black text-white p-[4%] flex flex-col overflow-hidden">
      <div className="shrink-0 mb-4">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight line-clamp-2">
          {currentQuestion.prompt}
        </h1>
      </div>

      {currentQuestion.isRevealed && (currentQuestion.type === "multiple_choice" || currentQuestion.type === "emoji") && (
        <div className="flex-1 flex flex-col justify-center gap-2 min-h-0">
          {optionData.map((item, index) => (
            <div key={index} className="shrink-0">
              <div className="flex items-center justify-between mb-1">
                <span className={currentQuestion.type === "emoji" ? "text-3xl md:text-4xl" : "text-xl md:text-2xl font-semibold truncate max-w-[70%]"}>
                  {item.label}
                </span>
                <span className="text-2xl md:text-3xl font-bold font-mono">
                  {Math.round(item.percentage)}%
                </span>
              </div>
              <div 
                className="rounded-lg bg-white/10 overflow-hidden relative"
                style={{ height: `clamp(2rem, ${Math.max(12 / optionCount, 3)}vh, 4rem)` }}
              >
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                  style={{ width: `${item.percentage}%` }}
                />
                <div className="absolute inset-0 flex items-center justify-end pr-4">
                  <span className="text-lg md:text-xl font-mono font-bold">
                    {item.votes.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {currentQuestion.isRevealed && currentQuestion.type === "slider" && tally && (
        <div className="flex-1 flex items-center justify-center min-h-0">
          <div className="text-center">
            <div className="text-7xl md:text-8xl lg:text-9xl font-bold font-mono mb-2">
              {Math.round((tally as any).average || 0)}
            </div>
            <p className="text-xl md:text-2xl text-white/60">Average Score</p>
          </div>
        </div>
      )}

      {!currentQuestion.isRevealed && (
        <div className="flex-1 flex items-center justify-center min-h-0">
          <div className="text-center">
            <div className="text-5xl md:text-6xl font-bold font-mono mb-2 animate-pulse">
              {totalVotes.toLocaleString()}
            </div>
            <p className="text-xl md:text-2xl text-white/60">Votes Received</p>
          </div>
        </div>
      )}

      <div className="shrink-0 pt-4 flex items-center justify-between">
        <div className="text-white/40 text-sm">
          #{code}
        </div>
        <div className="text-white/60 font-mono text-lg">
          {totalVotes.toLocaleString()} votes
        </div>
      </div>
    </div>
  );
}
