import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Smile } from "lucide-react";

interface Message {
  id: string;
  message: string;
  created_at: string;
  participants: {
    name: string;
  };
}

interface ChatPanelProps {
  roomId: string;
  participantId: string;
  participantName: string;
}

export const ChatPanel = ({ roomId, participantId, participantName }: ChatPanelProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMessages();
    
    const channel = supabase
      .channel(`chat_${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          loadMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadMessages = async () => {
    const { data } = await supabase
      .from("messages")
      .select(`
        *,
        participants (name)
      `)
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });

    if (data) {
      setMessages(data as Message[]);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    await supabase.from("messages").insert({
      room_id: roomId,
      participant_id: participantId,
      message: newMessage,
    });

    setNewMessage("");
  };

  const addReaction = (emoji: string) => {
    setNewMessage((prev) => prev + emoji);
  };

  return (
    <div className="bg-card rounded-lg border border-border h-[500px] flex flex-col">
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold">Chat</h3>
      </div>
      
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className="animate-fade-in">
              <div className="text-xs text-muted-foreground mb-1">
                {msg.participants.name}
              </div>
              <div className="bg-secondary rounded-lg p-2 text-sm">
                {msg.message}
              </div>
            </div>
          ))}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-border">
        <div className="flex gap-2 mb-2">
          {["👍", "❤️", "😂", "🎬", "🍿"].map((emoji) => (
            <Button
              key={emoji}
              variant="ghost"
              size="sm"
              onClick={() => addReaction(emoji)}
            >
              {emoji}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            onKeyPress={(e) => e.key === "Enter" && sendMessage()}
          />
          <Button onClick={sendMessage} size="icon">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
