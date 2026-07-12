# Metrics Plugin — LLM Coding Primer

Supplement to the Q Framework primer. Covers anonymous attribution tracking:
trackers, visits, hits, actions, traits, conversions, visit chaining, and
error telemetry. No dependency on Users or Streams — Metrics runs standalone.

---

## 1. Automatic Hit Recording

Every web request is tracked automatically. The `Q/metrics` after-handler fires
on every `Q_WebController` request:

```php
// This runs automatically — you don't call it.
// Reads trackerId from $_GET['sourceId'] (configurable),
// resolves URL to a Metrics_Action, records a Metrics_Hit
// under the current Metrics_Visit (creating one if needed).
```

Visitors arrive with a tracker via querystring: `?sourceId=myTracker`.
The field name is configurable:

```json
{
    "Metrics": {
        "querystring": {
            "fields": {
                "trackerId": ["sourceId"]
            }
        }
    }
}
```

Multiple field names can be listed — the first non-empty match wins.
Both `$_GET` and the Qbix internal URI (`Q_Dispatcher::uri()`) are checked.

---

## 2. Trackers

A tracker is a named attribution source — a campaign, a link, a QR code.

```php
// Create a tracker
$tracker = new Metrics_Tracker();
$tracker->id = 'greg/poker-night';      // free-form varbinary(63)
$tracker->publisherId = $userId;         // who owns this tracker
$tracker->sentCount = 50;                // how many people you sent it to
$tracker->visitsCount = 0;               // auto-incremented as visits arrive
$tracker->save();

// Retrieve
$tracker = new Metrics_Tracker();
$tracker->id = 'greg/poker-night';
if ($tracker->retrieve()) {
    $visits = $tracker->visitsCount;
}
```

The `id` field is free-form. Convention is `publisherId/someName` but any
string up to 63 bytes works.

---

## 3. Visits

A visit is one browsing session. Stored in `$_SESSION` and reused for the
duration of the PHP session.

```php
// Get or create the current visit (usually called internally)
$visit = Metrics_Visit::current($trackerId);
// If no visit exists in session, creates one with auto-generated id (prefix 'v-')
// If visit exists, returns it (ignores $trackerId — first one wins)

// Check current visit ID from session without creating
$id = Metrics_Visit::currentId();  // string or null

// Visit chaining — resolve parent visit
$parentId = $visit->referringVisitId();
// Returns the parent visitId if trackerId starts with "visitId:", else ""
```

Visit IDs are auto-generated in `beforeSave` via `Metrics::db()->uniqueId()`
with a `v-` prefix. The `Metrics/Visit/id` before-event lets other plugins
transform the ID (e.g. Users might prepend the logged-in userId).

### Fields populated automatically on creation

```php
$visit->platform;    // Q_Request::platform()
$visit->formFactor;  // Q_Request::formFactor() — 'desktop','mobile','tablet','other'
$visit->IP;          // Q_Request::ip()
// Geo fields (countryCode, postcode, geonameId) are TODO stubs
```

---

## 4. Hits

A hit is a single page view within a visit.

```php
// Register a hit from a URL (resolves to action, records hit)
$hit = Metrics_Hit::registerUrl($url, $trackerId);

// Register a hit from an action ID directly
$hit = Metrics_Hit::register($actionId, $trackerId);

// Both methods:
// 1. Call Metrics_Visit::current($trackerId) — resumes or creates visit
// 2. Insert hit row with {visitId, actionId, fromActionId, trackerId}
// 3. Update visit's lastActionId and lastTime
```

The hit's `fromActionId` is the visit's `lastActionId` at the time of recording —
giving you a page-to-page navigation chain within each visit.

---

## 5. Actions

An action is a canonical URL identity.

