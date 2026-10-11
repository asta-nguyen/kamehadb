# Marketing and Documentation Site

Verification: [x] The separate Next.js app, public routes, metadata, remote data requests, and image-refresh scripts were checked against current source.

## Public site pages

### Business rules

- The marketing site is a separate Next.js app under landing and is managed with npm, outside the pnpm workspace.
- The home page presents product features, supported database engines, screenshots, and a demo schema visualization.
- Public pages include the home page, changelog, team, and video demo.
- The changelog page parses the repository root CHANGELOG.md at build/runtime rather than using a separate landing changelog store.

### Flow

1. Next.js resolves the page route and renders the shared navigation/footer where applicable.
2. The home page fetches the public GitHub repository's star count and passes the value to the home view.
3. The team page loads contributor data through its server-side helper.
4. The changelog page parses the root changelog into releases and sections.

### State changes

- The site does not persist application workspace state.
- Homepage star data uses a 24-hour revalidation interval; team contributor data is also configured with 24-hour revalidation.

### Side effects

- The home page makes a request to the GitHub repository API; a non-OK response or fetch error yields no star count.
- The root layout loads the configured Umami analytics script after interaction.

### Authorization & constraints

- The landing app has a separate npm package and build; root pnpm workspace scripts do not include it.
- The site copy is marketing content and does not establish desktop runtime behavior.
- Current layout metadata claims MCP credentials are stored in the OS Keychain. Runtime MCP source instead stores an encrypted credential bundle in metadata SQLite and a key file beside it. Treat the website wording as a copy mismatch, not as runtime behavior.

### Error paths

- GitHub star lookup returns null if the request fails or the response does not contain a numeric star count.
- The source does not establish a visible recovery UI for contributor data failure in the team page.

### Tests

The recorded FFF test-file search for landing marketing/page identifiers found no matching landing page test.

### Related

- [Architecture overview](../architecture/overview.md)
- [Read-only MCP server](read-only-mcp.md)

### Sources

- landing/package.json
- landing/src/app/page.tsx
- landing/src/app/layout.tsx
- landing/src/app/changelog/page.tsx
- landing/src/app/team/page.tsx
- landing/src/app/video/page.tsx
- landing/src/components/home-view.tsx
- landing/src/lib/contributors.ts
- apps/sidecar/src/db/mcp-credential-vault.ts
- apps/sidecar/src/db/metadata-store.ts

## Search indexing and social metadata

### Business rules

- Site metadata defines canonical URLs, descriptions, keywords, Open Graph and Twitter cards, and robots directives.
- The sitemap exposes the home, changelog, team, and video routes.
- The Open Graph image uses the generated animated asset at landing/public/og-animated.gif.

### Flow

1. The root layout resolves the base URL and generates metadata and JSON-LD.
2. Sitemap and robots handlers derive their URLs from the same base URL helper.
3. Search and social crawlers receive those metadata and route responses.

### State changes

- Metadata is generated from source and environment URL configuration; the handlers do not persist a separate search index.

### Side effects

- Rendering the root layout requests the configured analytics script from an external host.

### Authorization & constraints

- The metadata and sitemap only describe the routes and copy present in the Next.js app; they do not validate installed desktop capabilities.
- The sitemap's last-modified timestamp comes from the repository root CHANGELOG.md file.

### Error paths

- Base URL resolution failures follow the Next.js route/render error path; no fallback URL behavior is established here.

### Tests

The recorded FFF test-file search for sitemap, robots, and metadata handlers in test/spec files returned no matching site tests.

### Related

- [Public site pages](marketing-site.md)

### Sources

- landing/src/app/layout.tsx
- landing/src/app/sitemap.ts
- landing/src/app/robots.ts
- landing/src/lib/url.ts
- landing/src/app/opengraph-image.tsx

## Marketing screenshot and Open Graph assets

### Business rules

- The AI comparison screenshots are generated from the landing capture script and stored under landing/public/images.
- The screenshot-refresh workflow runs on release tags or manual dispatch and commits refreshed images to the repository's default branch.
- The animated Open Graph GIF is rendered locally through the landing package script; it is a checked-in asset rather than a Vercel runtime route.

### Flow

1. The screenshot workflow installs landing dependencies and Playwright Chromium.
2. It runs the image-capture script and commits changes matching landing/public/images/\*.png.
3. The animated image script renders the OG GIF when invoked through the local package script.

### State changes

- Generated screenshots and the OG GIF are version-controlled files.
- The workflow can create a commit on the repository default branch after refreshing screenshots.

### Side effects

- Screenshot capture uses Playwright Chromium and writes image files.
- The GitHub Actions workflow has contents write permission for its commit step.

### Authorization & constraints

- The workflow is triggered by v\* tags or workflow dispatch.
- The image capture process uses the landing npm lockfile and does not run as part of the Tauri app build.

### Error paths

- Dependency installation, browser installation, image capture, or commit failure fails the GitHub Actions job.

### Tests

The recorded FFF test-file search for screenshot capture and OG image scripts in test/spec files returned no matching tests.

### Related

- [Public site pages](marketing-site.md)

### Sources

- landing/package.json
- landing/scripts/capture-images.mjs
- landing/scripts/render-og-animated.mjs
- landing/src/app/opengraph-image.tsx
- .github/workflows/screenshot-refresh.yml
