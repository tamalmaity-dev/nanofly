<p align="center">
  <img src="https://raw.githubusercontent.com/tamalmaity-dev/nanofly/main/web/public/logo.png" alt="NanoFly Logo" width="100" style="border-radius: 24px;" />
</p>

<h1 align="center">NanoFly</h1>

<p align="center">
  <strong>An open-source & self-hostable alternative to Vercel, Netlify & Heroku.</strong>
</p>

<p align="center">
  Manage your servers, deploy applications & databases on your own hardware.<br/>
  You only need an SSH connection. Works on VPS, bare metal, and Raspberry Pi.
</p>

<p align="center">
  <a href="https://github.com/tamalmaity-dev/nanofly/releases/latest"><img src="https://img.shields.io/github/v/release/tamalmaity-dev/nanofly?style=flat-square&color=00d4aa" alt="Latest Release" /></a>
  <a href="#license"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=flat-square" alt="License: Apache 2.0" /></a>
  <a href="https://github.com/tamalmaity-dev/nanofly/actions"><img src="https://img.shields.io/github/actions/workflow/status/tamalmaity-dev/nanofly/release.yml?style=flat-square&label=CI" alt="CI" /></a>
  <a href="https://github.com/tamalmaity-dev/nanofly/stargazers"><img src="https://img.shields.io/github/stars/tamalmaity-dev/nanofly?style=flat-square" alt="Stars" /></a>
</p>

---

## 🚀 Getting Started

To install NanoFly on your server, run the following command:

```bash
curl -sSL https://raw.githubusercontent.com/tamalmaity-dev/nanofly/main/install.sh | sudo bash
```

Once execution completes, NanoFly is set up as a system service. Open the URL shown in your terminal to create your admin account and start deploying.

> **System Requirements**
> - Ubuntu 20.04+, Debian 11+, or Rocky Linux 8+
> - Docker Engine installed and running
> - Supports **x86_64** and **ARM64** architectures (including Raspberry Pi 4/5)

---

## ✨ Features

### 🐳 Application Deployment
- **Direct GitHub Integration:** Connect your repository and deploy branches automatically.
- **Docker-ready Builds:** Built-in builder to build your Dockerfiles, run build command steps, and handle deployments.
- **Streaming Logs:** Inspect compilation and runtime logs in real-time.
- **Environment Management:** Easily define, update, and hide environment secrets for your projects.

### 🐘 One-Click Databases
- **Major Engines Supported:** Provision **PostgreSQL**, **MySQL**, **MariaDB**, **Redis**, **MongoDB**, **KeyDB**, or **ClickHouse** instantly.
- **Auto-generated Credentials:** Zero manual config required. NanoFly handles root user generation and exposes clean connection strings.

### 📟 Interactive Web Terminal
- **PTY integration:** Full-powered shell inside your browser window.
- **Responsive Layout:** Automatically scales row/column bounds. Fully styled with custom themes.

### 📊 Telemetry & Health Checks
- Live dashboards for CPU, memory, storage utilization, and CPU temperature.
- Real-time service state monitoring (starting, active, stopped, restarting).

### ⚡ Resource Optimized
- Designed specifically for low-end devices and Raspberry Pis.
- Ultra lightweight single-binary Go backend using an embedded SQLite database.

### 🔄 Auto Updates
- Keep your panel updated. Pull latest beta and stable updates directly from the dashboard settings.

---

## 🤝 Contributing

We welcome contributions of all forms! Feel free to open issues, submit pull requests, or start discussions on our GitHub repository.

---

## 📄 License

NanoFly is open-source software licensed under the **[Apache License 2.0](LICENSE)**.
