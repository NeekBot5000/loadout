# Launch kit

Everything needed to publish Loadout and get it in front of people. Drafts are written for you to post
yourself; nothing here has been posted. Researched 2026-10-12; check each site's rules again on the day.

## 1. Publish (about 15 minutes, you)

Claude Code's auto mode refused to create a public repo, push or deploy while you were away, so these
steps are yours. Everything they need is committed on `master`.

1. Create an empty **public** repo `loadout` at <https://github.com/new> (owner NeekBot5000; no README,
   .gitignore or license, the project has its own).
2. Your older local commits carry your Gmail address as author. To keep it private, publish a fresh
   one-commit branch instead of `master`. In the project folder (Git Bash or PowerShell):
   ```
   git checkout --orphan main
   git -c user.name=NeekBot5000 -c user.email=NeekBot5000@users.noreply.github.com commit -m "Loadout 0.1.0"
   git remote add origin https://github.com/NeekBot5000/loadout.git
   git push -u origin main
   git tag v0.1.0
   git push origin v0.1.0
   git checkout master
   ```
   The tag starts the Release workflow, which builds the installer on Windows and publishes it
   (about 10 minutes; watch the Actions tab). From then on the app updates itself from releases.
   Later releases: bump `version` in package.json, commit to `main`, tag `vX.Y.Z`, push the tag.
3. On the repo page, the gear next to About:
   - Description: `A mod manager for Claude Code skills: one-click installs, On / Name only / Off, profiles, and a checked catalog. Windows.`
   - Website: the site address from step 4.
   - Topics: `claude-code`, `claude-skills`, `agent-skills`, `skills`, `mod-manager`, `electron`, `windows`, `anthropic`, `developer-tools`.
   - Social preview: upload `site/src/img/og.png`.
4. Website on Cloudflare (you are signed in to wrangler):
   ```
   node site/build.mjs
   npx wrangler pages project create loadout-skills --production-branch main
   npx wrangler pages deploy site/dist --project-name loadout-skills --branch main
   ```
   It goes live at `https://loadout-skills.pages.dev`. If you buy a domain later, rebuild with
   `SITE_URL=https://yourdomain node site/build.mjs` and add the domain in the Pages project.

Links on the site and in the README use `HEAD`, so they work whatever the default branch is called.

## 2. Where people will find it

