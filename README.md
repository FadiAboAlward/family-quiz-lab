# Family Quiz Lab

Standalone/ad-hoc quizzes for Aya, Mohammad, and other family learners.

This repository is intentionally separate from `family-learning-hub`.

## Purpose

- Fast diagnostic and placement quizzes
- Short targeted follow-up quizzes
- Stable GitHub Pages domain for tablets managed by Family Link / Norton Family
- Reusable quiz engine; each quiz is data in `quizzes/*.json`
- Local autosave plus optional isolated Supabase cloud persistence

## Architecture

- `index.html` — quiz catalog
- `quiz.html` — reusable quiz UI
- `app.js` — quiz engine
- `styles.css` — shared UI styles
- `config.js` — backend configuration
- `quizzes/*.json` — individual quiz definitions

## Separation rule

Do not add this ad-hoc content to the main `family-learning-hub` application or its production learning model. The two projects serve different purposes.
