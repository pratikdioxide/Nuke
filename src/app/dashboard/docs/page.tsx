import Link from "next/link";

export const metadata = { title: "Docs" };

export default function Docs() {
  return (
    <div className="prose" style={{ maxWidth: 720 }}>
      <div className="page-head"><h1>Docs</h1><Link href="/dashboard" className="btn">Back</Link></div>
      <h2>Deploying</h2>
      <ol>
        <li>Click <b>New project</b>, choose a name. The URL name becomes your address: <code>yourdomain.com/name</code>.</li>
        <li>Add a single HTML file, a folder, a .zip, pasted HTML, or a GitHub repo. A root <code>index.html</code> is required.</li>
        <li>Every deploy creates a numbered deployment with logs. Failed deploys never replace the live site.</li>
        <li>Open <b>Deployments</b> to read logs, roll back (Promote), or redeploy.</li>
      </ol>
      <h2>Environment variables</h2>
      <p>Set them in the <b>Environment</b> tab. Saving redeploys automatically. In your HTML, read them from JavaScript:</p>
      <pre>{`<script>
  const api = window.NUKE_ENV.API_URL;
</script>`}</pre>
      <p>Static sites run in the browser, so values are visible to visitors. Do not store secrets here.</p>
      <h2>Private secrets and API proxies</h2>
      <p>Open the project’s <b>Secrets &amp; API</b> tab to save a private, one-line API credential. Secret values are encrypted at rest and are never included in your deployed pages or returned after saving. The <code>NUKE_SECRETS_ENCRYPTION_KEY</code> server setting must remain stable; changing it makes saved credentials unreadable.</p>
      <p>Create a proxy with an HTTPS upstream, a narrow path prefix such as <code>/v1</code>, permitted methods, and the secret header. Your browser calls the Nuke endpoint; Nuke attaches the secret on the server:</p>
      <pre>{`fetch("/api/proxy/your-project/PROXY_ID/items", {
  method: "GET",
  headers: { "Accept": "application/json" }
}).then(response => response.json());`}</pre>
      <p>Proxy endpoints are public and rate limited, not user-authenticated. Only expose low-risk operations. Nuke restricts each proxy to its configured host, path prefix, and methods; it rejects redirects and caps request and response sizes.</p>
      <h2>GitHub and deploy hooks</h2>
      <p>Choose <b>GitHub</b> when deploying, e.g. <code>owner/repo</code>. Private repos need <code>GITHUB_TOKEN</code>. In <b>Settings</b>, copy the deploy hook URL and add it as a GitHub webhook to redeploy on every push.</p>
      <h2>Editing files</h2>
      <p>The <b>Files</b> tab edits the live version. <b>Commit &amp; deploy</b> creates a new deployment from your changes.</p>
      <h2>Limits</h2>
      <ul>
        <li>1000 files, 32 MB per project, 4 MB per uploaded file.</li>
        <li>Files named <code>.env*</code>, <code>.npmrc</code>, keys, and <code>.git</code> / <code>node_modules</code> folders are never published.</li>
        <li>Reserved names: dashboard, login, api, docs, new, settings, admin.</li>
        <li>The 15 most recent deployments per project are kept.</li>
      </ul>
      <h2>Clean URLs</h2>
      <p><code>/site/about</code> serves <code>about.html</code> or <code>about/index.html</code>. A <code>404.html</code> is used for missing pages.</p>
    </div>
  );
}
