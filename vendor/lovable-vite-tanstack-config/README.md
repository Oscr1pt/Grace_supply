# @lovable.dev/vite-tanstack-config

Vite config wrapper for Lovable TanStack Start projects.

## What It Does

- Gives TanStack Start projects a single `defineConfig` helper for local preview and production builds.
- Keeps Lovable sandbox previews predictable by setting the server shape, watched paths, HMR coordination, and asset routing expected by the platform.
- Adds diagnostics that help the preview tell build, Vite, SSR, and app errors apart.
- Produces deployable build output for Lovable while still letting self-hosted projects choose their own target.

## Customization

Apps can pass through Vite options and adjust the React, TanStack Start, Nitro, HMR gate, and error-logging behavior when they need to.

## Grace Supply local compatibility patch

This project vendors the published `2.7.7` package contents because the published peer range `nitro: >=3.0.260603-beta` excludes later date-stamped Nitro prereleases under npm semver rules. Only `peerDependencies.nitro` in `package.json` is amended to `>=3.0.260603-beta || >=3.0.260903-beta`; runtime files are unchanged. Nitro `3.0.260903-beta` resolves the audited `env-runner` issue and has been verified by the repository's Cloudflare/Nitro production build and browser regression suite. Revisit this local copy when upstream publishes a peer range that includes the supported Nitro release.
