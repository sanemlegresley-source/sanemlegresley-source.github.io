# A working notebook — operations, experimentation & applied AI

**Sanem Le Gresley** · MIT · [LinkedIn](https://www.linkedin.com/in/sanemlegresley/)

A place to think out loud about how I approach the work: sizing an experiment, automating
a routine, scoring account health, reading a marketing funnel. Each piece is a small,
self-contained prototype — an annotated worked example rather than a case study.

> **On the data:** everything here runs on **edited, illustrative data**. Nothing in this
> repository is any employer's or client's information, and none of the numbers are reported
> results — they're there to make the method concrete.

Every piece runs live in the browser — no build step, no API key, no backend. Open the HTML
files directly, or serve the folder and browse to it.

## Projects

| # | Project | Area | What it explores |
|---|---------|------|------------------|
| 05 | [**Online Controlled Experiments**](experimentation/) | Experimentation · Stats | Notes and a small toolkit for A/B testing — a sample-size calculator, an honest test readout with confidence intervals and p-values, common pitfalls (peeking, multiple comparisons, CUPED), and a reading list. |
| 04 | [**Automation Opportunity Mapping**](ops-automation/) | Operations · AI | An impact-vs-effort matrix and a phased rollout for deciding what to automate first. |
| 02 | [**Account Health & Retention**](client-success/) | Client Success | How a composite health score can surface churn risk before renewal, and the play that tends to fit each signal. |
| 01 | [**Email Triage Prototype**](ai-email-triage/) | Applied AI | An in-browser sketch of an LLM triage layer — reads a message, assigns priority/category/sentiment, routes it, drafts a reply. |
| 03 | [**Reading a Marketing Funnel**](marketing-roi/) | Marketing analytics | ROAS, CAC, LTV:CAC and funnel conversion side by side, so budget talk starts from unit economics. |
| 06 | [**Foil Right-of-Way Trainer**](fencing/) 🤺 | Just for fun | An interactive "who gets the touch?" quiz on foil right-of-way, a valid-target diagram, and a quick glossary. A fencing aside. |

**Start here:** [`index.html`](./) — the hub that links them all.

## A few things I believe about this work

- **It's one loop, shared.** Acquisition, onboarding, support and retention belong to
  different teams but move together; instrumenting the whole loop is usually a collaboration.
- **Automation needs guardrails.** A useful automation ships with a human-in-the-loop
  checkpoint, a way to measure whether it's working, a rollback, and a clear owner.
- **Let the test decide.** Where it's practical, a well-run experiment settles a debate
  better than seniority — and stays honest about uncertainty instead of hiding it.
- **Schema-validated outputs.** When an LLM is in the loop, its output is strict JSON checked
  against a schema before anything downstream trusts it.

## Running locally

Pure static HTML/CSS/JS — no dependencies.

```bash
# open directly
open index.html            # macOS
xdg-open index.html        # Linux

# …or serve the folder
python3 -m http.server 8000         # then visit http://localhost:8000/./
```

The site also works as a **GitHub Pages** deployment — enable Pages on this repo and the
portfolio is publicly shareable at your Pages URL.

## Tech notes

- No frameworks or chart libraries — charts are hand-built SVG so the pages are tiny,
  fast, and dependency-free.
- Charts use a colorblind-safe categorical palette (validated against protan/deutan/tritan
  separation) with direct labels and table views, so nothing relies on color alone.
- Light and dark themes are both supported via `prefers-color-scheme`.
- Fully responsive; the pages read well on a phone.

---

*A working notebook by Sanem Le Gresley — built to be read and run. All data edited.*
[LinkedIn](https://www.linkedin.com/in/sanemlegresley/)
