# Delete Comment - Implementation Plan

Status: **SHIPPED 2026-07-25.** This is design history, not a work queue.

> Comment deletion is live on both surfaces. A comment can be removed by its author or by the
> author of the parent post / owner of the photo, decided server-side inside a transaction with
> the requester taken from the verified session — never from the request body. The same pass
> closed a wider hole: `POST /thoughts`, `/thoughts/:id/comments`, `/shares`, and `/reactions`
> previously had no auth at all and read the actor from the body, and `DELETE /thoughts/:id`
> had no ownership check. All now require a session. Deleting content also clears the
> notifications that referenced it.
>
> See the "Comment Moderation" entry in `CHANGELOG.md` for the as-built account, and
> `platform-api/tests/thought-routes.test.mjs` / `photo-routes.test.mjs` for the coverage.

  1. DB layer — two new functions

  platform-api/src/db/thoughts.mjs — add deleteThoughtComment(db, commentId, requestingPlayerId):
  - Fetch the comment, check author_player_id === requestingPlayerId OR fetch the parent thought and check
  author_player_id === requestingPlayerId (thought owner)
  - DELETE FROM thought_post_comments WHERE id = $1
  - Recount and update comment_count on thought_posts
  - Return { ok: true, thoughtId } or null on permission/not-found failure

  platform-api/src/db/photos.mjs — add deletePhotoComment(db, commentId, requestingPlayerId):
  - Same pattern: check commenter OR photo player_id
  - DELETE FROM photo_comments WHERE id = $1
  - Recount and update comment_count on player_photos
  - Return { ok: true, photoId } or null

  ---
  2. Backend routes — two new DELETE endpoints

  platform-api/src/app.mjs:

  Add a new regex near the existing comment match lines (~line 341):
  const photoCommentItemMatch = pathname.match(/^\/photos\/([^/]+)\/comments\/([^/]+)$/)
  const thoughtCommentItemMatch = pathname.match(/^\/thoughts\/([^/]+)\/comments\/([^/]+)$/)

  Add two DELETE handlers:
  - DELETE /thoughts/:thoughtId/comments/:commentId — requires auth, calls deleteThoughtComment(commentId,
  authClaims.playerId), returns 200 or 403/404
  - DELETE /photos/:photoId/comments/:commentId — requires auth, calls deletePhotoComment(commentId,
  authClaims.playerId), returns 200 or 403/404

  ---
  3. API client

  js/platform/api/platform-api.mjs — add two methods:
  - deleteThoughtComment(thoughtId, commentId) → DELETE /thoughts/${thoughtId}/comments/${commentId}
  - deletePhotoComment(photoId, commentId) → DELETE /photos/${photoId}/comments/${commentId}

  ---
  4. Frontend — thought comments (social-view.mjs)

  renderCommentSheet currently maps comments to <article class="thought-card__comment">. It needs to know two things to
  show the delete button: authSessionPlayerId (viewer) and item.authorPlayerId (thought poster). Both are already
  available on the view-model item.

  Add a data-delete-thought-comment attribute and a × delete button inside each comment article, rendered only when
  comment.authorPlayerId === authSessionPlayerId (commenter) or item.authorPlayerId === authSessionPlayerId (thought
  owner).

  The comment sheet function signature gains authSessionPlayerId passed down from the call sites in renderThoughtItem →
  buildThoughtCardViewModel.

  Handler lives in social-actions.mjs — add a click branch for [data-delete-thought-comment], call
  apiClient.deleteThoughtComment, then re-sync comments and re-render.

  ---
  5. Frontend — photo comments (viewer.mjs)

  paintSocial() builds the commentListEl.innerHTML. The viewer already knows viewerPlayerId and the photo owner can be
  derived from ownerId (already tracked in loadSocialState). Store photoOwnerId on the viewer state alongside
  socialStateMap.

  Add a data-delete-photo-comment button per comment, shown only when viewerPlayerId === c.authorPlayerId or
  viewerPlayerId === photoOwnerId.

  Add a click listener inside overlay.addEventListener("click", ...) for [data-delete-photo-comment], call
  apiClient.deletePhotoComment, refresh comment list via loadSocialState.

  ---
  6. CSS — minimal

  A small × delete button on each comment — positioned top-right on hover or always visible as a faint icon. One small
  rule in thoughts-feed.css / profile-social.css for thoughts, and one in the photo viewer CSS block for photos.

  ---
  Execution order when you're back

  1. DB functions (thoughts, photos)
  2. Backend routes
  3. API client methods
  4. social-view.mjs render + social-actions.mjs handler
  5. viewer.mjs render + click handler
  6. CSS
