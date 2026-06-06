# ✦ conjure

**Use your Gemini subscription from your terminal, your scripts, and a local web app — no Google API key.**

conjure drives the Gemini web app through a headless browser using your logged-in session, and exposes it three ways: a **CLI**, a Gemini-style **web UI**, and a small **HTTP API** secured by keys *you* mint. Ask a question and get the reply; ask for an image and get a PNG; attach files; browse and continue your real conversations.

```
conjure "what is the capital of France?"     # CLI: one-shot chat
conjure serve                                 # Web UI + API at http://127.0.0.1:8765
```

## Features

- 💬 **Chat** — start new chats, continue any conversation by id, list your history
- 🖼 **Images & files** — generate images in chat (saved locally), and attach images/files to your messages
- 🪟 **Web UI** — a Gemini-shaped local app: conversation sidebar, inline images, attachments, live titles, key management
- 🔌 **HTTP API** — `POST /chat` and friends behind conjure-issued API keys, for your own apps and scripts
- 🩺 **Diagnostics** — `conjure doctor` health check + automatic debug bundles (it rides the live web UI, so things can shift)
- 🔒 **Your session, your machine** — no API key, no third party; everything runs on localhost

## Setup

```
git clone https://github.com/wleeaf/conjure.git
cd conjure
./setup
```

`setup` creates a Python venv, installs [cloakbrowser](https://pypi.org/project/cloakbrowser/) (which bundles Playwright + Chromium), and symlinks `conjure` into `~/.local/bin/`.

**Log in once** (a visible browser opens; sign in normally — the session is saved to `~/.config/conjure/` and reused headlessly):

```
conjure login gemini
```

## Web UI

```
conjure serve            # then open http://127.0.0.1:8765
```

A familiar chat interface with a distinct identity: a sidebar of your conversations (new / open / continue), messages with inline images, a `+` to **attach images or files**, conversation titles that fill in automatically, and an API-keys panel. It's served over a single *warm* browser session and talks to the same-origin API; localhost is trusted, so the UI itself needs no key.

## CLI

A bare prompt is a **new** chat; the reply prints with the conversation id:

```
$ conjure "what is the capital of France?"
The capital of France is Paris.

[chat d1a5c0b7b87b0468]  continue with:  conjure chat -c d1a5c0b7b87b0468 "..."
```

```
conjure -c <id> "and its population?"     # continue a conversation
conjure chats                              # list recent conversations (id + title)
conjure image "a samurai cat in the rain" # (see Images below)
conjure doctor                             # health check
conjure -v "..."                           # verbose step trace
```

Images in a reply are saved to the current directory automatically, named from the message + timestamp.

## Images

The reliable way to make an image on Gemini is to **ask in a chat** — replies with images are saved automatically (and the API returns them as base64):

```
conjure "create an image of a samurai cat standing in the rain"
# → create-an-image-of-a-samurai-cat-20260328-200143.png
```

There's also a one-shot `conjure image "…"` / `conjure image --edit photo.png "…"`, but its **Gemini** path is currently unreliable — prefer asking in a chat (the command works with `--chatgpt`).

## HTTP API

`conjure serve` exposes a localhost API over the warm browser. Mint a key for *external* clients (the local UI needs none):

```
$ conjure key new my-app          # prints the token once
$ conjure key list                # labels + prefixes
$ conjure key revoke my-app
```

Call it (`Authorization: Bearer cjr_…` required only from non-localhost):

```
curl -s localhost:8765/chat -H "Authorization: Bearer cjr_…" \
     -d '{"message":"what is the capital of France?"}'
# → {"reply":"…","conversation_id":"d1a5…","images":["<base64 png>"],"title":"…"}
```

| method | path | body | returns |
|---|---|---|---|
| `POST` | `/chat` | `{message, conversation_id?, file?: {name, data}}` | `{reply, conversation_id, images[], title}` |
| `GET` | `/chats` | — | `{conversations: [{id, title}]}` |
| `GET` | `/chats/{id}` | — | `{messages: [{role, text, images[], files[]}]}` |
| `GET` | `/health` | — | `{ok: true}` (no auth) |
| `GET·POST·DELETE` | `/keys` | `{label}` on POST | key management (**localhost only**) |

`file.data` is base64; images come back as base64 PNG. Keys are stored **hashed** in `~/.config/conjure/`. Requests serialize through the one browser and are rate-limited.

> ⚠️ The server reuses your Gemini **subscription** session. Keep it **localhost-only**, and consider holding the subscription on a **secondary Google account** so a problem never touches your primary identity.

## How it works

1. Launches one headless Chromium via cloakbrowser with a persistent profile (your session cookies); `serve` keeps it **warm** so every request reuses it (no per-call cold start).
2. New chat → fresh page; continue → navigate to the conversation's `…/app/<id>` URL, which rehydrates history.
3. Sends the message and waits for completion by watching Gemini's **stop button** (present while generating, gone when done).
4. Reads the reply (stripping source-citation chips), and harvests images — AI-generated images via canvas, user uploads via Playwright's request API (cross-origin).

## Troubleshooting

Because conjure drives the live web UI, an upstream layout change can break it. Two tools tell you *what* broke:

```
conjure doctor [gemini]     # deps, login state, and whether the key selectors still resolve
conjure -v "..."            # step-by-step trace to stderr
```

On any failure, conjure writes a debug bundle — screenshot, page HTML, live selector counts — to `~/.config/conjure/debug/<timestamp>/` (under the config dir, not your cwd, since the HTML holds account/conversation data). A `✗` on a static selector means update the `SERVICES` table in `conjure`.

**Exit codes:** `0` ok · `1` setup/unexpected · `2` quota · `3` a page step failed (likely a changed selector) · `4` no image produced.

## Limitations

- **Model selection, extended thinking, and streaming** aren't wired yet — they need driving Gemini's own in-page controls (reachable, planned).
- **`conjure image` on Gemini** is flaky; ask in a chat instead.
- **Images in *reopened* chats** are best-effort (older lazy-loaded thumbnails may not appear).
- One warm browser means requests **serialize** (one at a time); it's tuned for a single user.
- It automates a third-party UI with your session — inherently against Gemini's ToS and brittle to upstream changes. Personal use; your call.

## Requirements

- Python 3.10+
- A Google account (and optionally a ChatGPT account for `image --chatgpt`)
