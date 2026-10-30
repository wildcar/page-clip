// Plain text of a PDF, enough for text-based reports: FlateDecode streams, object streams,
// ToUnicode CMaps, simple fonts in WinAnsi encoding, Form XObjects. Scanned PDFs give "".
// PageClip.pdfText(arrayBuffer) → Promise<string>: paragraphs separated by a blank line,
// hard line breaks kept; lines the generator wrapped to fit the page are joined back.
var PageClip = globalThis.PageClip || {};
globalThis.PageClip = PageClip;

(() => {
  // ---------- bytes ----------

  // PDF syntax is bytes; a "binary string" (one char per byte) keeps offsets and regexes simple.
  function binary(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return s;
  }

  function toBytes(s) {
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
  }

  async function inflate(bytes, format = "deflate") {
    const ds = new DecompressionStream(format);
    const writer = ds.writable.getWriter();
    writer.write(bytes).catch(() => {});
    writer.close().catch(() => {});
    const reader = ds.readable.getReader();
    const chunks = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } catch {
      // Truncated stream or junk after its end: keep what was decoded.
    }
    const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of chunks) out.set(c, (at += c.length) - c.length);
    if (!out.length && format === "deflate") return inflate(bytes, "deflate-raw");
    return out;
  }

  // ---------- lexer & parser ----------

  class Name {
    constructor(name) {
      this.name = name;
    }
  }
  class Op {
    constructor(op) {
      this.op = op;
    }
  }
  class Str {
    constructor(bytes) {
      this.bytes = bytes; // binary string
    }
  }
  class Ref {
    constructor(num) {
      this.num = num;
    }
  }
  const ARR = "[", ARR_END = "]", DICT = "<<", DICT_END = ">>", EOF = null;
  const WS = new Set([0, 9, 10, 12, 13, 32]);
  const DELIM = new Set([...`()<>[]{}/%`].map((c) => c.charCodeAt(0)));
  const isRegular = (c) => !WS.has(c) && !DELIM.has(c) && !Number.isNaN(c);

  class Lexer {
    constructor(s, pos = 0) {
      this.s = s;
      this.pos = pos;
    }

    skip() {
      const s = this.s;
      for (;;) {
        const c = s.charCodeAt(this.pos);
        if (WS.has(c)) this.pos++;
        else if (c === 37 /* % */) while (this.pos < s.length && !/[\r\n]/.test(s[this.pos])) this.pos++;
        else return;
      }
    }

    token() {
      this.skip();
      const s = this.s;
      if (this.pos >= s.length) return EOF;
      const c = s[this.pos];
      if (c === "/") {
        let end = ++this.pos;
        while (end < s.length && isRegular(s.charCodeAt(end))) end++;
        const name = s.slice(this.pos, end).replace(/#([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
        this.pos = end;
        return new Name(name);
      }
      if (c === "(") return this.literal();
      if (c === "<") {
        if (s[this.pos + 1] === "<") return (this.pos += 2), DICT;
        const end = s.indexOf(">", this.pos);
        const hex = s.slice(this.pos + 1, end < 0 ? s.length : end).replace(/[^0-9a-f]/gi, "");
        this.pos = end < 0 ? s.length : end + 1;
        let out = "";
        for (let i = 0; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2).padEnd(2, "0"), 16));
        return new Str(out);
      }
      if (c === ">") {
        this.pos += s[this.pos + 1] === ">" ? 2 : 1;
        return DICT_END;
      }
      if (c === "[" || c === "]") return this.pos++, c;
      if (c === "{" || c === "}" || c === ")") return this.pos++, new Op(c);
      let end = this.pos;
      while (end < s.length && isRegular(s.charCodeAt(end))) end++;
      const word = s.slice(this.pos, end);
      this.pos = end;
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) return Number(word);
      if (word === "true" || word === "false") return word === "true";
      if (word === "null") return null;
      return new Op(word);
    }

    literal() {
      const s = this.s;
      let depth = 0;
      let out = "";
      for (let i = this.pos + 1; i < s.length; i++) {
        const c = s[i];
        if (c === "\\") {
          const n = s[++i];
          const esc = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" }[n];
          if (esc) out += esc;
          else if (/[0-7]/.test(n)) {
            let oct = n;
            while (oct.length < 3 && /[0-7]/.test(s[i + 1])) oct += s[++i];
            out += String.fromCharCode(parseInt(oct, 8) & 0xff);
          } else if (n === "\r") {
            if (s[i + 1] === "\n") i++;
          } else if (n !== "\n") out += n;
        } else if (c === "(") {
          depth++;
          out += c;
        } else if (c === ")") {
          if (!depth--) {
            this.pos = i + 1;
            return new Str(out);
          }
          out += c;
        } else out += c;
      }
      this.pos = s.length;
      return new Str(out);
    }
  }

  // `refs`: integers followed by "<gen> R" become references (not in content streams).
  function parse(lex, tok = lex.token(), refs = true) {
    if (tok === ARR) {
      const arr = [];
      for (let t = lex.token(); t !== ARR_END && t !== EOF && t !== DICT_END; t = lex.token()) arr.push(parse(lex, t, refs));
      return arr;
    }
    if (tok === DICT) {
      const dict = {};
      for (let t = lex.token(); t !== DICT_END && t !== EOF; t = lex.token()) {
        if (t instanceof Name) dict[t.name] = parse(lex, undefined, refs);
      }
      return dict;
    }
    if (refs && Number.isInteger(tok) && tok >= 0) {
      const save = lex.pos;
      const gen = lex.token();
      if (Number.isInteger(gen)) {
        const r = lex.token();
        if (r instanceof Op && r.op === "R") return new Ref(tok);
      }
      lex.pos = save;
    }
    return tok;
  }

  // ---------- document ----------

  class Doc {
    constructor(bytes) {
      this.s = binary(bytes);
      this.objects = new Map(); // num → { value, stream?: [start, end] }
      this.decoded = new Map();
      this.scan();
    }

    // Objects in file order; a later definition (incremental update) wins. The scan jumps
    // over stream data, so "1 0 obj" inside binary data is never taken for an object.
    scan() {
      const s = this.s;
      const re = /(\d+)\s+\d+\s+obj\b/g;
      for (let m = re.exec(s); m; m = re.exec(s)) {
        try {
          const lex = new Lexer(s, re.lastIndex);
          const value = parse(lex);
          const obj = { value };
          lex.skip();
          if (s.startsWith("stream", lex.pos)) {
            let start = lex.pos + 6;
            if (s[start] === "\r") start++;
            if (s[start] === "\n") start++;
            const len = value?.Length;
            let end = Number.isInteger(len) && /^\s*endstream/.test(s.slice(start + len, start + len + 20)) ? start + len : -1;
            if (end < 0) {
              end = s.indexOf("endstream", start);
              if (end < 0) end = s.length;
              while (end > start && /[\r\n]/.test(s[end - 1])) end--;
            }
            obj.stream = [start, end];
            re.lastIndex = end;
          }
          this.objects.set(Number(m[1]), obj);
        } catch {
          /* damaged object: skip */
        }
      }
    }

    // Objects packed into object streams (PDF 1.5+) fill the gaps.
    async unpackObjectStreams() {
      for (const obj of [...this.objects.values()]) {
        if (obj.value?.Type?.name !== "ObjStm" || !obj.stream) continue;
        const data = await this.streamData(obj);
        if (!data) continue;
        const s = binary(data);
        const first = obj.value.First;
        const head = new Lexer(s.slice(0, first));
        for (let i = 0; i < obj.value.N; i++) {
          const num = head.token();
          const offset = head.token();
          if (!Number.isInteger(num) || !Number.isInteger(offset)) break;
          if (this.objects.has(num)) continue;
          try {
            this.objects.set(num, { value: parse(new Lexer(s, first + offset)) });
          } catch {
            /* skip */
          }
        }
      }
    }

    get(v) {
      for (let i = 0; v instanceof Ref && i < 32; i++) v = this.objects.get(v.num)?.value;
      return v instanceof Ref ? undefined : v;
    }

    objectOf(v) {
      return v instanceof Ref ? this.objects.get(v.num) : null;
    }

    // Decoded bytes of a stream object, or null for filters we don't read (images).
    async streamData(obj) {
      if (!obj?.stream) return null;
      if (this.decoded.has(obj)) return this.decoded.get(obj);
      let data = toBytes(this.s.slice(...obj.stream));
      const filters = [].concat(this.get(obj.value.Filter) ?? []).map((f) => this.get(f)?.name);
      for (const f of filters) {
        if (f === "FlateDecode" || f === "Fl") data = await inflate(data);
        else {
          data = null;
          break;
        }
      }
      this.decoded.set(obj, data);
      return data;
    }

    async refData(ref) {
      return this.streamData(this.objectOf(ref));
    }

    // Leaf pages in order, each with its inherited Resources.
    pages() {
      const out = [];
      const walk = (ref, inherited, depth) => {
        const node = this.get(ref);
        if (!node || depth > 32) return;
        const resources = node.Resources ?? inherited;
        if (node.Type?.name === "Pages" || Array.isArray(this.get(node.Kids))) {
          for (const kid of this.get(node.Kids) || []) walk(kid, resources, depth + 1);
        } else out.push({ node, resources });
      };
      const catalog = [...this.objects.values()].find((o) => o.value?.Type?.name === "Catalog");
      if (catalog) walk(catalog.value.Pages, undefined, 0);
      if (!out.length) {
        for (const o of this.objects.values()) if (o.value?.Type?.name === "Page") out.push({ node: o.value, resources: o.value.Resources });
      }
      return out;
    }
  }

  // ---------- fonts ----------

  // UTF-16BE bytes of a CMap destination → string.
  function utf16(bytes) {
    let out = "";
    for (let i = 0; i + 1 < bytes.length; i += 2) out += String.fromCharCode((bytes.charCodeAt(i) << 8) | bytes.charCodeAt(i + 1));
    if (bytes.length % 2) out += bytes[bytes.length - 1];
    return out;
  }
  const codeOf = (bytes) => [...bytes].reduce((n, c) => n * 256 + c.charCodeAt(0), 0);
  const MAX_RANGE = 0x10000;

  function parseCMap(text, font) {
    const lex = new Lexer(text);
    const values = [];
    for (let t = lex.token(); t !== EOF; t = lex.token()) {
      if (!(t instanceof Op)) {
        values.push(parse(lex, t, false));
        continue;
      }
      const strs = values.splice(0);
      if (t.op === "endcodespacerange") {
        for (let i = 0; i + 1 < strs.length; i += 2) {
          font.spaces.push({ len: strs[i].bytes.length, lo: codeOf(strs[i].bytes), hi: codeOf(strs[i + 1].bytes) });
        }
      } else if (t.op === "endbfchar") {
        for (let i = 0; i + 1 < strs.length; i += 2) {
          if (strs[i] instanceof Str && strs[i + 1] instanceof Str) font.toUnicode.set(codeOf(strs[i].bytes), utf16(strs[i + 1].bytes));
        }
      } else if (t.op === "endbfrange") {
        for (let i = 0; i + 2 < strs.length; i += 3) {
          const [lo, hi, dst] = [codeOf(strs[i].bytes), codeOf(strs[i + 1].bytes), strs[i + 2]];
          for (let code = lo; code <= hi && code - lo < MAX_RANGE; code++) {
            if (Array.isArray(dst)) {
              if (dst[code - lo] instanceof Str) font.toUnicode.set(code, utf16(dst[code - lo].bytes));
            } else if (dst instanceof Str) {
              const base = utf16(dst.bytes);
              font.toUnicode.set(code, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + code - lo));
            }
          }
        }
      }
    }
  }

  const WIN_ANSI = new TextDecoder("windows-1252");
  const GLYPHS = { space: " ", hyphen: "-", period: ".", comma: ",", colon: ":", semicolon: ";", slash: "/", parenleft: "(", parenright: ")" };

  async function loadFont(doc, dict) {
    const font = { type0: dict.Subtype?.name === "Type0", spaces: [], toUnicode: new Map(), widths: new Map(), dw: 1000, simple: new Map() };
    if (font.type0) {
      const desc = doc.get(doc.get(dict.DescendantFonts)?.[0]) || {};
      font.dw = doc.get(desc.DW) ?? 1000;
      const w = doc.get(desc.W) || [];
      for (let i = 0; i < w.length; ) {
        const first = doc.get(w[i]);
        const next = doc.get(w[i + 1]);
        if (Array.isArray(next)) {
          next.forEach((x, k) => font.widths.set(first + k, doc.get(x)));
          i += 2;
        } else {
          for (let c = first; c <= next && c - first < MAX_RANGE; c++) font.widths.set(c, doc.get(w[i + 2]));
          i += 3;
        }
      }
    } else {
      const first = doc.get(dict.FirstChar) ?? 0;
      (doc.get(dict.Widths) || []).forEach((x, k) => font.widths.set(first + k, doc.get(x)));
      font.dw = doc.get(doc.get(dict.FontDescriptor)?.MissingWidth) || 500;
      const diffs = doc.get(doc.get(dict.Encoding)?.Differences) || [];
      let code = 0;
      for (const d of diffs) {
        if (typeof d === "number") code = d;
        else if (d instanceof Name) {
          const uni = /^uni([0-9A-F]{4})$/.exec(d.name);
          const ch = uni ? String.fromCharCode(parseInt(uni[1], 16)) : GLYPHS[d.name] ?? (d.name.length === 1 ? d.name : "");
          font.simple.set(code++, ch);
        }
      }
    }
    if (dict.ToUnicode) {
      const data = await doc.refData(dict.ToUnicode);
      if (data) parseCMap(binary(data), font);
    }
    return font;
  }

  // Character codes of a shown string: codespace ranges if the CMap gives them, else 2 bytes
  // for composite fonts and 1 byte for simple ones.
  function* codes(font, bytes) {
    const lens = font.spaces.length ? [...new Set(font.spaces.map((r) => r.len))].sort() : [font.type0 ? 2 : 1];
    for (let i = 0; i < bytes.length; ) {
      let len = lens[lens.length - 1];
      for (const l of lens) {
        const c = codeOf(bytes.slice(i, i + l));
        if (!font.spaces.length || font.spaces.some((r) => r.len === l && c >= r.lo && c <= r.hi)) {
          len = l;
          break;
        }
      }
      yield { code: codeOf(bytes.slice(i, i + len)), single: len === 1 };
      i += len;
    }
  }

  function unicodeOf(font, code) {
    if (font.toUnicode.has(code)) return font.toUnicode.get(code);
    if (font.type0) return "";
    if (font.simple.has(code)) return font.simple.get(code);
    return code < 128 ? String.fromCharCode(code) : WIN_ANSI.decode(new Uint8Array([code]));
  }

  // ---------- content streams → positioned text runs ----------

  const mul = (m, n) => [
    m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
  ];
  const ID = [1, 0, 0, 1, 0, 0];
  const isSpace = (ch) => /^\s$/.test(ch);

  async function pageRuns(doc, content, resources, ctm0, fontCache, runs, depth = 0) {
    const res = doc.get(resources) || {};
    const fonts = doc.get(res.Font) || {};
    const xobjects = doc.get(res.XObject) || {};
    const st = { ctm: ctm0, font: null, fs: 0, tc: 0, tw: 0, th: 1, tl: 0, rise: 0 };
    const stack = [];
    let tm = ID;
    let tlm = ID;

    const font = async (name) => {
      const ref = fonts[name];
      const key = ref instanceof Ref ? ref.num : name + depth;
      if (!fontCache.has(key)) fontCache.set(key, await loadFont(doc, doc.get(ref) || {}));
      return fontCache.get(key);
    };
    const nextLine = (tx, ty) => {
      tlm = mul([1, 0, 0, 1, tx, ty], tlm);
      tm = tlm;
    };
    const show = (str) => {
      const f = st.font;
      if (!f || !(str instanceof Str)) return;
      const trm = mul(tm, st.ctm);
      const scaleX = Math.hypot(trm[0], trm[1]);
      const size = st.fs * Math.hypot(trm[2], trm[3]);
      let text = "";
      let adv = 0;
      let lead = null; // advance before the first non-space
      let firstWord = null; // advance at the first space after a word
      let trimEnd = 0; // advance after the last non-space
      for (const { code, single } of codes(f, str.bytes)) {
        const ch = unicodeOf(f, code);
        const w = ((f.widths.get(code) ?? f.dw) / 1000) * st.fs + st.tc + (single && code === 32 ? st.tw : 0);
        if (isSpace(ch) || !ch) {
          if (lead !== null && firstWord === null && ch) firstWord = adv;
        } else if (lead === null) lead = adv;
        adv += w * st.th;
        if (ch && !isSpace(ch)) trimEnd = adv;
        text += ch;
      }
      tm = mul([1, 0, 0, 1, adv, 0], tm);
      if (!text) return;
      const x = trm[4];
      runs.push({
        text,
        x,
        y: trm[5] + st.rise,
        size: size || 1,
        start: x + (lead ?? 0) * scaleX,
        end: x + trimEnd * scaleX,
        endRaw: x + adv * scaleX, // with trailing spaces: line breakers often count them

        firstWord: ((firstWord ?? trimEnd) - (lead ?? 0)) * scaleX,
        page: runs.page,
      });
    };

    const lex = new Lexer(binary(content));
    const args = [];
    for (let t = lex.token(); t !== EOF; t = lex.token()) {
      if (!(t instanceof Op)) {
        args.push(parse(lex, t, false));
        continue;
      }
      const a = args.splice(0);
      const n = (i) => (typeof a[i] === "number" ? a[i] : 0);
      switch (t.op) {
        case "q": stack.push({ ...st }); break;
        case "Q": if (stack.length) Object.assign(st, stack.pop()); break;
        case "cm": st.ctm = mul(a.slice(0, 6).map((_, i) => n(i)), st.ctm); break;
        case "BT": tm = tlm = ID; break;
        case "Tf": st.font = await font(a[0]?.name); st.fs = n(1); break;
        case "Tc": st.tc = n(0); break;
        case "Tw": st.tw = n(0); break;
        case "Tz": st.th = n(0) / 100; break;
        case "TL": st.tl = n(0); break;
        case "Ts": st.rise = n(0); break;
        case "Td": nextLine(n(0), n(1)); break;
        case "TD": st.tl = -n(1); nextLine(n(0), n(1)); break;
        case "Tm": tm = tlm = a.slice(0, 6).map((_, i) => n(i)); break;
        case "T*": nextLine(0, -st.tl); break;
        case "Tj": show(a[0]); break;
        case "'": nextLine(0, -st.tl); show(a[0]); break;
        case '"': st.tw = n(0); st.tc = n(1); nextLine(0, -st.tl); show(a[2]); break;
        case "TJ":
          for (const el of Array.isArray(a[0]) ? a[0] : []) {
            if (typeof el === "number") tm = mul([1, 0, 0, 1, (-el / 1000) * st.fs * st.th, 0], tm);
            else show(el);
          }
          break;
        case "Do": {
          const ref = xobjects[a[0]?.name];
          const obj = doc.objectOf(ref);
          if (depth < 5 && obj?.value?.Subtype?.name === "Form") {
            const data = await doc.streamData(obj);
            const matrix = doc.get(obj.value.Matrix) || ID;
            if (data) await pageRuns(doc, data, obj.value.Resources ?? resources, mul(matrix, st.ctm), fontCache, runs, depth + 1);
          }
          break;
        }
        case "BI": {
          // Inline image: binary data up to "EI".
          const end = lex.s.indexOf("EI", lex.s.indexOf("ID", lex.pos));
          lex.pos = end < 0 ? lex.s.length : end + 2;
          break;
        }
      }
    }
  }

  // ---------- runs → lines → paragraphs ----------

  function toLines(runs) {
    const lines = [];
    let line = null;
    for (const r of runs) {
      if (line && line.page === r.page && Math.abs(r.y - line.y) < Math.max(r.size, line.size) * 0.5) {
        if (r.start - line.end > r.size * 0.2 && !/\s$/.test(line.text) && !/^\s/.test(r.text)) line.text += " ";
        line.text += r.text;
        line.end = Math.max(line.end, r.end);
        line.endRaw = Math.max(line.endRaw, r.endRaw);
        continue;
      }
      line = { ...r };
      lines.push(line);
    }
    for (const l of lines) l.text = l.text.replace(/\s+/g, " ").trim();
    return lines.filter((l) => l.text);
  }

  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[s.length >> 1] : 0;
  };

  // A blank line in the layout (gap well above the usual line step) starts a paragraph.
  // A line is a soft wrap when the next line's first word would not have fitted after it within
  // the right edge of the text; that edge counts only if several lines reach it, so a document
  // of short hand-broken lines is left as is. A next line starting with a capital letter is
  // kept on its own: in reports it is usually a heading or a new item, and a missed join costs
  // only a line break.
  function toParagraphs(lines) {
    const steps = [];
    for (let i = 1; i < lines.length; i++) {
      const d = lines[i - 1].y - lines[i].y;
      if (lines[i].page === lines[i - 1].page && d > 0) steps.push(d);
    }
    const step = median(steps);
    const right = Math.max(...lines.map((l) => l.end));
    const left = Math.min(...lines.map((l) => l.start));
    const nearRight = lines.filter((l) => l.end >= right - (right - left) * 0.15).length;
    const wrapped = nearRight >= 3;

    const paragraphs = [];
    let para = null;
    let prev = null;
    for (const l of lines) {
      const samePage = prev && prev.page === l.page;
      const gap = samePage ? prev.y - l.y : 0;
      const blank = samePage && step && gap > step * 1.5;
      if (!para || blank) {
        para = [l.text];
        paragraphs.push(para);
      } else {
        const space = l.size * 0.3;
        const lineEnd = Math.max(prev.end + space, prev.endRaw);
        const soft = wrapped && !/^\p{Lu}/u.test(l.text) && lineEnd + l.firstWord > right + 0.5;
        if (soft) para[para.length - 1] += " " + l.text;
        else para.push(l.text);
      }
      prev = l;
    }
    return paragraphs.map((p) => p.join("\n")).join("\n\n");
  }

  PageClip.pdfText = async function pdfText(buffer) {
    const bytes = new Uint8Array(buffer);
    const doc = new Doc(bytes);
    await doc.unpackObjectStreams();
    const runs = [];
    const fontCache = new Map();
    let page = 0;
    for (const { node, resources } of doc.pages()) {
      runs.page = page++;
      const contents = [].concat(node.Contents ?? []);
      const parts = [];
      for (const c of contents.flatMap((c) => (Array.isArray(doc.get(c)) ? doc.get(c) : [c]))) {
        const data = await doc.refData(c);
        if (data) parts.push(binary(data));
      }
      if (parts.length) await pageRuns(doc, toBytes(parts.join("\n")), resources, ID, fontCache, runs);
    }
    const lines = toLines(runs);
    return lines.length ? toParagraphs(lines) : "";
  };
})();
