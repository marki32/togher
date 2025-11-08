import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { VideoPlayer } from "@/components/VideoPlayer";
import { ChatPanel } from "@/components/ChatPanel";
import { ParticipantsList } from "@/components/ParticipantsList";
import { Play, Pause, Upload, Lock, Unlock, LogOut } from "lucide-react";

interface Room {
  id: string;
  code: string;
  name: string;
  host_name: string;
  video_url: string | null;
  is_locked: boolean;
}

interface Participant {
  id: string;
  name: string;
  is_host: boolean;
  online?: boolean;
}

interface VideoState {
  is_playing: boolean;
  playback_time: number;
}

const Room = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [room, setRoom] = useState<Room | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [videoState, setVideoState] = useState<VideoState>({ is_playing: false, playback_time: 0 });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [onlineParticipants, setOnlineParticipants] = useState<Set<string>>(new Set());
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!code) return;

    const participantId = localStorage.getItem(`participant_${code}`);
    if (!participantId) {
      navigate(`/join/${code}`);
      return;
    }

    loadRoomData(participantId);
    setupRealtimeSubscriptions(participantId);
    setupPresence(participantId);
  }, [code]);

  const loadRoomData = async (participantId: string) => {
    const { data: roomData } = await supabase
      .from("rooms")
      .select("*")
      .eq("code", code)
      .single();

    if (roomData) {
      setRoom(roomData);
      
      const { data: participantData } = await supabase
        .from("participants")
        .select("*")
        .eq("id", participantId)
        .single();
      
      if (participantData) {
        setParticipant(participantData);
      }

      const { data: participantsData } = await supabase
        .from("participants")
        .select("*")
        .eq("room_id", roomData.id);
      
      if (participantsData) {
        setParticipants(participantsData);
      }

      const { data: videoStateData } = await supabase
        .from("video_state")
        .select("*")
        .eq("room_id", roomData.id)
        .maybeSingle();
      
      if (videoStateData) {
        setVideoState({
          is_playing: videoStateData.is_playing,
          playback_time: Number(videoStateData.playback_time),
        });
      }
    }
  };

  const setupRealtimeSubscriptions = (participantId: string) => {
    const channel = supabase.channel(`room_${code}`);

    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `code=eq.${code}` }, (payload) => {
        if (payload.eventType === "UPDATE") {
          setRoom(payload.new as Room);
        } else if (payload.eventType === "DELETE") {
          toast({ title: "Room closed", description: "The host has closed the room" });
          localStorage.removeItem(`participant_${code}`);
          navigate("/");
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "participants" }, (payload) => {
        if (payload.eventType === "DELETE" && payload.old.id === participantId) {
          toast({ title: "Kicked from room", description: "You have been removed by the host", variant: "destructive" });
          localStorage.removeItem(`participant_${code}`);
          navigate("/");
        } else {
          loadRoomData(participantId);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "video_state" }, (payload) => {
        if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
          const newState = {
            is_playing: payload.new.is_playing,
            playback_time: Number(payload.new.playback_time),
          };
          setVideoState(newState);
          
          if (videoRef.current && !participant?.is_host) {
            const video = videoRef.current;
            const timeDiff = Math.abs(video.currentTime - newState.playback_time);
            
            // Only seek if difference is more than 0.5 seconds
            if (timeDiff > 0.5) {
              video.currentTime = newState.playback_time;
            }
            
            if (newState.is_playing && video.paused) {
              video.play().catch(err => console.log("Play error:", err));
            } else if (!newState.is_playing && !video.paused) {
              video.pause();
            }
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const setupPresence = (participantId: string) => {
    const presenceChannel = supabase.channel(`presence_${code}`);

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const online = new Set<string>();
        Object.values(state).forEach((presences: any) => {
          presences.forEach((presence: any) => {
            online.add(presence.participant_id);
          });
        });
        setOnlineParticipants(online);
      })
      .on("presence", { event: "join" }, ({ newPresences }) => {
        console.log("Participant joined:", newPresences);
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        console.log("Participant left:", leftPresences);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            participant_id: participantId,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !room || !participant?.is_host) return;

    setUploading(true);
    setUploadProgress(0);
    
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${room.id}_${Date.now()}.${fileExt}`;

      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 85) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 5;
        });
      }, 200);

      const { error: uploadError } = await supabase.storage
        .from("videos")
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true,
        });

      clearInterval(progressInterval);

      if (uploadError) throw uploadError;

      setUploadProgress(90);
      const { data } = supabase.storage.from("videos").getPublicUrl(fileName);

      await supabase
        .from("rooms")
        .update({ video_url: data.publicUrl })
        .eq("id", room.id);

      setUploadProgress(100);
      
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
      }, 500);
      
      toast({ title: "Video uploaded successfully!" });
    } catch (error) {
      setUploading(false);
      setUploadProgress(0);
      toast({ title: "Upload failed", description: "Please try again", variant: "destructive" });
    } finally {
      e.target.value = '';
    }
  };

  const updateVideoState = async (updates: Partial<VideoState>) => {
    if (!room || !participant?.is_host) return;

    await supabase
      .from("video_state")
      .upsert({
        room_id: room.id,
        ...updates,
        updated_at: new Date().toISOString(),
      });
  };

  const handlePlayPause = () => {
    if (!participant?.is_host || !videoRef.current) return;
    
    const newIsPlaying = !videoState.is_playing;
    updateVideoState({
      is_playing: newIsPlaying,
      playback_time: videoRef.current.currentTime,
    });
  };

  const handleSeek = () => {
    if (!participant?.is_host || !videoRef.current) return;
    
    updateVideoState({
      playback_time: videoRef.current.currentTime,
    });
  };

  const toggleLock = async () => {
    if (!room || !participant?.is_host) return;

    await supabase
      .from("rooms")
      .update({ is_locked: !room.is_locked })
      .eq("id", room.id);
  };

  const handleLeave = async () => {
    if (!participant || !room) return;

    if (participant.is_host) {
      // Host leaving - close the entire room
      await supabase
        .from("rooms")
        .delete()
        .eq("id", room.id);
      
      toast({ title: "Room closed", description: "You have closed the room" });
    } else {
      // Regular participant leaving
      await supabase
        .from("participants")
        .delete()
        .eq("id", participant.id);
    }

    localStorage.removeItem(`participant_${code}`);
    navigate("/");
  };

  const handleKickParticipant = async (participantId: string) => {
    if (!participant?.is_host) return;

    await supabase
      .from("participants")
      .delete()
      .eq("id", participantId);

    toast({ title: "Participant removed" });
  };

  if (!room || !participant) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background p-4 animate-fade-in">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-hero bg-clip-text text-transparent">
              {room.name}
            </h1>
            <p className="text-muted-foreground">Room Code: {room.code}</p>
          </div>
          <Button onClick={handleLeave} variant="destructive">
            <LogOut className="w-4 h-4 mr-2" />
            Leave
          </Button>
        </div>

        <div className="grid lg:grid-cols-[1fr_350px] gap-4">
          <div className="space-y-4">
            <div className="relative">
              {room.video_url ? (
                <VideoPlayer
                  ref={videoRef}
                  url={room.video_url}
                  isHost={participant.is_host}
                  onSeek={handleSeek}
                />
              ) : (
                <div className="aspect-video bg-card rounded-lg border-2 border-dashed border-border flex items-center justify-center">
                  <p className="text-muted-foreground">No video uploaded yet</p>
                </div>
              )}
            </div>

            {participant.is_host && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={handlePlayPause} disabled={!room.video_url}>
                  {videoState.is_playing ? (
                    <>
                      <Pause className="w-4 h-4 mr-2" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Play
                    </>
                  )}
                </Button>
                
                <div className="relative">
                  <label>
                    <Button asChild disabled={uploading}>
                      <span>
                        <Upload className="w-4 h-4 mr-2" />
                        {uploading ? `Uploading... ${uploadProgress}%` : "Upload Video"}
                      </span>
                    </Button>
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={handleVideoUpload}
                    />
                  </label>
                  {uploading && (
                    <div className="absolute bottom-0 left-0 w-full h-1 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-hero transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  )}
                </div>

                <Button onClick={toggleLock} variant="secondary">
                  {room.is_locked ? (
                    <>
                      <Unlock className="w-4 h-4 mr-2" />
                      Unlock Room
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 mr-2" />
                      Lock Room
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <ParticipantsList 
              participants={participants.map(p => ({
                ...p,
                online: onlineParticipants.has(p.id)
              }))}
              currentParticipantId={participant.id}
              isHost={participant.is_host}
              onKickParticipant={handleKickParticipant}
            />
            <ChatPanel roomId={room.id} participantId={participant.id} participantName={participant.name} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Room;
