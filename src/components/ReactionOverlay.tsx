import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Reaction {
  id: string;
  emoji: string;
  x_position: number;
  y_position: number;
  created_at: string;
}

interface ReactionOverlayProps {
  roomId: string;
  participantId: string;
  onReactionClick: (emoji: string, x: number, y: number) => void;
}

export const ReactionOverlay = ({ roomId, participantId, onReactionClick }: ReactionOverlayProps) => {
  const [reactions, setReactions] = useState<Reaction[]>([]);

  useEffect(() => {
    const channel = supabase
      .channel(`reactions_${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "reactions",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const newReaction = payload.new as Reaction;
          setReactions((prev) => [...prev, newReaction]);
          
          // Remove reaction after animation completes
          setTimeout(() => {
            setReactions((prev) => prev.filter((r) => r.id !== newReaction.id));
          }, 3000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    const emojis = ["❤️", "😂", "🎬", "👍", "🍿", "😮", "🔥"];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    
    onReactionClick(randomEmoji, x, y);
  };

  return (
    <div 
      className="absolute inset-0 pointer-events-auto cursor-pointer"
      onClick={handleClick}
    >
      {reactions.map((reaction) => (
        <div
          key={reaction.id}
          className="absolute text-4xl animate-float-up pointer-events-none"
          style={{
            left: `${reaction.x_position}%`,
            top: `${reaction.y_position}%`,
          }}
        >
          {reaction.emoji}
        </div>
      ))}
    </div>
  );
};
