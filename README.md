# Order-fulfillment

## Cloudflare Pages deployment

This is a static browser app, so Cloudflare Pages must generate `config.js` during the build. In the Pages project settings, add these environment variables for the Production environment:

- `SUPABASE_URL`: your Supabase project URL, such as `https://your-project-id.supabase.co`
- `SUPABASE_KEY`: your Supabase anon or publishable key

Use these Pages build settings:

- Build command: `printf 'window.APP_CONFIG = { SUPABASE_URL: "%s", SUPABASE_KEY: "%s" };' "$SUPABASE_URL" "$SUPABASE_KEY" > config.js`
- Build output directory: `.`
- Root directory: `/`

For local testing, copy `config.example.js` to `config.js` and replace both values. `config.js` is ignored by Git.

Never put the Supabase `service_role` or secret key in this app. Anything sent to the browser is public; protect the database with Supabase Row Level Security policies.