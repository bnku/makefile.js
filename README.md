# ⚡ Makefile Commander (or just `m`)

[🇬🇧 English](README.md) | [🇷🇺 Русский](README.RU.md)

**Makefile Commander** is an ultra-fast, lightweight interactive CLI commander for your `Makefile`, written in pure Node.js.

🚀 **Zero external dependencies.** Only requires Node.js (v12+).
🎨 **Beautiful TTY UI** with categories, instant search, arrow-key navigation, and clean terminal output.

![Makefile Commander](preview.gif)

---

### 🔥 Why is it awesome?

* **Instant Search**: Just start typing to filter commands by name, category, or description text on the fly.
* **Group by Categories**: Organize your `Makefile` with ease. Split commands into logical blocks (`Docker`, `Database`, `Deploy`, etc.).
* **Seamless Interactive Commands**: Running real-time logs (like `docker compose logs -f`) or interactive prompts inside your commands won't break the terminal UI — everything runs exactly as if you executed it directly.
* **No Terminal Clutter**: The tool cleanly erases its interface from the terminal before executing a command and upon exit, leaving your shell history pristine.

---

### 🛠️ Quick Setup (alias as `m`)

To run the utility by typing just a single letter `m` from any directory, copy it to your local executable path:

#### Option 1: System-wide installation (for all users)
```bash
sudo cp make.js /usr/local/bin/m && sudo chmod +x /usr/local/bin/m
```

#### Option 2: Local installation (for your user only)
```bash
mkdir -p ~/.local/bin
cp make.js ~/.local/bin/m
chmod +x ~/.local/bin/m
```
*💡 Make sure `~/.local/bin` is in your `$PATH` environment variable (usually configured in your `~/.bashrc`, `~/.zshrc`, or `~/.profile` by adding `export PATH="$HOME/.local/bin:$PATH"`).*

---

### ✍️ How to Document Your `Makefile`

Makefile Commander automatically parses targets and comments. You can format them in two ways:

#### Method 1: Inline Comments (using `##`)
The most concise way. Just add a description on the same line as the target, separated by double hash symbols:
```makefile
up: ## Run local dev environment in background
	docker compose up -d

down: ## Stop containers and clean environment
	docker compose down
```

#### Method 2: Categories and Multi-line Descriptions
For larger projects, you can group commands logically using the `@category` tag. Any comments immediately preceding the target will be used as its description:

```makefile
# @category App Development

# Build both frontend and backend for production
# with pre-build cache cleaning
build:
	npm run build

# @category Docker Local

# Spin up local PostgreSQL database
db-up:
	docker compose up -d postgres

# Stop PostgreSQL and delete persisted volumes
db-clean:
	docker compose down -v
```

---

### 🎮 Usage

Simply type `m` in any directory containing a `Makefile`:
```bash
m
```

#### UI Controls:
* `[↑ / ↓]` or `[Ctrl+P / Ctrl+N]` — Navigate through commands.
* `Any characters` — Search and filter in real-time.
* `[Backspace]` — Delete character in search.
* `[Enter]` — Run selected command.
* `[Esc]` or `[Ctrl+C]` — Exit utility.

#### Direct Execution (skip the menu)
If you already know the command name, pass it as an argument:
```bash
m build
```
* If the `build` target exists in your `Makefile`, it runs **immediately**, bypassing the menu.
* If it doesn't exist, the interactive UI opens with your query pre-filled in the search bar.

---

### 📦 Requirements
* **Node.js** v12.0.0 or newer.
* **Make** (pre-installed on macOS and most Linux distributions).
* No `npm install` or `package.json` required — works out of the box!
