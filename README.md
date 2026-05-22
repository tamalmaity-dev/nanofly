<p align="center">
  <img src="https://raw.githubusercontent.com/tamalmaity-dev/nanofly/main/web/public/logo.png" alt="NanoFly Logo" width="100" style="border-radius: 24px;" />
</p>

<h1 align="center">NanoFly</h1>

<p align="center">
  <strong>A premium, self-hostable, lightweight PaaS. The open-source alternative to Vercel, Netlify, and Heroku.</strong>
</p>

<p align="center">
  Deploy applications, build from Git repositories, and provision databases in seconds on your own hardware. 
  Perfect for VPS, bare-metal servers, and Raspberry Pi.
</p>

<p align="center">
  <a href="https://github.com/tamalmaity-dev/nanofly/releases/latest"><img src="https://img.shields.io/github/v/release/tamalmaity-dev/nanofly?style=flat-square&color=00d4aa" alt="Latest Release" /></a>
  <a href="#license"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=flat-square" alt="License: Apache 2.0" /></a>
  <a href="https://github.com/tamalmaity-dev/nanofly/actions"><img src="https://img.shields.io/github/actions/workflow/status/tamalmaity-dev/nanofly/release.yml?style=flat-square&label=CI" alt="CI" /></a>
  <a href="https://github.com/tamalmaity-dev/nanofly/stargazers"><img src="https://img.shields.io/github/stars/tamalmaity-dev/nanofly?style=flat-square" alt="Stars" /></a>
</p>

---

## ⚡ About NanoFly Project

* **Zero Heavy Dependencies**: Unlike other self-hosted PaaS solutions, NanoFly is compiled into a single lightweight Go binary with an embedded SQLite database. No JVM, no heavy footprint.
* **Optimized for Low-End Hardware**: Fully optimized to run smoothly on low-resource environments (e.g. Raspberry Pi 4/5, $4 VPS instances).
* **One-Click Deployments**: Deploy applications directly from Git branches or provision database clusters in seconds.
* **Premium Dashboard**: A modern, interactive dark interface designed with accessibility, speed, and real-time state synchronization.

---

## 🚀 Installation

Get NanoFly running on your server with a single command:

```bash
curl -sSL https://raw.githubusercontent.com/tamalmaity-dev/nanofly/main/install.sh | sudo bash
```

Once installed:
1. **Access the Panel**: Open your browser and navigate to the address shown in the installation completion logs.
2. **Create Admin**: Complete the initial admin setup to access your dashboard.
3. **Connect & Deploy**: Start deploying applications from GitHub, managing environment variables, or creating databases.

### 📋 System Requirements
* **OS**: Ubuntu 20.04+, Debian 11+, or Rocky Linux 8+
* **Engine**: Docker Engine installed and active
* **Arch**: Supports **x86_64** and **ARM64** (Raspberry Pi 4/5)

---

## ✨ Features

### 🐳 Application Deployment
* **Git Integrations**: Hook directly to GitHub repositories for branch deployments.
* **Log Streaming**: Monitor container building and application execution output in real-time.
* **Configuration Panel**: Secure environment variable inputs with visibility toggles and clipboard copying.
* **Lightweight & ARM Compatible**: Specifically built to run efficiently on low-resource setups with minimal overhead.

### 🐘 Instantly Provision Databases
Create sandboxed database containers instantly with root-user auto-generation and clean integration strings. Supported engines:
* PostgreSQL, MySQL, MariaDB
* Redis, KeyDB, MongoDB, ClickHouse

### 📟 Native Web Terminal
* **Responsive Shell**: Embedded terminal using `xterm.js` and unix PTY.
* **Seamless Shell Access**: Run terminal commands directly from the dashboard on target hosts or active Docker containers, styled with premium dark terminal colors.

### 📊 Real-Time Server Telemetry
* Keep track of host performance with animated area charts.
* CPU utilization, RAM usage, storage volume overhead, and SoC CPU temperature.

### 🔄 Auto-Updating Dashboard
* Update panel versions (stable and beta releases) with a single click directly from settings.

---

## 🤝 Contributing

Contributions of any kind are welcome! Feel free to report bugs, suggest features, or submit pull requests.

---

## 📄 License

NanoFly is open-source software licensed under the **[Apache License 2.0](LICENSE)**.
