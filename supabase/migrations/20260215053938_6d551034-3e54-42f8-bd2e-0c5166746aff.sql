
-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Projects table
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Videos table
CREATE TABLE public.videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  share_token UUID DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

-- Comments table
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  timestamp_seconds FLOAT NOT NULL DEFAULT 0,
  author_name TEXT NOT NULL,
  author_email TEXT,
  message TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  parent_comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Enable realtime for comments
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;

-- Helper function: check if user owns a project
CREATE OR REPLACE FUNCTION public.is_project_owner(_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = _project_id AND owner_id = auth.uid()
  )
$$;

-- Helper function: check if user can access a video (owner or via share token)
CREATE OR REPLACE FUNCTION public.is_video_owner(_video_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.videos v
    JOIN public.projects p ON p.id = v.project_id
    WHERE v.id = _video_id AND p.owner_id = auth.uid()
  )
$$;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_videos_updated_at BEFORE UPDATE ON public.videos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- RLS: profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- RLS: projects
CREATE POLICY "Owners can view own projects" ON public.projects FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "Authenticated users can create projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can update own projects" ON public.projects FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "Owners can delete own projects" ON public.projects FOR DELETE USING (owner_id = auth.uid());

-- RLS: videos
CREATE POLICY "Owners can view own videos" ON public.videos FOR SELECT USING (public.is_project_owner(project_id));
CREATE POLICY "Owners can insert videos" ON public.videos FOR INSERT WITH CHECK (public.is_project_owner(project_id));
CREATE POLICY "Owners can update own videos" ON public.videos FOR UPDATE USING (public.is_project_owner(project_id));
CREATE POLICY "Owners can delete own videos" ON public.videos FOR DELETE USING (public.is_project_owner(project_id));
-- Anonymous access to videos via share token (used by edge function, not direct RLS for now)
CREATE POLICY "Anyone can view videos via share token" ON public.videos FOR SELECT USING (share_token IS NOT NULL);

-- RLS: comments
CREATE POLICY "Video owners can view comments" ON public.comments FOR SELECT USING (public.is_video_owner(video_id));
CREATE POLICY "Anyone can view comments on shared videos" ON public.comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.videos WHERE id = video_id AND share_token IS NOT NULL)
);
CREATE POLICY "Authenticated users can create comments on own videos" ON public.comments FOR INSERT WITH CHECK (public.is_video_owner(video_id));
CREATE POLICY "Anyone can comment on shared videos" ON public.comments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.videos WHERE id = video_id AND share_token IS NOT NULL)
);
CREATE POLICY "Video owners can update comments" ON public.comments FOR UPDATE USING (public.is_video_owner(video_id));
CREATE POLICY "Video owners can delete comments" ON public.comments FOR DELETE USING (public.is_video_owner(video_id));

-- Storage bucket for videos
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', true);

CREATE POLICY "Authenticated users can upload videos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'videos' AND auth.uid() IS NOT NULL);
CREATE POLICY "Anyone can view videos" ON storage.objects FOR SELECT USING (bucket_id = 'videos');
CREATE POLICY "Owners can delete their videos" ON storage.objects FOR DELETE USING (bucket_id = 'videos' AND auth.uid() IS NOT NULL);
