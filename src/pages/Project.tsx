import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, Play, Video, Loader2, Link as LinkIcon } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import ThemeToggle from "@/components/ThemeToggle";

const Project = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: videos, isLoading } = useQuery({
    queryKey: ["videos", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("*")
        .eq("project_id", projectId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const uploadVideo = useCallback(async (file: File) => {
    if (!projectId) return;
    const allowed = ["video/mp4", "video/webm", "video/quicktime"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Unsupported format", description: "Use MP4, WebM, or MOV", variant: "destructive" });
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    const ext = file.name.split(".").pop();
    const path = `${projectId}/${crypto.randomUUID()}.${ext}`;

    // Simulate progress since supabase-js doesn't support upload progress natively
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => Math.min(prev + 10, 90));
    }, 200);

    const { error: uploadError } = await supabase.storage
      .from("videos")
      .upload(path, file);

    clearInterval(progressInterval);

    if (uploadError) {
      setUploading(false);
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      return;
    }

    setUploadProgress(95);

    const title = file.name.replace(/\.[^/.]+$/, "");
    const { error: dbError } = await supabase
      .from("videos")
      .insert({ title, storage_path: path, project_id: projectId });

    setUploadProgress(100);
    setUploading(false);

    if (dbError) {
      toast({ title: "Error saving video", description: dbError.message, variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["videos", projectId] });
      toast({ title: "Video uploaded!" });
    }
  }, [projectId, queryClient, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadVideo(file);
  }, [uploadVideo]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadVideo(file);
  };

  const copyShareLink = (shareToken: string) => {
    const url = `${window.location.origin}/review/${shareToken}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Share link copied!" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="flex-1 text-lg font-semibold">{project?.name ?? "Project"}</h1>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        {/* Upload zone */}
        <div
          className={`relative rounded-xl border-2 border-dashed p-12 text-center transition-colors ${dragOver ? "border-primary bg-accent" : "border-border"
            }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {uploading ? (
            <div className="space-y-4">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
              <Progress value={uploadProgress} className="mx-auto max-w-xs" />
              <p className="text-sm text-muted-foreground">Uploading... {uploadProgress}%</p>
            </div>
          ) : (
            <>
              <Upload className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">Drag & drop a video here</p>
              <p className="mb-4 text-xs text-muted-foreground">MP4, WebM, or MOV</p>
              <label>
                <Button variant="outline" asChild>
                  <span>Browse files</span>
                </Button>
                <input type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={handleFileSelect} />
              </label>
            </>
          )}
        </div>

        {/* Video list */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : videos?.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No videos yet. Upload one above!</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos?.map((video) => (
              <Card key={video.id} className="group cursor-pointer transition-shadow hover:shadow-md">
                <CardContent className="p-4 space-y-3">
                  <div
                    className="flex aspect-video items-center justify-center rounded-lg bg-muted"
                    onClick={() => navigate(`/videos/${video.id}`)}
                  >
                    <Video className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span
                      className="text-sm font-medium truncate cursor-pointer hover:text-primary"
                      onClick={() => navigate(`/videos/${video.id}`)}
                    >
                      {video.title}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => copyShareLink(video.share_token)}
                    >
                      <LinkIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Project;