| Place | When | Notes |
| --- | --- | --- |
| Show HN | Day 1, a weekday morning US time | Must be something people can try. Post the first comment yourself, stay to answer. Never ask anyone to upvote. [Rules](https://news.ycombinator.com/showhn.html) |
| r/ClaudeAI, r/ClaudeCode | Day 1 to 3 | Read each sub's self-promotion rules and use the right flair. One sub per day, not a blast. |
| awesome-claude-code | 14+ days after the repo is public | Needs 14 days since the first commit plus more commits after, **or** 100 stars. Submit only through the issue form, by a person, one line, no sales language. [Contributing](https://github.com/hesreallyhim/awesome-claude-code/blob/main/CONTRIBUTING.md) |
| ComposioHQ/awesome-claude-skills, VoltAgent/awesome-agent-skills | After the first users | Large lists of skills and skill tools. Read each one's contributing rules first (not checked tonight). |
| Product Hunt | Once there is a v0.2 with fixes from early feedback | A launch is a one-day event; better with a short screen recording. |
| X / Bluesky / LinkedIn | Any time | A 20-second clip of the meter turning amber, then Name only bringing it back, says more than text. |

What tends to carry a launch like this:
- **The audit is the story.** "I read every file in 160 Claude skill repos" is more interesting to HN
  than "I made a skill manager". Lead with the findings page (`audit.html`), link the app.
- **Be upfront about the built-in `/skills` menu.** Claude Code can already toggle states. Loadout's
  case is the catalog, one-click installs, profiles, the visible cost and the safety review.
- **Answer every comment on day one.** Fix the first real bug report within a day and say so.
- **Listed skill authors.** If you like, tell the authors of the 57 community repos their skills are
  listed (one polite note each, or a single post), with a small "Listed in Loadout" badge they can add.
  Don't open issues on their repos to promote it.

## 3. Drafts

### Show HN

Title (80 characters max): `Show HN: Loadout – a mod manager for Claude Code skills`

First comment:

> I kept installing Claude Code skills from GitHub until Claude stopped picking up half of them.
> Every skill that is on puts its name and description into the listing Claude reads at the start of
> each chat, and that listing has a budget of 1% of the context window; past it, Claude Code drops
> descriptions without telling you which.
>
> Loadout is a Windows app that treats skills like game mods: a list, one-click installs, and three
> states per skill (On, Name only, Off) written to Claude Code's own `skillOverrides` setting. A meter
> shows what your setup costs, and profiles switch whole setups.
>
> The part I spent the most time on is the catalog. I downloaded the 160 most-starred skill repos and
> read every file in every skill without running anything: 6,082 skill folders, 27% with scripts. Most
> of what did not make it in was not dangerous, just not a standalone skill (copies for other agents,
> plugin-only skills, test fixtures). Three repos read browser cookies to act as you on other sites,
> which is documented but more access than I wanted behind a one-click install. Write-up:
> [link to audit.html]
>
> Claude Code's `/skills` menu can toggle states too; Loadout adds the catalog, installs, profiles and
> the safety review. MIT, Electron. Installer isn't code-signed yet. Feedback very welcome, especially
> on the audit rules.

### Reddit (r/ClaudeAI or r/ClaudeCode)

Title: `I read every file in 160 Claude skill repos and built a mod manager for skills`

> Two things, one post. [Link to audit.html] is what I found reading every file in the 160 most-starred
> skill repos (scripts, links, cookie access, plugin-only skills, name clashes). Loadout [link] is the
> Windows app that came out of it: install skills from that checked catalog, switch each On / Name only /
> Off so they stop eating the skill listing, and save setups as profiles. Free and MIT. Happy to answer
> questions about the audit method; the rules and every decision are in the repo.

### Product Hunt

- Name: Loadout
- Tagline (60 max): `A mod manager for Claude Code skills`
- Description: `Install Claude Code skills from a checked catalog with one click, switch each On, Name only or Off, and see what your setup costs in context. Profiles, updates with a diff, and a safety review of every file.`

### awesome-claude-code one-liner (for the issue form, later)

`Loadout: Windows app to install Claude Code skills from a checked catalog and switch each On, Name only or Off through skillOverrides, with profiles and a per-file safety review.`

## 4. Ads and Google

### AdSense: what it takes

- **A domain you own.** AdSense does not accept a site on someone else's subdomain such as
  `loadout-skills.pages.dev` or `*.github.io` ([AdSense community answer](https://support.google.com/adsense/thread/120486831),
  [Stack Overflow](https://stackoverflow.com/questions/69243354/can-i-use-adsense-with-github-pages)).
  A `.com` is about $10 a year; Cloudflare Registrar sells at cost and attaches to the Pages project in
  a few clicks. This is a purchase, so it is your call.
- **Original content.** "Low value content" is the usual rejection. A catalog that mostly repeats other
  people's skill descriptions is at risk on its own, which is why the site now has three original
  guides and the audit write-up. More guides help.
- **18 or over**, a privacy page (done: `privacy.html`, which updates itself when ads are on), and the
  site indexed by Google ([eligibility](https://support.google.com/adsense/answer/9724)).

### AdSense: steps once you have the domain

1. Deploy the site on the domain, then add it to [Google Search Console](https://search.google.com/search-console)
   (verify with a DNS TXT record in Cloudflare) and submit `https://yourdomain/sitemap.xml`.
2. Sign up at <https://adsense.google.com> with your Google account and add the site. AdSense asks you
   to place a verification snippet: paste your `ca-pub-` ID into `adsenseClient` in `site/src/config.js`
   and rebuild. (With only the client ID set and no slot, the site still shows no ad.)
3. After approval (days to weeks), create one **display ad unit**, copy its slot number into
   `adsenseSlot`, rebuild and deploy. `ads.txt` and the content-security headers are generated
   automatically once both IDs are set.
4. In AdSense, turn on **Privacy & messaging → European regulations message**, Google's own consent
   prompt for the EEA, UK and Switzerland. No code change is needed.
5. Check the live page once ads are on: open the catalog, pick a skill, and look at the browser console.
   The site's security policy allows Google's ad hosts only when both IDs are set; if AdSense adds a
   new host and the console shows a blocked request, add that host to `adHosts` in `site/build.mjs`.
   (Tested tonight with Google requests blocked; the real ad flow could not be tested without an account.)
6. Leave **Auto ads off.** The site is built for exactly one ad: under the skill details on the catalog
   page, labelled "Advertisement", loaded only when it scrolls into view, never on the home page,
   guides or privacy page.

Honest expectation: a developer-tool site with a few thousand visits a month typically earns a few
dollars a month from one ad unit. A "Sponsor" link (GitHub Sponsors or Ko-fi) in the README usually
does better for open-source tools and has no privacy cost. Both can coexist.

### Google Business Profile

Not available for Loadout: Google lists online-only businesses as ineligible
([guidelines](https://support.google.com/business/answer/13763036)). The Google tools that do apply are
Search Console (getting indexed, seeing search queries) and AdSense.

## 5. Before you post, check

- [ ] The release built and `Loadout-Setup-0.1.0.exe` is attached; download it on a clean machine or
      account and install it.
- [ ] The website's download and source links point at the real repo and branch.
- [ ] SmartScreen warning is mentioned (it is, on the site and README).
- [ ] You have a couple of hours free to answer comments.
