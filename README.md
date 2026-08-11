# n8n-nodes-onepage

![OnePage Node](https://img.shields.io/badge/n8n-community--node-FF6D5A)

![Version](https://img.shields.io/badge/version-1.0.0-blue)

![License](https://img.shields.io/badge/license-MIT-green)

A streamlined n8n Community Node for **real-time integration of OnePage Leads** via a trigger.

Ideal for anyone who wants to **immediately automate the processing of new leads** – without polling, without detours.

---

## What is n8n?

n8n is a workflow automation tool that lets you automate processes between different web applications – such as **OnePage**, CRM systems, Slack, email, or databases.

Instead of manual work, processes run automatically in the background as soon as an event occurs.

---

## ⚖️ Legal Notice

This community node uses the public OnePage API and is **not officially affiliated with OnePage**.

All trademarks and product names are the property of their respective owners.

**Note:** This is a community-developed integration. For official support, please contact OnePage directly.

---

## 🚀 Overview

The **OnePage n8n Node** provides a **trigger** that is activated as soon as **a new lead is received in OnePage**.

The trigger is perfect for:

* Lead forwarding
* CRM synchronization
* Notifications
* Automated follow-ups
* Internal processes & scoring

No manual retrieval.

No time delay.


* No manual retrieval. **100% Event-Based.**

---

## ✨ Main Function

### ⚡ **OnePage Trigger – New Lead**

This node provides **exactly one trigger**:

* **New Lead**

* Triggered as soon as a new lead is created in OnePage

* Use via webhooks (real-time)

* Automatic registration & removal of the webhook in OnePage

---

## 🔔 Trigger Details

### **OnePage Trigger: New Lead**

| Property | Description |

| ----------------- | --------------------- |

| Trigger Type | Webhook |

| Trigger | New Lead in OnePage |

| Execution | Real-time |

| Webhook Handling | Automatic |

| Multiple Workflows | Supported |

The trigger sends all lead data provided by the OnePage webhook directly to the workflow.


---

## 📦 Installation

### Requirements

* n8n version **1.0.0 or higher**
* Active OnePage account

---

### Installation via Community Nodes

1. Open your **n8n instance**

2. Go to **Settings → Community Nodes**

3. Click **Install**

4. Install one of the following packages:

#### Option 1 – Scoped (recommended)

```bash
@rjsebening/n8n-nodes-onepage
```

#### Option 2 – Unscoped

```bash
n8n-nodes-onepage
```

5. Restart n8n → Node is available

---

## 🔐 Configuration

### Creating OnePage API Credentials

1. In n8n, go to **Credentials → New Credential**

2. Select **OnePage API**

3. Enter your login details:

* **Email**: OnePage Login Email

* **Password**: OnePage Login Password

* **Base URL**:

```

https://api-eu.onepage.io/api/v1

```

4. Save

The connection will be tested automatically upon saving.

---

## 🧩 Workflow Usage

1. Create a new workflow

2. Add the **OnePage Trigger**

3. Select the **New Lead** trigger type

4. Activate the workflow

👉 From now on, the workflow will be executed **automatically for every new lead**.


---

## 📖 Typical Use Cases

* Automatically transfer new OnePage leads to the CRM
* Instant notification via Slack, email, or Microsoft Teams
* Lead scoring and qualification immediately upon receipt
* Initiate automated follow-up workflows
* Handoff to sales or onboarding processes

---

## 🌍 Why this is important

Many teams don't lose leads during marketing –

but **after they've been received**.


This node ensures that:

* **No leads are left behind**
* **Response times drop to seconds**
* **Manual work is eliminated**
* **Processes become scalable**

In short: **Leads come in – everything else runs automatically.**

---

## 📬 About the author

I am [Rezk Jörg Sebening](https://github.com/rjsebening) –
a business automation expert for n8n, APIs, and scalable processes in the DACH region.

I develop n8n nodes and systems that consistently eliminate manual work.

👉 Follow me on GitHub for more practical community nodes and integrations.

## 📋 Disclaimer

This unofficial community Node is **not affiliated with, supported, or sponsored by OnePage**.  
It only provides an interface to the publicly available OnePage API under its terms of use.

**Important Notes:**

- This Node is developed and maintained by the community
- For issues with the OnePage API itself, please contact official OnePage support
- All OnePage trademarks and logos belong to OnePage
- This Node only acts as a connector to the public API

---

## 🤖 Onepage MCP (AI Agent tool)

In addition to the trigger, this package ships the **Onepage MCP** node. It is an
**AI Agent tool sub-node**: attach it to the **Tools** input of an n8n **AI Agent** and it exposes
**all** tools of the Onepage MCP server (`https://mcp.onepage.io/`) to the agent — each as its own
tool with its own input schema. Tool calls are forwarded to the MCP server via the Model Context
Protocol (Streamable HTTP). Authentication uses OAuth 2.1 (no manual API key).

It can only be used as an AI tool — it has no main workflow input/output. Optionally restrict which
tools the agent sees via **Tools to Expose** (All / Selected / All Except), and set a **Timeout**
under Options.

The agent sees each tool as `<NodeName>_<mcpToolName>` (for example `Onepage_MCP_list_pages`), so two
MCP tool nodes on the same agent never collide. Calls are always forwarded to the MCP server under
the tool's original name. All tool calls of one workflow execution share a single MCP session.

### Requirements

- **n8n 2.32.0 or newer** (or the 2.30.8 / 2.31.5 patch releases). Older versions cannot read a tool
  collection supplied by a community node, because n8n-core only started matching it structurally in
  those releases — the node would connect but the agent would see no tools.
- **Authentication:** an **Onepage MCP OAuth2 API** credential (OAuth 2.1 / PKCE, automatic
  discovery + Dynamic Client Registration). See [CREDENTIALS.md](CREDENTIALS.md).
- **Self-hosted n8n:** community tool nodes must be enabled via the environment variable:

  ```bash
  N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true
  ```

### Example workflow

1. Add an **AI Agent** node and a **Chat Model**.
2. Add the **Onepage MCP** node and connect it to the agent's **Tools** input.
3. Select your **Onepage MCP OAuth2 API** credential on the node.
4. Ask the agent a question that needs Onepage data — it sees and calls every Onepage MCP tool.
