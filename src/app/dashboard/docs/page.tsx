import Link from "next/link";
import { SUPPORTED_PACKAGES } from "@/lib/shared";

export const metadata = { title: "Docs" };

const toc: [string, string][] = [
  ["start", "Quick start"], ["env", "Environment variables"], ["functions", "Functions (api/)"],
  ["example", "Example: tracker with a database"], ["git", "GitHub & deploy hooks"],
  ["manage", "Editing & rollback"], ["limits", "Limits"], ["fix", "Troubleshooting"],
];

export default function Docs() {
  return (
    <div className="prose" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <div><h1>Docs</h1><p className="sub">Everything about hosting, secrets and functions.</p></div>
        <Link href="/dashboard" className="btn">Back</Link>
      </div>
      <nav className="row" aria-label="Sections" style={{ marginBottom: 24 }}>
        {toc.map(([id, label]) => <a key={id} href={`#${id}`} className="badge">{label}</a>)}
      </nav>

      <h2 id="start">Quick start</h2>
      <ol>
        <li>Click <b>New project</b>, pick a name. The name becomes your address: <code>yourdomain.com/name</code>.</li>
        <li>Optionally add environment variables right there.</li>
        <li>Add a single HTML file, a folder, a .zip, pasted HTML, or a GitHub repo. A root <code>index.html</code> is required.</li>
        <li>Nuke creates a numbered <b>deployment</b> with logs. A failed deployment never replaces the live site.</li>
      </ol>
      <p>If your upload sits inside a wrapper folder (for example <code>my-site/index.html</code>) or a build folder (<code>dist</code>, <code>build</code>, <code>out</code>, <code>public</code>, <code>docs</code>), Nuke finds the right root automatically and says so in the logs.</p>

      <h2 id="env">Environment variables</h2>
      <p>Each variable has a name, a value, an optional <b>note</b> (to remember what it is for) and a visibility:</p>
      <table className="doc-table">
        <thead><tr><th></th><th>Server only (default)</th><th>Public</th></tr></thead>
        <tbody>
          <tr><td>Who can read it</td><td>Only your <code>api/</code> functions</td><td>Anyone who opens the site</td></tr>
          <tr><td>How you read it</td><td><code>process.env.NAME</code> in a function</td><td><code>window.NUKE_ENV.NAME</code> in the browser</td></tr>
          <tr><td>Stored</td><td>Encrypted (AES-256-GCM)</td><td>Encrypted, and copied into each deployed page</td></tr>
          <tr><td>Change applies</td><td>Immediately</td><td>After an automatic redeploy</td></tr>
          <tr><td>Use for</td><td>Database URLs, passwords, API keys</td><td>Public config: API base URL, analytics ID</td></tr>
        </tbody>
      </table>
      <p><b>Important:</b> a static page runs in the visitor&apos;s browser, so a browser can only use a value that was sent to it. That is why real secrets must stay <b>Server only</b> and be used from a function: the browser calls your function, and the function uses the secret on the server.</p>
      <ul>
        <li>Values are never shown in the dashboard list. Use <b>Reveal</b> to check one (you must be logged in).</li>
        <li>Use <b>Paste .env</b> to add many at once. Pasted values start as Server only.</li>
        <li>Encryption uses <code>NUKE_SECRETS_ENCRYPTION_KEY</code>. Set it once and never change it, or saved values cannot be read again. Keep a backup.</li>
        <li>Functions only receive <b>this project&apos;s</b> variables. Nuke&apos;s own settings (<code>NUKE_PASSWORD</code>, its <code>DATABASE_URL</code>) are never passed to them.</li>
      </ul>

      <h2 id="functions">Functions (api/)</h2>
      <p>Any file inside an <code>api/</code> folder becomes a server-side endpoint, like on Vercel. The files are private: they run, they are never downloadable.</p>
      <pre>{`my-project/
├── index.html          → https://yourdomain.com/my-project/
├── api/
│   ├── tracker.js      → /my-project/api/tracker
│   └── users/index.js  → /my-project/api/users
└── package.json        (optional)`}</pre>
      <p>Your page can call <code>fetch(&quot;/api/tracker&quot;)</code> exactly as it would on Vercel. Nuke automatically sends it to <code>/my-project/api/tracker</code>.</p>
      <pre>{`// api/hello.js
export default async function handler(req, res) {
  // req.method, req.query, req.body (parsed JSON), req.headers, req.cookies
  const key = process.env.MY_SECRET;          // Server only variable
  res.status(200).json({ ok: true, hasKey: Boolean(key) });
}

// Web-standard style also works:
// export async function GET(request) { return Response.json({ hi: 1 }); }`}</pre>
      <ul>
        <li>Supported file types: <code>.js</code>, <code>.mjs</code>, <code>.cjs</code>, <code>.ts</code>. Both <code>import</code> and <code>require</code> work. Relative imports of your own files work.</li>
        <li>Packages you can import: {SUPPORTED_PACKAGES.map((p, i) => <span key={p}>{i ? ", " : ""}<code>{p}</code></span>)}. Nuke does not run <code>npm install</code>. To use another package, bundle it into your file (for example with esbuild) first.</li>
        <li>Limits: 25 seconds per call, 4 MB request body, 6 MB response, 120 calls per minute per visitor.</li>
        <li>Open the <b>Logs</b> tab to see every call, its status, duration, and anything you <code>console.log</code>. Errors are shown there, never to visitors.</li>
      </ul>

      <h2 id="example">Example: tracker with a database</h2>
      <p>A project with <code>index.html</code>, <code>package.json</code> and <code>api/tracker.js</code> that stores data in Neon:</p>
      <ol>
        <li>In <b>New project</b> (or the Environment tab) add <code>DATABASE_URL</code> and <code>EDIT_PASSWORD</code> as <b>Server only</b>.</li>
        <li>Upload the folder. The deployment log should say <code>Found 1 serverless function(s): api/tracker.js</code>.</li>
        <li>Open the site. Calls to <code>/api/tracker</code> reach your function, which reads <code>process.env.DATABASE_URL</code> on the server. Nothing secret appears in the browser console or page source.</li>
      </ol>
      <pre>{`// api/tracker.js
import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  if (req.method === "POST") {
    if (req.body?.password !== process.env.EDIT_PASSWORD) return res.status(401).json({ error: "Wrong password" });
    // ...save with sql\`...\`
    return res.json({ saved: true });
  }
  res.json({ rows: await sql\`SELECT 1 AS ok\` });
}`}</pre>

      <h2 id="git">GitHub &amp; deploy hooks</h2>
      <p>Choose <b>GitHub</b> when deploying, for example <code>owner/repo</code> (optionally a branch and a folder). Private repos need <code>GITHUB_TOKEN</code> in Nuke&apos;s own environment. In <b>Settings</b>, copy the <b>deploy hook</b> URL and add it as a GitHub webhook to redeploy on every push.</p>

      <h2 id="manage">Editing &amp; rollback</h2>
      <ul>
        <li><b>Files</b> edits the live version. <b>Commit &amp; deploy</b> creates a new deployment.</li>
        <li><b>Deployments</b> lists the last 15. <b>Promote to production</b> rolls back to any successful one.</li>
        <li>Clean URLs: <code>/site/about</code> serves <code>about.html</code> or <code>about/index.html</code>. A <code>404.html</code> is used for missing pages.</li>
      </ul>

      <h2 id="limits">Limits</h2>
      <ul>
        <li>1000 files, 32 MB per project, 4 MB per file uploaded from the browser (GitHub import has no per-file limit).</li>
        <li><code>.env*</code> files, keys, <code>.git</code> and <code>node_modules</code> are never published. Put secrets in Environment variables instead.</li>
        <li>Reserved names: dashboard, login, api, docs, new, settings, admin.</li>
      </ul>

      <h2 id="fix">Troubleshooting</h2>
      <table className="doc-table">
        <thead><tr><th>You see</th><th>Why and what to do</th></tr></thead>
        <tbody>
          <tr><td><code>404</code> on <code>/api/something</code></td><td>The <code>api/</code> folder was not deployed or the file name differs. Open the deployment logs: they list every function found. The <code>api</code> folder must be at the project root, next to <code>index.html</code>.</td></tr>
          <tr><td>Env var is <code>undefined</code> in a function</td><td>It must exist in this project&apos;s Environment tab with the exact name. Check the Logs tab output.</td></tr>
          <tr><td><code>Package &quot;x&quot; is not available</code></td><td>Only the supported packages can be imported. Bundle other code into your file.</td></tr>
          <tr><td>Value shows &quot;cannot decrypt&quot;</td><td><code>NUKE_SECRETS_ENCRYPTION_KEY</code> changed. Restore the old key, or enter the value again.</td></tr>
          <tr><td>500 from a function</td><td>Open <b>Logs</b>. The error and your <code>console.log</code> output are there.</td></tr>
        </tbody>
      </table>
    </div>
  );
}
