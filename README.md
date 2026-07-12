# Metrics Plugin

Analytics and attribution tracking for the Qbix platform. Metrics is self-contained — it has no dependencies on Users, Streams, or any other plugin — but exposes hooks and conventions that other plugins can use to layer on user identity, access control, and referral rewards.

## Core Concepts

Metrics tracks four things: **trackers** (attribution sources), **visits** (browsing sessions), **hits** (individual page views within a visit), and **conversions** (aggregated outcomes sliced by traits).

A **tracker** is a named campaign or link source. It answers "where did traffic come from?" A tracker might represent a specific email blast, a billboard QR code, a social media post, or a referral link. Trackers carry `sentCount` (how many people you sent it to) and `visitsCount` (how many actually showed up).

A **visit** is one browsing session tied to a tracker. When someone arrives at your site via a tracked link, a visit is created, stored in the PHP session, and reused for the duration of that session. Each visit records platform, form factor, IP, and geo data.

A **hit** is a single page view within a visit. Every web request fires the `Q/metrics` after-handler, which records the URL as a hit. Hits carry the `actionId` (URL path), `fromActionId` (previous page), `trackerId`, and optional `finalState` and `extra` fields that can be updated later by client-side code.

An **action** is a canonical URL identity. Long URLs are hashed to fit the 63-byte key limit. Actions have a `canonicalActionId` so that multiple URL variants (with different query strings) can map to the same logical action.

**Traits** are named attribute/value pairs attached to trackers via a join table. A trait might be `name=medium, content=email` or `name=utm_campaign, content=summer2026`. The trait system lets you slice conversion data across arbitrary dimensions without adding columns to the tracker table.

**Conversions** aggregate how many visits from trackers with a given trait hit a given action, plus average time-to-conversion measured both from tracker creation and from visit start.

## Database Schema

### tracker

Primary attribution source. The `id` field is free-form (`varbinary(63)`) and can follow any convention — the comment suggests `publisherId/someName`.

| Column | Type | Purpose |
|---|---|---|
| `id` | varbinary(63) | PK. Can be `publisherId/someName` or any string. |
| `publisherId` | varbinary(31) | The user gathering metrics. |
| `sentCount` | int | Estimated number of people this tracker was sent to. |
| `visitsCount` | int | Total visits from this tracker. |
| `insertedTime` | timestamp | Row creation time. |
| `updatedTime` | timestamp | Last update time. |

### visit

One browsing session, tied to a tracker.

| Column | Type | Purpose |
|---|---|---|
| `id` | varbinary(63) | PK. Auto-generated with `v-` prefix. |
| `trackerId` | varbinary(63) | The tracker that brought this visitor. May also be `visitId:parentVisitId` for visit chaining. |
| `startTime` | timestamp | When the visit began. |
| `lastTime` | timestamp | Last activity time. |
| `lastActionId` | varbinary(63) | The most recent action hit in this visit. |
| `platform` | varbinary(31) | OS/browser platform. |
| `formFactor` | enum | `desktop`, `mobile`, `tablet`, `other`. |
| `IP` | varbinary(255) | IPv4 or IPv6. |
| `countryCode` | varchar(2) | Two-letter country code (from IP geolocation). |
| `postcode` | varchar(20) | Postal code (from IP geolocation). |
| `geonameId` | int | GeoNames ID (from IP geolocation). |

### hit

Individual page view within a visit.

| Column | Type | Purpose |
|---|---|---|
| `visitId` | varbinary(31) | Which visit this hit belongs to. |
| `actionId` | varbinary(63) | The action (URL path) that was visited. |
| `fromActionId` | varchar(63) | The previous action, if any. |
| `trackerId` | varbinary(63) | The tracker, copied from the visit for denormalized querying. |
| `insertedTime` | timestamp | When the hit occurred. |
| `finalState` | varchar(63) | Updated later by client code — e.g. `completed`, `abandoned`, `error`. |
| `extra` | varchar(1023) | JSON payload for error details, metadata, etc. |

### action

Canonical URL identity.

| Column | Type | Purpose |
|---|---|---|
| `id` | varbinary(63) | PK. Derived from the URL path; long paths are truncated + SHA1-hashed. |
| `url` | varbinary(2083) | The original URL. |
| `canonicalActionId` | varbinary(63) | Maps URL variants to one logical action. Derived from the Qbix internal URI. |

### trait

Named attribute values for slicing analytics.

| Column | Type | Purpose |
|---|---|---|
| `id` | varbinary(63) | PK. Synthetic key. |
| `name` | varchar(63) | Trait name — e.g. `platform`, `medium`, `utm_campaign`. |
| `content` | varbinary(63) | Trait value — e.g. `email`, `facebook`, `summer2026`. |
| `sentTotal` | int | Total sentCount across all trackers with this trait. |
| `visitsTotal` | int | Total visits from trackers with this trait. |

### tracker_trait

Join table linking trackers to their traits.

