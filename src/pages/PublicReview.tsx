import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Play, Pause, Volume2, VolumeX, MessageSquare, Send, Loader2
} from "lucide-react";

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

interface Comment {
  id: string;
  video_id: string;
  timestamp_seconds: number;
  author_name: string;
  author_email: string | null;
  message: string;
  resolved: boolean;
  parent_comment_id: string | null;
  user_id: string | null;
  created_at: string;
}

const PublicReview = () => {
  const { shareToken } = useParams<{ shareToken: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [identified, setIdentified] = useState(false);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [commentTimestamp, setCommentTimestamp] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const { data: video, isLoading: videoLoading } = useQuery({
    queryKey: ["public-video", shareToken],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("*")
        .eq("share_token", shareToken!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const videoUrl = video?.storage_path
    ? supabase.storage.from("videos").getPublicUrl(video.storage_path).data.publicUrl
    : null;

  const { data: comments = [] } = useQuery({
    queryKey: ["comments", video?.id],
    enabled: !!video?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("*")
        .eq("video_id", video!.id)
        .order("timestamp_seconds", { ascending: true });
      if (error) throw error;
      return data as Comment[];
    },
  });

  useEffect(() => {
    if (!video?.id) return;
    const channel = supabase
      .channel(`public-comments-${video.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `video_id=eq.${video.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["comments", video.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [video?.id, queryClient]);

  const addComment = useMutation({
    mutationFn: async () => {
      const ts = commentTimestamp ?? currentTime;
      const { error } = await supabase.from("comments").insert({
        video_id: video!.id,
        timestamp_seconds: ts,
        author_name: clientName,
        author_email: clientEmail,
        message: newComment,
        parent_comment_id: replyTo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", video?.id] });
      setNewComment("");
      setCommentTimestamp(null);
      setReplyTo(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (playing) videoRef.current.pause();
    else videoRef.current.play();
    setPlaying(!playing);
  }, [playing]);

  const seekTo = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const time = pct * duration;
    seekTo(time);
    setCommentTimestamp(time);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay]);

  // Client identification gate
  if (!identified) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Play className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">Join the review</CardTitle>
            <p className="text-sm text-muted-foreground">Enter your details to leave feedback</p>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (clientName.trim() && clientEmail.trim()) setIdentified(true);
              }}
              className="space-y-3"
            >
              <Input placeholder="Your name" value={clientName} onChange={(e) => setClientName(e.target.value)} required />
              <Input type="email" placeholder="Your email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} required />
              <Button type="submit" className="w-full">Continue</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (videoLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!video) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Video not found or link expired.</p>
      </div>
    );
  }

  const topLevelComments = comments.filter((c) => !c.parent_comment_id);
  const getReplies = (parentId: string) => comments.filter((c) => c.parent_comment_id === parentId);

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      {/* Video */}
      <div className="flex-1 p-4 lg:p-6">
        <div className="mx-auto max-w-4xl space-y-3">
          <h1 className="text-lg font-semibold">{video.title}</h1>
          <div className="relative overflow-hidden rounded-xl bg-black">
            {videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full"
                muted={muted}
                onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
                onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onClick={togglePlay}
              />
            ) : (
              <div className="flex aspect-video items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-white/50" />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="group relative h-2 cursor-pointer rounded-full bg-muted" onClick={handleTimelineClick}>
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }} />
              {topLevelComments.map((c) => (
                <div
                  key={c.id}
                  className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-accent-foreground/70 ring-2 ring-background cursor-pointer"
                  style={{ left: `${duration ? (c.timestamp_seconds / duration) * 100 : 0}%` }}
                  onClick={(e) => { e.stopPropagation(); seekTo(c.timestamp_seconds); }}
                />
              ))}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={togglePlay}>
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMuted(!muted)}>
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
                <span className="text-xs text-muted-foreground font-mono">{formatTime(currentTime)} / {formatTime(duration)}</span>
              </div>
              {commentTimestamp !== null && (
                <Badge variant="secondary" className="text-xs">Comment at {formatTime(commentTimestamp)}</Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Comments */}
      <div className="w-full border-t lg:w-96 lg:border-l lg:border-t-0 flex flex-col bg-card">
        <div className="border-b p-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Comments
            <span className="text-xs text-muted-foreground">({comments.length})</span>
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {topLevelComments.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-8">No comments yet. Click the timeline to add one.</p>
          )}
          {topLevelComments.map((comment) => (
            <div key={comment.id} className="space-y-2">
              <div className={`rounded-lg border p-3 text-sm ${comment.resolved ? "opacity-60" : ""}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-xs">{comment.author_name}</span>
                  <Badge variant="outline" className="text-[10px] cursor-pointer hover:bg-accent" onClick={() => seekTo(comment.timestamp_seconds)}>
                    {formatTime(comment.timestamp_seconds)}
                  </Badge>
                  {comment.resolved && <Badge variant="secondary" className="text-[10px]">Resolved</Badge>}
                </div>
                <p className="text-xs leading-relaxed">{comment.message}</p>
                <button className="mt-1 text-[10px] text-muted-foreground hover:text-foreground" onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}>
                  Reply
                </button>
              </div>
              {getReplies(comment.id).map((reply) => (
                <div key={reply.id} className="ml-4 rounded-lg border p-3 text-sm bg-muted/50">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-xs">{reply.author_name}</span>
                    <Badge variant="outline" className="text-[10px]">{formatTime(reply.timestamp_seconds)}</Badge>
                  </div>
                  <p className="text-xs leading-relaxed">{reply.message}</p>
                </div>
              ))}
              {replyTo === comment.id && (
                <div className="ml-4 flex gap-2">
                  <Input placeholder="Reply..." className="text-xs h-8" value={newComment} onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && newComment.trim()) addComment.mutate(); }} />
                  <Button size="icon" className="h-8 w-8 shrink-0" onClick={() => newComment.trim() && addComment.mutate()}>
                    <Send className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t p-4">
          <Textarea
            placeholder={commentTimestamp !== null ? `Comment at ${formatTime(commentTimestamp)}...` : "Click timeline to set timestamp..."}
            className="text-xs min-h-[60px] resize-none"
            value={replyTo ? "" : newComment}
            onChange={(e) => { setReplyTo(null); setNewComment(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && newComment.trim() && !replyTo) { e.preventDefault(); addComment.mutate(); }
            }}
          />
          {!replyTo && (
            <Button className="mt-2 w-full" size="sm" disabled={!newComment.trim() || addComment.isPending} onClick={() => addComment.mutate()}>
              {addComment.isPending ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Send className="mr-2 h-3 w-3" />}
              Post Comment
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PublicReview;
