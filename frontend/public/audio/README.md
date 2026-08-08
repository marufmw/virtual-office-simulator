# Sound

Nothing here is required. With this folder empty the office generates its
own sound — see `src/audio/music.js` and `src/audio/sfx.js` — and everything
you drop in replaces the generated version, with no code change.

## Music

Put a loopable track at `audio/office.mp3`. It plays while somebody is
standing in an office, looped, through the music volume slider.

Keep it small: everyone who walks in downloads it. Under ~3 MB, 96–128 kbps
is plenty for something playing quietly under a room.

## Effects

Put files in `audio/sfx/`. `.mp3`, `.ogg` and `.wav` all work.

| File          | When it plays                                    |
| ------------- | ------------------------------------------------ |
| `step.mp3`    | Every footfall — yours, and anyone walking nearby |
| `click.mp3`   | Any button, anywhere in the app                   |
| `open.mp3`    | The map, the whiteboard or a panel opening        |
| `close.mp3`   | …and closing                                      |
| `arrive.mp3`  | Somebody walks into the office                    |
| `depart.mp3`  | Somebody leaves                                   |
| `message.mp3` | A message arrives from someone else               |
| `nearby.mp3`  | Somebody comes close enough to talk to            |
| `refused.mp3` | The server turned something down                  |

**Variants.** `step` takes up to four (`step.mp3`, `step2.mp3`, `step3.mp3`,
`step4.mp3`) and `click` up to two; one is picked at random each time. Four
footsteps is the difference between walking and a stuck key. Even with one
file, playback speed is nudged slightly on every step.

Distance is handled for you: someone else's footsteps are quieter and panned
towards where they are standing, and are not played at all past about nine
metres.

**What makes a good file here:** short (a footstep is 100–200 ms, a click
under 80), trimmed hard at the start so it fires on time, and quiet — these
play constantly, and anything mastered loud will be exhausting within a
minute. Mono is fine and halves the size.

## Where to get them, free and safe to ship

- **[Kenney](https://kenney.nl/assets?q=audio)** — CC0, no attribution. The
  *Interface Sounds*, *UI Audio* and *Impact Sounds* packs cover clicks,
  panels and confirmations; this is the fastest way to sound deliberate.
- **[Pixabay](https://pixabay.com/sound-effects/)** — free for commercial
  use, no attribution. Good for footsteps ("footsteps carpet", "footsteps
  office") and there is an upbeat, loopable
  [music](https://pixabay.com/music/) library too.
- **[Freesound](https://freesound.org)** — enormous. Filter licence to
  **CC0** and you owe nobody anything; other filters need credit.
- **[Mixkit](https://mixkit.co/free-sound-effects/)** — free, no
  attribution, curated and quite polished.
- **[OpenGameArt](https://opengameart.org/art-search-advanced?field_art_type_tid%5B%5D=13)**
  — filter to CC0.
- **[FreePD](https://freepd.com)** and
  **[Incompetech](https://incompetech.com/music/royalty-free/music.html)** —
  public domain and CC-BY music respectively. Incompetech needs a credit
  line somewhere.

Check the licence on the page you download from rather than trusting a
search result, and keep a note of what came from where — a `CREDITS.md` next
to this file is enough.
