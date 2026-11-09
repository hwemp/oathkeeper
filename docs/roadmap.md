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

## Next development stages

Both character tracking and community remain in the intended first release.
These stages are work divisions, not a reduction of launch scope.

1. Add guided creation, skills, combat values, and leveling, building on the
   separate calculation module. Cover dependent calculations and manual
   adjustments with tests. Add 2014 Player's Handbook options only after
   establishing permission for the specific included material.
2. Agree character visibility, account behavior, and hosting budget. Implement
   accounts and online storage with access checks and recovery behavior.
3. Agree public/private group permissions and moderation. Implement public
   discussions, private gaming groups, comments, and live chat with permission
   and failure tests.
4. Agree upload limits and media storage. Add images, PDFs, and videos. Add PDF
   character import with editable review before saving; layout support must be
   explicit and unrecognized values must not be silently guessed.
5. Expand authorized official, third-party, and community sources in stages.
   Complete book coverage remains a long-term goal.

## Choices awaiting the owner

These have not been decided or implemented:

- Character visibility: private by default, shareable links, public profiles,
  and what group members may view or edit.
- Group permissions: who can invite, remove members, post, and manage content.
- Moderation: reporting, moderator powers, appeals, and public posting rules.
- Upload limits: allowed file sizes/types, quotas, and media retention.
- Hosting budget: monthly ceiling and expected initial audience.

Ask about each choice before implementing features that depend on it.
