# Engine NVH & Mount Dynamics — Deployment Guide

This guide covers deploying the **Engine NVH & Mount Dynamics App** step-by-step.

---

## 🏗 Understanding the Architecture

Unlike standard React + Node apps, this project contains **three interacting layers**:
1. **Frontend**: React 19 + Mantine UI + Vite.
2. **Backend**: Node.js + Express + Server-Sent Events (SSE).
3. **Computation Core**: Python 3 (`engine_calc.py` & `optimizer_calc.py`) with `numpy`, `scipy`, and `matplotlib`.
4. **Database**: MongoDB (stores calculation history and optimizer runs; safely falls back to in-memory if omitted).

Because the backend spawns a Python subprocess with `scipy` and `numpy`, **container-based deployment (Docker)** or a **Linux VPS (Ubuntu)** is the recommended approach.

---

## 🚀 Option 1: Render / Railway (Easiest Cloud Deploy)

Platforms like **Render** or **Railway** can build directly from your Git repository using the provided `Dockerfile`.

### Step 1: Push Project to GitHub / GitLab
```bash
git add .
git commit -m "Add Dockerfile and deployment config"
git push origin main
```

### Step 2: Deploy on Render
1. Sign up at [render.com](https://render.com).
2. Click **New +** → **Web Service**.
3. Connect your GitHub repository.
4. Set the following settings:
   - **Environment**: `Docker` (Render will automatically detect the root `Dockerfile`).
   - **Region**: Choose the closest region.
   - **Instance Type**: Starter (at least 1GB or 2GB RAM is recommended because SciPy optimizer runs differential evolution).
5. In **Environment Variables**, add:
   - `PORT`: `5050`
   - `PYTHON_PATH`: `/opt/venv/bin/python3`
   - `MONGO_URI`: Your MongoDB connection string (e.g. from MongoDB Atlas, or leave blank to use in-memory history).
6. Click **Create Web Service**. Render will build the container and provide an `https://your-app.onrender.com` URL.

---

## 🖥️ Option 2: Linux VPS (Ubuntu / AWS EC2 / DigitalOcean)

This option provides full control, fast CPU performance for the optimizer, and cost efficiency.

### Step 1: Provision Server
- Choose **Ubuntu 22.04 or 24.04 LTS** (DigitalOcean Droplet, AWS EC2 t3.medium, or Hetzner).
- Connect via SSH:
  ```bash
  ssh root@your-server-ip
  ```

### Step 2: Install System Packages
```bash
# Update package list
sudo apt update && sudo apt upgrade -y

# Install Git, curl, build tools
sudo apt install -y git curl build-essential

# Install Python 3, pip, venv
sudo apt install -y python3 python3-pip python3-venv

# Install Node.js 20 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 (process manager)
sudo npm install -g pm2
```

### Step 3: Clone Code & Configure Python Venv
```bash
# Clone your repository
cd /var/www
git clone https://github.com/your-username/engine-nvh-app.git
cd engine-nvh-app

# Create Python virtual environment and install dependencies
python3 -m venv /var/www/engine-nvh-app/venv
/var/www/engine-nvh-app/venv/bin/pip install --upgrade pip
/var/www/engine-nvh-app/venv/bin/pip install -r python/requirements.txt
```

### Step 4: Build Frontend & Install Backend
```bash
# 1. Build Client (React UI)
cd /var/www/engine-nvh-app/client
npm install
npm run build

# 2. Setup Server
cd /var/www/engine-nvh-app/server
npm install --production
```

### Step 5: Configure Environment Variables
Create `/var/www/engine-nvh-app/server/.env`:
```ini
PORT=5050
NODE_ENV=production
PYTHON_PATH=/var/www/engine-nvh-app/venv/bin/python3
MONGO_URI=mongodb://localhost:27017/engine-nvh
CLIENT_URL=""
```

### Step 6: Start with PM2 (Auto-Restart on Reboot)
```bash
cd /var/www/engine-nvh-app/server
pm2 start index.js --name "engine-nvh"
pm2 save
pm2 startup
```

### Step 7: Configure Nginx Reverse Proxy & SSL (HTTPS)
```bash
# Install Nginx and Certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# Create Nginx site configuration
sudo nano /etc/nginx/sites-available/engine-nvh
```

Add the following config:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # SSE long timeout for Optimizer (up to 20 minutes)
    proxy_read_timeout 1200s;
    proxy_connect_timeout 1200s;
    proxy_send_timeout 1200s;

    location / {
        proxy_pass http://127.0.0.1:5050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable buffering for live Server-Sent Events (SSE)
        proxy_buffering off;
        proxy_cache off;
    }
}
```

Enable site & get free SSL certificate:
```bash
sudo ln -s /etc/nginx/sites-available/engine-nvh /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Obtain SSL via Let's Encrypt
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## 🍃 MongoDB Setup (Optional / Recommended)

If you want persistent calculation history across server restarts:

1. **MongoDB Atlas (Cloud, Free 512MB Tier)**:
   - Go to [mongodb.com/atlas](https://www.mongodb.com/atlas).
   - Create a free cluster.
   - Whitelist your server IP (or `0.0.0.0/0` with secure credentials).
   - Copy connection string: `mongodb+srv://<user>:<password>@cluster.mongodb.net/engine-nvh?retryWrites=true&w=majority`.
   - Set as `MONGO_URI` in `.env`.

2. **Or run local MongoDB via Docker**:
   ```bash
   docker run -d --name mongo -p 27017:27017 -v mongo_data:/data/db mongo:7
   ```
