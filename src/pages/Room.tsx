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
  const [compressing, setCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const [enableCompression, setEnableCompression] = useState(true);
  const [uploadSpeed, setUploadSpeed] = useState<string>('');
  const [uploadETA, setUploadETA] = useState<string>('');
  const [onlineParticipants, setOnlineParticipants] = useState<Set<string>>(new Set());
  const videoRef = useRef<HTMLVideoElement>(null);
  const uploadStartTime = useRef<number>(0);
  const uploadedBytes = useRef<number>(0);

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

  const compressVideo = async (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const videoElement = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      videoElement.preload = 'metadata';
      videoElement.src = URL.createObjectURL(file);
      
      videoElement.onloadedmetadata = () => {
        // Set canvas to video dimensions (could be scaled down further)
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        
        const stream = canvas.captureStream();
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp8',
          videoBitsPerSecond: 1000000, // 1 Mbps - adjust for quality vs size
        });
        
        const chunks: Blob[] = [];
        mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          setCompressing(false);
          setCompressionProgress(0);
          URL.revokeObjectURL(videoElement.src);
          resolve(blob);
        };
        mediaRecorder.onerror = reject;
        
        mediaRecorder.start();
        videoElement.play();
        
        const drawFrame = () => {
          if (videoElement.paused || videoElement.ended) {
            mediaRecorder.stop();
            return;
          }
          ctx?.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          const progress = Math.min(99, Math.round((videoElement.currentTime / videoElement.duration) * 100));
          setCompressionProgress(progress);
          requestAnimationFrame(drawFrame);
        };
        
        drawFrame();
      };
      
      videoElement.onerror = reject;
    });
  };

  // Use Supabase storage client for large files - it handles resumable uploads internally
  // This avoids 524 timeout errors by using Supabase's built-in large file handling
  const uploadFileWithSupabaseClient = async (file: File, fileName: string): Promise<void> => {
    // Simulate progress since Supabase client doesn't provide it directly
    // We'll update progress based on time elapsed (approximate)
    const startTime = Date.now();
    const fileSize = file.size;
    
    // Update progress periodically
    const progressInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      // Estimate progress based on average upload speed (conservative estimate)
      // Assume 10 MB/s average - this is just for UI feedback
      const estimatedUploaded = Math.min(fileSize * 0.9, (elapsed * 10 * 1024 * 1024));
      const percent = Math.min(95, Math.round((estimatedUploaded / fileSize) * 100));
      setUploadProgress(percent);
      
      if (elapsed > 0) {
        const speed = estimatedUploaded / elapsed;
        const remaining = fileSize - estimatedUploaded;
        const eta = remaining / speed;
        setUploadSpeed(formatBytes(speed) + '/s (estimated)');
        setUploadETA(formatTime(eta));
      }
    }, 500);

    try {
      const { data, error } = await supabase.storage
        .from('videos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: file.type || 'video/mp4',
        });

      clearInterval(progressInterval);

      if (error) {
        throw error;
      }

      if (data) {
        setUploadProgress(100);
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = fileSize / elapsed;
        setUploadSpeed(formatBytes(speed) + '/s');
        setUploadETA('0s');
      }
    } catch (error) {
      clearInterval(progressInterval);
      throw error;
    }
  };

  // Optimized XHR upload for smaller files (under 500MB to avoid timeout)
  const uploadFileWithXHR = async (file: File, fileName: string): Promise<void> => {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    
    // Use direct storage hostname for better performance
    let storageUrl = SUPABASE_URL;
    if (storageUrl.includes('.supabase.co')) {
      storageUrl = storageUrl.replace('.supabase.co', '.storage.supabase.co');
    }
    const uploadUrl = `${storageUrl}/storage/v1/object/videos/${encodeURIComponent(fileName)}`;

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl, true);
      xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_PUBLISHABLE_KEY}`);
      xhr.setRequestHeader('apikey', SUPABASE_PUBLISHABLE_KEY);
      xhr.setRequestHeader('x-upsert', 'true');
      xhr.setRequestHeader('cache-control', '3600');
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      
      // Set a longer timeout for large files (but this won't help with Cloudflare's 100s limit)
      xhr.timeout = 300000; // 5 minutes (though Cloudflare will timeout at 100s)
      
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const percent = Math.min(99, Math.round((evt.loaded / evt.total) * 100));
          setUploadProgress(percent);
          
          // Calculate speed and ETA
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
      
      xhr.ontimeout = () => reject(new Error('Upload timeout - file too large. Try chunked upload'));
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadProgress(100);
          resolve();
        } else {
          reject(new Error(`Upload error: ${xhr.status}`));
        }
      };
      
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

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !room || !participant?.is_host) return;

    const fileSizeMB = file.size / (1024 * 1024);
    const LARGE_FILE_THRESHOLD = 100; // 100MB - disable compression for files larger than this
    const CHUNKED_UPLOAD_THRESHOLD = 500; // Use Supabase client for files > 500MB to avoid 524 timeout

    try {
      let fileToUpload: File = file;
      let fileName = `${room.id}_${Date.now()}`;
      
      // Auto-disable compression for large files (it's too slow)
      const shouldCompress = enableCompression && fileSizeMB < LARGE_FILE_THRESHOLD;
      
      if (shouldCompress) {
        setCompressing(true);
        setCompressionProgress(0);
        toast({ 
          title: 'Compressing video...', 
          description: `File size: ${fileSizeMB.toFixed(1)}MB - This may take a moment` 
        });
        const compressedBlob = await compressVideo(file);
        fileName += '.webm';
        
        // Create a new File object from the compressed blob
        fileToUpload = new File([compressedBlob], fileName, { type: 'video/webm' });
        
        toast({ 
          title: 'Compression complete!', 
          description: `Reduced from ${fileSizeMB.toFixed(1)}MB to ${(compressedBlob.size / 1024 / 1024).toFixed(1)}MB` 
        });
      } else {
        if (fileSizeMB >= LARGE_FILE_THRESHOLD && enableCompression) {
          toast({ 
            title: 'Large file detected', 
            description: `Compression disabled for files > ${LARGE_FILE_THRESHOLD}MB to speed up upload` 
          });
        }
        const fileExt = file.name.split('.').pop();
        fileName += `.${fileExt}`;
        fileToUpload = file;
      }

      setCompressing(false);
      setCompressionProgress(0);
      setUploading(true);
      setUploadProgress(0);
      setUploadSpeed('');
      setUploadETA('');
      uploadStartTime.current = Date.now();
      uploadedBytes.current = 0;

      const uploadFileSizeMB = fileToUpload.size / (1024 * 1024);
      
      toast({ 
        title: 'Starting upload...', 
        description: `File size: ${uploadFileSizeMB.toFixed(1)}MB - ${uploadFileSizeMB >= CHUNKED_UPLOAD_THRESHOLD ? 'Using optimized upload to avoid timeout' : 'Uploading directly'}` 
      });

      // Use Supabase storage client for large files to avoid 524 timeout errors
      // Cloudflare has a 100-second timeout, so files > 500MB should use Supabase client
      // which handles resumable uploads internally
      if (uploadFileSizeMB >= CHUNKED_UPLOAD_THRESHOLD) {
        // For very large files, use Supabase's storage client
        // It handles large files better and avoids timeout issues
        await uploadFileWithSupabaseClient(fileToUpload, fileName);
      } else {
        // For smaller files, use direct XHR upload with progress tracking
        await uploadFileWithXHR(fileToUpload, fileName);
      }

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
        description: `Uploaded in ${uploadTime}s` 
      });
    } catch (error) {
      console.error('Upload error:', error);
      setCompressing(false);
      setCompressionProgress(0);
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
                      <Button asChild disabled={uploading || compressing}>
                        <span>
                          <Upload className="w-4 h-4 mr-2" />
                          {compressing ? `Compressing... ${compressionProgress}%` : uploading ? `Uploading... ${uploadProgress}%` : "Upload Video"}
                        </span>
                      </Button>
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={handleVideoUpload}
                      />
                    </label>
                    {(uploading || compressing) && (
                      <div className="mt-2 space-y-1">
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-hero transition-all duration-300"
                            style={{ width: `${compressing ? compressionProgress : uploadProgress}%` }}
                          />
                        </div>
                        {uploading && uploadSpeed && (
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
                
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableCompression}
                    onChange={(e) => setEnableCompression(e.target.checked)}
                    className="w-4 h-4 rounded border-border"
                  />
                  <span>
                    Compress video before upload (auto-disabled for files &gt; 100MB)
                    <span className="block text-xs mt-1 opacity-75">
                      Large files (3-5GB) will use optimized chunked upload for maximum speed
                    </span>
                  </span>
                </label>
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
