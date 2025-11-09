import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const JoinRoom = () => {
  const { code: urlCode } = useParams();
  const [code, setCode] = useState(urlCode || "");
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const joinRoom = async () => {
    if (!code.trim() || !name.trim()) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }

    setJoining(true);

    const { data: roomData, error: roomError } = await supabase
      .from("rooms")
      .select("*")
      .eq("code", code.toUpperCase())
      .single();

    if (roomError || !roomData) {
      toast({ title: "Room not found", description: "Please check the room code", variant: "destructive" });
      setJoining(false);
      return;
    }

    if (roomData.is_locked) {
      toast({ title: "Room is locked", description: "This room is not accepting new participants", variant: "destructive" });
      setJoining(false);
      return;
    }

    const { data: participantData, error: participantError } = await supabase
      .from("participants")
      .insert({
        room_id: roomData.id,
        name: name,
        is_host: false,
        user_id: user?.id || null,
      })
      .select()
      .single();

    if (participantError) {
      toast({ title: "Failed to join room", description: participantError.message, variant: "destructive" });
      setJoining(false);
      return;
    }

    localStorage.setItem(`participant_${code.toUpperCase()}`, participantData.id);
    navigate(`/room/${code.toUpperCase()}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md p-8 bg-card border-border animate-fade-in">
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-gradient-hero flex items-center justify-center shadow-glow">
            <Users className="w-8 h-8 text-primary-foreground" />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-center mb-2">Join Watch Party</h1>
        <p className="text-center text-muted-foreground mb-8">
          Enter the room code to join your friends
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Your Name</label>
            <Input
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Room Code</label>
            <Input
              placeholder="Enter room code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </div>

          <Button
            onClick={joinRoom}
            disabled={joining}
            className="w-full bg-gradient-hero hover:opacity-90 transition-opacity shadow-glow"
          >
            {joining ? "Joining..." : "Join Room"}
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

export default JoinRoom;
