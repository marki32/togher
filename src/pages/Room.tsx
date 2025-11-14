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
import { useAuth } from "@/hooks/useAuth";

interface Room {
  id: string;
  code: string;
  name: string;
  host_name: string;
  video_url: string | null;
  is_locked: boolean;
  view_count?: number;
  total_watch_time_seconds?: number;
  last_activity_at?: string;
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
  const { user } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [videoState, setVideoState] = useState<VideoState>({ is_playing: false, playback_time: 0 });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState<string>('');
  const [uploadETA, setUploadETA] = useState<string>('');
  const [onlineParticipants, setOnlineParticipants] = useState<Set<string>>(new Set());
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [roomClosed, setRoomClosed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const uploadStartTime = useRef<number>(0);
  const uploadedBytes = useRef<number>(0);
  const watchStartTime = useRef<number>(Date.now());
  const historyUpdateInterval = useRef<NodeJS.Timeout | null>(null);
  const roomCloseTimeout = useRef<NodeJS.Timeout | null>(null);

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

    // Start tracking watch time for authenticated users
    if (user) {
      watchStartTime.current = Date.now();
      historyUpdateInterval.current = setInterval(() => {
        updateWatchHistory();
      }, 30000); // Update every 30 seconds
    }

    return () => {
      if (historyUpdateInterval.current) {
        clearInterval(historyUpdateInterval.current);
      }
      if (roomCloseTimeout.current) {
        clearTimeout(roomCloseTimeout.current);
      }
      // Final update on unmount
      if (user) {
        updateWatchHistory();
      }
    };
  }, [code, user]);

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
          setRoomClosed(true);
          setStatusMessage("Room closed by host");
          if (roomCloseTimeout.current) {
            clearTimeout(roomCloseTimeout.current);
          }
          roomCloseTimeout.current = setTimeout(() => {
            toast({ title: "Room closed", description: "The host has closed the room" });
            localStorage.removeItem(`participant_${code}`);
            navigate("/");
          }, 2000);
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

  const updateWatchHistory = async () => {
    if (!user || !room) return;

    const watchDuration = Math.floor((Date.now() - watchStartTime.current) / 1000);

    try {
      // Upsert room history
      await supabase
        .from("room_history")
        .upsert({
          user_id: user.id,
          room_id: room.id,
          room_code: room.code,
          room_name: room.name,
          video_url: room.video_url,
          last_watched_at: new Date().toISOString(),
          watch_duration_seconds: watchDuration,
        }, {
          onConflict: 'user_id,room_id',
        });

      // Update room statistics
      await supabase
        .from("rooms")
        .update({
          view_count: (room.view_count || 0) + 1,
          total_watch_time_seconds: (room.total_watch_time_seconds || 0) + watchDuration,
          last_activity_at: new Date().toISOString(),
        })
        .eq("id", room.id);
    } catch (error) {
      console.error("Failed to update watch history:", error);
    }
  };

  // Fast direct upload - optimized for maximum speed
  // Uses XHR with proper configuration for best performance
  const uploadFileFast = async (file: File, fileName: string): Promise<void> => {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    
    // Use direct storage hostname for better performance (bypasses API gateway)
    let storageUrl = SUPABASE_URL;
    if (storageUrl.includes('.supabase.co')) {
      storageUrl = storageUrl.replace('.supabase.co', '.storage.supabase.co');
    }
    const uploadUrl = `${storageUrl}/storage/v1/object/videos/${encodeURIComponent(fileName)}`;

    uploadStartTime.current = Date.now();
    uploadedBytes.current = 0;

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      // Use POST method with upsert for faster uploads
      xhr.open('POST', uploadUrl, true);
      
      // Set headers for optimal performance
      xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_PUBLISHABLE_KEY}`);
      xhr.setRequestHeader('apikey', SUPABASE_PUBLISHABLE_KEY);
      xhr.setRequestHeader('x-upsert', 'true');
      xhr.setRequestHeader('cache-control', '3600');
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      
      // Extended timeout for large files
      xhr.timeout = 1800000; // 30 minutes for very large files
      
      // Track upload progress in real-time
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const percent = Math.min(99, Math.round((evt.loaded / evt.total) * 100));
          setUploadProgress(percent);
          
          uploadedBytes.current = evt.loaded;
          const elapsed = (Date.now() - uploadStartTime.current) / 1000;
          if (elapsed > 0) {
            const speed = evt.loaded / elapsed;
            const remaining = evt.total - evt.loaded;
            const eta = remaining / speed;
            
            setUploadSpeed(formatBytes(speed) + '/s');
            setUploadETA(formatTime(eta));
          }
        }
      };
      
      xhr.ontimeout = () => reject(new Error('Upload timeout - please check your connection'));
      xhr.onerror = () => reject(new Error('Upload failed - please try again'));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadProgress(100);
          resolve();
        } else {
          reject(new Error(`Upload error: ${xhr.status} - ${xhr.statusText}`));
        }
      };
      
      // Send file directly - browser handles optimization
      xhr.send(file);
    });
  };


  // Helper functions
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
  };

  useEffect(() => {
    if (roomClosed) return;
    if (!participant || participant.is_host || !room?.video_url) {
      setStatusMessage("");
      return;
    }
    setStatusMessage(videoState.is_playing ? "" : "Paused by host");
  }, [videoState.is_playing, participant, room?.video_url, roomClosed]);

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !room || !participant?.is_host) return;

    const fileSizeMB = file.size / (1024 * 1024);

    try {
      // Skip compression entirely for faster uploads - compression is too slow
      // Users can compress videos before uploading if needed
      const fileExt = file.name.split('.').pop() || 'mp4';
      const fileName = `${room.id}_${Date.now()}.${fileExt}`;

      setUploading(true);
      setUploadProgress(0);
      setUploadSpeed('');
      setUploadETA('');
      uploadStartTime.current = Date.now();
      uploadedBytes.current = 0;

      toast({ 
        title: 'Starting fast upload...', 
        description: `File size: ${fileSizeMB.toFixed(1)}MB - Optimized for maximum speed` 
      });

      // Use optimized direct upload for all files - fastest method
      await uploadFileFast(file, fileName);

      // Get public URL and update room
      const { data } = supabase.storage.from('videos').getPublicUrl(fileName);

      await supabase
        .from('rooms')
        .update({ video_url: data.publicUrl })
        .eq('id', room.id);

      setUploading(false);
      setUploadProgress(0);
      setUploadSpeed('');
      setUploadETA('');

      const uploadTime = ((Date.now() - uploadStartTime.current) / 1000).toFixed(1);
      toast({ 
        title: 'Video uploaded successfully!', 
        description: `Uploaded ${fileSizeMB.toFixed(1)}MB in ${uploadTime}s` 
      });
    } catch (error) {
      console.error('Upload error:', error);
      setUploading(false);
      setUploadProgress(0);
      setUploadSpeed('');
      setUploadETA('');
      toast({ 
        title: 'Upload failed', 
        description: error instanceof Error ? error.message : 'Please try again', 
        variant: 'destructive' 
      });
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
              {statusMessage && (
                <div
                  className={`absolute top-4 left-4 z-10 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${
                    roomClosed ? "bg-destructive/90 text-destructive-foreground" : "bg-background/80 text-foreground"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      roomClosed ? "bg-destructive-foreground" : "bg-primary"
                    }`}
                  />
                  {statusMessage}
                </div>
              )}
            </div>

            {participant.is_host && (
              <div className="space-y-3">
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
                      <div className="mt-2 space-y-1">
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-hero transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        {uploadSpeed && (
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{uploadSpeed}</span>
                            {uploadETA && <span>ETA: {uploadETA}</span>}
                          </div>
                        )}
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
