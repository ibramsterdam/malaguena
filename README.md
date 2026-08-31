# Malagueña

A personal guitar practice PWA, named after the first song it ever played.
Tuner, metronome, ASCII tab library, and timed practice routines with a
beat-synced tab playhead — wrapped in the Duende look (rosewood, lacquer
amber, serif).

## Running locally

```sh
bin/setup       # first time: installs gems, prepares and seeds the database
bin/rails server
```

Then open http://localhost:3000. Seeds include the Malagueña tab and a
"Morning practice" routine (10 min warm-up · 1 min break · 20 min free play).

The tuner needs a microphone, which browsers only allow over HTTPS or on
localhost — so it works in development as-is.

## Deploying

- Any HTTPS host works (the microphone and PWA install both require HTTPS).
- Set `MALAGUENA_PASSWORD` to put the whole app behind one shared password
  (HTTP Basic). Leave it unset to run the app open, as in development.
- SQLite is the production database on purpose; there is no other setup.

## How the audio pieces work

- **Metronome** — clicks are scheduled ahead on the Web Audio clock
  (lookahead scheduling), so JS timer jitter never reaches the ear. Each click
  dispatches a `metronome:beat` event.
- **Tab playhead** — ASCII tab has no rhythm information, so every column of
  fret numbers counts as one beat and the playhead advances on each
  `metronome:beat`. Right for steady arpeggio studies like Malagueña.
- **Tuner** — normalized autocorrelation over the mic signal with octave-error
  correction, accurate to a few cents across all six strings.
