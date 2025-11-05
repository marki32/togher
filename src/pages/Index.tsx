import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Film, Users, Play } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-16 animate-fade-in">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-hero mb-6 shadow-glow">
            <Film className="w-10 h-10 text-primary-foreground" />
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-hero bg-clip-text text-transparent">
            Watch Together
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Create a virtual cinema with friends. Watch movies in perfect sync while chatting and reacting together.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <Card className="p-8 bg-card border-border hover:border-primary/50 transition-all cursor-pointer group animate-fade-in" 
                onClick={() => navigate("/create")}>
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
              <Play className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-2xl font-bold mb-2">Create Room</h3>
            <p className="text-muted-foreground mb-6">
              Start a new watch party. Upload your movie and control playback for everyone.
            </p>
            <Button className="w-full bg-gradient-hero hover:opacity-90 transition-opacity shadow-glow">
              Create Room
            </Button>
          </Card>

          <Card className="p-8 bg-card border-border hover:border-primary/50 transition-all cursor-pointer group animate-fade-in" 
                onClick={() => navigate("/join")}>
            <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4 group-hover:bg-accent/20 transition-colors">
              <Users className="w-6 h-6 text-accent" />
            </div>
            <h3 className="text-2xl font-bold mb-2">Join Room</h3>
            <p className="text-muted-foreground mb-6">
              Enter a room code to join friends and watch together in real-time.
            </p>
            <Button variant="secondary" className="w-full">
              Join Room
            </Button>
          </Card>
        </div>

        <div className="mt-16 grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <div className="text-center animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Film className="w-6 h-6 text-primary" />
            </div>
            <h4 className="font-semibold mb-2">Perfect Sync</h4>
            <p className="text-sm text-muted-foreground">
              All viewers watch at the same time, controlled by the host
            </p>
          </div>

          <div className="text-center animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <h4 className="font-semibold mb-2">Live Chat</h4>
            <p className="text-sm text-muted-foreground">
              Chat and react together with emojis and messages
            </p>
          </div>

          <div className="text-center animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Play className="w-6 h-6 text-primary" />
            </div>
            <h4 className="font-semibold mb-2">Host Control</h4>
            <p className="text-sm text-muted-foreground">
              Room creator has full control over playback and settings
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
