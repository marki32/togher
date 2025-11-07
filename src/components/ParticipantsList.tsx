import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Crown, User, UserX } from "lucide-react";

interface Participant {
  id: string;
  name: string;
  is_host: boolean;
  online?: boolean;
}

interface ParticipantsListProps {
  participants: Participant[];
  currentParticipantId: string;
  isHost: boolean;
  onKickParticipant?: (participantId: string) => void;
}

export const ParticipantsList = ({ 
  participants, 
  currentParticipantId, 
  isHost, 
  onKickParticipant 
}: ParticipantsListProps) => {
  const onlineCount = participants.filter(p => p.online).length;

  return (
    <Card className="p-4 border-border bg-card">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <User className="w-4 h-4" />
        Participants ({participants.length})
        <span className="ml-auto text-xs text-muted-foreground">
          {onlineCount} online
        </span>
      </h3>
      <div className="space-y-2">
        {participants.map((participant) => (
          <div
            key={participant.id}
            className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50"
          >
            <div className="relative">
              {participant.is_host ? (
                <Crown className="w-4 h-4 text-primary" />
              ) : (
                <User className="w-4 h-4 text-muted-foreground" />
              )}
              {participant.online && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-background" />
              )}
            </div>
            <span className="text-sm flex-1">{participant.name}</span>
            {participant.is_host && (
              <span className="text-xs text-primary font-medium">Host</span>
            )}
            {isHost && !participant.is_host && participant.id !== currentParticipantId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onKickParticipant?.(participant.id)}
              >
                <UserX className="w-3 h-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};
