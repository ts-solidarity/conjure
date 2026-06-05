# conjure

CLI for chatting with **Gemini** — and generating images — by driving its web interface with a headless browser, using your logged-in session (no Google API key). Ask a question, get the reply in your terminal; ask for an image, get a PNG. It can also run as a small local **API server** that puts your subscription chats behind your *own* API keys.

## Setup

```
git clone https://github.com/wleeaf/conjure.git
cd conjure
./setup
```

This creates a Python venv, installs [cloakbrowser](https://pypi.org/project/cloakbrowser/) (which bundles Playwright) with Chromium, and symlinks `conjure` into `~/.local/bin/`.

### First run — log in

Log in once; the session is saved to `~/.config/conjure/` and reused for future headless runs:

```
conjure login gemini
```

This opens a visible browser window — log in normally, then it's saved.

## Chatting

A bare prompt starts a **new** Gemini chat and prints the reply, followed by the conversation id:

```
$ conjure "what is the capital of France?"
The capital of France is Paris.

[chat d1a5c0b7b87b0468]  continue with:  conjure chat -c d1a5c0b7b87b0468 "..."
```

**Continue** a conversation with `-c <id>` (the id from any earlier reply, or from `conjure chats`):

```
conjure -c d1a5c0b7b87b0468 "and its population?"
```

**List** your recent conversations (id + title), scraped from the Gemini sidebar:

```
$ conjure chats
Recent Gemini conversations (10):

  d1a5c0b7b87b0468  Capital of France Identified
  c7cd58c0c6b5f2ab  Create an image of a single red bicycle
  ...
```

If a reply contains images, they're downloaded to the current directory automatically (named from the message + timestamp).

## Images

```
conjure image "a samurai cat standing in the rain"
conjure image --edit photo.png "make the sky purple"
```

Image generation defaults to Gemini; add `--chatgpt` to use ChatGPT instead. The PNG is saved to your current directory, named from the prompt and timestamp (e.g. `a-samurai-cat-standing-in-the-rain-20260328-200143.png`).

> Chat (`chat`/`chats`) is **Gemini-only**. Image generation works on both Gemini (default) and ChatGPT (`--chatgpt`).

## API server

Run conjure as a small **local HTTP API** over a single *warm* browser session — one Chromium launch, reused for every request (no per-call cold start). You mint conjure's own API keys; clients use them to talk to your Gemini subscription.

Mint a key (the raw token is shown once), then start the server:

```
$ conjure key new my-app
New API key — shown once, store it now:

    cjr_8f3a…

$ conjure serve                 # http://127.0.0.1:8765  (localhost only)
$ conjure serve --port 9000
```

`conjure key list` shows labels + prefixes; `conjure key revoke <label>` removes one.

Call it with the key:

```
# new chat (or continue by passing conversation_id)
curl -s localhost:8765/chat -H "Authorization: Bearer cjr_…" \
     -d '{"message": "what is the capital of France?"}'
# → {"reply": "...", "conversation_id": "d1a5…", "images": ["<base64 png>"]}

curl -s localhost:8765/chats  -H "Authorization: Bearer cjr_…"
curl -s localhost:8765/health         # {"ok": true} — no auth
```

| method | path | body | returns |
|---|---|---|---|
| POST | `/chat` | `{message, conversation_id?}` | `{reply, conversation_id, images[]}` — images base64 PNG |
| GET | `/chats` | — | `{conversations: [{id, title}]}` |
| GET | `/health` | — | `{ok: true}` — no auth |

Keys are stored **hashed** in `~/.config/conjure/api_keys.json`. Requests serialize through the one browser (one op at a time) and are rate-limited.

> ⚠️ The server reuses your Gemini **subscription** session for every request — the same session conjure already uses, but as a service the volume is higher. Keep it **localhost-only**, and consider holding the subscription on a **secondary Google account** so a restriction never touches your primary identity.

## How it works

1. Launches a headless Chromium instance via cloakbrowser with a persistent profile (your session cookies).
2. For a new chat it starts fresh; to continue, it navigates to the conversation's `…/app/<id>` URL, which rehydrates the history.
3. Submits the message, waits for the response to complete (stop-button detection + content stability), and reads the reply text.
4. Downloads any images in the reply via an in-page `fetch()` (falling back to the native download button / canvas capture).

## Troubleshooting

conjure drives the live Gemini web UI, so a layout change upstream can break it. Two tools help you find out *what* broke.

**Health check** — verify setup and that the page selectors still resolve, without sending anything:

```
conjure doctor            # check every configured service
conjure doctor gemini     # check just one
```

It reports whether dependencies are installed, whether you're logged in, and whether the critical selectors (prompt input, new-chat, send button) still match. A `✗` on a selector means that service changed its markup and the matching entry in the `SERVICES` table in `conjure` needs updating. Selectors that only exist mid-run (stop button, response container, conversation list) are listed but verified only during real use.

**Verbose trace** — print each step as it happens (works with any command):

```
conjure -v "a cat in a top hat"
```

When a run fails, conjure writes a diagnostics bundle — screenshot, page HTML, and live selector counts — to `~/.config/conjure/debug/<timestamp>/` and prints the path. The bundle lives under the config dir rather than your working directory because the HTML contains your account name and conversation history.

**Exit codes:** `0` success · `1` unexpected or setup error · `2` quota hit · `3` a page step failed (likely a changed selector) · `4` no image produced (image command).

## Requirements

- Python 3.10+
- A Google account (and, optionally, a ChatGPT account for `image --chatgpt`)
```
