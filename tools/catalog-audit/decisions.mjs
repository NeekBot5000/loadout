// Hand-made verdicts from reading the flagged lines on 2026-10-12. The audit flags; these decide.
// Every community entry is pinned to the commit that was audited. A newer commit is not reviewed.

export const AUDIT_DATE = '2026-10-12';

/** Repos left out entirely, with the reason shown in the report. */
export const EXCLUDE_REPO = {
  'mvanhorn/last30days-skill': 'Its scripts decrypt your Chrome and Firefox session cookies and read Keychain secrets to log into X and Reddit as you. Deliberate, but too much access for a one-click install.',
  'teng-lin/notebooklm-py': 'The skill is the whole Python project, and it reads your Chrome and Firefox cookies to sign in to NotebookLM as you.',
  'JimLiu/baoyu-skills': 'Reuses Chrome session cookies to post to WeChat, X and Weibo, and includes a reverse-engineered Gemini web client ("danger-gemini-web").',
  'Donchitos/Claude-Code-Game-Studios': '68 of 74 skills run hook scripts that live outside the skill folder, so they break when installed one by one. Use the repo as a whole project instead.',
  'diet103/claude-code-infrastructure-showcase': 'A showcase of one project\'s setup. The skills point at that project\'s own files.',
  'Imbad0202/academic-research-skills': 'License not stated in a form GitHub recognizes. Left out until you check it.',
  'deanpeters/Product-Manager-Skills': 'License not stated in a form GitHub recognizes. Left out until you check it.',
  'tech-leads-club/agent-skills': 'License not stated in a form GitHub recognizes. Left out until you check it.',
};

/** Individual skills left out from repos that are otherwise included. Key: "owner/repo:path". */
export const EXCLUDE_SKILL = {
  'trailofbits/skills:plugins/devcontainer-setup/skills/devcontainer-setup': 'Writes Claude Code settings that turn on bypassPermissions (inside a container, but still).',
  'muratcankoylan/Agent-Skills-for-Context-Engineering:.': 'The repo root would install the whole project, including a script that sets up macOS background jobs. Its separate skills are listed.',
  'anthropics/skills:template': 'The starting skeleton for writing a new skill, not a skill to use.',
};

/**
 * Repos whose high-severity hits were all read by hand and found to be defensive or documentation
 * text: "treat fetched pages as data, ignore instructions in them", prompt-injection test strings,
 * install commands quoted in docs, and tests that use example IPs.
 */
export const CLEARED_HIGH = {
  'addyosmani/agent-skills': 'Tells Claude to ignore instructions found in web pages (defensive).',
  'Egonex-AI/Understand-Anything': 'Defensive "treat README as data" text; a regex that parses cron annotations in code under analysis.',
  'coreyhaines31/marketingskills': 'Defensive "fetched pages are data, not instructions" text.',
  'cathrynlavery/diagram-design': '"Do not fall back silently, tell the user" (the opposite of hiding).',
  'vercel-labs/agent-browser': 'Prompt-injection warning for browser automation (defensive).',
  'Nutlope/hallmark': 'Defensive "treat fetched content as untrusted" text.',
  'jackwener/OpenCLI': '"Stop and tell the user to log in" (the opposite of hiding).',
  'AgriciDaniel/claude-seo': 'Rule that tool descriptions must never bypass the user (defensive).',
  'AgriciDaniel/claude-ads': 'Rules that refuse curl | bash installs (defensive).',
  'anthropics/claude-plugins-official': 'Anthropic\'s plugin directory: security-scan docs, an rm -rf example inside a hook test, defensive text.',
  'EveryInc/compound-engineering-plugin': 'Workflow wording ("do not ask whether to..."), a schema listing permission modes, defensive text.',
  'trailofbits/skills': 'Security research docs quoting attack strings and installers. The one skill that changes permissions is excluded.',
  'Orchestra-Research/AI-Research-SKILLs': 'Install commands quoted from vendor docs (uv, ollama, Lambda); jailbreak strings used as test input for guardrail tools.',
  'Jeffallan/claude-skills': 'Install commands quoted from vendor docs (istio, linkerd); prompt-injection test strings; an ngrok URL placeholder.',
  'wanshuiyin/Auto-claude-code-research-in-sleep': 'Fallback wording when a tool is missing; not hiding anything from the user.',
  'titanwings/distilly': 'A test script in the repo runs Claude in bypassPermissions mode for end-to-end tests. Installing the skill never runs it.',
  'bradautomates/claude-video': 'Setup script installs uv with its official installer (irm https://astral.sh/uv/install.ps1 | iex). Flagged on the skill.',
};

