// Logs every WebHID report the vendor driver sends or receives.
//
// Installed via agent-browser --init-script, so it runs before the page's own
// scripts and cannot miss the opening handshake. Frames land in
// window.__hidlog, which is then read back with agent-browser eval.
(() => {
  const log = [];
  window.__hidlog = log;
  window.__hidclear = () => {
    log.length = 0;
  };

  const toHex = (v) =>
    Array.from(v instanceof Uint8Array ? v : new Uint8Array(v))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");

  const push = (dir, reportId, data) => {
    log.push({ dir, id: reportId, bytes: toHex(data), len: data.length, t: Date.now() });
    // Keep the buffer sane; a live sensor stream is one frame per few ms.
    if (log.length > 4000) log.splice(0, log.length - 4000);
  };

  const patchSend = () => {
    if (typeof HIDDevice === "undefined") return false;
    const proto = HIDDevice.prototype;
    if (proto.__hidPatched) return true;
    const origSend = proto.sendReport;
    proto.sendReport = function (reportId, data) {
      try {
        push("tx", reportId, data);
      } catch {}
      return origSend.call(this, reportId, data);
    };
    proto.__hidPatched = true;
    return true;
  };

  const patchReceive = () => {
    if (typeof HIDDevice === "undefined") return false;
    const proto = HIDDevice.prototype;
    if (typeof proto.receiveReport === "function" && !proto.__hidRecvPatched) {
      const orig = proto.receiveReport;
      proto.receiveReport = function (reportId) {
        return orig.call(this, reportId).then((buf) => {
          try {
            push("rx", reportId, new Uint8Array(buf));
          } catch {}
          return buf;
        });
      };
      proto.__hidRecvPatched = true;
    }
    return true;
  };

  if (!patchSend()) {
    // WebHID may not exist yet in some builds; retry shortly.
    setTimeout(() => {
      patchSend();
      patchReceive();
    }, 250);
  }
  patchReceive();

  // The async event path: event.data when the browser fills it in.
  if (typeof navigator !== "undefined" && navigator.hid) {
    navigator.hid.addEventListener("inputreport", (e) => {
      try {
        if (e.data) push("rx", e.reportId, e.data);
      } catch {}
    });
    const origReq = navigator.hid.requestDevice.bind(navigator.hid);
    navigator.hid.requestDevice = (opts) =>
      origReq(opts).then((devices) => {
        window.__hids = devices.map((d) => ({
          vendorId: d.vendorId,
          productId: d.productId,
          collections: d.collections.map((c) => ({
            usagePage: c.usagePage,
            usage: c.usage,
          })),
        }));
        return devices;
      });
  }

  console.log("[hidlog] installed");
})();