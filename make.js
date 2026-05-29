#!/usr/bin/env node

/**
 * Makefile Interactive CLI Commander
 * 
 * A universal script with zero external dependencies for interactive navigation
 * and running commands from a Makefile with search support and a beautiful TTY UI.
 * 
 * ============================================================================
 * MAKEFILE FORMATTING RULES FOR CLI COMPATIBILITY:
 * ============================================================================
 * 
 * 1. Category (section) declaration:
 *    - A new category is declared using the @category tag in a comment.
 *    - Example:
 *        # @category Docker Local
 *        # @category Database Prisma
 * 
 * 2. Command description declaration:
 *    - The description is written ON THE LINE IMMEDIATELY PRECEDING the target.
 *    - It can be any arbitrary text in any language and of any length.
 *    - Example:
 *        # Run local dev environment in background
 *        up:
 * 
 * 3. Alternative inline comment:
 *    - You can write a description on the same line as the target using double hashes "##":
 *        up: ## Run local dev environment in background
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

// Path to the Makefile in the current working directory (where the script is run)
const MAKEFILE_PATH = path.join(process.cwd(), 'Makefile');

/**
 * Parses the Makefile and extracts targets with their descriptions and categories.
 * @returns {Array<{name: string, description: string, category: string}>}
 */
function parseMakefile() {
  if (!fs.existsSync(MAKEFILE_PATH)) {
    console.error(`\x1b[31mError: Makefile not found at ${MAKEFILE_PATH}\x1b[0m`);
    process.exit(1);
  }

  const content = fs.readFileSync(MAKEFILE_PATH, 'utf8');
  const lines = content.split(/\r?\n/);
  
  const targets = [];
  let currentCategory = 'General';
  let currentComments = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Handle comments
    if (line.startsWith('#')) {
      const comment = line.slice(1).trim();
      if (comment) {
        // If the comment contains the @category tag, switch the active category
        if (comment.startsWith('@category')) {
          currentCategory = comment.replace('@category', '').trim();
          currentComments = [];
        } else {
          // Any other comment is treated as a description for the subsequent command
          currentComments.push(comment);
        }
      }
      continue;
    }

    // An empty line resets the accumulated command comments
    if (line === '') {
      currentComments = [];
      continue;
    }

    // Regular expression to find Makefile targets
    // Excludes variable assignments (:=)
    const targetMatch = line.match(/^([a-zA-Z0-9_-]+)\s*:(?!=)/);
    if (targetMatch) {
      const name = targetMatch[1];
      
      // Ignore built-in keywords and standard templates
      if (['include', 'ifneq', 'endif', 'else', 'ifdef', 'ifndef'].includes(name)) {
        continue;
      }

      // Look for an inline comment like `target: ## comment`
      let description = '';
      const inlineCommentMatch = line.match(/##\s*(.*)$/);
      if (inlineCommentMatch) {
        description = inlineCommentMatch[1].trim();
      } else if (currentComments.length > 0) {
        description = currentComments.join(' ');
      }

      targets.push({
        name,
        category: currentCategory,
        description
      });

      currentComments = [];
    }
  }

  return targets;
}

// Load targets
const allTargets = parseMakefile();

if (allTargets.length === 0) {
  console.log('\x1b[33mNo targets found in Makefile.\x1b[0m');
  process.exit(0);
}

// Interface state
let searchQuery = '';
let selectedIndex = 0;
let scrollOffset = 0;
let lastRenderedLines = 0;
let isRunningCommand = false;

// Set up the terminal for interactive mode
function setupTerminal() {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.setEncoding('utf8');
  process.stdin.resume();
  readline.emitKeypressEvents(process.stdin);
  
  // Hide the cursor
  process.stdout.write('\x1b[?25l');
}

// Restore the standard terminal mode
function restoreTerminal() {
  // Show the cursor
  process.stdout.write('\x1b[?25h');
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
}

/**
 * Beautifully formats a command list row considering colors and terminal width.
 * Prevents line wrapping by truncating long descriptions.
 */
