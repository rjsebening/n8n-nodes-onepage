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