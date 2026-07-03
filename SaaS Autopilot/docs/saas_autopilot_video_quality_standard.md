# SaaS Autopilot Video Quality Standard

This standard is used by the SaaS Autopilot script, editor, and QA agents.

## Production Rule

Every video must be a strict step-by-step automation demonstration. The viewer should see what to click, what to enter, what to connect, what to test, and what result to verify.

Minimum requirements:

- Runtime: at least 480 seconds.
- Target runtime: about 540 seconds.
- Narration: at least 900 spoken words.
- Scenes: at least 8 structured scenes.
- Demo steps: at least 18 concrete UI actions.
- Visual anchors: at least 14 visible UI anchors such as button names, field names, node names, panels, test logs, tables, payloads, and output cards.
- No silent padding to reach duration.
- Every production scene must use a real, full-length screen recording.
- Images, generated slides, and black-frame fallbacks are forbidden in production output.
- A recording must cover at least 90% of its scene narration; looping a short clip is forbidden.
- QA scans the complete video for black frames and samples the complete runtime for repeated/static footage.
- Publication requires a human full-watch approval tied to the exact final video SHA-256 hash.

## Required Episode Shape

1. Finished result preview: show the completed workflow run and final output first.
2. Workspace setup: open the app, name the workflow, connect accounts.
3. Trigger build: create the trigger node, webhook, schedule, or event.
4. Input schema: paste real sample data and validate fields.
5. Transform and mapping: map exact fields and show normalized output.
6. AI/API/action configuration: configure prompt, endpoint, schema, model, or app action.
7. Test and debug: run happy path plus one bad input, show the error, and fix it.
8. Publish and handoff: activate, monitor, confirm downloadable PDF/materials.

## Research-Backed Practices

- Strong tutorials need preparation, script discipline, clear pacing, readable visuals, and high-quality audio. The ACM SIGCHI/Wired video guide warns against slow live demos, overly fast cuts, excessive pan/zoom, poor audio, and distracting mouse movement.
- Software tutorial viewers rely heavily on visual anchors in the application workspace. AQuA's tutorial-video research highlights that viewer questions often refer to UI elements and visual context.
- Good instructional videos need task-level goals plus systematic, specific steps. The GUIDE paper focuses on extracting meaningful task steps instead of trivial or unsystematic fragments.
- Demonstration beats manual-style explanation. The M2V paper shows that action sequences extracted from manuals become more useful when they are turned into performed instructional video steps.
- Comments on feature-rich software tutorials reveal that learners get stuck when steps skip context, use unexplained UI states, or fail to handle follow-along barriers.

## Bad Practices To Block

- Static text pictures with narration.
- Long problem descriptions before showing the build.
- Generic claims such as "streamlines operations", "results are incredible", or "game changer".
- Silent padding, repeated lines, filler summaries, or overlong CTA segments.
- Mascot/Ken Burns slides used as the primary visual.
- Showing only architecture diagrams instead of actual UI actions.
- Skipping account setup, field mapping, test payloads, edge cases, or final output verification.
- Uploading when the script lacks demo_steps and visual_plan.
- Treating a duration pass as proof of instructional quality.
- Reusing or looping short recordings underneath unrelated narration.

## Pilot-First Release Rule

After a production-standard change, build one pilot episode only. Do not batch-render or upload other episodes until the pilot has passed script QA, asset QA, full-render QA, downloadable-material QA, and a complete human watch-through. The approved pilot becomes the reference for pacing, framing, zoom level, narration timing, and demonstrated detail.

Human approval file: `metadata/review_approvals/<topic>_approval.json`

Required fields: `approved`, `watched_full_video`, `action_sync_verified`, `final_output_verified`, `reviewer`, and `video_sha256`.

## Source Links

- ACM SIGCHI/Wired guide to successful video presentations: https://www.wired.com/2012/10/acm-sigchi-guide-to-successful-video-presentations/
- AQuA software tutorial video question-answering paper: https://arxiv.org/abs/2403.05213
- GUIDE instructional video guideline extraction paper: https://arxiv.org/abs/2406.18227
- M2V manual-to-video instructional paper: https://arxiv.org/abs/2311.11031
- "My toxic trait is I wanna do everything now" software tutorial learner-barrier paper: https://arxiv.org/abs/2404.07114
