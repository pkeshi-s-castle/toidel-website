## Toidel Catalog Website

Static Hugo catalog website based on the [CloudCannon Fur Hugo template](https://github.com/CloudCannon/fur-hugo-template).

This version is configured for inquiry-only selling flow:

- No payment gateway
- No checkout/cart
- Product inquiry routed to WhatsApp

## Quick Configuration

Update these values in `/Users/prakash/github.com/pkeshi-s-castle/toidel-website/config.toml`:

- `baseURL`: your Cloudflare Pages domain or custom domain
- `params.whatsapp_number`: full number in international format without `+` or spaces
- `params.whatsapp_prefill`: default message text
- `params.author.email` and `params.author.phone`

You can also update social links in `/Users/prakash/github.com/pkeshi-s-castle/toidel-website/data/socials.yaml`.

## Local Development

```bash
hugo server
```

Open [http://localhost:1313](http://localhost:1313).

## Deploy To Cloudflare Pages

1. Push this repository to GitHub.
2. In Cloudflare Dashboard, go to Pages and create a project from this repo.
3. Use these build settings:
   - Framework preset: `Hugo`
   - Build command: `hugo --gc --minify`
   - Build output directory: `public`
4. Set an environment variable if needed:
   - `HUGO_VERSION` = `0.121.2` (or newer stable)
5. Deploy.

## Product Management

Products live in `/Users/prakash/github.com/pkeshi-s-castle/toidel-website/content/products/`.

Each product supports:

- Title
- Optional description
- One picture

The "Chat on WhatsApp" button is generated automatically per product.

## Admin Panel (Self-Hosted, Free)

This repo now includes Decap CMS at `/admin` so a non-technical partner can add/update/delete products.

- Admin URL: `https://<your-domain>/admin/`
- CMS config file: `/Users/prakash/github.com/pkeshi-s-castle/toidel-website/static/admin/config.yml`
- OAuth endpoints (Cloudflare Pages Functions):
  - `/Users/prakash/github.com/pkeshi-s-castle/toidel-website/functions/api/auth.js`
  - `/Users/prakash/github.com/pkeshi-s-castle/toidel-website/functions/api/callback.js`

### One-Time Setup

1. Create a GitHub OAuth App:
   - Homepage URL: `https://<your-domain>`
   - Authorization callback URL: `https://<your-domain>/api/callback`
2. In Cloudflare Pages project settings, add environment variables:
   - `GITHUB_OAUTH_CLIENT_ID`
   - `GITHUB_OAUTH_CLIENT_SECRET`
   - Optional: `GITHUB_OAUTH_SCOPE` (default is `repo`)
3. Update Decap repo/site values in `/Users/prakash/github.com/pkeshi-s-castle/toidel-website/static/admin/config.yml`:
   - `backend.repo`
   - `backend.base_url`
   - `site_url`
   - `display_url`
4. Redeploy Cloudflare Pages.

### Partner Workflow

1. Open `https://<your-domain>/admin/`
2. Login with GitHub.
3. Open **Products** collection.
4. Create, edit, or delete products.
5. Save changes. Cloudflare Pages redeploys automatically.
