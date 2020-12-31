# activitypub-express

[![Build Status](https://travis-ci.com/immers-space/activitypub-express.svg?branch=master)](https://travis-ci.com/immers-space/activitypub-express)

Modular implementation of the ActivityPub decentralized social networking protocol,
written for NodeJS as ExpressJS middleware.
Includes a interchangable storage interface with a default MongoDB implemenation.

## Installation

In order for http request signing to function correctly, a patched version of the `http-signature`
library is required. To ensure that `request` library is using the correct version for its subdependency,
you may need to dedupe after installation.

```
npm install --save activitypub-express
npm dedupe
```

## Usage

```js
const express = require('express')
const { MongoClient } = require('mongodb')
const ActivitypubExpress = require('activitypub-express')

const port = 8080
const app = express()
const routes = {
  actor: '/u/:actor',
  object: '/o/:id',
  activity: '/s/:id',
  inbox: '/u/:actor/inbox',
  outbox: '/u/:actor/outbox',
  followers: '/u/:actor/followers',
  following: '/u/:actor/following',
  liked: '/u/:actor/liked',
  collections: '/u/:actor/c/:id',
  blocked: '/u/:actor/blocked',
  rejections: '/u/:actor/rejections',
  rejected: '/u/:actor/rejected',
  shares: '/s/:id/shares',
  likes: '/s/:id/likes'
}
const apex = ActivitypubExpress({
  domain: 'localhost',
  actorParam: 'actor',
  objectParam: 'id',
  activityParam: 'id',
  routes
})
const client = new MongoClient('mongodb://localhost:27017', { useUnifiedTopology: true, useNewUrlParser: true })

app.use(express.json({ type: apex.consts.jsonldTypes }), apex)
// define routes using prepacakged middleware collections
app.route(routes.inbox)
  .get(apex.net.inbox.get)
  .post(apex.net.inbox.post)
app.route(routes.outbox)
  .get(apex.net.outbox.get)
  .post(apex.net.outbox.post)
app.get(routes.actor, apex.net.actor.get)
app.get(routes.followers, apex.net.followers.get)
app.get(routes.following, apex.net.following.get)
app.get(routes.liked, apex.net.liked.get)
app.get(routes.object, apex.net.object.get)
app.get(routes.activity, apex.net.activityStream.get)
app.get(routes.shares, apex.net.shares.get)
app.get(routes.likes, apex.net.likes.get)
app.get('/.well-known/webfinger', apex.net.webfinger.get)
// custom side-effects for your app
app.on('apex-outbox', msg => {
  if (msg.activity.type === 'Create') {
    console.log(`New ${msg.object.type} from ${msg.actor}`)
  }
})
app.on('apex-inbox', msg => {
  if (msg.activity.type === 'Create') {
    console.log(`New ${msg.object.type} from ${msg.actor} to ${msg.recipient}`)
  }
})

client.connect({ useNewUrlParser: true })
  .then(() => {
    apex.store.db = client.db('DB_NAME')
    return apex.store.setup()
  })
  .then(() => {
    app.listen(port, () => console.log(`apex app listening on port ${port}`))
  })
```

## Implementation status

* [ ] Shared server- & client-to-server
  * [x] Inbox GET
  * [x] Outbox GET
  * [ ] Shared inbox GET
  * [x] Resource GET
    * [x] Object
    * [x] Actor
    * [x] Activity
    * [x] Collections
      * [x] Special collections
        * [x] Inbox
        * [x] Outbox
        * [x] Followers
        * [x] Following
        * [x] Liked
        * [x] Likes
        * [x] Shares
      * [x] Misc collections (of activities)
      * [x] Pagination
    * [ ] Relay requests for remote objects
    * [ ] Response code 410 for Tombstones
  * [ ] Security
    * [ ] Permission-based filtering
* [ ] Server-to-server
  * [x] Inbox POST
    * [x] Activity side-effects
      * [x] Create
      * [x] Update
      * [x] Delete
      * [x] Follow
      * [x] Accept
      * [x] Reject[*](#implementation-notes)
      * [x] Add[*](#implementation-notes)
      * [x] Remove[*](#implementation-notes)
      * [x] Like
      * [x] Announce
      * [x] Undo
        * [ ] Publish affected collection update
      * [x] Other acivity types
    * [x] Security
      * [x] Signature validation
      * [x] Honor recipient blocklist
    * [x] Recursive resolution of related objects
    * [x] Forwarding from inbox
      * [ ] Validation of forwarded messages
  * [ ] Shared inbox POST
    * [ ] Delivery to targeted local inboxes
  * [x] Delivery
    * [x] Request signing
    * [x] Addressing
      * [ ] Shared inbox optmization
      * [ ] Direct delivery to local inboxes
    * [x] Redelivery attempts
* [ ] Client-to-server
  * [x] Outbox POST
    * [x] Auto-Create for bare objects
    * [ ] Activity side-effects
      * [x] Create
      * [x] Update
        * [ ] Add prior recipients of updated object to federation audience
      * [x] Delete
      * [x] Follow
      * [x] Accept
      * [x] Reject
      * [x] Add
      * [x] Remove
      * [x] Like
      * [x] Block[*](#implementation-notes)
      * [x] Undo
        * [ ] Publish affected collection update
      * [x] Other acivity types
  * [ ] Media upload
* [ ] Other
  * [x] Actor creation
    * [x] Key generation
  * [ ] Security
    * [ ] Verification
    * [ ] Rate limits
    * [ ] localhost block
    * [ ] Content sanitization
    * [x] Recursive object resolution depth limit
  * [ ] Related standards
    * [x] http-signature
    * [x] webfinger
    * [ ] oauth
    * [x] json-ld
      * [ ] Context cache
    * [ ] Linked data signatures
  * [x] Storage model (denormalized MongoDB)
    * [ ] Index coverage for all queries
    * [ ] Fully interchangable with documented API

### Implementation notes

* Inbox Add/Remove: I don't see a general purpose
(i.e. a remote actor being able to modify local collections);
specific uses can be added in the implementation via the event handler.

* Reject: Activity is added to the actor's rejected (outbox) or rejection (inbox) collection.
If the object is a Follow that was previously accepted, this will also remove it from
the followers (outbox) or following (inbox) collection.

* Block: Activity is added to the actor's blocked collection.
Per spec, future activities from blocked actors will be silently ignored.
Additionally, past activitities will be filtered from display in the inbox and followers
collections, but they are not permanetly deleted, so they would re-appear after undo of block.

## API

### ActivitypubExpress initializer

Configures and returns an express middleware function that must be added to the route
before any other apex midddleware. It needs to be configured with the routes you will use
in order to correctly generate IRIs and actor profiles

```
const ActivitypubExpress = require('activitypub-express')
const apex = ActivitypubExpress(options)
app.use(apex)
```

Option | Description
--- | ---
**Required** |
domain | String. Hostname for your app
actorParam | String. Express route parameter used for actor name
objectParam | String. Express route parameter used for object id
routes | Object. The routes your app uses for ActivityPub endpoints (including parameter). Details below
routes.actor | Actor profile route & IRI pattern
routes.object | Object retrieval route & IRI pattern
routes.activity | Activity retrieval route & IRI pattern
routes.inbox | Actor inbox route
routes.outbox | Actor outbox route
routes.following | Actor following collection route
routes.followers | Actor followers collection route
routes.liked | Actor liked collection route
routes.blocked | Actor's blocklist
routes.rejected | Activities rejected by actor
routes.rejections | Actor's activities that were rejected by recipient
routes.shares | Activity shares collection route
routes.likes | Activity likes collection route
routes.collections | Actors' miscellaneous collections route (must include `actorParam` and `collectionParam`)
**Optional** |
activityParam | String. Express route parameter used for activity id (defaults to `objectParam`)
collectionParam | String. Express route parameter used for collection id (defaults to `objectParam`)
pageParam | String. Query parameter used for collection page identifier (defaults to `page`)
itemsPerPage | Number. Count of items in each collection page (default `20`)
context | String, Array. JSON-LD context for your app. Defaults to AcivityStreams + Security vocabs
store | Replace the default storage model & database backend with your own (see `store/interface.js` for API)
threadDepth | Controls how far up apex will follow links in incoming activities in order to display the conversation thread & check for inbox forwarding needs  (default 10)
systemUser | Actor object representing system and used for signing GETs (see below)

Blocked, rejections, and rejected: these routes must be defined in order to track
these items internally for each actor, but they do not need to be exposed endpoints
(and probably should not be public even then)

### System User / GET authentication

Some federated apps may require http signature authentication on GET requests.
To enable this functionality, set the `systemUser` property on your apex instance
equal to an actor created with `createActor` (generally of type 'Service')
and saved to your object store.
Its keys will be used to sign all federated object retrieval requests.
This property can be set after initializing your apex instance, as
you will need access to the `createActor` method and a database connection.

```
const ActivitypubExpress = require('activitypub-express')
const apex = ActivitypubExpress(options)
// ... connect to db
apex.createActor('system-user', 'System user', '', null, 'Service')
  .then(async actor => {
    await apex.store.saveObject(actor)
    apex.systemUser = actor
  })
```


## FAQ

Q: How do I resolve this error seen when receiving/delivering activities or running the federation tests: `Uncaught exception: InvalidHeaderError: bad param format`

A: Run `npm dedupe` to ensure `request` library is using the patched version of `http-signature` library.
