// js/local/dialog/intents.js - What kind of message is it? (intent patterns, like Amor's intents.js)
// Your message is lowercased, apostrophes and repeated letters are tidied ("heyyy" -> "hey",
// "soooo" -> "so") and every pattern is looked for as whole words:
//     "word"   -> anywhere in the message, as a whole word ("hi" doesn't match "hiking")
//     "word*"  -> as the start of a word ("compliment*" also matches "compliments")
//     "^word"  -> only at the start of the message
//     "=words" -> the whole message, nothing else
// Order matters: the first intent with a hit wins (per message; the strongest of your messages wins).
window.SL = window.SL || {};
SL.dialog = SL.dialog || {};

SL.dialog.INTENTS = [
    ["creepy", ["nudes", "nude", "send nudes", "naked", "sexy pic*", "horny", "dick", "boobs", "tits", "your body", "sex", "sleep with you", "in bed with you", "lingerie", "bikini pic*"]],
    ["insult", ["stupid", "idiot", "dumb", "shut up", "stfu", "bitch", "whore", "slut", "ugly", "loser", "you're boring", "youre boring", "so boring", "annoying", "fuck you", "fuck off", "retard*", "hate you", "you suck", "pathetic", "weirdo", "go away", "get lost"]],
    ["night", ["good night", "goodnight", "gn", "nighty", "nite", "going to bed", "going to sleep", "off to bed", "off to sleep", "gotta sleep", "need to sleep", "sweet dreams", "sleep well", "sleep tight", "heading to bed", "i'm sleepy", "im sleepy", "time for bed"]],
    ["morning", ["good morning", "goodmorning", "^gm", "^morning", "^mornin", "just woke up", "i just woke", "rise and shine"]],
    ["bye", ["bye", "byee", "goodbye", "see you later", "see ya", "cya", "ttyl", "talk later", "talk to you later", "gotta go", "got to go", "i have to go", "i need to go", "gtg", "g2g", "brb", "^later", "catch you later", "take care"]],
    ["photo", ["send a pic", "send me a pic", "send pic", "send a photo", "send me a photo", "a pic of you", "pic of you", "photo of you", "selfie", "send a selfie", "your pics", "more pics", "show me your face", "show me you", "let me see you", "what do you look like", "face pic", "facetime", "video call", "^pic", "^pics"]],
    ["meet", ["meet up", "wanna meet", "want to meet", "let's meet", "lets meet", "can we meet", "we should meet", "meet you in person", "meet irl", "hang out", "go out sometime", "go out together", "on a date", "a date", "date night", "take you out", "take you to dinner", "dinner together", "grab drinks", "get drinks", "grab a coffee", "get coffee", "coffee date", "your number", "phone number", "instagram", "your insta", "snapchat", "your snap", "whatsapp", "telegram", "discord", "call you", "can i call", "voice call", "come over", "visit you", "see you in person", "irl"]],
    ["kiss", ["kiss", "kisses", "kissing", "smooch", "mwah", "muah", "😘", "💋"]],
    ["hug", ["hug", "hugs", "cuddle", "cuddles", "🤗", "🫂", "hold you"]],
    ["flirt", ["i love you", "love you", "luv u", "ily", "i like you", "i really like you", "crush on you", "i have a crush", "be my girlfriend", "be my gf", "my girlfriend", "marry me", "will you marry", "date me", "go out with me", "fall for you", "falling for you", "fell for you", "you're mine", "be mine", "my heart", "only you", "soulmate", "wifey", "babe", "baby", "sweetheart", "darling", "my love"]],
    ["miss", ["miss you", "missed you", "miss u", "missed u", "thinking about you", "thinking of you", "thought about you", "can't stop thinking", "on my mind", "dreamt about you", "dreamed about you", "dream about you"]],
    ["compliment", [
        ...["cute", "pretty", "beautiful", "gorgeous", "stunning", "hot", "sexy", "lovely", "adorable", "amazing", "sweet", "funny", "smart",
            "cool", "perfect", "attractive", "the best", "so cute", "so pretty", "so beautiful", "really pretty", "really cute"]
            .flatMap(w => [`you're ${w}`, `youre ${w}`, `ur ${w}`, `you are ${w}`, `you look ${w}`, `u r ${w}`]),
        "nice smile", "your smile", "your eyes", "pretty eyes", "beautiful eyes", "your hair", "love your style", "love your hair", "nice pics",
        "you look great", "you look good", "😍", "🥰", "cutie", "^gorgeous", "^beautiful", "^stunning", "^pretty", "^cute", "so cute", "so pretty"]],
    ["ask_memory", ["remember me", "do you remember", "what do you know about me", "what do you remember", "do you know my name", "what's my name", "whats my name", "who am i", "forgot me", "forget me"]],
    ["ask_bot", ["are you a bot", "are you real", "are you ai", "are you an ai", "are you a robot", "are you human", "chatgpt", "real person", "fake account", "catfish"]],
    ["ask_name", ["what's your name", "whats your name", "what is your name", "your name", "who are you", "what should i call you", "real name", "how do i say your name", "how do you pronounce"]],
    ["ask_age", ["how old are you", "how old r u", "your age", "how old", "what age", "when's your birthday", "whens your birthday", "your birthday"]],
    ["ask_city", ["where are you from", "where r u from", "where do you live", "where you from", "where are u from", "which city", "where do u live", "where's home", "your hometown", "where did you grow up", "where are you based", "what part"]],
    ["ask_job", ["what do you do", "what do u do", "your job", "do you work", "do you study", "what do you study", "where do you work", "for a living", "your work", "how's work", "hows work", "how's uni", "hows uni", "how's school", "what's your job", "whats your job", "are you a student", "your major"]],
    ["ask_pet", ["any pets", "have pets", "have a pet", "do you have a cat", "do you have a dog", "your cat", "your dog", "your pet", "cat or dog", "dog or cat", "cat person", "dog person"]],
    ["ask_family", ["your family", "siblings", "brother or sister", "brothers", "sisters", "your parents", "your mom", "your mum", "your dad", "only child", "your sister", "your brother"]],
    ["ask_music", ["what music", "music do you", "favorite song", "favourite song", "favorite band", "favourite band", "favorite artist", "favourite artist", "listening to", "what are you listening", "song recommendation", "recommend a song", "your playlist", "favorite singer", "music taste"]],
    ["ask_food", ["favorite food", "favourite food", "what do you like to eat", "did you eat", "have you eaten", "what did you eat", "what's for dinner", "whats for dinner", "had lunch", "had dinner", "what are you eating", "fav food"]],
    ["ask_movie", ["favorite movie", "favourite movie", "favorite film", "favourite film", "favorite show", "favourite show", "what are you watching", "watching anything", "seen any good", "recommend a movie", "recommend a show"]],
    ["ask_weekend", ["weekend plans", "this weekend", "plans for the weekend", "doing this weekend", "doing tonight", "plans tonight", "any plans", "tomorrow plans", "doing tomorrow"]],
    ["ask_about", ["tell me about yourself", "tell me about you", "tell me something about you", "tell me more about you", "something about yourself", "about yourself", "tell me a secret", "a fun fact", "fun fact about you", "describe yourself", "get to know you", "what are you like", "tell me more"]],
    ["ask_hobby", ["hobbies", "hobby", "what do you like", "what are you into", "free time", "for fun", "what do you enjoy", "your interests", "what makes you happy", "passion*"]],
    ["ask_day", ["how was your day", "how's your day", "hows your day", "how was ur day", "how is your day", "how did your day go", "how was today", "how's your week", "hows your week", "how was your weekend", "your day going"]],
    ["how_are_you", ["how are you", "how r u", "how are u", "how r you", "how're you", "hru", "how you doing", "how u doing", "how ya doing", "how have you been", "how've you been", "you good", "u good", "you okay", "you ok", "are you ok", "how's it going", "hows it going", "how's life", "what's up", "whats up", "wassup", "sup", "wsp", "wbu", "hbu", "and you", "and u", "what about you", "how about you"]],
    ["wyd", ["what are you doing", "what r u doing", "what are u doing", "wyd", "wud", "whatcha doing", "what you doing", "what are you up to", "what r u up to", "up to anything", "what u up to", "are you busy", "where are you", "where r u"]],
    ["joke", ["tell me a joke", "say something funny", "make me laugh", "a joke"]],
    // "=..." = the whole message ("what?" alone means "huh?", "what do you do" doesn't)
    ["confused", ["=what", "=huh", "=wdym", "=why", "=wait what", "=what do you mean", "what do you mean", "=what lol", "=hm what", "=excuse me"]],
    ["bored", ["i'm bored", "im bored", "so bored", "bored af", "i am bored", "entertain me", "boredom"]],
    ["answer_bad", ["i'm sad", "im sad", "i'm tired", "im tired", "exhausted", "bad day", "rough day", "long day", "stressed", "i'm stressed", "not good", "not great", "not so good", "not really", "meh", "i'm sick", "im sick", "feeling down", "depressed", "lonely", "i'm lonely", "anxious", "awful", "terrible", "horrible", "sucks", "the worst", "crying", "i failed", "worst day", "not okay", "not ok", "could be better", "been better", "kinda bad"]],
    ["sorry", ["sorry", "i'm sorry", "im sorry", "my bad", "apologies", "i apologize", "forgive me", "my fault"]],
    ["thanks", ["thank you", "thanks", "thx", "thank u", "ty", "tysm", "appreciate it", "appreciate you"]],
    ["laugh", ["haha", "hahaha", "lol", "lmao", "lmfao", "rofl", "xd", "hehe", "😂", "🤣", "💀", "dying", "i'm dead", "im dead", "you're hilarious", "so funny lol"]],
    ["greet", ["^hi", "^hey", "^hello", "^hiya", "^heya", "^yo", "^sup", "^hola", "^bonjour", "^merhaba", "^selam", "^hallo", "^ciao", "^good evening", "^good afternoon", "^evening", "^hii", "^heyy", "^ello", "^howdy", "^ayo", "nice to meet you", "^hey there", "^hi there"]],
    ["answer_good", ["^good", "^great", "^fine", "^amazing", "^awesome", "^not bad", "^pretty good", "^really good", "^so good", "^i'm good", "^im good", "^i'm great", "^im great", "^i'm fine", "^im fine", "^all good", "^doing good", "^doing well", "^i'm well", "^im well", "^excellent", "^perfect", "^chilling", "^chillin", "^i'm okay", "^im okay", "^ok i guess", "^good thanks", "^good you", "^better now"]],
    ["agree", ["^yes", "^yeah", "^yep", "^yup", "^ya", "^ye", "^sure", "^ok", "^okay", "^okey", "^k", "^true", "^exactly", "^definitely", "^of course", "^absolutely", "^right", "^agreed", "^same", "^me too", "^totally", "^for sure", "^fair", "^bet", "^yess", "^deal", "^sounds good", "^why not"]],
    ["disagree", ["^no", "^nah", "^nope", "^not really", "^never", "^no way", "^i don't think so", "^i dont think so", "^not at all", "^disagree", "^hell no"]],
];