function formatRow(target, isSelected, termWidth, isScrollBarLine, isScrollActive, maxNameLength) {
  const nameWidth = Math.min(35, Math.max(15, maxNameLength));
  
  // Command name
  let displayName = target.name;
  if (displayName.length > nameWidth) {
    displayName = displayName.slice(0, nameWidth - 3) + '...';
  }
  displayName = displayName.padEnd(nameWidth);

  // Category
  let displayCategory = '';
  if (target.category && target.category !== 'General') {
    displayCategory = `[${target.category}]`;
  }
  displayCategory = displayCategory.padEnd(22).slice(0, 22);

  // Description
  // Calculate the available width for the description
  // 3 (prefix " ❯ ") + nameWidth + 1 (space) + 22 (category) + 3 (separator " # ") + 2 (scrollbar) = nameWidth + 31
  const prefix = isSelected ? ' ❯ ' : '   ';
  const overhead = nameWidth + 31;
  const descWidth = Math.max(10, termWidth - overhead);

  let displayDesc = target.description || '';
  if (displayDesc.length > descWidth) {
    displayDesc = displayDesc.slice(0, Math.max(5, descWidth - 3)) + '...';
  }
  displayDesc = displayDesc.padEnd(descWidth);

  // Scrollbar character
  let scrollChar = ' ';
  if (isScrollActive) {
    scrollChar = isScrollBarLine ? '█' : '│';
  }

  if (isSelected) {
    return `\x1b[1;36m${prefix}\x1b[1;36m${displayName}\x1b[0m \x1b[90m${displayCategory}\x1b[0m \x1b[33m# ${displayDesc}\x1b[0m \x1b[36m${scrollChar}\x1b[0m`;
  } else {
    return `\x1b[90m${prefix}\x1b[0m\x1b[37m${displayName}\x1b[0m \x1b[90m${displayCategory}\x1b[0m \x1b[90m# ${displayDesc}\x1b[0m \x1b[90m${scrollChar}\x1b[0m`;
  }
}

// Render the interface
function render() {
  if (isRunningCommand) return;

  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;

  // Filter targets by search query
  const query = searchQuery.toLowerCase();
  const filtered = allTargets.filter(t => 
    t.name.toLowerCase().includes(query) || 
    (t.description && t.description.toLowerCase().includes(query)) ||
    (t.category && t.category.toLowerCase().includes(query))
  );

  // Adjust the selection index
  if (filtered.length === 0) {
    selectedIndex = 0;
  } else if (selectedIndex >= filtered.length) {
    selectedIndex = filtered.length - 1;
  }

  // Calculate scroll parameters
  // Header (3 lines) + Search (2 lines) + Tip (2 lines) = 7 lines overhead
  const maxVisible = Math.min(15, Math.max(5, rows - 8));
  
  if (selectedIndex < scrollOffset) {
    scrollOffset = selectedIndex;
  } else if (selectedIndex >= scrollOffset + maxVisible) {
    scrollOffset = selectedIndex - maxVisible + 1;
  }

  const total = filtered.length;
  const visible = Math.min(maxVisible, total);
  const isScrollActive = total > visible;

  // Scrollbar slider range
  let barStart = 0;
  let barSize = 0;
  if (isScrollActive) {
    barSize = Math.max(1, Math.round((visible / total) * visible));
    const maxStart = visible - barSize;
    const pct = scrollOffset / (total - visible);
    barStart = Math.min(maxStart, Math.round(pct * maxStart));
  }

  const outputLines = [];

  // 1. Beautiful header
  outputLines.push(`\x1b[1;35m⚡ Makefile Commander\x1b[0m \x1b[90m(found ${allTargets.length} targets)\x1b[0m`);
  
  // 2. Search line
  const searchPlaceholder = searchQuery ? searchQuery : '\x1b[90mType to filter commands...\x1b[0m';
  outputLines.push(`\x1b[1;37m🔍 Search:\x1b[0m ${searchPlaceholder}`);
  outputLines.push(`\x1b[90m${'─'.repeat(Math.min(cols, 80))}\x1b[0m`);

  // 3. Command list output
  const maxNameLength = Math.max(...allTargets.map(t => t.name.length), 20);
  
  if (filtered.length === 0) {
    outputLines.push(`   \x1b[31mNo matching commands found.\x1b[0m`);
    // Fill with empty lines to maintain height
    for (let i = 1; i < maxVisible; i++) {
      outputLines.push('');
    }
  } else {
    for (let i = 0; i < maxVisible; i++) {
      const itemIndex = scrollOffset + i;
      if (itemIndex < filtered.length) {
        const target = filtered[itemIndex];
        const isScrollBarLine = isScrollActive && (i >= barStart && i < barStart + barSize);
        outputLines.push(formatRow(target, itemIndex === selectedIndex, cols, isScrollBarLine, isScrollActive, maxNameLength));
      } else {
        outputLines.push('');
      }
    }
  }

  // 4. Navigation tips
  outputLines.push(`\x1b[90m${'─'.repeat(Math.min(cols, 80))}\x1b[0m`);
  outputLines.push(`\x1b[90m[↑/↓] Navigate  •  [Enter] Run  •  [Backspace] Clear  •  [Esc/Ctrl+C] Exit\x1b[0m`);

  // Clear previous output and redraw
  if (lastRenderedLines > 0) {
    readline.moveCursor(process.stdout, 0, -lastRenderedLines);
    readline.clearScreenDown(process.stdout);
  }

  // Write all lines to stdout
  process.stdout.write(outputLines.join('\n') + '\n');
  lastRenderedLines = outputLines.length;
}

