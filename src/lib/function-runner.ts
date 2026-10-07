// Source of the script that runs inside the child process for every function call.
// It only ever sees the project's own variables. Written with plain quotes (no template literals)
// because it is embedded as a string.
export const RUNNER = String.raw`
"use strict";
var chunks = [];
process.stdin.on("data", function (c) { chunks.push(c); });
process.stdin.on("end", function () { main().catch(fail); });
function out(obj) { process.stdout.write(JSON.stringify(obj), function () { process.exit(0); }); }
function fail(e) { out({ error: String((e && e.stack) || e) }); }
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);
var util = require("util");
["log", "info", "warn", "error", "debug"].forEach(function (k) {
  console[k] = function () {
    var a = Array.prototype.slice.call(arguments).map(function (x) { return typeof x === "string" ? x : util.inspect(x); });
    process.stderr.write(a.join(" ") + "\n");
  };
});

async function main() {
  var input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  var path = require("path").posix;
  var nodeModule = require("module");
  var hostRequire = nodeModule.createRequire(require("path").join(process.cwd(), "x.js"));
  var BLOCKED = { fs: 1, "fs/promises": 1, child_process: 1, worker_threads: 1, cluster: 1, vm: 1, module: 1, repl: 1, inspector: 1, v8: 1, wasi: 1 };
  var cache = {};
  var EXTS = ["", ".js", ".mjs", ".cjs", ".ts", ".json", "/index.js", "/index.mjs", "/index.cjs", "/index.ts"];

  function resolveLocal(p) {
    for (var i = 0; i < EXTS.length; i++) if (input.modules[p + EXTS[i]] !== undefined) return p + EXTS[i];
    return null;
  }
  function load(file) {
    if (cache[file]) return cache[file].exports;
    var src = input.modules[file];
    if (src && typeof src === "object") throw new Error("Could not compile " + file + ": " + src.error);
    var mod = { exports: {} };
    cache[file] = mod;
    if (/\.json$/.test(file)) { mod.exports = JSON.parse(src); return mod.exports; }
    var dir = path.dirname(file);
    var fn = new Function("require", "module", "exports", "__filename", "__dirname", src);
    fn(function (spec) { return req(spec, dir); }, mod, mod.exports, "/" + file, "/" + dir);
    return mod.exports;
  }
  function req(spec, dir) {
    if (spec.charAt(0) === ".") {
      var f = resolveLocal(path.normalize(path.join(dir, spec)));
      if (!f) throw new Error("Cannot find module '" + spec + "' (imported from " + dir + "/)");
      return load(f);
    }
    if (nodeModule.isBuiltin(spec)) {
      if (BLOCKED[spec.replace(/^node:/, "")]) throw new Error("Node module '" + spec + "' is not available in Nuke functions.");
      return require(spec);
    }
    var ok = input.packages.some(function (p) { return spec === p || spec.indexOf(p + "/") === 0; });
    if (!ok) throw new Error("Package '" + spec + "' is not available in Nuke functions. Available: " + input.packages.join(", ") + ". Bundle other packages into your own file.");
    return hostRequire(spec);
  }

  var r = input.req;
  var u = new URL(r.url, "http://localhost");
  var raw = Buffer.from(r.body, "base64");
  var headers = r.headers;
  var query = {};
  u.searchParams.forEach(function (v, k) {
    if (Object.prototype.hasOwnProperty.call(query, k)) query[k] = [].concat(query[k], v); else query[k] = v;
  });
  var cookies = {};
  String(headers.cookie || "").split(";").forEach(function (p) {
    var i = p.indexOf("="); if (i > 0) { try { cookies[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch (e) {} }
  });
  var ct = String(headers["content-type"] || "").toLowerCase();
  var body;
  if (raw.length) {
    if (ct.indexOf("application/json") >= 0) { try { body = JSON.parse(raw.toString("utf8")); } catch (e) { body = raw.toString("utf8"); } }
    else if (ct.indexOf("application/x-www-form-urlencoded") >= 0) body = Object.fromEntries(new URLSearchParams(raw.toString("utf8")));
    else if (ct.indexOf("text/") === 0) body = raw.toString("utf8");
    else body = raw;
  }

  var nodeReq = require("stream").Readable.from(raw.length ? [raw] : []);
  Object.assign(nodeReq, { method: r.method, url: r.url, headers: headers, query: query, cookies: cookies, body: body, httpVersion: "1.1", socket: { remoteAddress: r.ip }, connection: { remoteAddress: r.ip } });

  var state = { headers: {}, chunks: [], ended: false };
  var resolveDone; var done = new Promise(function (ok) { resolveDone = ok; });
  function push(c) { if (c === undefined || c === null || typeof c === "function") return; state.chunks.push(Buffer.isBuffer(c) ? c : (c instanceof Uint8Array ? Buffer.from(c) : Buffer.from(String(c)))); }
  function finish() { if (state.ended) return; state.ended = true; resolveDone({ status: res.statusCode, headers: state.headers, body: Buffer.concat(state.chunks).toString("base64") }); }
  var res = {
    statusCode: 200, headersSent: false, writableEnded: false,
    setHeader: function (k, v) { state.headers[String(k).toLowerCase()] = v; return res; },
    getHeader: function (k) { return state.headers[String(k).toLowerCase()]; },
    getHeaders: function () { return state.headers; },
    hasHeader: function (k) { return String(k).toLowerCase() in state.headers; },
    removeHeader: function (k) { delete state.headers[String(k).toLowerCase()]; },
    status: function (n) { res.statusCode = n; return res; },
    writeHead: function (n, h) { res.statusCode = n; if (h) Object.keys(h).forEach(function (k) { res.setHeader(k, h[k]); }); return res; },
    write: function (c) { push(c); return true; },
    end: function (c) { push(c); finish(); return res; },
    json: function (o) { if (!res.hasHeader("content-type")) res.setHeader("content-type", "application/json; charset=utf-8"); return res.end(JSON.stringify(o)); },
    send: function (b) {
      if (b && typeof b === "object" && !Buffer.isBuffer(b) && !(b instanceof Uint8Array)) return res.json(b);
      if (!res.hasHeader("content-type")) res.setHeader("content-type", typeof b === "string" ? "text/html; charset=utf-8" : "application/octet-stream");
      return res.end(b);
    },
    redirect: function (a, b) { res.statusCode = typeof a === "number" ? a : 307; res.setHeader("location", typeof a === "number" ? b : a); return res.end(); },
    on: function () { return res; }, once: function () { return res; }, emit: function () { return false; }
  };

  function webRequest() {
    var h = new Headers();
    Object.keys(headers).forEach(function (k) { try { h.set(k, String(headers[k])); } catch (e) {} });
    var m = r.method.toUpperCase();
    return new Request("https://" + (headers.host || "localhost") + r.url, { method: m, headers: h, body: (m === "GET" || m === "HEAD") ? undefined : raw });
  }

  var exp = load(input.entry);
  var method = r.method.toUpperCase();
  var VERBS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
  var named = exp && typeof exp[method] === "function" ? exp[method] : null;
  var def = typeof exp === "function" ? exp : (exp && typeof exp.default === "function" ? exp.default : null);
  var webObj = exp && exp.default && typeof exp.default.fetch === "function" ? exp.default : null;
  var result;
  if (named) result = await named(webRequest());
  else if (def) result = await def(nodeReq, res);
  else if (webObj) result = await webObj.fetch(webRequest());
  else if (exp && VERBS.some(function (v) { return typeof exp[v] === "function"; })) { res.statusCode = 405; res.setHeader("allow", VERBS.filter(function (v) { return typeof exp[v] === "function"; }).join(", ")); res.end(); }
  else throw new Error("The api file must export a handler: export default function handler(req, res) { ... }");

  if (result && typeof Response !== "undefined" && result instanceof Response) {
    var h2 = {};
    result.headers.forEach(function (v, k) { h2[k] = v; });
    if (typeof result.headers.getSetCookie === "function") { var sc = result.headers.getSetCookie(); if (sc.length) h2["set-cookie"] = sc; }
    var ab = Buffer.from(await result.arrayBuffer());
    return out({ status: result.status, headers: h2, body: ab.toString("base64") });
  }
  var timer;
  var final = await Promise.race([done, new Promise(function (_, no) { timer = setTimeout(function () { no(new Error("The function finished without sending a response. Call res.json(), res.send() or res.end().")); }, 5000); })]);
  clearTimeout(timer);
  out(final);
}
`;
