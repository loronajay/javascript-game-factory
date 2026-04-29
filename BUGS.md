# Bugs

## Open

- GitHub Pages still requests `/favicon.ico` and gets a `404` because the site does not currently publish a favicon at the host root. This is cosmetic and does not block sign-in or page loads.

## Recently Fixed

- Sign-in redirect on GitHub Pages project deployments no longer falls out of the app root after login. `/me` was sending unauthenticated users to `/sign-in` with `next=/me/index.html`, and the sign-in page treated that as an origin-root path, which produced a `404` on project-site deployments. Auth redirects now resolve against the app root instead of the domain root.