// Run the selected command
function runCommand(targetName) {
  isRunningCommand = true;
  restoreTerminal();

  // Completely clear our CLI block to avoid leaving clutter
  if (lastRenderedLines > 0) {
    readline.moveCursor(process.stdout, 0, -lastRenderedLines);
    readline.clearScreenDown(process.stdout);
  }

  console.log(`\x1b[1;32m⚡ Running command:\x1b[0m \x1b[1;36mmake ${targetName}\x1b[0m\n`);

  // Run make with the selected target
  const child = spawn('make', [targetName], {
    stdio: 'inherit',
    shell: true
  });

  child.on('close', (code) => {
    console.log(`\n\x1b[90m──────────────────────────────────────────────────\x1b[0m`);
    if (code === 0) {
      console.log(`\x1b[1;32m✔ Command completed successfully.\x1b[0m`);
    } else {
      console.log(`\x1b[1;31m✘ Command failed with exit code ${code}.\x1b[0m`);
    }
    process.exit(code);
  });
}

// Keyboard event handling
process.stdin.on('keypress', (str, key) => {
  if (isRunningCommand) return;

  // Exit via Ctrl+C or Escape
  if ((key.ctrl && key.name === 'c') || key.name === 'escape') {
    restoreTerminal();
    if (lastRenderedLines > 0) {
      readline.moveCursor(process.stdout, 0, -lastRenderedLines);
      readline.clearScreenDown(process.stdout);
    }
    console.log('Commander closed.');
    process.exit(0);
  }

  const query = searchQuery.toLowerCase();
  const filtered = allTargets.filter(t => 
    t.name.toLowerCase().includes(query) || 
    (t.description && t.description.toLowerCase().includes(query)) ||
    (t.category && t.category.toLowerCase().includes(query))
  );

  if (key.name === 'up') {
    if (filtered.length > 0) {
      selectedIndex = (selectedIndex - 1 + filtered.length) % filtered.length;
    }
    render();
  } else if (key.name === 'down') {
    if (filtered.length > 0) {
      selectedIndex = (selectedIndex + 1) % filtered.length;
    }
    render();
  } else if (key.name === 'return') {
    if (filtered.length > 0 && selectedIndex < filtered.length) {
      runCommand(filtered[selectedIndex].name);
    }
  } else if (key.name === 'backspace') {
    searchQuery = searchQuery.slice(0, -1);
    selectedIndex = 0;
    render();
  } else if (str && str.length === 1 && !key.ctrl && !key.meta) {
    searchQuery += str;
    selectedIndex = 0;
    render();
  }
});

// Handle terminal resize
process.stdout.on('resize', () => {
  render();
});

// Guaranteed terminal restoration on unexpected errors
const cleanExit = () => {
  restoreTerminal();
  process.exit();
};

process.on('SIGINT', cleanExit);
process.on('SIGTERM', cleanExit);
process.on('uncaughtException', (err) => {
  restoreTerminal();
  console.error('\x1b[31mUncaught Exception:\x1b[0m', err);
  process.exit(1);
});

// Execution start
const initialArg = process.argv.slice(2)[0];

if (initialArg) {
  const targetExists = allTargets.some(t => t.name === initialArg);
  if (targetExists) {
    runCommand(initialArg);
  } else {
    // If the command is not found, open the CLI with the search pre-filled
    searchQuery = initialArg;
    setupTerminal();
    render();
  }
} else {
  setupTerminal();
  render();
}
