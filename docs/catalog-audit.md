# Catalog audit, 2026-10-12

Loadout downloaded 68 popular skill repos from GitHub, pinned to a commit, and read every file inside every skill without running anything. Static rules flagged lines for prompt injection, hidden text, reading secrets, sending data out, running code from the internet, obfuscation, persistence, changes to Claude Code settings, and binaries. Every high-risk hit in an included repo was then read by hand.

Result: **57 community repos** plus `anthropics/skills`, **1273 skills** in the catalog.

What this does not prove: a skill can still give Claude bad advice, and scripts can have bugs. Static rules miss what they do not look for. The audit covers one commit; updates are not reviewed until the audit is run again (`node tools/catalog-audit/audit.mjs`).

## Included

| Repo | Stars | License | Skills | Commit | Notes |
| --- | ---: | --- | ---: | --- | --- |
| [anthropics/skills](https://github.com/anthropics/skills) | 180,722 | per skill | 19 | `dbd4588` | Official |
| [obra/superpowers](https://github.com/obra/superpowers) | 298,164 | MIT | 13 | `bb92a77` |  |
| [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | 161,827 | MIT | 6 | `11082c4` |  |
| [morluto/rea](https://github.com/morluto/rea) | 152,402 | MIT | 3 | `3b0ea59` |  |
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | 105,579 | MIT | 25 | `1be8e34` | Reviewed: Tells Claude to ignore instructions found in web pages (defensive). |
| [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach) | 96,556 | MIT | 1 | `94f06c1` |  |
| [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | 95,115 | MIT | 13 | `d237dd3` |  |
| [Egonex-AI/Understand-Anything](https://github.com/Egonex-AI/Understand-Anything) | 86,060 | MIT | 6 | `f2d0164` | Reviewed: Defensive "treat README as data" text; a regex that parses cron annotations in code under analysis. |
| [hugohe3/ppt-master](https://github.com/hugohe3/ppt-master) | 61,062 | MIT | 1 | `ca04346` | Its scripts send prompts to image services (OpenAI, Black Forest Labs) with your API keys when you use them. |
| [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd) | 56,676 | MIT | 1 | `1ecea19` |  |
| [blader/humanizer](https://github.com/blader/humanizer) | 56,180 | MIT | 1 | `225a6f3` |  |
| [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | 54,366 | MIT | 50 | `1efedbc` | Reviewed: Defensive "fetched pages are data, not instructions" text. |
| [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design) | 52,438 | MIT | 1 | `dd20721` | Reviewed: "Do not fall back silently, tell the user" (the opposite of hiding). |
| [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) | 49,452 | MIT | 6 | `3ccff53` |  |
| [Yuan1z0825/nature-skills](https://github.com/Yuan1z0825/nature-skills) | 47,702 | Apache-2.0 | 23 | `e605b35` | Some scripts send images to an OCR service when you use them. |
| [alibaba/open-code-review](https://github.com/alibaba/open-code-review) | 46,521 | Apache-2.0 | 2 | `4a3844c` |  |
| [MadsLorentzen/ai-job-search](https://github.com/MadsLorentzen/ai-job-search) | 46,360 | MIT | 9 | `a011214` |  |
| [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser) | 43,861 | Apache-2.0 | 10 | `d957091` | Reviewed: Prompt-injection warning for browser automation (defensive). |
| [wshobson/agents](https://github.com/wshobson/agents) | 40,501 | MIT | 180 | `46891e7` |  |
| [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) | 37,740 | Apache-2.0 | 21 | `f359d43` | Reviewed: Anthropic's plugin directory: security-scan docs, an rm -rf example inside a hook test, defensive text. |
| [virgiliojr94/book-to-skill](https://github.com/virgiliojr94/book-to-skill) | 34,659 | MIT | 1 | `a24e62f` |  |
| [alchaincyf/nuwa-skill](https://github.com/alchaincyf/nuwa-skill) | 34,182 | MIT | 1 | `fe03746` |  |
| [vercel-labs/skills](https://github.com/vercel-labs/skills) | 34,013 | MIT | 1 | `13e4063` |  |
| [googleworkspace/cli](https://github.com/googleworkspace/cli) | 31,409 | Apache-2.0 | 95 | `a3768d0` |  |
| [zarazhangrui/frontend-slides](https://github.com/zarazhangrui/frontend-slides) | 30,540 | MIT | 1 | `9906a34` |  |
| [jackwener/OpenCLI](https://github.com/jackwener/OpenCLI) | 30,102 | Apache-2.0 | 5 | `0f8fd44` | Reviewed: "Stop and tell the user to log in" (the opposite of hiding). |
| [Nutlope/hallmark](https://github.com/Nutlope/hallmark) | 29,954 | MIT | 1 | `13ac0ec` | Reviewed: Defensive "treat fetched content as untrusted" text. |
| [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory) | 29,359 | Apache-2.0 | 17 | `6a2b35a` |  |
| [yamadashy/repomix](https://github.com/yamadashy/repomix) | 28,807 | MIT | 6 | `55c6de6` |  |
| [browser-use/video-use](https://github.com/browser-use/video-use) | 28,794 | MIT | 2 | `43cfc56` |  |
| [op7418/guizang-ppt-skill](https://github.com/op7418/guizang-ppt-skill) | 27,724 | AGPL-3.0 | 1 | `c91369c` |  |
| [OthmanAdi/planning-with-files](https://github.com/OthmanAdi/planning-with-files) | 27,411 | MIT | 1 | `ff349eb` |  |
| [phuryn/pm-skills](https://github.com/phuryn/pm-skills) | 26,922 | MIT | 69 | `c68487d` |  |
| [titanwings/distilly](https://github.com/titanwings/distilly) | 25,532 | MIT | 1 | `6fb0ab9` | Reviewed: A test script in the repo runs Claude in bypassPermissions mode for end-to-end tests. Installing the skill never runs it. |
| [EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin) | 25,492 | MIT | 37 | `50532b0` | Reviewed: Workflow wording ("do not ask whether to..."), a schema listing permission modes, defensive text. |
| [op7418/Humanizer-zh](https://github.com/op7418/Humanizer-zh) | 19,516 | MIT | 1 | `f4518a8` |  |
| [AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo) | 18,782 | MIT | 8 | `4b99de2` | Reviewed: Rule that tool descriptions must never bypass the user (defensive). |
| [bradautomates/claude-video](https://github.com/bradautomates/claude-video) | 18,421 | MIT | 1 | `03ceb42` | Reviewed: Setup script installs uv with its official installer (irm https://astral.sh/uv/install.ps1 | iex). Flagged on the skill. Its setup script downloads and runs the uv installer from astral.sh. |
| [microsoft/SkillOpt](https://github.com/microsoft/SkillOpt) | 18,278 | MIT | 2 | `343db22` |  |
| [muratcankoylan/Agent-Skills-for-Context-Engineering](https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering) | 18,115 | MIT | 18 | `9ff0c99` |  |
| [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop) | 17,954 | MIT | 1 | `8da1f03` |  |
| [wanshuiyin/Auto-claude-code-research-in-sleep](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep) | 17,335 | MIT | 84 | `26b95cf` | Reviewed: Fallback wording when a tool is missing; not hiding anything from the user. |
| [greensock/gsap-skills](https://github.com/greensock/gsap-skills) | 16,273 | MIT | 8 | `aed9cfd` |  |
| [AgriciDaniel/claude-obsidian](https://github.com/AgriciDaniel/claude-obsidian) | 15,483 | MIT | 14 | `32ac5a0` |  |
| [yusufkaraaslan/Skill_Seekers](https://github.com/yusufkaraaslan/Skill_Seekers) | 15,136 | MIT | 2 | `5b5d8df` |  |
| [nidhinjs/prompt-master](https://github.com/nidhinjs/prompt-master) | 14,380 | MIT | 1 | `769bf64` |  |
| [Orchestra-Research/AI-Research-SKILLs](https://github.com/Orchestra-Research/AI-Research-SKILLs) | 13,490 | MIT | 98 | `773a529` | Reviewed: Install commands quoted from vendor docs (uv, ollama, Lambda); jailbreak strings used as test input for guardrail tools. |
| [Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills) | 11,844 | MIT | 67 | `1be15d8` | Reviewed: Install commands quoted from vendor docs (istio, linkerd); prompt-injection test strings; an ngrok URL placeholder. |
| [zubair-trabzada/geo-seo-claude](https://github.com/zubair-trabzada/geo-seo-claude) | 11,014 | MIT | 16 | `989cae0` |  |
| [Agents365-ai/drawio-skill](https://github.com/Agents365-ai/drawio-skill) | 10,093 | MIT | 1 | `5727082` |  |
| [AgriciDaniel/claude-ads](https://github.com/AgriciDaniel/claude-ads) | 9,930 | MIT | 34 | `ac21644` | Reviewed: Rules that refuse curl | bash installs (defensive). |
| [google-labs-code/stitch-skills](https://github.com/google-labs-code/stitch-skills) | 8,480 | Apache-2.0 | 16 | `0337446` |  |
| [Gentleman-Programming/gentle-ai](https://github.com/Gentleman-Programming/gentle-ai) | 7,715 | MIT | 18 | `caf3a01` |  |
| [trailofbits/skills](https://github.com/trailofbits/skills) | 7,495 | CC-BY-SA-4.0 | 75 | `442fc9d` | Reviewed: Security research docs quoting attack strings and installers. The one skill that changes permissions is excluded. |
| [Cocoon-AI/architecture-diagram-generator](https://github.com/Cocoon-AI/architecture-diagram-generator) | 7,421 | MIT | 1 | `4b9087d` |  |
| [Master-cai/Research-Paper-Writing-Skills](https://github.com/Master-cai/Research-Paper-Writing-Skills) | 7,416 | MIT | 1 | `77e7c2c` |  |
| [MengTo/Skills](https://github.com/MengTo/Skills) | 6,724 | MIT | 175 | `83a47fe` |  |
| [SawyerHood/dev-browser](https://github.com/SawyerHood/dev-browser) | 6,660 | MIT | 1 | `a25e767` |  |

## Left out

| Repo | Why |
| --- | --- |
| [mvanhorn/last30days-skill](https://github.com/mvanhorn/last30days-skill) | Its scripts decrypt your Chrome and Firefox session cookies and read Keychain secrets to log into X and Reddit as you. Deliberate, but too much access for a one-click install. |
| [Imbad0202/academic-research-skills](https://github.com/Imbad0202/academic-research-skills) | License not stated in a form GitHub recognizes. Left out until you check it. |
| [JimLiu/baoyu-skills](https://github.com/JimLiu/baoyu-skills) | Reuses Chrome session cookies to post to WeChat, X and Weibo, and includes a reverse-engineered Gemini web client ("danger-gemini-web"). |
| [Donchitos/Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) | 68 of 74 skills run hook scripts that live outside the skill folder, so they break when installed one by one. Use the repo as a whole project instead. |
| [teng-lin/notebooklm-py](https://github.com/teng-lin/notebooklm-py) | The skill is the whole Python project, and it reads your Chrome and Firefox cookies to sign in to NotebookLM as you. |
| [xbtlin/ai-berkshire](https://github.com/xbtlin/ai-berkshire) | No skill left after the per-skill checks. |
| [diet103/claude-code-infrastructure-showcase](https://github.com/diet103/claude-code-infrastructure-showcase) | A showcase of one project's setup. The skills point at that project's own files. |
| [SimoneAvogadro/android-reverse-engineering-skill](https://github.com/SimoneAvogadro/android-reverse-engineering-skill) | No skill left after the per-skill checks. |
| [deanpeters/Product-Manager-Skills](https://github.com/deanpeters/Product-Manager-Skills) | License not stated in a form GitHub recognizes. Left out until you check it. |
| [tech-leads-club/agent-skills](https://github.com/tech-leads-club/agent-skills) | License not stated in a form GitHub recognizes. Left out until you check it. |

## Not shortlisted

The wider scan covered the 160 most-starred repos tagged for Claude or agent skills. Most of the rest are apps or tools whose skills mainly drive that product, or lists of links. Notable ones left out on purpose:

- [affaan-m/ECC](https://github.com/affaan-m/ECC): A 1,062-skill harness that also changes Claude Code settings and hooks; too broad to vet skill by skill.
- [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills): 458 symbolic links inside skills. Loadout refuses links, so most entries could not install.
- [mukul975/Anthropic-Cybersecurity-Skills](https://github.com/mukul975/Anthropic-Cybersecurity-Skills): Offensive security playbooks (credential access, persistence, exfiltration) by design.
- [zhaoxuya520/reverse-skill](https://github.com/zhaoxuya520/reverse-skill): Offensive security and reverse engineering, with webhook and credential tooling by design.
- [SnailSploit/Claude-Red](https://github.com/SnailSploit/Claude-Red): Red-team tooling by design.
- [Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode): An orchestration layer that rewrites Claude Code settings and enables bypass modes.
- [nanocoai/nanoclaw](https://github.com/nanocoai/nanoclaw): An agent runtime; its skills drive that runtime and change Claude Code settings.
- [luongnv89/claude-howto](https://github.com/luongnv89/claude-howto): A tutorial; its skills are examples that include permission-bypass settings.
- [career-ops-hq/career-ops](https://github.com/career-ops-hq/career-ops): Skills are symbolic links. Loadout refuses links.
- [KKKKhazix/khazix-skills](https://github.com/KKKKhazix/khazix-skills): Skills are symbolic links. Loadout refuses links.
- [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills): No license.
- [tanweai/pua](https://github.com/tanweai/pua): No license.
- [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills): No license file GitHub recognizes.

## Name clashes (9)

Two skills with the same name would install to the same folder. Loadout lists both and installs only one at a time.

- `test-driven-development`: addyosmani/agent-skills and obra/superpowers
- `frontend-design`: anthropics/claude-plugins-official and anthropics/skills
- `skill-creator`: anthropics/claude-plugins-official and anthropics/skills
- `marketing-ideas`: phuryn/pm-skills and coreyhaines31/marketingskills
- `defuddle`: AgriciDaniel/claude-obsidian and kepano/obsidian-skills
- `obsidian-bases`: AgriciDaniel/claude-obsidian and kepano/obsidian-skills
- `obsidian-markdown`: AgriciDaniel/claude-obsidian and kepano/obsidian-skills
- `ads`: AgriciDaniel/claude-ads and coreyhaines31/marketingskills
- `skill-creator`: Gentleman-Programming/gentle-ai and anthropics/skills

## Skills left out of included repos (262)

- obra/superpowers: 2 skills. Needs files outside its folder.
- anthropics/skills: 1 skill. The starting skeleton for writing a new skill, not a skill to use.
- DietrichGebert/ponytail: 6 skills. A copy written for another agent; the Claude Code copy is listed.
- Egonex-AI/Understand-Anything: 3 skills. Part of a plugin and needs files the plugin provides. Install it with /plugin instead.
- ayghri/i-have-adhd: 1 skill. A copy written for another agent; the Claude Code copy is listed.
- alibaba/open-code-review: 1 skill. A second copy of open-code-review in the same repo; skills/open-code-review is listed.
- alibaba/open-code-review: 1 skill. A second copy of open-code-review-delegate in the same repo; skills/open-code-review-delegate is listed.
- wshobson/agents: 3 skills. Part of a plugin and needs files the plugin provides. Install it with /plugin instead.
- wshobson/agents: 1 skill. Needs files outside its folder.
- anthropics/claude-plugins-official: 8 skills. Part of a plugin and needs files the plugin provides. Install it with /plugin instead.
- anthropics/claude-plugins-official: 2 skills. A second copy of access in the same repo; external_plugins/discord/skills/access is listed.
- anthropics/claude-plugins-official: 2 skills. A second copy of configure in the same repo; external_plugins/discord/skills/configure is listed.
- vercel-labs/skills: 2 skills. Written for another agent (Codex, Cursor or similar).
- OthmanAdi/planning-with-files: 14 skills. Part of a plugin and needs files the plugin provides. Install it with /plugin instead.
- OthmanAdi/planning-with-files: 3 skills. A copy written for another agent; the Claude Code copy is listed.
- EveryInc/compound-engineering-plugin: 6 skills. A test fixture or example inside the repo, not a skill to install.
- AgriciDaniel/claude-seo: 27 skills. Part of a plugin and needs files the plugin provides. Install it with /plugin instead.
- microsoft/SkillOpt: 1 skill. Part of a plugin and needs files the plugin provides. Install it with /plugin instead.
- microsoft/SkillOpt: 2 skills. A second copy of skillopt-sleep in the same repo; plugins/dsh/skills/skillopt-sleep is listed.
- muratcankoylan/Agent-Skills-for-Context-Engineering: 1 skill. The repo root would install the whole project, including a script that sets up macOS background jobs. Its separate skills are listed.
- wanshuiyin/Auto-claude-code-research-in-sleep: 84 skills. A copy written for another agent; the Claude Code copy is listed.
- wanshuiyin/Auto-claude-code-research-in-sleep: 2 skills. A second copy of auto-paper-improvement-loop in the same repo; skills/auto-paper-improvement-loop is listed.
- wanshuiyin/Auto-claude-code-research-in-sleep: 2 skills. A second copy of auto-review-loop in the same repo; skills/auto-review-loop is listed.
- wanshuiyin/Auto-claude-code-research-in-sleep: 2 skills. A second copy of novelty-check in the same repo; skills/novelty-check is listed.
- wanshuiyin/Auto-claude-code-research-in-sleep: 2 skills. A second copy of paper-figure in the same repo; skills/paper-figure is listed.
- wanshuiyin/Auto-claude-code-research-in-sleep: 2 skills. A second copy of paper-plan in the same repo; skills/paper-plan is listed.
- wanshuiyin/Auto-claude-code-research-in-sleep: 2 skills. A second copy of paper-write in the same repo; skills/paper-write is listed.
- wanshuiyin/Auto-claude-code-research-in-sleep: 2 skills. A second copy of research-refine in the same repo; skills/research-refine is listed.
- wanshuiyin/Auto-claude-code-research-in-sleep: 2 skills. A second copy of research-review in the same repo; skills/research-review is listed.
- wanshuiyin/Auto-claude-code-research-in-sleep: 1 skill. A second copy of grant-proposal in the same repo; skills/grant-proposal is listed.
- wanshuiyin/Auto-claude-code-research-in-sleep: 1 skill. A second copy of idea-creator in the same repo; skills/idea-creator is listed.
- wanshuiyin/Auto-claude-code-research-in-sleep: 1 skill. A second copy of idea-discovery in the same repo; skills/idea-discovery is listed.
- wanshuiyin/Auto-claude-code-research-in-sleep: 1 skill. A second copy of idea-discovery-robot in the same repo; skills/idea-discovery-robot is listed.
- wanshuiyin/Auto-claude-code-research-in-sleep: 1 skill. A second copy of paper-poster-html in the same repo; skills/paper-poster-html is listed.
- wanshuiyin/Auto-claude-code-research-in-sleep: 1 skill. A second copy of paper-slides in the same repo; skills/paper-slides is listed.
- wanshuiyin/Auto-claude-code-research-in-sleep: 1 skill. A second copy of paper-writing in the same repo; skills/paper-writing is listed.
- xbtlin/ai-berkshire: 22 skills. Written for another agent (Codex, Cursor or similar).
- AgriciDaniel/claude-obsidian: 1 skill. Part of a plugin and needs files the plugin provides. Install it with /plugin instead.
- AgriciDaniel/claude-obsidian: 1 skill. A test fixture or example inside the repo, not a skill to install.
- yusufkaraaslan/Skill_Seekers: 24 skills. A test fixture or example inside the repo, not a skill to install.
- SimoneAvogadro/android-reverse-engineering-skill: 1 skill. Part of a plugin and needs files the plugin provides. Install it with /plugin instead.
- Gentleman-Programming/gentle-ai: 1 skill. A second copy of branch-pr in the same repo; skills/branch-pr is listed.
- Gentleman-Programming/gentle-ai: 1 skill. A second copy of chained-pr in the same repo; skills/chained-pr is listed.
- Gentleman-Programming/gentle-ai: 1 skill. A second copy of cognitive-doc-design in the same repo; skills/cognitive-doc-design is listed.
- Gentleman-Programming/gentle-ai: 1 skill. A second copy of comment-writer in the same repo; skills/comment-writer is listed.
- Gentleman-Programming/gentle-ai: 1 skill. A second copy of gentle-ai-bench in the same repo; skills/gentle-ai-bench is listed.
- Gentleman-Programming/gentle-ai: 1 skill. A second copy of rdd-defect-workflow in the same repo; skills/rdd-defect-workflow is listed.
- Gentleman-Programming/gentle-ai: 1 skill. A second copy of systemic-issue-triage in the same repo; skills/systemic-issue-triage is listed.
- Gentleman-Programming/gentle-ai: 1 skill. A second copy of work-unit-commits in the same repo; skills/work-unit-commits is listed.
- trailofbits/skills: 6 skills. Part of a plugin and needs files the plugin provides. Install it with /plugin instead.
- trailofbits/skills: 2 skills. A test fixture or example inside the repo, not a skill to install.
- trailofbits/skills: 1 skill. Writes Claude Code settings that turn on bypassPermissions (inside a container, but still).
- trailofbits/skills: 1 skill. Needs files outside its folder.
- MengTo/Skills: 1 skill. Needs files outside its folder.
