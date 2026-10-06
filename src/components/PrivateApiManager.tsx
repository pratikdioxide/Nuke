"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "@/lib/client/upload";

type Secret = { name: string; created_at: string; updated_at: string };
type ProxyConfig = {
  id: string;
  name: string;
  origin: string;
  path_prefix: string;
  allowed_methods: string[];
  secret_name: string;
  secret_header: string;
  secret_prefix: string;
};
type ProxyForm = Omit<ProxyConfig, "id">;

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function emptyProxy(secretName = ""): ProxyForm {
  return {
    name: "",
    origin: "",
    path_prefix: "/v1",
    allowed_methods: ["GET"],
    secret_name: secretName,
    secret_header: "authorization",
    secret_prefix: "Bearer ",
  };
}

export default function PrivateApiManager({ slug }: { slug: string }) {
  const projectUrl = `/api/projects/${encodeURIComponent(slug)}`;
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [proxies, setProxies] = useState<ProxyConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [secretName, setSecretName] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [editingSecret, setEditingSecret] = useState("");
  const [secretBusy, setSecretBusy] = useState(false);
  const [proxyForm, setProxyForm] = useState<ProxyForm>(() => emptyProxy());
  const [editingProxy, setEditingProxy] = useState("");
  const [proxyBusy, setProxyBusy] = useState(false);
  const [copiedProxy, setCopiedProxy] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [secretData, proxyData] = await Promise.all([
        api(`${projectUrl}/secrets`, "GET"),
        api(`${projectUrl}/proxies`, "GET"),
      ]);
      const nextSecrets = secretData.secrets as Secret[];
      setSecrets(nextSecrets);
      setProxies(proxyData.proxies as ProxyConfig[]);
      setProxyForm((current) => current.secret_name || !nextSecrets.length
        ? current
        : { ...current, secret_name: nextSecrets[0].name });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectUrl]);

  useEffect(() => { void refresh(); }, [refresh]);

  const secretUse = useMemo(() => {
    const uses = new Map<string, string[]>();
    for (const proxy of proxies) {
      uses.set(proxy.secret_name, [...(uses.get(proxy.secret_name) ?? []), proxy.name]);
    }
    return uses;
  }, [proxies]);

  async function saveSecret(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSecretBusy(true);
    try {
      const result = await api(`${projectUrl}/secrets`, "POST", { name: secretName, value: secretValue });
      setSecretName("");
      setSecretValue("");
      setEditingSecret("");
      setNotice(result.replaced
        ? `Secret “${result.name}” replaced. Proxies using it now use the new value.`
        : `Secret “${result.name}” saved.`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSecretBusy(false);
    }
  }

  async function deleteSecret(name: string) {
    if (!window.confirm(`Delete the private secret “${name}”? This cannot be undone.`)) return;
    setError("");
    setNotice("");
    try {
      await api(`${projectUrl}/secrets/${encodeURIComponent(name)}`, "DELETE");
      setNotice(`Secret “${name}” deleted.`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function startProxyEdit(proxy: ProxyConfig) {
    setEditingProxy(proxy.id);
    setProxyForm({
      name: proxy.name,
      origin: proxy.origin,
      path_prefix: proxy.path_prefix,
      allowed_methods: proxy.allowed_methods,
      secret_name: proxy.secret_name,
      secret_header: proxy.secret_header,
      secret_prefix: proxy.secret_prefix,
    });
    setError("");
    setNotice("");
  }

  function cancelProxyEdit() {
    setEditingProxy("");
    setProxyForm(emptyProxy(secrets[0]?.name ?? ""));
  }

  function toggleMethod(method: string) {
    setProxyForm((current) => ({
      ...current,
      allowed_methods: current.allowed_methods.includes(method)
        ? current.allowed_methods.filter((item) => item !== method)
        : [...current.allowed_methods, method],
    }));
  }

  async function saveProxy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setProxyBusy(true);
    try {
      const url = editingProxy ? `${projectUrl}/proxies/${editingProxy}` : `${projectUrl}/proxies`;
      await api(url, editingProxy ? "PATCH" : "POST", proxyForm);
      setNotice(editingProxy ? "Proxy settings updated." : "Proxy created.");
      cancelProxyEdit();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProxyBusy(false);
    }
  }

  async function deleteProxy(proxy: ProxyConfig) {
    if (!window.confirm(`Delete the “${proxy.name}” proxy? Its public endpoint will stop working.`)) return;
    setError("");
    setNotice("");
    try {
      await api(`${projectUrl}/proxies/${proxy.id}`, "DELETE");
      if (editingProxy === proxy.id) cancelProxyEdit();
      setNotice(`Proxy “${proxy.name}” deleted.`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function copyEndpoint(proxy: ProxyConfig) {
    const endpoint = `${window.location.origin}/api/proxy/${encodeURIComponent(slug)}/${proxy.id}`;
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopiedProxy(proxy.id);
      window.setTimeout(() => setCopiedProxy(""), 1800);
    } catch {
      setError("Could not copy the endpoint. Select and copy it from the proxy card.");
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Secrets &amp; API proxies</h1>
          <p className="hint">Keep credentials private and use a restricted proxy for browser-side API calls.</p>
        </div>
      </div>

      <div className="notice warn">
        Public environment variables are still visible to site visitors. Private secrets are encrypted at rest, never displayed again after saving, and only sent by the server to an API host and path you configure. Proxy endpoints are public: visitors may call them, so enable only low-risk API operations and keep the path and methods narrow.
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="hint" role="status">{notice}</p>}

      <section className="card">
        <div className="card-head">
          <h2>Private secrets</h2>
          <span className="hint">{secrets.length} saved</span>
        </div>
        <div className="card-pad stack">
          <p className="hint" style={{ margin: 0 }}>
            Save one-line API credentials here. Replacing a secret updates every proxy that uses it. Nuke does not provide a way to reveal a saved value.
          </p>
          <form className="stack" onSubmit={saveSecret}>
            <div className="envrow">
              <label className="field">
                Secret name
                <input
                  className="input mono"
                  value={secretName}
                  onChange={(event) => setSecretName(event.target.value)}
                  placeholder="PAYMENTS_API_KEY"
                  maxLength={64}
                  required
                  disabled={secretBusy || !!editingSecret}
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </label>
              <label className="field">
                {editingSecret ? `New value for ${editingSecret}` : "Secret value"}
                <input
                  className="input mono"
                  type="password"
                  value={secretValue}
                  onChange={(event) => setSecretValue(event.target.value)}
                  placeholder="Paste the API credential"
                  maxLength={8192}
                  required
                  autoComplete="new-password"
                  spellCheck={false}
                  disabled={secretBusy}
                />
              </label>
            </div>
            <div className="row">
              <button className="btn btn-primary" type="submit" disabled={secretBusy}>
                {secretBusy ? "Saving…" : editingSecret ? "Replace secret" : "Save secret"}
              </button>
              {editingSecret && (
                <button
                  className="btn"
                  type="button"
                  onClick={() => { setEditingSecret(""); setSecretName(""); setSecretValue(""); }}
                  disabled={secretBusy}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          {loading ? <p className="hint">Loading secrets…</p> : secrets.length === 0 ? (
            <p className="hint">No private secrets saved yet.</p>
          ) : (
            <div className="stack">
              {secrets.map((secret) => {
                const usedBy = secretUse.get(secret.name) ?? [];
                return (
                  <div className="envrow" key={secret.name} style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                    <div>
                      <code className="mono">{secret.name}</code>
                      <div className="hint">
                        {usedBy.length ? `Used by ${usedBy.join(", ")}` : "Not used by a proxy"}
                      </div>
                    </div>
                    <span className="hint">Value hidden · updated {new Date(secret.updated_at).toLocaleString()}</span>
                    <div className="row" style={{ flexWrap: "nowrap" }}>
                      <button
                        className="btn btn-sm"
                        type="button"
                        onClick={() => { setEditingSecret(secret.name); setSecretName(secret.name); setSecretValue(""); }}
                        disabled={secretBusy}
                      >
                        Replace
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        type="button"
                        onClick={() => void deleteSecret(secret.name)}
                        disabled={secretBusy || usedBy.length > 0}
                        title={usedBy.length ? "Edit or remove the proxy before deleting this secret." : undefined}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Restricted API proxies</h2>
          <span className="hint">{proxies.length} configured</span>
        </div>
        <div className="card-pad stack">
          <p className="hint" style={{ margin: 0 }}>
            Upstreams must use HTTPS on port 443. Each proxy is limited to its configured path prefix and methods. Requests are capped at 64 KB, responses at 1 MB, and each proxy allows 30 requests per client and 300 total requests per minute.
          </p>
          {secrets.length === 0 && (
            <div className="notice">Save a private secret above before creating an API proxy.</div>
          )}
          <form className="stack" onSubmit={saveProxy}>
            <div className="grid2">
              <label className="field">
                Proxy name
                <input
                  className="input"
                  value={proxyForm.name}
                  onChange={(event) => setProxyForm({ ...proxyForm, name: event.target.value })}
                  placeholder="payments"
                  pattern="[a-z][a-z0-9-]{0,39}"
                  title="Use lowercase letters, numbers, or dashes; start with a letter."
                  maxLength={40}
                  required
                  disabled={proxyBusy}
                />
              </label>
              <label className="field">
                API origin
                <input
                  className="input mono"
                  type="url"
                  value={proxyForm.origin}
                  onChange={(event) => setProxyForm({ ...proxyForm, origin: event.target.value })}
                  placeholder="https://api.vendor.com"
                  required
                  disabled={proxyBusy}
                />
              </label>
              <label className="field">
                Allowed path prefix
                <input
                  className="input mono"
                  value={proxyForm.path_prefix}
                  onChange={(event) => setProxyForm({ ...proxyForm, path_prefix: event.target.value })}
                  placeholder="/v1"
                  required
                  disabled={proxyBusy}
                />
              </label>
              <label className="field">
                Private secret
                <select
                  className="input"
                  value={proxyForm.secret_name}
                  onChange={(event) => setProxyForm({ ...proxyForm, secret_name: event.target.value })}
                  required
                  disabled={proxyBusy || secrets.length === 0}
                >
                  {secrets.map((secret) => <option key={secret.name} value={secret.name}>{secret.name}</option>)}
                </select>
              </label>
              <label className="field">
                Authentication header
                <input
                  className="input mono"
                  value={proxyForm.secret_header}
                  onChange={(event) => setProxyForm({ ...proxyForm, secret_header: event.target.value })}
                  placeholder="authorization"
                  maxLength={80}
                  required
                  disabled={proxyBusy}
                />
              </label>
              <label className="field">
                Header value prefix
                <input
                  className="input mono"
                  value={proxyForm.secret_prefix}
                  onChange={(event) => setProxyForm({ ...proxyForm, secret_prefix: event.target.value })}
                  placeholder="Bearer "
                  maxLength={64}
                  disabled={proxyBusy}
                />
              </label>
            </div>

            <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="hint" style={{ marginBottom: 8 }}>Allowed methods</legend>
              <div className="row">
                {METHODS.map((method) => (
                  <label key={method} className="row hint" style={{ gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={proxyForm.allowed_methods.includes(method)}
                      onChange={() => toggleMethod(method)}
                      disabled={proxyBusy}
                    />
                    {method}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="row">
              <button className="btn btn-primary" type="submit" disabled={proxyBusy || secrets.length === 0}>
                {proxyBusy ? "Saving…" : editingProxy ? "Save proxy" : "Create proxy"}
              </button>
              {editingProxy && <button className="btn" type="button" onClick={cancelProxyEdit} disabled={proxyBusy}>Cancel</button>}
            </div>
          </form>

          {loading ? <p className="hint">Loading proxies…</p> : proxies.length === 0 ? (
            <p className="hint">No API proxies configured.</p>
          ) : (
            <div className="stack">
              {proxies.map((proxy) => {
                const endpoint = `/api/proxy/${slug}/${proxy.id}`;
                return (
                  <article className="card card-pad stack" key={proxy.id}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <div>
                        <h3 style={{ margin: 0 }}>{proxy.name}</h3>
                        <div className="hint">{proxy.origin}{proxy.path_prefix} · {proxy.allowed_methods.join(", ")}</div>
                      </div>
                      <div className="row">
                        <button className="btn btn-sm" type="button" onClick={() => void copyEndpoint(proxy)}>
                          {copiedProxy === proxy.id ? "Copied" : "Copy endpoint"}
                        </button>
                        <button className="btn btn-sm" type="button" onClick={() => startProxyEdit(proxy)}>Edit</button>
                        <button className="btn btn-sm btn-danger" type="button" onClick={() => void deleteProxy(proxy)}>Delete</button>
                      </div>
                    </div>
                    <code className="mono" style={{ overflowWrap: "anywhere" }}>{endpoint}/…</code>
                    <div className="hint">Credential: {proxy.secret_name} → {proxy.secret_header}</div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {proxies.length > 0 && (
        <section className="card card-pad stack">
          <h2 style={{ margin: 0 }}>Calling a proxy</h2>
          <p className="hint" style={{ margin: 0 }}>Call the Nuke endpoint from your hosted page and append a path under the configured prefix. Nuke adds the private credential on the server.</p>
          <pre style={{ overflowX: "auto", margin: 0 }}><code>{`fetch("/api/proxy/${slug}/${proxies[0].id}/items", {
  method: "GET",
  headers: { "Accept": "application/json" }
}).then(response => response.json());`}</code></pre>
          <p className="hint" style={{ margin: 0 }}>Do not put the upstream credential in the browser request or in <code>window.NUKE_ENV</code>.</p>
        </section>
      )}
    </div>
  );
}
