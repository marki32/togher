import { Card } from "@/components/ui/card";
import { Crown, User } from "lucide-react";

interface Participant {
  id: string;
  name: string;
  is_host: boolean;
}

interface ParticipantsListProps {
  participants: Participant[];
}

export const ParticipantsList = ({ participants }: ParticipantsListProps) => {
  return (
    <Card className="p-4 border-border bg-card">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <User className="w-4 h-4" />
        Participants ({participants.length})
      </h3>
      <div className="space-y-2">
        {participants.map((participant) => (
          <div
            key={participant.id}
            className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50"
          >
            {participant.is_host ? (
              <Crown className="w-4 h-4 text-primary" />
            ) : (
              <User className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="text-sm">{participant.name}</span>
            {participant.is_host && (
              <span className="ml-auto text-xs text-primary font-medium">Host</span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};
