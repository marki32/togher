import { forwardRef } from "react";

interface VideoPlayerProps {
  url: string;
  isHost: boolean;
  onSeek: () => void;
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  ({ url, isHost, onSeek }, ref) => {
    return (
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden shadow-glow">
        <video
          ref={ref}
          src={url}
          className="w-full h-full"
          controls={isHost}
          onSeeked={onSeek}
        />
      </div>
    );
  }
);

VideoPlayer.displayName = "VideoPlayer";
