"""
Sanéme Web - data builder
=========================
Turns the character folders into one script the app loads (js/data/characters.js), so the app
works from a plain file:// double-click as well as from GitHub Pages - no server, no fetch().

    characters/<id>/persona.json   identity, texting style, posts, examples, voice_type
    characters/<id>/backstory.md   her life story; "## section" + "> share: <stage>"
    characters/<id>/stories.json   24h stories pool + notes
    characters/<id>/photos/        her photos

Run it after adding or editing a character:

    python tools/build-data.py

It also makes:
- a tiny blurred preview of every photo (needs Pillow: pip install pillow; skipped without it)
- first-person versions of the persona's third-person facts ("has a cat" -> "I have a cat"),
  which the dialog engine uses when she talks about herself. Check the printed lines once:
  anything that reads wrong can be overridden in persona.json under "talk".
"""

import base64
import io
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
CHARS = ROOT / "characters"
OUT = ROOT / "js" / "data" / "characters.js"
PHOTO_EXT = {".jpg", ".jpeg", ".png", ".webp"}
FIRST = "saneme"

try:
    from PIL import Image
except ImportError:
    Image = None


def lqip(path: Path):
    if not Image:
        return None
    try:
        with Image.open(path) as im:
            im.draft("RGB", (64, 64))
            im = im.convert("RGB")
            im.thumbnail((16, 20))
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=60)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return None


# ---- third person -> first person ----
IRREGULAR_PAST = set("""went grew got made took had was began came fell found felt left lost met ran saw spent told thought wore
wrote became broke bought brought chose did drove ate gave kept knew sold sat sang swam stood won heard paid built taught""".split())
NOT_VERBS = set("""his this is was has does its always perhaps sometimes famous serious various previous nervous jealous
always across less unless""".split())


def third_to_first_verb(w: str) -> str:
    low = w.lower()
    special = {"has": "have", "is": "am", "does": "do", "goes": "go", "was": "was", "hasn't": "haven't", "doesn't": "don't",
               "isn't": "am not"}
    if low in special:
        return special[low]
    if low.endswith("ies") and len(low) > 4:
        return low[:-3] + "y"
    if re.search(r"(ches|shes|sses|xes|zes|oes)$", low):
        return low[:-2]
    if low.endswith("s") and not low.endswith("ss") and len(low) > 3:
        return low[:-1]
    return low


def is_verbish_start(w: str) -> bool:
    low = w.lower()
    if low in IRREGULAR_PAST:
        return True
    if low in NOT_VERBS:
        return False
    if low.endswith("ed") and len(low) > 3:
        return True
    return low in KNOWN_3P  # "Works at…" yes, "Statistics is…" no


HER_ME_NEXT = set("""to and a an the for that this with at in on of from by about up out back off into onto over through
like as because when but than so if or until while after before around along home away there here too again
alone outside anyway""".split())
# third-person verbs that follow her as a second verb ("...and is now", "secretly loves") - converted only
# right after "I", "and", a comma or an adverb, never after "who" (that's someone else)
KNOWN_3P = set("""is has does goes works studies loves lives wants spends shares interns gets treats keeps takes makes says
thinks hates likes misses calls tells acts cries swims feeds drives runs teaches knows needs plays watches reads writes
dreams hopes worries fears believes wishes sings paints draws cooks bakes walks listens sleeps wakes talks texts sends buys
wears rewatches remembers refuses pretends tries puts sees finds leaves comes brings gives uses helps visits meets means feels
becomes starts sits stays stops learns collects saves grows owns rides plans practises practices volunteers edits shoots films
sketches designs produces mixes records codes streams dances surfs trains resells checks develops drinks complains wonders
fixes builds organizes""".split())
ADVERBS = set("""now also still often usually secretly always never sometimes really just even rarely mostly only quietly
basically literally kind of""".split())


PARTICIPLES = "been|had|done|never|always|got|seen|told|made|kept|lived|worked|started|wanted"
FIXES = [(r"\bI isn't\b", "I'm not"), (r"\bI doesn't\b", "I don't"), (r"\bI hasn't\b", "I haven't"),
         (r"\bI is\b", "I'm"), (r"\bI has\b", "I have"), (r"\bI'm (" + PARTICIPLES + r")\b", r"I've \1"),
         (r"\b[Ss]he'd\b", "I'd"), (r"\b[Ss]he'll\b", "I'll"), (r"\bme and (\w+) spent\b", r"\1 and I spent"),
         (r"\bI and (\w+)\b", r"\1 and I")]


