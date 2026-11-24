# Reken Avontuur · Math Adventure 🦉

A math game for 5–6 year olds, in **Dutch and English** (Flemish school style). It works **offline** on an Android tablet after it has been opened once.

Every instruction is **read aloud** (in Dutch, English, or both), so the child doesn't need to be able to read. The buttons are big, mistakes are never punished (the child just tries again), and every round of 8 questions earns stars and a sticker.

## Dutch and English

- **Flag button (top right)** switches the text on screen: 🇧🇪 🇬🇧 both languages (Dutch with English underneath) → 🇧🇪 Dutch only → 🇬🇧 English only.
- **⚙️ Ouders / Parents → Read aloud** chooses the voice: Off, Dutch, Dutch + English, or English. Default: Dutch, so the child hears the words used at school.
- **⚙️ Ouders / Parents → Word list**: the Dutch math words your child hears at school (verliefde harten, tiental, eenheid, gedeeld door…) with English meanings. Tap a word to hear how it's pronounced in Dutch.
- On the abacus, English mode shows H / T / **O** (hundreds, tens, ones); Dutch shows H / T / **E** (honderdtal, tiental, eenheid).

## The 9 games (each with 3 levels: 🐣 Makkelijk · 🐥 Gewoon · 🦁 Moeilijk)

| Game | What it teaches |
|---|---|
| 🐞 **Tellen** | Counting objects to 5 / 10 / 20 (grouped in fives), recognising spoken numbers |
| 💯 **Getallen** | Numbers to 20 / 100 / 200: hearing a number, MAB blocks (H-T-E), the missing number, bigger/smaller, counting on in jumps (2, 5, 10) |
| ➕ **Plus** | Adding with pictures, and with ten frames up to 20 |
| ➖ **Min** | Taking away (items get crossed out) |
| ✖️ **Keer** | Making groups ("3 groepjes van 2"), times tables of 2, 5 and 10 |
| ➗ **Delen** | Sharing fairly: the child taps the animals to share out the food, then answers "how many does each one get?" |
| 🔴 **Rekenrek** | The 20-bead rekenrek used in Flemish classrooms (5 red + 5 white per row): make a number, read a number, add up to 20. Also has a free-play mode |
| 🧮 **Telraam** | Abacus with H / T / E rods. 10 beads swap automatically into 1 bead on the next rod ("10 eenheden worden 1 tiental!"). Also has a free-play mode |
| 🧠 **Hoofdrekenen** | Mental math: *verliefde harten* (pairs that make 10), doubles, halves, sums to 20, tens up to 200 |

It uses the Flemish conventions: `:` for division, and the colour code **H = green, T = red, E = blue**.

## Putting it on GitHub Pages

1. Upload all of these files to the repo (keep the `icons` folder):
   `index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest`, `icons/`
2. On GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**.
3. After about a minute the app is live at
   `https://ghostbuster2124.github.io/math-adventure-app/`

## Installing on the Android tablet (for offline use)

1. Open the link above in **Chrome** on the tablet while you're on Wi-Fi.
2. Tap **⋮ → Add to home screen / Install app**.
3. Open the app once from the home screen icon. From then on it works **without internet**, full-screen.

### Making the voice work offline
The voice comes from the tablet's own text-to-speech, which needs a Dutch voice installed on the tablet:
**Settings → System → Languages → Text-to-speech output → Google → ⚙️ → Install voice data → Nederlands (België)** (and English, if you use the English voice).
You can test the voice in the app under **⚙️ Ouders → ▶️ Test stem**.

## Updating the app later
If you change any file, also bump the version in `sw.js` (for example `reken-avontuur-v2` → `v3`). The tablet picks up the new version the next time it opens the app while online.

Progress (stars and stickers) is saved on the tablet itself. You can reset it under **⚙️ Ouders**.
