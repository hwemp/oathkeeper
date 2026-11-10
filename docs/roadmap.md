# Product plan and current coverage

## Implemented foundation

The home page is a single-character worksheet for 2014 fifth edition rules.
It calculates ability modifiers, level-based proficiency, saving throws chosen
by the user, and basic initiative. Saving throws and initiative have separate
manual adjustments. Final ability scores must already include bonuses from
character options. Class, race / ancestry, and notes are manual text fields.

The worksheet exists in memory in the current browser tab. Downloading a
versioned JSON file preserves all supported fields. Restoring validates the file
and shows a review before replacing the worksheet. Unknown fields or versions
are rejected rather than discarded. A downloaded file is the only durable save;
there is no browser autosave or account storage. The page warns before leaving
with undownloaded edits, where the browser supports that warning.

The Community tab now supports username/password accounts, saved public posts,
comments, invitation-only groups, group messages, and file attachments. MongoDB
stores accounts and content; local files persist in `.data/uploads` during
frontend/backend development. Group chat refreshes every three seconds. The app
enforces access rules and upload limits on the server. Public reports are
reviewed by a configured moderator account.

This is implemented for local testing, not deployed. Render Free is selected for
app hosting, but uploads are disabled in production unless durable storage is
configured. The local disk adapter must not be used on Render's temporary disk.
Cloud storage integration, password recovery, and public-launch hardening remain.
See [hosting and owner next steps](hosting.md) and [community testing](community.md).

## Agreed community rules

Approved by the owner on November 9, 2026. These rules are implemented in the local community API.

- Public posts are visible to everyone.
- Private groups are visible only to invited members. Group owners manage
  invitations.
- Every group member may post and chat. Only the group owner can remove members.
- Messaging takes place within groups and between accepted friends.
- Authors can delete their own posts. Group owners can remove group content.
- Public content can be reported. The owner reviews reports through a configured
  moderator account and can remove reported posts and their comments/files.
- Photos may be up to 100 MB each; videos may be up to 500 MB each.
  PDFs and other files may be up to 1 GB each. The owner subsequently replaced
  the 5 GB total cap with expandable storage and no fixed upload count. Files
  stay until their post is deleted; actual storage capacity still applies.
- The earlier $0–$10 hosting budget is superseded. Build and review the app
  locally before purchasing services; select and review paid hosting later.

## Next development stages

Both character tracking and community remain in the intended first release.
These stages are work divisions, not a reduction of launch scope.

1. Add guided creation, skills, combat values, and leveling, building on the
   separate calculation module. Cover dependent calculations and manual
   adjustments with tests. Add 2014 Player's Handbook options only after
   establishing permission for the specific included material.
2. Agree character visibility and account behavior. Select hosting within the
   future reviewed monthly budget. Implement
   accounts and online storage with access checks and recovery behavior.
3. Extend and harden the implemented community features for public launch,
   including account recovery, moderation policy, and operational monitoring.
4. Connect durable media storage for deployment while preserving the implemented
   file-size and total-storage limits. Add PDF
   character import with editable review before saving; layout support must be
   explicit and unrecognized values must not be silently guessed.
5. Expand authorized official, third-party, and community sources in stages.
   Complete book coverage remains a long-term goal.

## Choices awaiting the owner

These have not been decided or implemented:

- Character visibility: private by default, shareable links, public profiles,
  and what group members may view or edit.
- Remaining moderation policy: appeals and public posting rules.
- Future upload policy refinements: allowed file-type restrictions. The first
  version accepts general files as downloads and previews only recognized media.
- Expected initial audience, to help size hosting within the agreed budget.

Ask about each choice before implementing features that depend on it.

## Added community scope

Friend requests, acceptance/decline/cancel, friend removal, friend-only direct
messages, blocking/unblocking, user and individual-message reports, and moderator
message removal are implemented for local testing. Existing general uploads
cover map files and character sheets. Native integration, cloud storage,
moderator account suspension, and recovery remain planned work.
