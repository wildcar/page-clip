// Runs in the page's own JavaScript world; the popup injects it only for presets with
// "attachments". While content.js holds <html data-pb-capture="<id>">, it catches the PDF
// the page loads in answer to the click content.js makes — a fetch / XHR response, a Blob
// given to URL.createObjectURL, a base64 PDF inside JSON — posts the bytes to content.js
// and swallows the download or new tab the page would open with it. Otherwise it changes nothing.
(() => {
  if (window.__pageClipHook) return;
  window.__pageClipHook = true;

  const ATTR = "data-pb-capture";
  const QUIET_MS = 3000; // file downloads are still swallowed this long after the PDF is caught
  let answered = null; // capture id already answered
  let quietUntil = 0;

  const captureId = () => document.documentElement.getAttribute(ATTR);
  const suppressing = () => captureId() !== null || Date.now() < quietUntil;

  const isPdf = (buffer) => {
    const head = new Uint8Array(buffer, 0, Math.min(1024, buffer.byteLength));
    return String.fromCharCode(...head).includes("%PDF-");
  };

  function fromBase64(b64) {
    const bin = atob(b64.replace(/\s+/g, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }

  // First string in a JSON value that is a base64 PDF ("JVBERi" = "%PDF").
  function base64Pdf(value, depth = 0) {
    if (typeof value === "string") {
      const m = /^(?:data:[\w/.+-]*;base64,)?(JVBERi[A-Za-z0-9+/=\s]+)$/.exec(value);
      return m ? fromBase64(m[1]) : null;
    }
    if (!value || typeof value !== "object" || depth > 8) return null;
    for (const v of Object.values(value)) {
      const found = base64Pdf(v, depth + 1);
      if (found) return found;
    }
    return null;
  }

  function jsonPdf(text) {
    try {
      return base64Pdf(JSON.parse(text));
    } catch {
      return null;
    }
  }

  // `source` resolves to an ArrayBuffer (or null); only a PDF answers the current capture.
  async function offer(source) {
    const id = captureId();
    if (id === null || answered === id) return;
    try {
      const buffer = await source();
      if (!buffer || !isPdf(buffer) || answered === id || captureId() !== id) return;
      answered = id;
      quietUntil = Date.now() + QUIET_MS;
      window.postMessage({ pageClip: "pdf", id, buffer }, "*");
    } catch {
      /* not readable: wait for another source */
    }
  }

  const realFetch = window.fetch;

  async function responseBuffer(res) {
    const type = res.headers.get("content-type") || "";
    if (/json/.test(type)) return jsonPdf(await res.text());
    if (/^(text\/|application\/(javascript|xml))/.test(type)) return null;
    return res.arrayBuffer();
  }

  window.fetch = function (...args) {
    const promise = realFetch.apply(this, args);
    if (captureId() !== null) promise.then((res) => offer(() => responseBuffer(res.clone())), () => {});
    return promise;
  };

  const realSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    if (captureId() !== null) {
      this.addEventListener("load", () =>
        offer(async () => {
          const r = this.response;
          if (r instanceof ArrayBuffer) return r;
          if (r instanceof Blob) return r.arrayBuffer();
          if (typeof r === "string") return jsonPdf(r);
          return base64Pdf(r);
        }),
      );
    }
    return realSend.apply(this, args);
  };

  const realCreate = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    if (obj instanceof Blob && captureId() !== null) offer(() => obj.arrayBuffer());
    return realCreate.call(this, obj);
  };

  // The file may reach us only as a URL (blob:, data: or the site's own link): read it ourselves.
  function grab(url) {
    offer(async () => {
      const u = new URL(url, location.href);
      if (!/^(blob|data):$/.test(u.protocol) && u.origin !== location.origin) return null;
      return responseBuffer(await realFetch(u.href, { credentials: "include" }));
    });
  }

  const isFileLink = (a) => a.hasAttribute("download") || /^(blob|data):/.test(a.href) || /\.pdf$/i.test(a.pathname);

  const realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (suppressing() && isFileLink(this)) return grab(this.href);
    return realClick.call(this);
  };

  const realDispatch = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function (event) {
    if (event?.type === "click" && this instanceof HTMLAnchorElement && suppressing() && isFileLink(this)) {
      grab(this.href);
      return false;
    }
    return realDispatch.call(this, event);
  };

  const realOpen = window.open;
  window.open = function (url, ...rest) {
    if (suppressing() && url) {
      grab(String(url));
      return null;
    }
    return realOpen.call(this, url, ...rest);
  };
})();
