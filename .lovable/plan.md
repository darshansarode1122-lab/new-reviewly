

# Video Review & Feedback App — Full MVP

A browser-based video review tool for fast sharing and timestamp-based feedback between creators and clients. Think "simpler Frame.io."

---

## 1. Authentication
- **Passwordless email login** (magic link / OTP via Supabase Auth)
- User profile with display name and avatar
- Protected routes for authenticated users

## 2. Dashboard
- **Project list** showing all user's projects
- Each project card shows: name, video count, unresolved comment count, last activity timestamp
- Create new project button
- Clean grid/list layout

## 3. Projects
- Create, rename, and delete projects
- Project detail page showing uploaded videos
- Each video card shows thumbnail, title, comment count, and status

## 4. Video Upload
- **Drag-and-drop upload** interface within a project
- Upload progress bar with percentage
- Videos stored in **Supabase Storage** (S3-compatible bucket)
- Support common formats (MP4, MOV, WebM)
- Auto-generate a shareable review link per video

## 5. Video Review Player
- **Large, centered HTML5 video player**
- Click anywhere on the timeline to pin a comment to that timestamp
- Playhead jumps to timestamp when clicking a comment
- Play/pause, seek, volume controls
- Keyboard shortcuts (spacebar for play/pause)

## 6. Comments System
- **Right-side comment panel** alongside the video player
- Each comment shows: author name, timestamp badge, message, time posted
- **Reply threads** on each comment
- **Resolve / reopen** toggle per comment
- Filter: All / Open / Resolved
- Real-time updates via Supabase realtime subscriptions

## 7. Client Review Mode (Public Share Link)
- Shareable link that works **without login**
- Client is prompted for **name and email** before commenting
- Client sees the video player + comment panel (read & write)
- Client cannot access dashboard or other projects
- Secure token-based link (UUID)

## 8. Email Notifications
- **Edge function** triggered when a new comment is posted
- Sends email to the project creator with: client name, comment text, timestamp, and a link to the video at that timestamp
- Uses a transactional email service (e.g., Resend)

## 9. Database Schema (Supabase / PostgreSQL)
- **profiles** — user display name, avatar
- **projects** — name, owner, timestamps
- **videos** — title, storage path, project reference, share token
- **comments** — video reference, timestamp, author info, message, resolved status, parent comment (for replies)
- **RLS policies** ensuring creators see only their projects; public share links grant scoped read/write access to comments

## 10. UI Design
- Clean, minimal interface with neutral modern colors
- Rounded cards with soft shadows
- Large centered video player with right-side comments panel
- Responsive layout (desktop-first, functional on tablet)
- No complex menus or enterprise patterns
- Toast notifications for actions (upload complete, comment posted, etc.)

---

### Implementation Order
1. Auth + profiles setup
2. Dashboard + project CRUD
3. Video upload + storage
4. Video player + timeline interaction
5. Comments system (create, reply, resolve)
6. Public share link + client review mode
7. Email notifications via edge function
8. Polish: responsive layout, loading states, error handling