| Column | Type | Purpose |
|---|---|---|
| `trackerId` | varbinary(63) | FK to tracker. |
| `traitId` | varbinary(63) | FK to trait. |

### conversion

Aggregated conversion stats per trait/action pair.

| Column | Type | Purpose |
|---|---|---|
| `traitId` | varbinary(63) | Which trait. |
| `actionId` | varbinary(63) | Which action was hit. |
| `visitsTotal` | int | How many visits from trackers with this trait hit this action. |
| `sinceTracker` | decimal(10,4) | Average seconds from tracker creation to this hit. |
| `sinceVisit` | decimal(10,4) | Average seconds from visit start to this hit. |

## Server-Side Flow

### Automatic hit recording

Every web request triggers `Metrics_after_Q_metrics` (registered in `plugin.json` as an after-handler for `Q/metrics`):

```php
function Metrics_after_Q_metrics()
{
    // reads trackerId from configured querystring fields
    // default config: look for "sourceId" in $_GET or the URI
    $trackerId = /* resolved from $_GET or URI */;
    
    $url = Q_Request::url();
    Metrics_Hit::registerUrl($url, $trackerId);
}
```

`Metrics_Hit::registerUrl` resolves the URL to a `Metrics_Action` (creating one if needed), then calls `Metrics_Hit::register($actionId, $trackerId)`, which:

1. Calls `Metrics_Visit::current($trackerId)` — resumes from session or creates a new visit.
2. Inserts a hit row with `{visitId, actionId, fromActionId, trackerId}`.
3. Updates the visit's `lastActionId` and `lastTime`.

### Explicit landing

The `Metrics/landed` POST handler lets client code explicitly associate a visit with a tracker after page load:

```php
function Metrics_landed_post()
{
    $trackerId = $_POST['trackerId'];
    $visit = Metrics_Visit::current($trackerId);
    if (empty($visit->trackerId)) {
        $visit->trackerId = $trackerId;
        $visit->save();
        Q::event('Metrics/landed/visit/started', ['visit' => $visit]);
    }
    Q_Response::setSlot('visitId', $visit->id);
}
```

This is used for visit chaining (see below) and for cases where the tracker ID isn't in the querystring.

### Hit state updates

The `Metrics/update` POST handler lets client code update the `finalState` and `extra` on a recent hit:

```php
// finds the matching hit among the last 5 for this visit
// updates finalState and/or extra
```

This powers conversion tracking (marking a hit as `completed`, `abandoned`, `step2`, etc.) and error telemetry.

### User activity time

If the Users plugin is loaded, the `Metrics/before/Users_User_lastActiveTime` handler derives user activity from visit data:

```php
function Metrics_before_Users_User_lastActiveTime($params, &$result)
{
    // queries visits by userId prefix in the visit ID
    // returns the lastTime of the most recent visit
}
```

This hook only fires if Users is present — Metrics doesn't require it.

## Client-Side (Metrics.js)

### State tracking

```js
Metrics.setState(state, extra)
```

Debounced (5 seconds) POST to `Metrics/update`. Sets `finalState` and `extra` on the current hit. Use this to mark funnel steps, completion, abandonment, or errors.

### Error telemetry

Metrics.js installs global handlers for `window.error` and `unhandledrejection`. Caught errors are POSTed to `Metrics/update` with `state: 'error'` and a structured payload containing message, stack, URL, user agent, and timestamps.

### Visit chaining

For cross-page or cross-origin attribution, Metrics.js propagates visit IDs via the URL hash fragment `#v=visitId`:

1. On page load, if `#v=parentVisitId` is present, POST to `Metrics/landed` with `trackerId: 'visitId:' + parentVisitId`.
2. The server stores this verbatim as the visit's `trackerId`.
3. `ensureVisitInHash` uses `history.replaceState` to maintain the `#v=` parameter across client-side navigation.
4. The response's `visitId` is written back into the hash for downstream pages.

The `"visitId:"` prefix is a convention, not a parsed protocol. The server stores it as-is. To resolve the chain, use `Metrics_Visit::referringVisitId()`:

```php
/**
 * Gets ID of the referring visit, if any, otherwise ""
 * @return {string}
 */
function referringVisitId() {
    $trackerId = $this->trackerId;
    if (Q::startsWith($trackerId, 'visitId:')) {
        return substr($trackerId, 8);
    }
    return "";
}
```

Walk the chain by following `referringVisitId()` until you reach a visit whose `trackerId` is a real tracker (not a `visitId:` reference). That root tracker is the original attribution source.

## Configuration

In `plugin.json`:

```json
{
    "Metrics": {
        "action": {
            "id": {
                "length": 30
            }
        },
        "querystring": {
            "fields": {
                "trackerId": ["sourceId"]
            }
        },
        "visit": {
            "enrich": {
                "location": true
            }
        }
    }
}
```

`Metrics.querystring.fields.trackerId` is an array of field names to check in `$_GET` (and the Qbix URI) for the tracker ID. Default is `["sourceId"]`, so visitors arrive via `?sourceId=myTracker`.