```php
// Resolve URL to action (creates if new)
$action = Metrics_Action::fromUrl($url);
// Sets $action->id (path-based), $action->url, $action->canonicalActionId (from Q_Uri)

// Compute action ID from URL without database lookup
$id = Metrics_Action::idFromUrl($url);
// If path ≤ 63 bytes: returns path as-is
// If path > 63 bytes: truncates + appends SHA1 hash suffix

// Compute action ID from internal URI
$id = Metrics_Action::idFromUri($uri);
// Same truncation logic as idFromUrl

// Hash suffix length is configurable:
// "Metrics": { "action": { "id": { "length": 30 } } }
```

The `canonicalActionId` maps URL variants (different query strings) to the
same logical action. It's derived from the Qbix internal URI (`Q_Uri::from()`).

---

## 6. Traits & Tracker-Trait Join

Traits are named attribute/value pairs for slicing analytics across dimensions.

```php
// Create a trait
$trait = new Metrics_Trait();
$trait->id = 'medium_email';             // synthetic key
$trait->name = 'medium';                 // trait name
$trait->content = 'email';               // trait value
$trait->sentTotal = 0;
$trait->visitsTotal = 0;
$trait->save();

// Attach trait to tracker
$tt = new Metrics_TrackerTrait();
$tt->trackerId = 'greg/poker-night';
$tt->traitId = 'medium_email';
$tt->save();

// Query: which trackers used email as medium?
$rows = Metrics_TrackerTrait::select()
    ->where(array('traitId' => 'medium_email'))
    ->fetchDbRows();

// Query: what traits does a tracker have?
$rows = Metrics_TrackerTrait::select()
    ->where(array('trackerId' => 'greg/poker-night'))
    ->fetchDbRows();
```

---

## 7. Conversions

Aggregated conversion stats per trait/action pair.

```php
// Read conversion data
$conv = new Metrics_Conversion();
$conv->traitId = 'medium_email';
$conv->actionId = '/signup';
if ($conv->retrieve()) {
    $totalVisits = $conv->visitsTotal;       // visits from email trackers that hit /signup
    $avgFromTracker = $conv->sinceTracker;   // avg seconds from tracker creation to this hit
    $avgFromVisit = $conv->sinceVisit;       // avg seconds from visit start to this hit
}

// Query: best-converting traits for an action
$convs = Metrics_Conversion::select()
    ->where(array('actionId' => '/signup'))
    ->orderBy('visitsTotal', false)
    ->fetchDbRows();
```

Note: conversion rows are not auto-populated — you write the aggregation
logic yourself, typically in a cron job or an event handler.

---

## 8. Client-Side API (Metrics.js)

### State tracking

```javascript
// Mark current hit with a state (debounced 5s, then POSTs to Metrics/update)
Metrics.setState('completed', { score: 42 });
Metrics.setState('abandoned');
Metrics.setState('step2', { formField: 'email' });
Metrics.setState('error', { message: 'something broke' });
```

The POST sends `{navigatorUrl, url, state, extra}`. The server matches
against the last 5 hits for the current visit by `actionId` and updates
`finalState` and `extra`.

### Visit chaining

```javascript
// Automatic: if URL contains #v=parentVisitId, Metrics.js POSTs to
// Metrics/landed with trackerId: 'visitId:' + parentVisitId
// The response's visitId is written back into the hash for downstream pages.

// To propagate a visit ID into a link you're building:
var link = 'https://other-site.com/page#v=' + currentVisitId;
```

### Error telemetry

Global handlers for `window.error` and `unhandledrejection` are installed
automatically. Errors POST to `Metrics/update` with `state: 'error'` and
a structured payload containing message, stack, URL, userAgent, and timestamps.

---

## 9. Server-Side Handlers

### Metrics/landed (POST)

Explicit landing attribution. Called by client code when the tracker
isn't in the querystring (e.g. visit chaining via hash fragment).

```php
// Requires: $_POST['trackerId']
// Gets/creates visit via Metrics_Visit::current($trackerId)
// If visit had no trackerId, sets it and fires event:
Q::event('Metrics/landed/visit/started', array('visit' => $visit));
// Returns: slot 'visitId' => $visit->id
```