def first_person(text: str, name: str = "") -> str:
    """Rough third-person -> first-person rewrite of persona facts / backstory sentences."""
    if not text:
        return ""
    if name:
        # her own name as the subject of her own story: "Nisa's hair" -> "my hair", "which is why Clara knows" -> "I know"
        # (a nickname someone calls her stays: "calls her Baharu")
        text = re.sub(rf"\b{re.escape(name)}'s\b", "her", text)
        text = re.sub(rf"(^|[.!?;:]\s+|,\s+|\b(?:when|and|but|which is why|so|that)\s+){re.escape(name)}(?= [a-z])", r"\1she", text)
    # "told her I…", "prove her wrong": after these verbs "her" is always her, the object
    text = re.sub(r"\b(told|tells|calls|called|prove|proved|asked|asks|taught|dragged|drove|helped|helps|let|lets)\s+her\b", r"\1 ME_OBJ", text)
    text = re.sub(r"(\bwho \w+ )her own\b", r"\1HER_OWN", text)  # "her mom, who left her own degree"
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    out = []
    for s in sentences:
        if not s:
            continue
        words = s.split(" ")
        first = re.sub(r"[^A-Za-z']", "", words[0])
        if first.lower() in ("has", "have"):
            words[0] = "I have"
        elif first.lower() in ("she", "she's"):
            words[0] = "I'm" if first.lower() == "she's" else "I"
            if len(words) > 1 and first.lower() == "she":
                k = 2 if words[1].lower() in ADVERBS and len(words) > 2 else 1  # "She sometimes feels"
                words[k] = third_to_first_verb(words[k]) if words[k].lower() != "was" else "was"
        elif is_verbish_start(first):
            verb = words[0]
            words[0] = "I " + (third_to_first_verb(verb) if not verb.lower().endswith("ed") and verb.lower() not in IRREGULAR_PAST else verb.lower())
        s = " ".join(words)
        # pronouns inside the sentence
        s = re.sub(r"\bshe's\b", "I'm", s, flags=re.I)
        s = re.sub(r"\bherself\b", "myself", s, flags=re.I)
        s = re.sub(r"\bhers\b", "mine", s, flags=re.I)

        # "her": "my" before a noun ("her dad"), "me" otherwise ("told her", "for her.")
        def her(m):
            obj = m.group(2) or not m.group(4) or m.group(4).lower() in HER_ME_NEXT
            word = "me" if obj else "my"
            return (word.capitalize() if m.group(1)[0] == "H" else word) + m.group(2) + m.group(3) + m.group(4)
        s = re.sub(r"\b([Hh]er)\b([.,;!?)]?)(\s*)(\w*)", her, s)
        # "she's had" -> "I've had", then "she (adverb) verbs" -> "I (adverb) verb"
        s = re.sub(r"\b[Ss]he's (" + PARTICIPLES + r")\b", r"I've \1", s)
        s = re.sub(r"\b[Ss]he's\b", "I'm", s)
        s = re.sub(r"\b[Ss]he((?: \w+ly| now| also| still| always| never| often| just| sometimes)?) ('?)(\w+)",
                   lambda m: "I" + m.group(1) + " " + m.group(2) + third_to_first_verb(m.group(3)), s)
        if re.search(r"\bI\b", s):
            # her second verbs in the same sentence: "...and is now in", ", studies at", "secretly loves" -
            # but not someone else's ("brother Stavros ... and plays"): no other subject since her "I"
            def second(m):
                before = s[:m.start()]
                mark = list(re.finditer(r"\bI(?:'m)?\b", before))
                if not mark:
                    return m.group(0)
                between = before[mark[-1].end():]
                # someone else became the subject since her "I" (a name - but not a place after a preposition)
                if re.search(r"\b(?:who|which|he|they|it)\b|(?<!\bto )(?<!\bin )(?<!\bat )(?<!\bfrom )(?<!\bof )\b[A-Z][a-zà-ÿ]+", between):
                    return m.group(0)
                return m.group(1) + third_to_first_verb(m.group(2))
            verbs = sorted(KNOWN_3P) + ["hasn't", "doesn't", "isn't"]
            s = re.sub(r"((?:\band |\bbut |, |\bI |\b(?:" + "|".join(ADVERBS) + r") ))(" + "|".join(re.escape(v) for v in verbs) + r")(?![\w'])", second, s)
            s = re.sub(r"\b(and|but) am\b", r"\1 I'm", s)
        for pat, rep in FIXES:
            s = re.sub(pat, rep, s)
        out.append(s.replace("HER_OWN", "her own").replace("ME_OBJ", "me"))
    return " ".join(out)


