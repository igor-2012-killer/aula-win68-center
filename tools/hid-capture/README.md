# hid-capture

Records every WebHID frame that a page sends or receives.

This is how the Mod-Tap frame was **confirmed on the wire** instead of inferred:
the vendor's own driver was run in a real browser against the board, and its
packets were compared with `protocol::mod_tap_packet`. They matched byte for
byte. See `docs/VENDOR-DRIVER.md` §6 and §12.

No HID proxy or packet logger is needed. Wrapping `sendReport` inside the page is
enough and much less invasive.

## What it does

`hid-logger.js` is installed as an **init script**, so it runs before the page's
own JavaScript and cannot miss the opening handshake. It patches:

* `HIDDevice.prototype.sendReport` — outgoing frames
* `HIDDevice.prototype.receiveReport` — replies, when the browser supports it
* the `inputreport` event — replies on the event path
* `navigator.hid.requestDevice` — to record which device was granted

Frames land in `window.__hidlog` as `{ dir, id, bytes, len, t }`, with `bytes` a
hex string of the full 64-byte report.

## Usage

```sh
npx --no-install agent-browser --session hidcap --headed \
  --init-script tools/hid-capture/hid-logger.js \
  open https://magnet.aulastar.com
```

Then clear the buffer, do exactly one thing in the vendor UI, and read back:

```sh
# reset, so one UI action shows up as one frame
npx --no-install agent-browser --session hidcap eval "window.__hidclear()"

# ... click something in the page ...

# outgoing frames, as hex
npx --no-install agent-browser --session hidcap eval \
  "window.__hidlog.filter(f=>f.dir==='tx').map(f=>f.bytes)"

# just the non-zero bytes of each frame, which is usually what you want
npx --no-install agent-browser --session hidcap eval \
  "window.__hidlog.filter(f=>f.dir==='tx').map(f=>{const a=f.bytes.split(' ').map(x=>parseInt(x,16));return a.map((v,i)=>v!==0?i+':'+v:null).filter(Boolean).join(',')})"
```

## The one manual step

Chrome's WebHID permission prompt cannot be automated:
`navigator.hid.requestDevice` needs a human to pick the device, once per browser
profile. After that the driver UI is fully scriptable — connect button, Config
List, Custom Key picker, delay slider and Save are all reachable with `click`,
`fill` and `eval`.

## Caveats

* `--headed` is required. Chrome will not show the permission prompt usefully
  otherwise.
* The page's own bundle is minified and sets `window.onconnect`, which can
  clobber the patched `navigator.hid.onconnect`. The logger does not rely on it,
  so this does not matter, but do not be surprised if you see it.
* The buffer is capped at 4000 frames, because a live sensor stream produces one
  frame every few milliseconds and would otherwise evict the interesting ones.