### Metrics/update (POST)

Updates `finalState` and/or `extra` on a recent hit.

```php
// Fields: url, navigatorUrl, state, extra
// Finds matching hit among last 5 for current visit (by actionId)
// Updates finalState and extra on that hit
// Returns: slots 'updated' => bool, 'hitId' or 'error'
```

### Metrics/before/Users_User_lastActiveTime

Optional hook — only fires if Users plugin is loaded. Derives user
activity time from visit data by querying visits whose ID starts with
`userId;` (assumes visit ID was prefixed by Users plugin via the
`Metrics/Visit/id` before-event).

---

## 10. Events

```php
// Visit ID generation — lets other plugins transform the auto-generated ID
// e.g. Users plugin might prepend userId
Q::event('Metrics/Visit/id', array(), 'before');
// Return value replaces the generated ID

// New visit started via explicit landing
Q::event('Metrics/landed/visit/started', array('visit' => $visit));
```

---

## 11. Configuration

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

| Key | Purpose |
|---|---|
| `action.id.length` | SHA1 hash suffix length when URL path exceeds 63 bytes. Default 30. |
| `querystring.fields.trackerId` | Array of `$_GET` field names to check for tracker ID. Default `["sourceId"]`. |
| `visit.enrich.location` | Whether to geo-enrich visits (stub — needs Places_IP2Location). |

Plugin registration in `Q.pluginInfo`:

```json
{
    "Metrics": {
        "version": "0.8",
        "requires": { "Q": "1.0" },
        "connections": ["Metrics"]
    }
}
```

No dependency on Users, Streams, or any other plugin.

---

## 12. Visit Chaining

For cross-page or cross-origin attribution where the tracker can't be passed
as a querystring parameter:

```
Page A (tracked link)  →  redirect  →  Page B (app page)
       visit 1                              visit 2
    trackerId: "greg/poker"              trackerId: "visitId:v-a8f3kx"
```

Page B includes `#v=visit1Id` in the redirect URL. Metrics.js picks it up
and POSTs to `Metrics/landed` with `trackerId: 'visitId:' + visit1Id`.
The server stores this verbatim. To resolve the chain:

```php
// Walk the chain to find the root tracker
$visit = new Metrics_Visit(array('id' => $visitId));
$visit->retrieve();
while ($parentId = $visit->referringVisitId()) {
    $visit = new Metrics_Visit(array('id' => $parentId));
    if (!$visit->retrieve()) break;
}
// $visit->trackerId is now the original attribution source
```

This is the anonymous equivalent of `Users_Referred`. When used with
Streams invites, the Metrics chain provides attribution while the invite
token provides access control.

---

## 13. Key Schema

### metrics_tracker
```sql
id             varbinary(63)   PK   -- free-form, e.g. "publisherId/someName"
publisherId    varbinary(31)        -- who owns this tracker
sentCount      int                  -- estimated recipients
visitsCount    int                  -- total visits from this tracker
insertedTime   timestamp
updatedTime    timestamp       NULL
```

### metrics_visit
```sql
id             varbinary(63)   PK   -- auto-generated, prefix "v-"
trackerId      varbinary(63)        -- tracker that brought this visitor, or "visitId:parentId"
startTime      timestamp       NULL
lastTime       timestamp       NULL
lastActionId   varbinary(63)        -- most recent action hit
platform       varbinary(31)        -- OS/browser
formFactor     enum('desktop','mobile','tablet','other')
IP             varbinary(255)       -- IPv4 or IPv6
countryCode    varchar(2)      NULL
postcode       varchar(20)     NULL
geonameId      int             NULL
```

