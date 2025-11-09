import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Film } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const CreateRoom = () => {
  const [roomName, setRoomName] = useState("");
  const [hostName, setHostName] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const generateRoomCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const createRoom = async () => {
    if (!roomName.trim() || !hostName.trim()) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }

    setCreating(true);
    const code = generateRoomCode();

    const { data: roomData, error: roomError } = await supabase
      .from("rooms")
      .insert({
        code,
        name: roomName,
        host_name: hostName,
      })
      .select()
      .single();

    if (roomError) {
      toast({ title: "Failed to create room", description: roomError.message, variant: "destructive" });
      setCreating(false);
      return;
    }

      const { data: participantData, error: participantError } = await supabase
        .from("participants")
        .insert({
          room_id: roomData.id,
          name: hostName,
          is_host: true,
          user_id: user?.id || null,
        })
        .select()
        .single();

    if (participantError) {
      toast({ title: "Failed to join room", description: participantError.message, variant: "destructive" });
      setCreating(false);
      return;
    }

    await supabase.from("video_state").insert({
      room_id: roomData.id,
      is_playing: false,
      playback_time: 0,
    });

    localStorage.setItem(`participant_${code}`, participantData.id);
    navigate(`/room/${code}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md p-8 bg-card border-border animate-fade-in">
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-gradient-hero flex items-center justify-center shadow-glow">
            <Film className="w-8 h-8 text-primary-foreground" />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-center mb-2">Create Watch Party</h1>
        <p className="text-center text-muted-foreground mb-8">
          Start a room and invite friends to watch together
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Your Name</label>
            <Input
              placeholder="Enter your name"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Room Name</label>
            <Input
              placeholder="e.g., Movie Night"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
            />
          </div>

          <Button
            onClick={createRoom}
            disabled={creating}
            className="w-full bg-gradient-hero hover:opacity-90 transition-opacity shadow-glow"
          >
            {creating ? "Creating..." : "Create Room"}
          </Button>

          <Button
            onClick={() => navigate("/")}
            variant="ghost"
            className="w-full"
          >
            Back to Home
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default CreateRoom;
