import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Check, Clock } from "lucide-react";
import type { QuestionWithTally, Segment, EmojiType } from "@shared/schema";
import { EMOJIS } from "@shared/schema";
import { useCountdown } from "@/hooks/use-countdown";

interface VotingInterfaceProps {
  question: QuestionWithTally;
  hasVoted: boolean;
  onVote: (payload: any) => void;
  segment: Segment;
}

export function VotingInterface({ question, hasVoted, onVote, segment }: VotingInterfaceProps) {
  const [sliderValue, setSliderValue] = useState(50);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [selectedEmoji, setSelectedEmoji] = useState<EmojiType | null>(null);
  
  const remaining = useCountdown(
    question.durationSeconds,
    question.openedAt,
    question.state === "LIVE"
  );
  
  const isUrgent = remaining !== null && remaining <= 10;
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  const handleMultipleChoiceVote = (optionId: number) => {
    if (hasVoted || question.isFrozen) return;
    setSelectedOption(optionId);
    onVote({ optionId });
  };

  const handleSliderVote = () => {
    if (hasVoted || question.isFrozen) return;
    onVote({ value: sliderValue });
  };

  const handleEmojiVote = (emoji: EmojiType) => {
    if (selectedEmoji || question.isFrozen) return;
    setSelectedEmoji(emoji);
    onVote({ emoji });
  };

  const options = question.optionsJson || [];
  const tally = question.tally;
  const totalVotes = tally?.total || 0;

  if (hasVoted && !question.isRevealed && question.type !== "emoji") {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="w-16 h-16 rounded-full bg-chart-2/20 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-chart-2" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Vote Submitted!</h2>
            <p className="text-muted-foreground">
              Your response has been recorded. Results will be revealed soon.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-4">
      <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col">
        <div className="text-center mb-8 mt-4">
          {remaining !== null && (
            <div className="flex justify-center mb-4">
              <Badge 
                variant={isUrgent ? "destructive" : "secondary"}
                className={`text-lg px-4 py-1 ${isUrgent ? "animate-pulse" : ""}`}
              >
                <Clock className="w-4 h-4 mr-2" />
                {formatTime(remaining)}
              </Badge>
            </div>
          )}
          <h2 className="text-3xl md:text-4xl font-bold">
            {question.prompt}
          </h2>
        </div>

        {question.type === "multiple_choice" && (
          <div className="space-y-4 flex-1">
            {options.map((option, index) => {
              const optionVotes = tally?.byOption?.[index.toString()] || 0;
              const percentage = totalVotes > 0 ? (optionVotes / totalVotes) * 100 : 0;
              const isSelected = selectedOption === index;

              if (question.isRevealed && hasVoted) {
                return (
                  <div key={index} className="relative">
                    <div className={`
                      h-20 md:h-24 rounded-lg border overflow-hidden
                      ${isSelected ? "border-primary border-2" : "border-border"}
                    `}>
                      <div 
                        className="absolute inset-0 bg-primary/20 transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                      <div className="relative h-full flex items-center justify-between px-6">
                        <span className="text-xl font-medium">{option}</span>
                        <div className="text-right">
                          <span className="text-2xl font-bold font-mono">{Math.round(percentage)}%</span>
                          <span className="text-muted-foreground text-sm ml-2">({optionVotes})</span>
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <div className="absolute -right-2 -top-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-4 h-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Button
                  key={index}
                  variant={isSelected ? "default" : "outline"}
                  className="h-20 md:h-24 w-full text-xl justify-start px-6"
                  onClick={() => handleMultipleChoiceVote(index)}
                  disabled={hasVoted || question.isFrozen}
                  data-testid={`button-option-${index}`}
                >
                  {option}
                  {isSelected && <Check className="w-5 h-5 ml-auto" />}
                </Button>
              );
            })}
          </div>
        )}

        {question.type === "slider" && (
          <div className="flex-1 flex flex-col justify-center">
            <div className="text-center mb-8">
              <span className="text-6xl font-bold font-mono">{sliderValue}</span>
            </div>
            <Slider
              value={[sliderValue]}
              onValueChange={([value]) => setSliderValue(value)}
              min={0}
              max={100}
              step={1}
              disabled={hasVoted || question.isFrozen}
              className="mb-8"
              data-testid="slider-vote"
            />
            <div className="flex justify-between text-muted-foreground mb-8">
              <span>0</span>
              <span>100</span>
            </div>
            {!hasVoted && (
              <Button
                className="h-16 text-xl"
                onClick={handleSliderVote}
                disabled={question.isFrozen}
                data-testid="button-submit-slider"
              >
                Submit Vote
              </Button>
            )}
            {hasVoted && question.isRevealed && tally && (
              <div className="space-y-4 mt-8">
                <div className="text-center">
                  <span className="text-muted-foreground">Average: </span>
                  <span className="text-2xl font-bold font-mono">
                    {Math.round((tally as any).average || 0)}
                  </span>
                </div>
                <div className="text-center text-muted-foreground">
                  {totalVotes} votes
                </div>
              </div>
            )}
          </div>
        )}

        {question.type === "emoji" && (
          <div className="flex-1 flex flex-col justify-center">
            {selectedEmoji ? (
              <Card className="max-w-md mx-auto w-full">
                <CardContent className="pt-8 pb-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-chart-2/20 flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-chart-2" />
                  </div>
                  <h2 className="text-xl font-semibold mb-2">Vote Submitted!</h2>
                  <p className="text-muted-foreground mb-4">
                    You selected: <span className="text-4xl">{selectedEmoji}</span>
                  </p>
                  {question.isRevealed && (
                    <div className="text-muted-foreground">
                      {totalVotes} total reactions
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex flex-wrap justify-center gap-4">
                  {EMOJIS.map((emoji) => {
                    const emojiCount = tally?.byOption?.[emoji] || 0;
                    return (
                      <button
                        key={emoji}
                        onClick={() => handleEmojiVote(emoji)}
                        disabled={question.isFrozen}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-transparent hover:border-primary hover:bg-primary/10 active:bg-primary/20 transition-all"
                        data-testid={`button-emoji-${emoji}`}
                      >
                        <span className="text-5xl md:text-6xl">{emoji}</span>
                        {question.isRevealed && (
                          <span className="text-lg font-mono font-bold">{emojiCount}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {question.isRevealed && (
                  <div className="text-center mt-8 text-muted-foreground">
                    {totalVotes} total reactions
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {totalVotes > 0 && question.isRevealed && (
          <div className="mt-auto pt-4 text-center text-muted-foreground text-sm">
            {totalVotes} total votes
          </div>
        )}
      </div>
    </div>
  );
}
