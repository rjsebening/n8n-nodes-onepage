# 📄 CREDENTIALS.md

# OnePage API Credentials

This file describes how to create the credentials for the OnePage API in n8n to use the OnePage Node.

Authentication is performed using login credentials (email & password).

---

## 🔑 Required Credentials

To use the integration, you need the following information:

1. Email Address

* The email address of your OnePage account.

* This is the same email address you use to log in to the OnePage dashboard.

2. Password

* The password of your OnePage account.

* Stored encrypted in n8n and not shared in plain text.

3. **Base URL (`baseUrl`)** *(optional, default value set)*

* Default value:

"
https://api-eu.onepage.io/api/v1
"
* This value is already pre-filled in the credentials and usually **does not need to be changed**.

---

## ⚙️ Setup in n8n

1. Open **n8n**.
2. Navigate to **Credentials → Add New Credential**.
3. Select **OnePage API**.
4. Enter the following information:

* **Email:** Your OnePage login email address
* **Password:** Your OnePage login password
* **Base URL:** (optional, default value recommended)
5. Save.

---

## ✅ Test Connection

When saving, n8n automatically tests the connection to OnePage. API.

Typical test request:

"
POST /auth/login
Host: https://api-eu.onepage.io/api/v1
Content type: application/json

{ "email": "<YOUR_EMAIL>", "password": "<YOUR_PASSWORD>"
}
"

* If your login credentials are correct, you will receive a **200 OK** response including an authentication token.
* If you encounter an error, please check:

* Email address
* Password
* whether your account is active

---

## 📝 Notes

* The login credentials are **your regular OnePage login**.
* If your password changes, the credentials in n8n must also be updated.
* Authentication is server-side; **no password is displayed in the workflow**.
* For production environments, a dedicated OnePage account is recommended. Integrations.
---

# Onepage MCP OAuth2 API Credentials

These credentials are used **only** by the **Onepage MCP** node (an AI Agent tool
sub-node). Authentication uses the Onepage MCP server's **OAuth 2.1** flow, **not**
email/password. Access and refresh tokens are managed by n8n and are never exposed to the AI
agent, logs, or error messages.

There is **no Client ID to enter**. The credential extends n8n's generic OAuth2 with
**Dynamic Client Registration** enabled, so n8n performs the full MCP OAuth flow automatically:

- OAuth metadata **discovery** (`/.well-known/oauth-protected-resource` →
  `/.well-known/oauth-authorization-server`),
- **Dynamic Client Registration** (a client is registered for your n8n instance, with the
  callback `https://<your-n8n-host>/rest/oauth2-credential/callback`),
- **PKCE** authorization-code login.

This is the same mechanism n8n's built-in *MCP Client Tool* node uses.

## Setup in n8n

There is **nothing to fill in**. The credential has no visible fields at all — server URL,
resource URL and the whole OAuth client configuration are baked in.

1. Add the **Onepage MCP** node to a workflow and open it.
2. As long as no Onepage MCP credential exists yet, n8n shows a **Connect** button directly in the
   node instead of the usual credential dropdown. Click it.
3. The Onepage login page opens. Log in and approve.
4. Done. n8n discovers the endpoints, registers a client, and stores the access + refresh
   tokens automatically.

> Once a credential of this type exists, n8n goes back to the normal dropdown — the button is an
> empty state for the first connection, not a permanent replacement. You can also create the
> credential the classic way via **Credentials → Add New Credential → "Onepage MCP OAuth2 API" →
> Connect my account**.

## Token lifetime

You do not have to reconnect when the **access token** expires. The node renews it in two ways,
the same combination n8n's built-in MCP nodes use:

- **Proactively** — before a request, whenever the token expires within the next 2 minutes (or
  within the last 10% of its lifetime, whichever is shorter). No request ever has to fail first.
  This relies on the absolute expiry n8n stores as `n8n_expires_at`; credentials connected with an
  older n8n, or authorization servers that do not send `expires_in`, have no such value — those
  fall back to the reactive path below, which works just as well, only one round trip slower.
- **Reactively** — after a `401`/`403`, the token is refreshed once and the request is retried.

Concurrent tool calls share a single refresh, so a busy agent never triggers a refresh storm.

A **manual reconnect is only needed** when the *refresh* token itself is gone:

- it expired (absolute lifetime or inactivity window of the Onepage authorization server),
- it was revoked (password change, integration disconnected, admin revoke),
- or the dynamically registered client expired.

In all of those cases the node reports "Could not connect to the Onepage MCP server.
Authentication failed." together with the "OAuth connection is missing, expired, or not
authorized" hint — then simply **reconnect** the credential.

> **Requirement:** Automatic discovery + Dynamic Client Registration is handled by n8n core
> and requires a **recent n8n version** (the MCP OAuth/DCR support from the late‑2025 1.11x+
> release line). On older versions the automatic flow is not available.
