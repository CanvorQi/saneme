/*
 * Sanéme - profile photo card avatar
 * ==================================
 * The user never uploads a photo. Instead they pick physical features and this file draws a
 * stylized portrait from them - that portrait is "the photo" Sanéme sees on the dating app.
 * Shared by the chat app (frontend/index.html) and the admin panel (admin/admin.html).
 *
 *   SanemeAvatar.svg(appearance, { size })  -> SVG string
 *   SanemeAvatar.normalize(appearance)       -> appearance with every visual field filled in
 *   SanemeAvatar.chips(appearance)           -> short labels for the card ("182 cm", "fit", ...)
 */
(function () {
    const SKIN = {
        light: "#f7dccb", fair: "#efc3a4", medium: "#d9a27b", olive: "#c08a5c", brown: "#8d5a36", dark: "#5c3920",
    };
    const HAIR = {
        black: "#1d1a19", "dark brown": "#3a2416", brown: "#6b4325", blonde: "#d8b06a", red: "#a8472a", gray: "#a3a3a3",
    };
    const EYES = {
        brown: "#5b3a20", hazel: "#8b6b36", green: "#4d7f4a", blue: "#4b7bb8", gray: "#7c8996", black: "#1c1c1c",
    };
    const HAIR_STYLES = ["bald", "buzz cut", "short", "curly", "wavy", "long"];
    const BODY_W = { slim: 56, fit: 64, average: 66, muscular: 77, heavy: 78 };
    const HEAD_RX = { slim: 34, fit: 36, average: 36, muscular: 37, heavy: 41 };
    const CLOTHES = {
        sporty: "#2f6fd6", classic: "#25406b", streetwear: "#26262b", casual: "#8c99a6", smart: "#1f2b46",
    };

    function shade(hex, f) {
        const n = parseInt(hex.slice(1), 16);
        const ch = s => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
        return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
    }

    // Older profiles only have free-text hair / eye_color - guess the visual fields from them
    function normalize(a) {
        a = Object.assign({}, a || {});
        const hairText = String(a.hair || "").toLowerCase();
        if (!a.hair_style) {
            a.hair_style = HAIR_STYLES.find(s => hairText.includes(s.split(" ")[0])) ||
                (hairText.includes("wav") ? "wavy" : "short");
        }
        if (!a.hair_color) {
            a.hair_color = Object.keys(HAIR).sort((x, y) => y.length - x.length).find(c => hairText.includes(c)) ||
                (hairText.includes("blond") ? "blonde" : hairText.includes("grey") ? "gray" : "dark brown");
        }
        const eye = String(a.eye_color || "").toLowerCase();
        a.eye_color = Object.keys(EYES).find(c => eye.includes(c)) || "brown";
        if (!SKIN[a.skin_tone]) a.skin_tone = "medium";
        if (!BODY_W[a.body_type]) a.body_type = "average";
        if (!CLOTHES[a.style]) a.style = "casual";
        if (a.glasses == null) a.glasses = /glass/i.test(a.notable || "");
        a.facial_hair = a.facial_hair || "none";
        a.height_cm = a.height_cm || 178;
        return a;
    }

    function clothes(style, w, color) {
        const L = 100 - w, R = 100 + w;
        const torso = `<path d="M${L} 240 L${L} 202 Q${L} 177 ${L + 26} 172 L${R - 26} 172 Q${R} 177 ${R} 202 L${R} 240 Z" fill="${color}"/>`;
        const dark = shade(color.startsWith("#") ? color : "#333333", .72), light = "rgba(255,255,255,.85)";
        switch (style) {
            case "sporty":
                return torso +
                    `<path d="M86 171 L100 186 L114 171" fill="none" stroke="${dark}" stroke-width="7" stroke-linejoin="round"/>` +
                    `<line x1="100" y1="186" x2="100" y2="240" stroke="${light}" stroke-width="2.5"/>` +
                    `<line x1="${L + 9}" y1="196" x2="${L + 9}" y2="240" stroke="${light}" stroke-width="4"/>` +
                    `<line x1="${R - 9}" y1="196" x2="${R - 9}" y2="240" stroke="${light}" stroke-width="4"/>`;
            case "streetwear":
                return torso +
                    `<path d="M72 178 Q100 202 128 178 Q122 166 100 166 Q78 166 72 178 Z" fill="${shade("#3a3a40", 1)}"/>` +
                    `<line x1="93" y1="186" x2="91" y2="212" stroke="${light}" stroke-width="2.2" stroke-linecap="round"/>` +
                    `<line x1="107" y1="186" x2="109" y2="212" stroke="${light}" stroke-width="2.2" stroke-linecap="round"/>` +
                    `<rect x="84" y="222" width="32" height="18" rx="4" fill="${dark}"/>`;
            case "classic":
                return torso +
                    `<path d="M86 172 L100 200 L114 172 Z" fill="#f4f4f4"/>` +
                    `<path d="M86 172 L95 186 L100 176 Z M114 172 L105 186 L100 176 Z" fill="#ffffff" stroke="#d9d9d9" stroke-width="1"/>` +
                    `<path d="M80 172 L100 206 L120 172" fill="none" stroke="${dark}" stroke-width="5"/>`;
            case "smart":
                return torso +
                    `<path d="M86 172 L100 212 L114 172 Z" fill="#f4f4f4"/>` +
                    `<path d="M97 182 L103 182 L102 214 L100 220 L98 214 Z" fill="#a8233f"/>` +
                    `<path d="M86 172 L80 182 L92 196 L100 214 Z" fill="${dark}"/>` +
                    `<path d="M114 172 L120 182 L108 196 L100 214 Z" fill="${dark}"/>`;
            default: // casual tee
                return torso + `<path d="M85 172 Q100 190 115 172" fill="none" stroke="${dark}" stroke-width="4"/>`;
        }
    }

    function hairBack(style, rx, color) {
        const L = 100 - rx, R = 100 + rx;
        if (style === "long") return `<path d="M${L - 9} 100 Q${L - 11} 46 100 46 Q${R + 11} 46 ${R + 9} 100 L${R + 12} 182 Q100 194 ${L - 12} 182 Z" fill="${color}"/>`;
        if (style === "wavy") return `<path d="M${L - 6} 100 Q${L - 9} 48 100 48 Q${R + 9} 48 ${R + 6} 100 L${R + 7} 134 Q${R - 2} 140 ${R - 4} 124 L${L + 4} 124 Q${L + 2} 140 ${L - 7} 134 Z" fill="${color}"/>`;
        return "";
    }

    function hairFront(style, rx, color) {
        const L = 100 - rx, R = 100 + rx;
        switch (style) {
            case "bald":
                return `<ellipse cx="88" cy="72" rx="9" ry="5" fill="rgba(255,255,255,.22)" transform="rotate(-20 88 72)"/>`;
            case "buzz cut":
                return `<path d="M${L + 1} 100 Q${L - 1} 58 100 58 Q${R + 1} 58 ${R - 1} 100 Q${R - 6} 77 100 75 Q${L + 6} 77 ${L + 1} 100 Z" fill="${color}" opacity=".88"/>`;
            case "curly": {
                let s = `<path d="M${L - 2} 102 Q${L - 6} 54 100 54 Q${R + 6} 54 ${R + 2} 102 Q${R - 4} 80 100 78 Q${L + 4} 80 ${L - 2} 102 Z" fill="${color}"/>`;
                for (let deg = -180; deg <= 0; deg += 20) {
                    const t = deg * Math.PI / 180;
                    s += `<circle cx="${(100 + (rx + 1) * Math.cos(t)).toFixed(1)}" cy="${(98 + 42 * Math.sin(t)).toFixed(1)}" r="10" fill="${color}"/>`;
                }
                return s;
            }
            case "wavy":
            case "long":
                return `<path d="M${L - 4} 106 Q${L - 8} 50 100 50 Q${R + 8} 50 ${R + 4} 106 Q${R - 2} 84 ${R - 10} 76 Q112 86 90 78 Q76 76 ${L + 8} 84 Q${L} 92 ${L - 4} 106 Z" fill="${color}"/>`;
            default: // short
                return `<path d="M${L - 2} 104 Q${L - 6} 52 100 52 Q${R + 6} 52 ${R + 2} 104 Q${R - 2} 82 ${R - 12} 74 Q112 82 92 76 Q80 74 ${L + 10} 78 Q${L + 2} 86 ${L - 2} 104 Z" fill="${color}"/>`;
        }
    }

    function facialHair(kind, rx, color) {
        const L = 100 - rx, R = 100 + rx;
        const jaw = (bottom, op) => `<path d="M${L + 2} 112 Q${L + 4} ${bottom - 4} 100 ${bottom} Q${R - 4} ${bottom - 4} ${R - 2} 112 Q${R - 6} 128 108 130 Q100 128 92 130 Q${L + 6} 128 ${L + 2} 112 Z" fill="${color}" opacity="${op}"/>`;
        const lip = op => `<path d="M88 131 Q94 125 100 129 Q106 125 112 131 Q106 132.5 100 131 Q94 132.5 88 131 Z" fill="${color}" opacity="${op}"/>`;
        if (kind === "stubble") return jaw(150, .24) + lip(.26);
        if (kind === "beard") return jaw(158, .95) + lip(.95);
        if (kind === "mustache") return lip(.95);
        return "";
    }

    function svg(appearance, opts) {
        const a = normalize(appearance);
        const size = (opts && opts.size) || "100%";
        const skin = SKIN[a.skin_tone], hair = HAIR[a.hair_color], eye = EYES[a.eye_color];
        const rx = HEAD_RX[a.body_type], w = BODY_W[a.body_type];
        const skinShadow = shade(skin, .86), L = 100 - rx, R = 100 + rx;
        const brow = a.hair_style === "bald" ? shade(hair, 1) : hair;
        const neckW = a.body_type === "muscular" || a.body_type === "heavy" ? 30 : 24;

        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="16 30 168 210" width="${size}" height="${size}" role="img" aria-label="profile portrait">
            ${hairBack(a.hair_style, rx, hair)}
            ${clothes(a.style, w, CLOTHES[a.style])}
            <rect x="${100 - neckW / 2}" y="136" width="${neckW}" height="40" rx="8" fill="${skinShadow}"/>
            <ellipse cx="${L + 1}" cy="110" rx="5.5" ry="8.5" fill="${skinShadow}"/>
            <ellipse cx="${R - 1}" cy="110" rx="5.5" ry="8.5" fill="${skinShadow}"/>
            <ellipse cx="100" cy="104" rx="${rx}" ry="${a.body_type === "heavy" ? 46 : 44}" fill="${skin}"/>
            <ellipse cx="${L + 12}" cy="124" rx="7" ry="4" fill="#ff7a9a" opacity=".18"/>
            <ellipse cx="${R - 12}" cy="124" rx="7" ry="4" fill="#ff7a9a" opacity=".18"/>
            ${facialHair(a.facial_hair, rx, hair)}
            <path d="M80 98 Q86 94 93 97" fill="none" stroke="${brow}" stroke-width="2.8" stroke-linecap="round"/>
            <path d="M107 97 Q114 94 120 98" fill="none" stroke="${brow}" stroke-width="2.8" stroke-linecap="round"/>
            <ellipse cx="86" cy="108" rx="6" ry="4.4" fill="#fff"/><ellipse cx="114" cy="108" rx="6" ry="4.4" fill="#fff"/>
            <circle cx="86" cy="108" r="3.4" fill="${eye}"/><circle cx="114" cy="108" r="3.4" fill="${eye}"/>
            <circle cx="86" cy="108" r="1.6" fill="#111"/><circle cx="114" cy="108" r="1.6" fill="#111"/>
            <circle cx="87.2" cy="106.8" r=".9" fill="#fff"/><circle cx="115.2" cy="106.8" r=".9" fill="#fff"/>
            <path d="M100 112 Q96 123 99.5 125.5 Q102 126.5 104 124.5" fill="none" stroke="${shade(skin, .72)}" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M91 134.5 Q100 140.5 109 134.5" fill="none" stroke="#9a4b4b" stroke-width="2.4" stroke-linecap="round"/>
            ${a.facial_hair === "beard" || a.facial_hair === "mustache" ? facialHair("mustache", rx, hair) : ""}
            ${hairFront(a.hair_style, rx, hair)}
            ${a.glasses ? `<g fill="rgba(255,255,255,.18)" stroke="#2b2b2b" stroke-width="2.4">
                <rect x="75" y="100" width="21" height="15" rx="5"/><rect x="104" y="100" width="21" height="15" rx="5"/></g>
                <path d="M96 106 Q100 103 104 106" fill="none" stroke="#2b2b2b" stroke-width="2.2"/>
                <line x1="75" y1="105" x2="${L + 1}" y2="103" stroke="#2b2b2b" stroke-width="2.2"/>
                <line x1="125" y1="105" x2="${R - 1}" y2="103" stroke="#2b2b2b" stroke-width="2.2"/>` : ""}
        </svg>`;
    }

    function chips(appearance) {
        const a = normalize(appearance);
        const hair = a.hair_style === "bald" ? "bald" : `${a.hair_style} ${a.hair_color} hair`;
        return [
            `📏 ${a.height_cm} cm`,
            a.body_type,
            hair,
            a.facial_hair !== "none" ? a.facial_hair : null,
            `${a.eye_color} eyes`,
            a.style,
            a.glasses ? "glasses" : null,
        ].filter(Boolean);
    }

    window.SanemeAvatar = {
        svg, normalize, chips,
        options: { skin: SKIN, hair: HAIR, eyes: EYES, hairStyles: HAIR_STYLES },
    };
})();
