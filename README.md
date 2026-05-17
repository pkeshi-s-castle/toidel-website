## Toidel Catalog Website

Static Hugo catalog website based on the [CloudCannon Fur Hugo template](https://github.com/CloudCannon/fur-hugo-template).

This version supports two checkout paths:

- Local cart with WhatsApp order message
- Optional online payment with Razorpay
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
- Optional description
- One or more pictures

The "Chat on WhatsApp" button is generated automatically per product.

The cart page (`/cart`) lets shoppers review quantities and send a WhatsApp message containing all cart items and total.

## Razorpay Checkout (Optional)

The cart page supports direct Razorpay checkout with D1 order persistence.

Cloudflare Pages environment variables required for Razorpay:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `DB` (D1 binding)
- `ORDER_ADMIN_TOKEN` (for `/admin/orders/` access)

Optional environment variables:

- `RAZORPAY_BRAND_NAME` (default: `Toidel`)
- `RAZORPAY_CHECKOUT_DESCRIPTION` (default: `Cart order payment`)
- `RAZORPAY_RECEIPT_PREFIX` (default: `toidel`)
- `SHIPPING_CHARGE_PAISE` (default: `10000`, i.e. `₹100`)

Implemented Pages Functions:

- `/api/razorpay-order` creates an order in Razorpay
- `/api/razorpay-verify` verifies Razorpay signature after checkout and updates order status
- `/api/razorpay-webhook` validates Razorpay webhooks and idempotently updates order status
- `/api/admin-orders` returns protected order list + summary for admin view
- `/api/admin-order` returns protected per-order detail (items + webhook events)

### D1 Setup

1. Create a D1 database in Cloudflare.
2. Bind it to this Pages project as `DB` (Preview + Production).
3. Apply these schema migrations:
   - `/Users/prakash/github.com/pkeshi-s-castle/toidel-website/migrations/0001_orders.sql`
   - `/Users/prakash/github.com/pkeshi-s-castle/toidel-website/migrations/0002_order_totals.sql`

Example with Wrangler:

```bash
wrangler d1 execute <YOUR_DB_NAME> --remote --file=./migrations/0001_orders.sql
wrangler d1 execute <YOUR_DB_NAME> --remote --file=./migrations/0002_order_totals.sql
```

### Razorpay Webhook Setup

1. In Razorpay Dashboard, configure webhook URL:
   - `https://<your-domain>/api/razorpay-webhook`
2. Use the same secret in Razorpay and `RAZORPAY_WEBHOOK_SECRET`.
3. Subscribe at minimum to:
   - `payment.captured`
   - `order.paid`
   - `payment.failed`
   - `payment.refunded`

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

## Orders Admin View

- URL: `https://<your-domain>/admin/orders/`
- Access token: value from `ORDER_ADMIN_TOKEN` in Cloudflare Pages env vars

This view shows:

- Payment status (`pending`, `paid`, `failed`, `refunded`)
- Customer phone/email + shipping address
- Item rows with quantity and line totals
- Razorpay order/payment references

The checkout flow applies a flat shipping charge (`₹100` by default) to every order and stores `subtotal + shipping + total` in D1.
