import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { History as HistoryIcon, Play, ArrowLeft, LogOut } from "lucide-react";
import { Session } from "@supabase/supabase-js";

interface HistoryItem {
  id: string;
  room_code: string;
  room_name: string;
  video_url: string | null;
  last_watched_at: string;
  watch_duration_seconds: number;
}

const History = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      } else {
        loadHistory();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const loadHistory = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("room_history")
      .select("*")
      .order("last_watched_at", { ascending: false });

    if (error) {
      toast({ 
        title: "Failed to load history", 
        description: error.message, 
        variant: "destructive" 
      });
    } else {
      setHistory(data || []);
    }
    setLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const handleRewatch = (roomCode: string) => {
    navigate(`/join/${roomCode}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Watch History</h1>
              <p className="text-muted-foreground">Your recently watched rooms</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleSignOut}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading history...</p>
          </div>
        ) : history.length === 0 ? (
          <Card className="p-12 text-center">
            <HistoryIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">No watch history yet</h3>
            <p className="text-muted-foreground mb-6">
              Your watched rooms will appear here
            </p>
            <Button onClick={() => navigate("/")}>
              Start Watching
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4">
            {history.map((item) => (
              <Card key={item.id} className="p-6 hover:border-primary/50 transition-all">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-1">{item.room_name}</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      Room Code: {item.room_code}
                    </p>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{formatDate(item.last_watched_at)}</span>
                      {item.watch_duration_seconds > 0 && (
                        <>
                          <span>•</span>
                          <span>Watched {formatDuration(item.watch_duration_seconds)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Button
                    onClick={() => handleRewatch(item.room_code)}
                    className="bg-gradient-hero hover:opacity-90 shadow-glow"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Rewatch
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default History;
