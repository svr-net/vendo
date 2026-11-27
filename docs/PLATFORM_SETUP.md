# Connecting real ad platforms

Vendo connects to each platform with OAuth 2.0. For each platform you (the person running Vendo) create **one developer app** and put its credentials in `.env`. Your users then click **Connect** and sign in with their own ad accounts.

For every platform, the redirect URI is:

```
{PUBLIC_BASE_URL}/oauth/{platform}/callback
# e.g. https://ads.example.com/oauth/meta/callback
```

The Connect page shows the exact URI for each platform under *Developer setup*.

> Media: TikTok and Pinterest **download** creatives by URL. If users upload files to Vendo, `PUBLIC_BASE_URL` must be reachable from the internet. Otherwise use public image and video URLs.

---

## Meta (Facebook & Instagram)

1. Go to <https://developers.facebook.com/apps> and create an app of type **Business**.
2. Add the **Marketing API** and **Facebook Login for Business** products.
3. Under *Facebook Login → Settings*, add the redirect URI.
4. Permissions requested: `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_ads`. Admins and testers of the app can use them straight away. Other users need **Advanced Access** through App Review, plus Business Verification.
5. Set the following in `.env`:
   ```
   META_APP_ID=...
   META_APP_SECRET=...
   META_API_VERSION=v23.0
   ```

Notes:
- Vendo exchanges the code for a **long-lived (~60 day) token**. When it expires, users reconnect.
- The user must pick a **Facebook Page**. Ads run under its name, and on Instagram as the linked account.
- Leads and sales objectives use `OFFSITE_CONVERSIONS` with the selected pixel.

## Google Ads

1. You need a **Google Ads manager (MCC) account**. Go to *Tools → API Center* and request a **developer token**. A new token only works with test accounts until Google approves *Basic Access*.
2. In the Google Cloud Console, enable the **Google Ads API** and create an **OAuth client ID** (type *Web application*). Add the redirect URI.
3. Set the following in `.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_ADS_DEVELOPER_TOKEN=...
   GOOGLE_ADS_LOGIN_CUSTOMER_ID=   # optional: MCC id (no dashes) if users reach accounts through it
   GOOGLE_ADS_API_VERSION=v21
   ```

Notes:
- Scope `https://www.googleapis.com/auth/adwords`, with `access_type=offline`. Vendo refreshes access tokens automatically.
- Vendo creates **Search** campaigns using *Maximize clicks*, or *Maximize conversions* when the user confirms conversion tracking is set up. Keywords use phrase match.

## TikTok

1. Register at <https://business-api.tiktok.com/portal> and create a developer app.
2. Request these scopes: Ad Account Management, Ads Management, Creative Management, Reporting, and Pixel Management (optional).
3. Set the **Advertiser redirect URL** to the redirect URI.
4. Set the following in `.env`:
   ```
   TIKTOK_APP_ID=...
   TIKTOK_APP_SECRET=...
   ```

Notes:
- Long-term access tokens don't expire unless the user revokes them.
- Ads are single vertical videos with a cover image and a custom identity (brand name). The minimum ad group budget is about 20 USD per day.

## LinkedIn

1. Create an app at <https://www.linkedin.com/developers/apps> and verify it with your Company Page.
2. Request the **Advertising API** product. The *Development tier* is enough to manage ad accounts you have access to.
3. Add the redirect URI under *Auth*.
4. Scopes requested: `r_ads`, `rw_ads`, `r_ads_reporting`, `r_organization_social`, `w_organization_social`.
5. Set the following in `.env`:
   ```
   LINKEDIN_CLIENT_ID=...
   LINKEDIN_CLIENT_SECRET=...
   LINKEDIN_API_VERSION=202510   # YYYYMM; LinkedIn supports roughly the last 12 months
   ```

Notes:
- Access tokens last 60 days. Refresh tokens are only issued to approved partners. Without one, users reconnect.
- Ads are "dark" sponsored posts by the Company Page that the ad account references.

## Pinterest

1. Create an app at <https://developers.pinterest.com/apps/> (this needs a Pinterest business account).
2. Request **Standard access** with the scopes `ads:read`, `ads:write`, `boards:read`, `boards:write`, `pins:read`, `pins:write`, `user_accounts:read`.
3. Add the redirect URI.
4. Set the following in `.env`:
   ```
   PINTEREST_APP_ID=...
   PINTEREST_APP_SECRET=...
   ```

Notes:
- Vendo refreshes access tokens automatically using the refresh token.
- Every ad promotes a new Pin that Vendo creates on the board the user selects.

---

## Troubleshooting

- **Exact platform errors**: open the campaign, expand *Launch log & API calls*, and open the failed step. It shows the request body and the platform's full error response.
- **Retry**: fix the cause (on the Connect page, or by duplicating the campaign with edits), then press *Retry launch*. Objects that were already created are reused.
- **Currency**: budgets are sent in the ad account's currency. Pick the matching currency in the wizard.
