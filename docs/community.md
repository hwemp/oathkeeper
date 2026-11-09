# Local community setup and testing

## Start the app

From the repository root:

```bash
docker compose up -d mongo
npm run dev
```

Open http://localhost:5173 and select Community. Both frontend and backend are
needed. If a frontend server is already running, start only the backend with
`npm run dev --workspace=@oathkeeper/backend`.

Create an account using a username (3–30 letters, numbers, or underscores) and a
password (12–128 characters). Passwords are hashed with scrypt; sign-in uses an
HTTP-only cookie. Sessions expire after seven days. Account recovery and email
verification are not available in this first local version.

MongoDB stores accounts, groups, posts, comments, reports, and messages. Files
are streamed to `.data/uploads` at the repository root when using `npm run dev`.
The directory is ignored by Git. Reloading the page or restarting development
servers preserves published content, provided the database and files remain.
Character worksheets still require downloading a save file.

## Try it with two people/accounts

1. Sign up in a regular browser window. Make a public post with text, a photo,
   a video, or a PDF. Files are uploaded when you submit the post. Recognized
   PNG/JPEG/GIF/WebP and MP4 media have previews; other formats can be downloaded.
   The browser must support the uploaded codec for playback.
2. Open a private browser window. Read the public post without signing in and
   download its attachment. Create a second account and comment on the post.
3. In the first window, create a private group and invite the second username.
   In the second window, accept the invitation. Select that group in both windows.
4. Create a private post and send messages. Group chat updates every three
   seconds; posts/comments refresh every five seconds. The interface shows the
   latest 50 posts and 100 messages/comments, while older content remains stored.
5. Remove the second member as group owner. Their group access and private file
   access should stop, including when they reuse a copied file URL. Already
   downloaded files cannot be recalled from someone's device.
6. Delete a post and verify its attachments can no longer be downloaded. Storage
   space becomes available again. Authors can delete their own content; group
   owners can also delete group content.

## Limits and failure behavior

- Photos: 100 MB; videos: 500 MB; PDFs and other files: 1 GB per file. Units are
  decimal (1 MB = 1,000,000 bytes). Zero-byte files are rejected.
- Up to ten files per post. The app reserves capacity before receiving bytes,
  enforcing a 5 GB total cap even when uploads happen at the same time.
- Files are retained until their post is deleted. General files are served as
  downloads; only recognized media are shown inline. This is not malware scanning.
- Upload failure/cancellation leaves the post unpublished. The UI tries to
  discard that draft and its files. On backend restart, abandoned drafts and
  incomplete uploads are removed and storage usage is reconciled.
- Group membership and deletion permissions are checked by the backend for
  every request, including file downloads. Invitees must accept before access.
- The local disk adapter supports one backend process. Do not run multiple
  backend instances against the same community database/upload directory.

## Review public reports

First create your own account locally. Then restart the backend with your
registered username in `MODERATOR_USERNAME` (replace `your_username`):

```bash
MODERATOR_USERNAME=your_username npm run dev --workspace=@oathkeeper/backend
```

Only designate an account you already own. This is a server setting; users cannot
make themselves moderators through the app. Sign in as that account to see
Public reports. Another account can report a public post or its comments, giving
a reason. The moderator can dismiss the report or remove the reported post,
including its comments and files. Private group moderation belongs to the owner.

## Verification

```bash
npm test
npm run test:integration
npm run typecheck
npm run build
```

Integration tests require MongoDB and create a uniquely named `oathkeeper_test_*`
database plus a temporary upload folder, cleaning both afterward. They never
use the application's `oathkeeper` database. To select a different test MongoDB
server, set `TEST_MONGODB_URI`.

## Deployment boundary

The current upload adapter stores files on disk. Production requires an explicit
`UPLOAD_DIR` on durable storage; otherwise the API disables uploads. Render Free
has temporary disk, so leave uploads disabled there until a cloud-storage adapter
is implemented. Do not route large uploads through a memory-buffering service.

Production cookies require HTTPS. For testing a production build strictly on
localhost over HTTP, set `COOKIE_SECURE=false`; do not use that setting on a public
HTTP deployment. Back up MongoDB and the upload directory together.
