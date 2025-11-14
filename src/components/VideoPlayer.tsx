import { forwardRef, MutableRefObject, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, PictureInPicture2 } from "lucide-react";

interface VideoPlayerProps {
  url: string;
  isHost: boolean;
  onSeek: () => void;
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  ({ url, isHost, onSeek }, ref) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isPiPAvailable, setIsPiPAvailable] = useState(false);
    const [isPiPActive, setIsPiPActive] = useState(false);

    const assignRefs = (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as MutableRefObject<HTMLVideoElement | null>).current = node;
      }
    };

    useEffect(() => {
      const handleFullscreenChange = () => {
        const container = containerRef.current;
        setIsFullscreen(document.fullscreenElement === container);
      };

      document.addEventListener("fullscreenchange", handleFullscreenChange);
      return () => {
        document.removeEventListener("fullscreenchange", handleFullscreenChange);
      };
    }, []);

    useEffect(() => {
      const video = videoRef.current;
      const pipEnabled =
        typeof document !== "undefined" &&
        "pictureInPictureEnabled" in document &&
        Boolean((document as any).pictureInPictureEnabled) &&
        !!video &&
        "requestPictureInPicture" in video &&
        !(video as any).disablePictureInPicture;

      setIsPiPAvailable(pipEnabled);

      if (!video) return;

      const handleEnter = () => setIsPiPActive(true);
      const handleLeave = () => setIsPiPActive(false);

      video.addEventListener("enterpictureinpicture", handleEnter);
      video.addEventListener("leavepictureinpicture", handleLeave);

      return () => {
        video.removeEventListener("enterpictureinpicture", handleEnter);
        video.removeEventListener("leavepictureinpicture", handleLeave);
      };
    }, [url]);

    const toggleFullscreen = async () => {
      const container = containerRef.current;
      if (!container) return;

      if (document.fullscreenElement === container) {
        await document.exitFullscreen().catch(() => undefined);
      } else {
        await container.requestFullscreen().catch(() => undefined);
      }
    };

    const togglePiP = async () => {
      const video = videoRef.current;
      if (!video || !isPiPAvailable) return;

      try {
        if ((document as any).pictureInPictureElement === video) {
          await (document as any).exitPictureInPicture?.();
        } else {
          await (video as any).requestPictureInPicture();
        }
      } catch (error) {
        console.error("Failed to toggle Picture-in-Picture:", error);
      }
    };

    return (
      <div
        ref={containerRef}
        className="relative aspect-video bg-black rounded-lg overflow-hidden shadow-glow"
      >
        <video
          ref={assignRefs}
          src={url}
          className="w-full h-full"
          controls={isHost}
          onSeeked={onSeek}
        />

        <button
          type="button"
          onClick={toggleFullscreen}
          className="absolute top-3 right-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/70 text-foreground transition hover:bg-background"
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </button>

        {isPiPAvailable && !isHost && (
          <button
            type="button"
            onClick={togglePiP}
            className="absolute top-3 right-14 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/70 text-foreground transition hover:bg-background"
            aria-label={isPiPActive ? "Exit Picture-in-Picture" : "Enter Picture-in-Picture"}
          >
            <PictureInPicture2 className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }
);

VideoPlayer.displayName = "VideoPlayer";