// How a message moves her (mood) and how much she warms up (Amor's "affinity" - here it only colors
// her mood; how much she likes him is the Attraction Engine's job)
SL.dialog.EFFECTS = {
    creepy: { valence: -0.3, arousal: 0.25 }, insult: { valence: -0.35, arousal: 0.3 },
    compliment: { valence: 0.07, arousal: 0.03 }, flirt: { valence: 0.03, arousal: 0.05 }, kiss: { valence: 0.02, arousal: 0.05 },
    hug: { valence: 0.05 }, miss: { valence: 0.06 }, laugh: { valence: 0.05, arousal: 0.03 }, thanks: { valence: 0.03 },
    sorry: { valence: 0.05 }, joke: { valence: 0.02, arousal: 0.03 }, how_are_you: { valence: 0.02 }, ask_about: { valence: 0.03 },
    ask_day: { valence: 0.03 }, answer_bad: { valence: -0.02 }, bored: { valence: -0.01 },
};

// Questions she asks (to keep the chat going). answers: keyword hits in his reply -> her reaction;
// any: when his reply hit nothing but was a real answer. x = the start of his answer.
SL.dialog.QUESTIONS = [
    { id: "coffee_tea", q: ["ok important question: coffee or tea?", "coffee or tea? choose wisely", "coffee person or tea person?"],
      answers: [{ m: ["coffee", "espresso", "latte", "cappuccino"], r: ["coffee, good. we can be friends", "correct answer", "same, i run on it"] },
                { m: ["tea", "chai", "matcha"], r: ["tea?? ok that's kind of soft, i like it", "a tea person, interesting", "tea is cozy, respect"] },
                { m: ["both", "neither", "water"], r: ["a diplomat i see", "that's not an answer haha", "fine, i'll allow it"] }],
      any: ["hm noted", "interesting choice"] },
    { id: "cat_dog", q: ["cat person or dog person?", "cats or dogs? this decides a lot"],
      answers: [{ m: ["cat", "cats", "kitten"], r: ["cats!! yes", "good, cats are superior", "ok you passed"] },
                { m: ["dog", "dogs", "puppy", "puppies"], r: ["dogs are so loyal, fair", "a dog person, i can see it", "dogs are the best huggers tbh"] },
                { m: ["both", "neither"], r: ["both is a cheat answer haha", "ok mr diplomatic"] }],
      any: ["hmm interesting"] },
    { id: "morning_night", q: ["are you a morning person or a night person?", "early bird or night owl?"],
      answers: [{ m: ["morning", "early", "bird"], r: ["a morning person?? how", "respect, i could never", "ok so you're the one who's awake at 7"] },
                { m: ["night", "owl", "late"], r: ["night owls unite", "same, nights are better", "knew it"] }],
      any: ["fair"] },
    { id: "beach_mountain", q: ["beach or mountains?", "sea or mountains, pick one"],
      answers: [{ m: ["beach", "sea", "ocean", "summer"], r: ["the sea always wins", "beach people are happier, it's science", "good, sea it is"] },
                { m: ["mountain", "mountains", "hiking", "snow"], r: ["mountains, very peaceful of you", "ok i see you, the hiking type", "fresh air person, nice"] }],
      any: ["hm a mystery answer"] },
    { id: "weekend", q: ["what's your perfect weekend?", "how do you usually spend your weekends?"],
      answers: [{ m: ["sleep", "bed", "nothing", "chill", "relax", "home", "netflix"], r: ["a professional rester, love that", "honestly the dream", "doing nothing is underrated"] },
                { m: ["party", "out", "friends", "club", "drinks", "bar"], r: ["a social butterfly i see", "you sound like fun", "ok party guy"] },
                { m: ["gym", "football", "run", "hike", "sport", "game"], r: ["an active one, wow", "sporty, respect", "ok athlete"] }],
      any: ["that sounds nice actually", "i like that"] },
    { id: "music", q: ["what kind of music do you listen to?", "what's on your playlist lately?"],
      answers: [{ m: ["rap", "hip hop", "hiphop", "trap"], r: ["rap, nice", "ok rap guy, who do you listen to"] },
                { m: ["rock", "metal", "indie", "alternative"], r: ["ooh good taste", "a rock person, i didn't expect that"] },
                { m: ["pop", "everything", "anything", "a bit of everything"], r: ["everything is a safe answer haha", "pop is a vibe, no shame"] },
                { m: ["jazz", "classical", "piano", "lofi", "lo-fi"], r: ["fancy", "that's so calming", "a man of culture"] }],
      any: ["i'll have to check that out", "hm noted for later"] },
    { id: "travel", q: ["if you could fly anywhere tomorrow, where would you go?", "where's the one place you really want to travel?"],
      answers: [{ m: ["japan", "tokyo", "kyoto"], r: ["japan is on my list too", "everyone says japan and they're right"] },
                { m: ["paris", "italy", "rome", "spain", "barcelona", "greece", "london"], r: ["ooh europe, classic", "that's a good one"] },
                { m: ["here", "nowhere", "home", "with you", "wherever you are"], r: ["haha smooth", "that's lowkey sweet"] }],
      any: ["that sounds amazing", "good choice", "take me with you lol"] },
    { id: "food", q: ["what's your comfort food?", "what could you eat every day?"],
      answers: [{ m: ["pizza", "burger", "fries", "pasta"], r: ["can't argue with that", "a classic", "ok now i'm hungry"] },
                { m: ["sushi", "ramen", "noodles"], r: ["good taste", "yes!!", "ramen is a whole mood"] },
                { m: ["mom", "mum", "home", "homemade"], r: ["mom's cooking always wins", "that's the right answer"] }],
      any: ["now i'm hungry", "hm sounds good"] },
    { id: "movie", q: ["what's the last thing you watched?", "seen anything good lately?"],
      answers: [{ m: ["horror", "scary"], r: ["horror? ok brave", "i respect a horror person"] },
                { m: ["anime"], r: ["an anime guy, interesting", "which one?"] },
                { m: ["nothing", "no", "not really"], r: ["you need recommendations then", "boring haha"] }],
      any: ["is it good?", "i might watch that", "noted"] },
    { id: "fun_fact", q: ["tell me a fun fact about you", "ok tell me something random about you"],
      answers: [{ m: ["nothing", "boring", "idk", "i don't know"], r: ["come on there's always something", "nope, try again"] }],
      any: ["wait that's actually fun", "haha i did not expect that", "ok that's interesting"] },
];

// a few things she says when she asks about you directly (and then waits for the answer)
SL.dialog.ASK_HIM = {
    name: ["what's your name btw?", "wait i don't even know your name", "what should i call you?"],
    city: ["where are you from?", "where do you live?", "so where are you based?"],
    job: ["what do you do?", "do you work or study?", "so what do you do all day?"],
    age: ["how old are you btw?", "wait how old are you?"],
};