`Metrics.action.id.length` controls how many characters of the SHA1 hash are used when a URL path exceeds 63 bytes.

## Integration with Other Plugins

### Streams Invites

Metrics trackers and Streams invite tokens serve different purposes — trackers handle attribution, invite tokens handle access grants — but they can work together for tracked invite links.

The tracker's `id` (e.g. `publisherId/poker-night`) becomes the friendly slug in a short URL. The tracker stores or maps to a Streams invite token. On click:

1. The link shortener's resolution handler records the Metrics visit and hit.
2. Redirects to the app URL with `?Streams.token=inviteToken&sourceId=trackerId`.
3. The Streams plugin's `Streams_before_Q_objects` follows the invite token (session storage, auto-login, state checking).
4. `Metrics_after_Q_metrics` fires on the app page and records a second hit under the same tracker.
5. On invite acceptance, `Streams_Invite::accept()` calls `Users_Referred::handleReferral()`, creating the referral chain.

Multiple trackers can point at the same invite (e.g. `publisherId/poker-email` and `publisherId/poker-sms`), which is the whole point of the trait/conversion schema — same destination, different attribution paths answering "which channel converts better?"

### Groups App — Privacy-Preserving Link Tracking

The Groups mobile app rewrites URLs in outbound messages (SMS, email) so clicks can be tracked without exposing contact PII to the server. The architecture uses opaque tokens as the only identifier the server ever sees.

**Token generation is client-side only.** `Groups.Contacts.Tokens.add(contactId)` creates a random opaque token for each contact. The mapping `token → contactId` is stored exclusively in `localStorage['Groups_contacts_tokens']` on the device. The server never receives contact names, phone numbers, email addresses, or contactIds.

**The three-step pipeline:**

1. **`transformBody(body, contactIds, fields, fill)`** — regex-extracts all URLs from the message body. For each URL × contactId pair, generates a token. Calls `suggestLinks()`.

2. **`suggestLinks(payload)`** — PUT to `manageLinksUrl` with `{urls, titles, tokens: tokensByUrl, fields}`. The `tokensByUrl` structure is `{ "https://original.url": ["tok_a", "tok_b", "tok_c"] }` — an array of opaque tokens in contact order. The server sees tokens and URLs but has no way to resolve tokens to people. The server returns `{urls: [rewritten...], hmacs: [...]}` — each original URL replaced with a trackable short URL. The server can create Metrics trackers at this point, attaching traits from `fields`.

3. **`sentLinks({urls, hmacs})`** — POST to `manageLinksUrl` after the message is actually sent. Confirms delivery. Only sends URLs and HMACs (for tamper verification). No contact info.

**When the server sends instructions back** (via push notifications or the update response), it references contacts by token. The app resolves them locally:

```js
const token = contact.encryptedToken || contact.token;
const contactId = Groups.Contacts.byToken?.[token];
if (!contactId) continue; // unknown token → skip
```

The server can say "update the contact with token X" but never "update John Smith" — it doesn't know John Smith exists. This is the core privacy invariant: the server operates on opaque tokens, the device holds the token-to-identity mapping.

The token map survives app reinstalls via the backup/snapshot system (`saveSnapshot` / `loadAndMergeSnapshot` include `Groups_contacts_tokens`).

**Server-side sending** via `processByServer(fields, identifiers, contactIds)` is a separate path for when the server handles SMS/email dispatch directly. In that case the server does receive identifiers (phone numbers, emails) because it needs them to send the messages. This is an explicit trust boundary — the user chooses server-side sending knowing the server sees the recipients.

**Three token types serve distinct roles:**

| Token | Lives in | Purpose |
|---|---|---|
| `trackerId` | Metrics tracker table, visit, hit | Attribution — which campaign/link/channel |
| `inviteToken` | Streams invite table | Access control — grants participation in a stream |
| `contactToken` | Device only (`localStorage`) | Recipient identity — which contact clicked. Server sees the token but cannot resolve it to a person. |

### Users Referrals

Metrics visit chaining (`visitId:parentVisitId` in the `trackerId` field) is the anonymous equivalent of `Users_Referred`. Both track "who/what brought this person here and deserves credit."

| Users_Referred | Metrics visit chain |
|---|---|
| `userId` | child `visitId` |
| `referredByUserId` | parent `visitId` (via `referringVisitId()`) |
| `toCommunityId` | `actionId` on the hit |
| `points` / `qualifiedTime` | `conversion` table aggregates |
| `handleReferral()` resolves chain, awards points | `referringVisitId()` resolves one link; walk to root for full chain |

The difference is that `Users_Referred` requires user identity (login), while Metrics visit chaining works for anonymous visitors. When a visitor later logs in and accepts an invite, the Metrics visit chain and the Users referral chain can be joined — the visit's `trackerId` identifies which tracker (and therefore which referrer) brought them in.