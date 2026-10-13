// Static rules for the catalog audit. They flag lines for a human to read; a hit is not a verdict.
// kind is 'doc' (markdown and plain text that Claude reads) or 'code' (anything else).

// Characters that can hide text from a human reader: tag characters (invisible ASCII copies) and
// bidi overrides. Zero-width spaces and joiners are common in normal prose and emoji, so they are not here.
export const HIDDEN_UNICODE = /[\u202A-\u202E\u2066-\u2069\u{E0000}-\u{E007F}]/gu;

export const BINARY_EXT = new Set(['.exe', '.dll', '.so', '.dylib', '.msi', '.scr', '.com', '.jar', '.app', '.deb', '.rpm', '.apk']);

const TEXT_EXT = /\.(md|markdown|txt|py|sh|bash|zsh|js|mjs|cjs|ts|tsx|jsx|json|ya?ml|toml|ini|cfg|html?|css|xml|svg|csv|ps1|bat|cmd|rb|go|rs|java|kt|swift|c|h|cpp|lua|sql|r|tex|bib|env|gitignore|lock)$/i;

export function isTextLike(rel, buf) {
  if (TEXT_EXT.test(rel)) return true;
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return false;
  return true;
}

const URL_NOT_LOCAL = /https?:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|example\.(com|org)|\[::1\])/i;

export const RULES = [
  // Instructions hidden from or working against the user
  { id: 'override-instructions', sev: 'high', only: 'doc', re: /\b(ignore|disregard|forget)\b.{0,30}\b(previous|prior|above|earlier|all|any)\b.{0,20}\b(instructions|rules|guidelines|prompts?)\b/i },
  { id: 'conceal-from-user', sev: 'high', only: 'doc', re: /\b(do not|don't|never)\b.{0,25}\b(tell|inform|mention|reveal|show|disclose)\b.{0,30}\b(the )?user\b|without (telling|asking|informing|notifying) the user/i },
  { id: 'stealth-action', sev: 'medium', re: /\b(silently|secretly|covertly|stealthily|quietly)\b.{0,40}\b(send|upload|post|transmit|exfiltrat\w*|install|delete|collect|harvest|forward|record|share|report back)\b/i },
  { id: 'skip-permissions', sev: 'high', re: /dangerously-skip-permissions|--dangerously|bypassPermissions|"defaultMode"\s*:\s*"bypass/i },

  // Reading secrets
  { id: 'credential-paths', sev: (k) => (k === 'code' ? 'high' : 'medium'), re: /(~|\$HOME|%USERPROFILE%|os\.homedir\(\)|expanduser\(["']~)[^\n]{0,40}(\.ssh|\.aws|\.gnupg|\.netrc|\.npmrc|\.pypirc|\.git-credentials|\.docker\/config|\.kube\/config)|id_rsa|id_ed25519|wallet\.dat|Login Data|User Data[\/]+Local State|security find-generic-password/i },
  { id: 'browser-cookies', sev: 'high', only: 'code', re: /(Chrome|Chromium|Firefox|Edge|Brave)[^\n]{0,60}(Cookies|cookies\.sqlite|Login Data)|browser_cookie3|pycookiecheat/i },
  { id: 'env-dump', sev: 'medium', only: 'code', re: /JSON\.stringify\(process\.env\)|dict\(os\.environ\)|os\.environ\.copy\(\)|\bprintenv\b|Get-ChildItem env:|\benv\s*\|/i },

  // Running code fetched from the internet
  { id: 'pipe-to-shell', sev: 'high', re: /(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b|(iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^\n|]*\|\s*iex\b|python[23]?\s+-c\s+["'][^"']*urlopen/i },
  { id: 'exec-remote', sev: 'high', only: 'code', re: /(eval|exec|Function)\s*\(\s*(await\s+)?(fetch|requests\.get|urlopen|urllib|http\.get|axios)/i },

  // Obfuscation
  { id: 'decode-and-run', sev: 'high', only: 'code', re: /(eval|exec|Function|compile)\s*\([^\n]{0,80}(b64decode|base64|atob|fromCharCode|FromBase64String|codecs\.decode|zlib\.decompress|marshal\.loads)/i },
  { id: 'long-base64', sev: 'medium', re: /[A-Za-z0-9+/]{400,}={0,2}/, unless: /data:(image|font|application\/(font|x-font))/i },
  { id: 'powershell-encoded', sev: 'high', re: /powershell[^\n]{0,40}\s-(e|enc|encodedcommand)\s+[A-Za-z0-9+/=]{20,}/i },

  // Sending data out
  { id: 'upload-to-host', sev: 'medium', only: 'code', re: /(requests\.(post|put)|fetch\([^)]*method:\s*['"](POST|PUT)|curl\b[^\n]*\s(-d|--data|-F|--upload-file|-T)\b|Invoke-RestMethod[^\n]*-Method\s+(Post|Put))/i },
  { id: 'webhook-or-paste', sev: 'high', re: /discord(app)?\.com\/api\/webhooks|hooks\.slack\.com\/services|api\.telegram\.org\/bot|pastebin\.com\/api|transfer\.sh|webhook\.site|ngrok\.io|requestbin|pipedream\.net|interact\.sh|\boast\.(fun|site|live|me|pro|online)\b|burpcollaborator/i },
  { id: 'raw-ip-url', sev: 'medium', re: /https?:\/\/(?!127\.|0\.0\.0\.0|10\.|192\.168\.)\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/ },

  // Persistence and damage
  { id: 'persistence', sev: 'high', only: 'code', re: /\bcrontab\b|schtasks\s*\/create|launchctl\s+load|LaunchAgents|\\CurrentVersion\\Run|systemctl\s+enable|>>\s*~?\/?[^\n]*\.(bashrc|zshrc|profile|bash_profile)\b/i },
  { id: 'destructive', sev: 'high', re: /rm\s+-rf?\s+(--no-preserve-root\s+)?(\/|~|\$HOME|\*)(\s|$|")|Remove-Item[^\n]*-Recurse[^\n]*(C:\\|\$env:USERPROFILE)|format\s+[a-z]:|mkfs\.|dd\s+if=[^\n]*of=\/dev\//i },
  { id: 'claude-config-write', sev: 'medium', re: /(write|edit|modify|append|update|overwrite)[^\n]{0,60}(~\/\.claude\/settings|\.claude\/settings(\.local)?\.json|CLAUDE\.md|\.claude\/hooks)/i },

  // Compatibility: a skill copied out of a plugin may need files the plugin provides.
  { id: 'needs-plugin', sev: 'info', re: /\$\{?CLAUDE_PLUGIN_ROOT\}?|\$\{?CLAUDE_PLUGIN_DATA\}?/ },

  // Supply chain: worth knowing, rarely bad on its own
  { id: 'installs-packages', sev: 'low', re: /\b(pip3? install|npm (i|install)\b|npx -y|uvx\b|brew install|cargo install|go install|gem install)\b/i },
  { id: 'external-url', sev: 'low', only: 'code', re: URL_NOT_LOCAL },
  { id: 'network-call', sev: 'low', only: 'code', re: /\b(requests\.(get|post|put|patch|delete|Session)|httpx\.|urllib\.request|urlopen\(|aiohttp|fetch\(|axios\b|https?\.(get|request)\(|XMLHttpRequest|WebSocket\(|Invoke-WebRequest|Invoke-RestMethod)|(^|[\s;|&(])(curl|wget)\s/ },
];
