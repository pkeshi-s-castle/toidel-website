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

- Name
- Description
- Optional price display
- Multiple style images and colors

The "Chat on WhatsApp" button is generated automatically per product.
