# Sanéme Web 💗

The web version of Sanéme: chat with matches who each have their own life, mood, texting style and memory of you. Pure HTML + CSS + JavaScript, no server and no AI model: it runs entirely in the browser, works offline and can be installed on a phone or desktop like an app.

The desktop app (`Saneme/`) answers with a local language model. This version answers with a **pattern-based dialog engine**, like Amor: every reply is assembled from the character's own facts, voice and line banks, then texted in her style.

## Run it

- **Locally:** double-click `index.html`. Everything works except installing as an app (that needs a web address).
- **GitHub Pages:** push this folder to a GitHub repository → *Settings → Pages → Branch: `main` / root* → save. After a minute it's live at `https://<you>.github.io/<repo>/`.
- **Install:** open the Pages address → Settings (☰ More) → *Install the app*, or the browser's "Install app / Add to Home Screen". On iPhone: Safari → Share → Add to Home Screen. Once installed it opens offline.

Your profile and all chats are stored in this browser only (localStorage). Nothing is sent anywhere.

## How a reply is made

1. **Intent** (`js/local/dialog/intents.js`): what kind of message it is: a greeting, a compliment, "where are you from?", a joke, an insult...
2. **Topic** (`dialog/topics.js`): what it's about (music, football, exams...) and whether it's good or bad news. A topic stays on her mind for a few messages.
3. **Memory** (`js/local/memory.js`): what she learns about you ("i'm 25", "i live in Izmir", "i have an exam tomorrow"). She reacts, brings it up again later, and asks how the exam went once it's over.
4. **Interest and stage** (`attraction.js`): her hidden interest in you moves with every message, the same way as in the desktop app. It sets the stage (stranger, acquaintance, curious, crush) and the stage decides how she answers: a compliment from a stranger gets "smooth. let's see if you can keep a conversation", from a crush "stop, you're making me blush".
5. **Mood** (`mood.js`): every character has a mood that drifts back to her normal self. Your messages nudge it, her energy follows her own clock (tired at 3am in her time zone), and when her social battery runs out she wraps up the chat.
6. **Lines** (`dialog/lines.js`): she answers from her voice's line bank (sunny, bold, witty, dry, soft, dreamy) with her own life filled in: city, job, likes, pet, family, stories and backstory (unlocked by stage). Her persona's example lines are used when your message is close to them.
7. **Style** (`style.js`): the clean lines become her texts: lowercase, abbreviations, her laugh (keysmash on her keyboard layout, lmao, xd...), her verbal tics, words from her first language, emojis, typos with a "*correction", split into bubbles with typing delays.

The 🐞 panel in a chat shows every step of the last reply.

Also ported from the desktop app: reactions on your messages, "reaction only" replies, typed-and-deleted messages, quoted replies, photos she sends (depending on the stage), stickers, first moves (some characters text first), 24h stories, notes, posts with likes and comments (she answers under the post), sharing posts, notifications.

## Folders

```
index.html              the app (the same frontend as the desktop app)
css/, js/*.js           the frontend
js/local/               the in-browser backend: storage, engines, dialog, the stand-in for the API
js/local/dialog/        intents, line banks, topics, the dialog engine
js/data/characters.js   all characters in one script (generated, see below)
js/data/language.js     the Sanéme words
characters/<id>/        persona.json, backstory.md, stories.json, photos/
tools/build-data.py     builds js/data/characters.js from characters/
sw.js, manifest.json    offline cache + install
```

## Adding or editing a character

1. Create `characters/<id>/` with `persona.json`, `backstory.md`, `stories.json` and a `photos/` folder (copy an existing character as a template).
2. In `persona.json` set `"voice_type"` to one of `sunny`, `bold`, `witty`, `dry`, `soft`, `dreamy`.
3. Rebuild the data (Python 3; Pillow is optional, for the blurred photo previews):

   ```
   python tools/build-data.py --review
   ```

   `--review` prints how her third-person facts were turned into her own words ("has a cat" → "I have a cat"). If a sentence reads wrong, write it yourself in `persona.json` under `"talk"` (see `saneme` or `derin`).
4. When you publish the change, bump `VERSION` in `sw.js` (`saneme-v2`, ...) so installed apps load the new files.

## Editing what they say

- New lines for every character: `js/local/dialog/lines.js`, under `shared`.
- Lines for one voice: the same file, under that voice. A key like `"compliment@crush"` is used only at that stage; `"@warm"` = curious or crush, `"@cold"` = stranger or acquaintance.
- New ways to say something: add words to the intent in `dialog/intents.js` (`"word"` anywhere, `"^word"` at the start, `"=words"` the whole message).
- Fill-ins in lines: `{name}` (yours), `{self}`, `{age}`, `{city}`, `{job}`, `{like}`, `{hobby}`, `{pet}`, `{family}`, `{doing}`, `{x}`. A line whose fill-in is empty for a character is skipped for her.
