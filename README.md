# conjure

CLI tool that generates images through ChatGPT and Gemini by automating their web interfaces with a headless browser. Give it a text prompt, get back a PNG.

## Setup

```
git clone https://github.com/wleeaf/conjure.git
cd conjure
./setup
```

This creates a Python venv, installs [cloakbrowser](https://pypi.org/project/cloakbrowser/) (which bundles Playwright) with Chromium, and symlinks `conjure` into `~/.local/bin/`.

## Usage

```
conjure "a samurai cat standing in the rain"
conjure --gemini "a robot reading a book in a cozy library"
```

Defaults to ChatGPT when no service flag is given. Use `--gemini` to switch.
Each run starts from a fresh chat so old conversation state does not interfere with image detection.

### Editing images

Upload an existing image and describe how to change it:

```
conjure --edit photo.png "make the sky purple"
conjure --gemini --edit photo.png "add a sunset in the background"
```

The image is saved as a PNG in your current directory, named from the prompt and timestamp (e.g. `a-samurai-cat-standing-in-the-rain-20260328-200143.png`).

### First run

You need to log in once per service:

```
conjure --login chatgpt
conjure --login gemini
```

This opens a visible browser window. Log in normally — your session is saved to `~/.config/conjure/` and reused for future headless runs.

## How it works

1. Launches a headless Chromium instance via cloakbrowser with a persistent profile (session cookies)
2. Navigates to ChatGPT or Gemini and submits an image generation prompt
3. Waits for the response to complete (stop-button detection + content stability)
4. Finds the largest new image on the page and downloads it via an in-page `fetch()`
5. Falls back to canvas capture if the fetch fails

## Troubleshooting

Because conjure drives the live ChatGPT and Gemini web UIs, a layout change upstream can break it. Two tools help you find out *what* broke.

**Health check** — verify your setup and that the page selectors still resolve, without running a generation:

```
conjure --doctor            # check both services
conjure --doctor chatgpt    # check just one
```

It reports whether dependencies are installed, whether you are logged in, and whether the critical selectors (prompt input, new-chat, send button) still match. A `✗` on a selector means that service changed its markup and the matching entry in the `SERVICES` table in `conjure` needs updating. Selectors that only exist mid-run (stop button, response container) are listed but can only be verified during a real generation.

**Verbose trace** — print each step as it happens:

```
conjure -v "a cat in a top hat"
```

When a run fails, conjure writes a diagnostics bundle — screenshot, page HTML, and live selector counts — to `~/.config/conjure/debug/<timestamp>/` and prints the path. The bundle lives under the config dir rather than your working directory because the HTML contains your account name and conversation history.

**Exit codes:** `0` success · `1` unexpected or setup error · `2` quota hit or content refusal · `3` a page step failed (likely a changed selector) · `4` no image produced.

## Requirements

- Python 3.10+
- A ChatGPT and/or Google account