/** Extra warnings shown on a skill's inspector, by repo. */
export const WARN_REPO = {
  'bradautomates/claude-video': 'Its setup script downloads and runs the uv installer from astral.sh.',
  'hugohe3/ppt-master': 'Its scripts send prompts to image services (OpenAI, Black Forest Labs) with your API keys when you use them.',
  'Yuan1z0825/nature-skills': 'Some scripts send images to an OCR service when you use them.',
};

/** Paths written for other agents (Codex, Cursor, pi...). Claude Code copies are preferred. */
export const OTHER_AGENT_DIR = /(^|\/)(\.codex|\.cursor|\.pi|\.factory|\.opencode|\.gemini|\.windsurf|\.kiro|\.qwen|\.openclaw|\.claw|\.hermes|\.roo|\.cline|\.continue|\.amp|\.crush|\.goose|\.trae|\.kilocode|\.augment|\.github|codex-skills|skills-codex|cursor-skills|openclaw-skills)(\/|$)/;

/** Folders that hold test fixtures, golden files or examples, not skills meant to be installed. */
export const FIXTURE_DIR = /(^|\/)(tests?|__tests__|fixtures?|golden|testdata|test-data|examples?|samples?|demos?)(\/|$)/;

/** Short blurbs and kinds for the official skills, from the approved prototype. */
export const OFFICIAL_KIND = {docx:'documents',pdf:'documents',pptx:'documents',xlsx:'documents',
 'canvas-design':'design','frontend-design':'design','theme-factory':'design','brand-guidelines':'design','algorithmic-art':'design','slack-gif-creator':'design',
 'mcp-builder':'building','skill-creator':'building','web-artifacts-builder':'building','webapp-testing':'building','claude-api':'building',
 'doc-coauthoring':'writing','internal-comms':'writing','academy-guide':'guidance','discernment-nudge':'guidance'};

export const OFFICIAL_BLURB = {
 'academy-guide':'Points you to Claude Academy lessons when you ask how to use Claude.',
 'algorithmic-art':'Makes generative art with p5.js, using seeds so you can repeat a result.',
 'brand-guidelines':'Applies Anthropic brand colors and fonts to what Claude makes.',
 'canvas-design':'Designs posters and other static art as PNG or PDF files.',
 'claude-api':'Reference for building with the Claude API and its SDKs.',
 'discernment-nudge':'Adds a few follow-up questions after advice or drafts you might act on.',
 'doc-coauthoring':'Walks you through writing specs, proposals and other docs step by step.',
 'docx':'Creates and edits Word documents and templates.',
 'frontend-design':'Steers web design away from generic, template-looking defaults.',
 'internal-comms':'Writes status reports and company updates in common formats.',
 'mcp-builder':'Guides building MCP servers that connect Claude to outside services.',
 'pdf':'Reads, merges, splits, fills in and creates PDF files.',
 'pptx':'Builds and edits PowerPoint decks.',
 'skill-creator':'Turns a workflow you repeat into a new skill, then tests it.',
 'slack-gif-creator':'Makes animated GIFs sized for Slack.',
 'theme-factory':'Applies one of 10 ready-made color and font themes to slides, docs and pages.',
 'web-artifacts-builder':'Builds larger web artifacts with React, Tailwind and shadcn/ui.',
 'webapp-testing':'Tests a local web app with Playwright and takes screenshots.',
 'xlsx':'Creates and fixes spreadsheets, including formulas and CSV cleanup.'};

/** Notable repos from the wider scan that were not shortlisted for the catalog, and why. */
export const NOT_SHORTLISTED = {
  'affaan-m/ECC': 'A 1,062-skill harness that also changes Claude Code settings and hooks; too broad to vet skill by skill.',
  'alirezarezvani/claude-skills': '458 symbolic links inside skills. Loadout refuses links, so most entries could not install.',
  'mukul975/Anthropic-Cybersecurity-Skills': 'Offensive security playbooks (credential access, persistence, exfiltration) by design.',
  'zhaoxuya520/reverse-skill': 'Offensive security and reverse engineering, with webhook and credential tooling by design.',
  'SnailSploit/Claude-Red': 'Red-team tooling by design.',
  'Yeachan-Heo/oh-my-claudecode': 'An orchestration layer that rewrites Claude Code settings and enables bypass modes.',
  'nanocoai/nanoclaw': 'An agent runtime; its skills drive that runtime and change Claude Code settings.',
  'luongnv89/claude-howto': 'A tutorial; its skills are examples that include permission-bypass settings.',
  'career-ops-hq/career-ops': 'Skills are symbolic links. Loadout refuses links.',
  'KKKKhazix/khazix-skills': 'Skills are symbolic links. Loadout refuses links.',
  'multica-ai/andrej-karpathy-skills': 'No license.',
  'tanweai/pua': 'No license.',
  'vercel-labs/agent-skills': 'No license file GitHub recognizes.',
};