def a_or_an(phrase: str) -> str:
    p = phrase.strip()
    if not p:
        return ""
    if re.match(r"^(?:a|an|the)\s", p, re.I):
        return p
    vowel = p[0].lower() in "aeiou" and not re.match(r"^(?:U[A-Z]|uni|use|usu|euro|one)", p, re.I)  # "a UX designer"
    return ("an " if vowel else "a ") + p


def parse_backstory(md: str, name: str = ""):
    out = []
    for block in re.split(r"^## ", md, flags=re.M)[1:]:
        lines = block.strip().split("\n")
        title = lines[0].strip()
        share, body = "stranger", []
        for l in lines[1:]:
            m = re.match(r"^>\s*share:\s*(\w+)", l.strip())
            if m:
                share = m.group(1).lower()
            elif l.strip() and not l.startswith(">"):
                body.append(l.strip())
        text = " ".join(body)
        out.append({"title": title, "share": share, "text": text, "me": first_person(text, name)})
    return out


def main():
    data, review = {}, []
    ids = sorted(p.parent.name for p in CHARS.glob("*/persona.json"))
    ids = ([FIRST] if FIRST in ids else []) + [i for i in ids if i != FIRST]
    for cid in ids:
        folder = CHARS / cid
        persona = json.loads((folder / "persona.json").read_text(encoding="utf-8"))
        persona["id"] = cid
        photos_dir = folder / "photos"
        files = sorted(p.name for p in photos_dir.iterdir() if p.suffix.lower() in PHOTO_EXT) if photos_dir.is_dir() else []
        photos = {f: lqip(photos_dir / f) for f in files}
        stories = json.loads((folder / "stories.json").read_text(encoding="utf-8")) if (folder / "stories.json").exists() else {}
        name = persona.get("name", "")
        backstory = parse_backstory((folder / "backstory.md").read_text(encoding="utf-8"), name) if (folder / "backstory.md").exists() else []
        talk = persona.get("talk", {})
        for b in backstory:  # hand-written first-person versions win
            if (talk.get("backstory") or {}).get(b["title"]):
                b["me"] = talk["backstory"][b["title"]]
        about = {
            "job": talk.get("job") or a_or_an(persona.get("occupation", "")),
            "family": talk.get("family") or first_person(persona.get("family", ""), name),
            "pet": talk.get("pet") or first_person(persona.get("pet", ""), name),
            "background": talk.get("background") or first_person(persona.get("background", ""), name),
            "languages": talk.get("languages") or persona.get("languages", ""),
        }
        review.append((cid, about, [(b["title"], b["share"], b["me"]) for b in backstory]))
        data[cid] = {"persona": persona, "photos": list(files), "lqip": photos, "stories": stories,
                     "backstory": backstory, "about": about}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("// Generated by tools/build-data.py - don't edit by hand, edit characters/<id>/ and rebuild.\n"
                   "window.SANEME_DATA = " + json.dumps({"order": ids, "characters": data}, ensure_ascii=False) + ";\n",
                   encoding="utf-8", newline="\n")
    print(f"{OUT.relative_to(ROOT)}: {len(ids)} characters, {sum(len(d['photos']) for d in data.values())} photos"
          + ("" if Image else " (no Pillow: no blurred previews)"))
    if "--review" in sys.argv:
        for cid, about, bs in review:
            print(f"\n== {cid}")
            for k, v in about.items():
                print(f"  {k}: {v}")
            for t, sh, me in bs:
                print(f"  [{sh}] {t}: {me}")


if __name__ == "__main__":
    main()
