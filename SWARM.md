# Fair Winds project brief

<!-- swarm-project-brief:schema=1 -->

```json
{
  "schema_version": 1,
  "updated_at": "2026-11-11T19:11:00Z",
  "project": {
    "name": "Fair Winds",
    "purpose": "Hands-on sailing practice through engaging playable lessons."
  },
  "users_outcomes": [
    "Learn steering, wind/trim, manoeuvres, collision avoidance, dummy recovery, anchoring and radio use by doing.",
    "A publicly playable browser beta with clear feedback and the approved visual style."
  ],
  "objective": {
    "current": "Polish the live six-lesson beta: a compact minimal rank/reward UI and an isolated Claude scenery patch matching the approved ImageGen direction, followed by independent integration and actual-game proof.",
    "non_goals": [
      "No feature cuts or logo replacement.",
      "No claim of full sailing certification, Steam readiness or an unverified 90/100 score."
    ]
  },
  "repo": {
    "canonical_checkout": "C:/Projects/fair-winds/tmp/f-title-profile",
    "accepted_main": "b0962cf5e4564ab169dbc5bfb015f3aa15a29baf",
    "accepted_product": "93426a9904cb7c75be615904486a68ec72eddf28",
    "architecture": "Deterministic TypeScript simulation, Three.js world, existing DOM/CSS overlays, Vitest/source contracts and Firebase Hosting.",
    "placement": "Preserve the existing C checkout exception. New temporary checkouts use D:/Projects/fair-winds/tmp/."
  },
  "authority": {
    "ctrl_thread": "01a1970d-18a8-7933-a6f0-495007770b38",
    "scope": "Existing owner-authorized implementation, review, coordination and public release.",
    "constraints": [
      "No email, new login, paid extra usage, credential sharing or security-policy changes.",
      "Preserve previous private-material/provider denials; use only the existing public-source Claude review route.",
      "Preserve unrelated sessions/drafts, source custody, dirty work and accepted useful features."
    ]
  },
  "milestones": {
    "live": "93426a9 published and accepted for reviewed changes on 11 Nov.",
    "proof": "415 unit tests, 150 source contracts; 37 provider hashes, 13 live bodies, 8 headers; affected actual gameplay/UI proof.",
    "next": "SWARM UI producer and Claude public-source scenery producer work on disjoint files; performance analysis remains open/deferred. Independent review/build/release serialize after freeze."
  },
  "decisions": [
    "Original logo; selected F title with top-right player/rank; shared frameless overlays.",
    "Six direct-start lessons in a 3x2 chooser; gold rank/XP progression.",
    "Later owner decisions supersede historical one-lake non-goals where explicitly expanded.",
    "12 Nov owner correction: buttons have no underlines; compact rank reveal uses the rank as headline and Level once, with detailed XP totals in profile/settings. Keep the travelling XP boat on course completion."
  ],
  "ownership": {
    "ctrl": "01a1970d-18a8-7933-a6f0-495007770b38",
    "active_producers": [
      {
        "role": "DOER engineering",
        "owner": "/root/ui_polish",
        "surface": "Isolated D UI worktree, copy/loading/portrait and contained rank/reward UI."
      },
      {
        "role": "DOER native operator",
        "owner": "/root/fable_access",
        "surface": "Isolated public-source scenery packet and own existing Fair Fable session; no canonical writes."
      }
    ],
    "last_completed_roles": [
      "release_latest",
      "candidate_review",
      "fable_review"
    ],
    "rule": "One writer per mutable surface; bounded workers do not become controllers."
  },
  "proof_acceptance": {
    "route": "Independent exact-source review, matching focused/CI proof, ordinary-control desktop/short-landscape verification, exact deployed receipts.",
    "limits": [
      "Source/static proof is not browser/deployed proof.",
      "Fable initial review was static; physics/audio, physical phones, Steam and whole-game 90/100 remain unverified.",
      "Retain and label partial captures; do not fabricate scores or performance gains."
    ]
  },
  "risks_blockers": [
    "Cold-entry work and world rendering under pause remain performance concerns.",
    "Distinct covers, Mediterranean world fidelity and passive VHF caption proof remain open.",
    "The retained parent goal is usageLimited; preserve it and do not create a duplicate. Current continuation is owner-directed.",
    "Claude reset time is owner-confirmed; fresh availability remains unverified until one actual request runs. Foreground custody is serialized with SoWal and Brimstone; preserve their sessions/drafts."
  ],
  "links": {
    "public": "https://fairwinds.web.app/?v=93426a9",
    "parent": "https://linear.app/flowwweb/issue/FLO-81",
    "findings": "https://linear.app/flowwweb/issue/FLO-303",
    "performance": "https://linear.app/flowwweb/issue/FLO-293",
    "scenery": "https://linear.app/flowwweb/issue/FLO-295",
    "evidence": "C:/Projects/fair-winds/tmp/f-release-20261110"
  }
}
```