### metrics_hit
```sql
visitId        varbinary(31)        -- which visit
actionId       varbinary(63)        -- URL path / action
fromActionId   varchar(63)     NULL -- previous action in this visit
trackerId      varbinary(63)        -- denormalized from visit
insertedTime   timestamp       NULL
finalState     varchar(63)     NULL -- e.g. 'completed', 'abandoned', 'error'
extra          varchar(1023)   NULL -- JSON payload
```
Indexed on: `(visitId, insertedTime)`, `(actionId, visitId)`, `fromActionId`,
`trackerId`, `insertedTime`.

### metrics_action
```sql
id                varbinary(63)   PK   -- derived from URL path
url               varbinary(2083) NULL -- original URL
canonicalActionId varbinary(63)        -- maps variants to one logical action
```

### metrics_trait
```sql
id             varbinary(63)   PK   -- synthetic key
name           varchar(63)          -- trait name: 'medium', 'utm_campaign', etc.
content        varbinary(63)        -- trait value: 'email', 'summer2026', etc.
sentTotal      int                  -- aggregate across trackers with this trait
visitsTotal    int                  -- aggregate visits
insertedTime   timestamp
updatedTime    timestamp       NULL
```

### metrics_tracker_trait
```sql
trackerId      varbinary(63)   PK   -- FK to tracker
traitId        varbinary(63)   PK   -- FK to trait
insertedTime   timestamp
updatedTime    timestamp       NULL
```

### metrics_conversion
```sql
traitId        varbinary(63)   PK   -- which trait
actionId       varbinary(63)   PK   -- which action was hit
visitsTotal    int                  -- visits from trackers with this trait hitting this action
sinceTracker   decimal(10,4)        -- avg seconds from tracker creation to hit
sinceVisit     decimal(10,4)        -- avg seconds from visit start to hit
insertedTime   timestamp
updatedTime    timestamp       NULL
```

---

## 14. Common Patterns

```php
// Track a custom action (not just page views)
Metrics_Hit::register('checkout/complete', $trackerId);

// Create a tracked short link
$tracker = new Metrics_Tracker();
$tracker->id = $publisherId . '/' . $slug;
$tracker->publisherId = $publisherId;
$tracker->sentCount = count($recipients);
$tracker->save();
// Build URL: https://yoursite.com/landing?sourceId=publisherId/slug

// Attach traits for later slicing
$trait = new Metrics_Trait();
$trait->id = 'medium_sms';
$trait->name = 'medium';
$trait->content = 'sms';
$trait->save(true);  // upsert

$tt = new Metrics_TrackerTrait();
$tt->trackerId = $tracker->id;
$tt->traitId = $trait->id;
$tt->save();

// Query all visits from a tracker
$visits = Metrics_Visit::select()
    ->where(array('trackerId' => $tracker->id))
    ->orderBy('startTime', false)
    ->fetchDbRows();

// Query hit funnel for a visit
$hits = Metrics_Hit::select()
    ->where(array('visitId' => $visit->id))
    ->orderBy('insertedTime', true)
    ->fetchDbRows();
```

---

## 15. Common Mistakes

| Wrong | Right |
|-------|-------|
| Passing trackerId after visit already started | `Metrics_Visit::current()` ignores trackerId if visit exists in session — first call wins |
| Expecting hit PK to be a single column | Hit PK is composite `(visitId, insertedTime)` — there is no auto-increment `id` |
| Querying hits by `canonicalActionId` | Hits store `actionId` (the raw path), not `canonicalActionId` — join through `metrics_action` to group by canonical |
| Updating `metrics_conversion` rows directly without averaging | `sinceTracker` and `sinceVisit` are running averages — use `(old * n + new) / (n+1)` |
| Assuming visit geo fields are populated | `countryCode`, `postcode`, `geonameId` are stubs — need Places_IP2Location integration |
| Relying on `#v=` hash for server-side logic | Hash fragments are never sent to the server — the client-side JS must POST to `Metrics/landed` |
| Creating trackers with IDs > 63 bytes | `tracker.id` is `varbinary(63)` — will silently truncate |