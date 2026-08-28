from __future__ import annotations

import math
import os
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "video" / "whatsapp-walkthroughs"
OUT.mkdir(parents=True, exist_ok=True)

WIDTH, HEIGHT, FPS, SECONDS = 960, 540, 18, 9
BG = "#07110d"
PANEL = "#111a17"
PANEL_2 = "#17221e"
LINE = "#2a3933"
TEXT = "#f1f7f3"
MUTED = "#98aaa2"
GREEN = "#2dd78a"
GREEN_DARK = "#0f6c49"
GOLD = "#d8ad4f"
RED = "#e36b70"

FONT_REG = "C:/Windows/Fonts/segoeui.ttf"
FONT_BOLD = "C:/Windows/Fonts/segoeuib.ttf"


def font(size: int, bold: bool = False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)


F10, F11, F12, F13, F14 = (font(v) for v in (10, 11, 12, 13, 14))
F11B, F12B, F13B, F14B, F16B, F20B, F24B = (font(v, True) for v in (11, 12, 13, 14, 16, 20, 24))


def rounded(draw, box, radius=12, fill=PANEL, outline=None, width=1):
    draw.rounded_rectangle(box, radius, fill=fill, outline=outline, width=width)


def text(draw, xy, value, fill=TEXT, f=F12, anchor=None):
    draw.text(xy, value, fill=fill, font=f, anchor=anchor)


def line(draw, box, fill=LINE, radius=4):
    rounded(draw, box, radius, fill)


def badge(draw, x, y, label, color=GREEN, width=None):
    w = width or int(draw.textlength(label, font=F10) + 22)
    rounded(draw, (x, y, x + w, y + 24), 12, color + "22", color, 1)
    text(draw, (x + w / 2, y + 12), label, color, F10, "mm")


def button(draw, box, label, primary=True):
    rounded(draw, box, 10, GREEN if primary else PANEL_2, GREEN if primary else LINE, 1)
    text(draw, ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2), label, "#06140e" if primary else TEXT, F12B, "mm")


def avatar(draw, x, y, label, color=GREEN):
    draw.ellipse((x, y, x + 36, y + 36), fill=color)
    text(draw, (x + 18, y + 18), label, "#04130d", F12B, "mm")


def cursor(draw, x, y, pulse=0.0):
    if pulse > 0:
        r = 13 + 5 * pulse
        draw.ellipse((x - r, y - r, x + r, y + r), outline=GREEN + "88", width=2)
    draw.polygon([(x, y), (x + 5, y + 20), (x + 10, y + 13), (x + 18, y + 12)], fill="#ffffff", outline="#07110d")


def shell(draw, title, nav_active):
    rounded(draw, (22, 20, 938, 500), 20, "#0b1511", LINE, 1)
    rounded(draw, (36, 34, 186, 486), 14, "#08110e", LINE, 1)
    text(draw, (54, 56), "VN", GOLD, F20B)
    text(draw, (91, 55), "Varada Nexus", TEXT, F12B)
    text(draw, (91, 73), "WhatsApp Solutions", MUTED, F10)
    nav = ["Overview", "Inbox", "Contacts", "Campaigns", "Templates", "Flows", "Analytics"]
    for idx, label in enumerate(nav):
        y = 112 + idx * 43
        if label == nav_active:
            rounded(draw, (46, y - 8, 176, y + 24), 8, GREEN + "20")
            draw.rectangle((46, y - 5, 49, y + 21), fill=GREEN)
        draw.ellipse((58, y, 66, y + 8), fill=GREEN if label == nav_active else MUTED)
        text(draw, (76, y + 4), label, TEXT if label == nav_active else MUTED, F11, "lm")
    text(draw, (212, 50), title, TEXT, F20B)
    text(draw, (212, 76), "Sample walkthrough · no customer data", MUTED, F11)


def inbox(draw, phase, p):
    shell(draw, "Team inbox", "Inbox")
    rounded(draw, (210, 102, 450, 470), 12, PANEL, LINE, 1)
    text(draw, (226, 122), "Conversations", TEXT, F14B)
    rounded(draw, (226, 148, 434, 181), 8, PANEL_2, LINE, 1)
    text(draw, (243, 164), "Search conversations", MUTED, F10, "lm")
    names = [("A", "Ananya Rao", "Need help with my order"), ("M", "Meera Stores", "Thank you!"), ("R", "Rohan", "Can I change the date?")]
    for i, (initial, name, preview) in enumerate(names):
        y = 199 + i * 72
        rounded(draw, (220, y - 6, 440, y + 58), 9, GREEN + "12" if i == phase % 3 else PANEL)
        avatar(draw, 230, y + 6, initial)
        text(draw, (278, y + 9), name, TEXT, F11)
        text(draw, (278, y + 30), preview, MUTED, F10)
    rounded(draw, (466, 102, 922, 470), 12, PANEL, LINE, 1)
    text(draw, (486, 122), names[min(phase, 2)][1], TEXT, F14B)
    draw.line((480, 145, 908, 145), fill=LINE)
    bubbles = [
        ("Hi, I need help with my order.", 492, 176, False),
        ("I can help. Please share the order number.", 608, 228, True),
        ("VN-2048", 492, 283, False),
    ]
    for value, x, y, own in bubbles[: phase + 1]:
        w = min(270, int(draw.textlength(value, font=F11) + 28))
        rounded(draw, (x, y, x + w, y + 38), 11, GREEN + "25" if own else PANEL_2, GREEN + "55" if own else LINE, 1)
        text(draw, (x + 14, y + 19), value, TEXT, F11, "lm")
    rounded(draw, (486, 411, 788, 450), 10, PANEL_2, LINE, 1)
    text(draw, (503, 430), "Type a reply…", MUTED, F11, "lm")
    button(draw, (800, 411, 902, 450), "Send")
    targets = [(330, 216), (735, 246), (848, 430)]
    cursor(draw, *targets[phase], pulse=math.sin(p * math.pi) ** 2)


def contacts(draw, phase, p):
    shell(draw, "Contacts", "Contacts")
    rounded(draw, (210, 102, 922, 470), 12, PANEL, LINE, 1)
    text(draw, (230, 124), "Customer directory", TEXT, F14B)
    rounded(draw, (660, 113, 902, 147), 8, PANEL_2, LINE, 1)
    text(draw, (677, 130), "Search name or number", MUTED, F10, "lm")
    headers = [(230, "Customer"), (476, "Consent"), (626, "Status"), (760, "Activity")]
    for x, label in headers:
        text(draw, (x, 174), label.upper(), MUTED, F10)
    rows = [("A", "Ananya Rao", "+91 98••• 2401", "Opted in", "Active", "2m ago"), ("M", "Meera Stores", "+91 97••• 8810", "Opted in", "Active", "1h ago"), ("R", "Rohan Mehta", "+91 99••• 1172", "Unknown", "Pending", "Yesterday")]
    for i, row in enumerate(rows):
        y = 198 + i * 70
        rounded(draw, (220, y - 8, 912, y + 53), 9, GREEN + "10" if i == min(phase, 2) else PANEL_2, LINE, 1)
        avatar(draw, 232, y + 4, row[0])
        text(draw, (278, y + 8), row[1], TEXT, F11)
        text(draw, (278, y + 29), row[2], MUTED, F10)
        badge(draw, 474, y + 7, row[3], GREEN if row[3] == "Opted in" else GOLD, 95)
        badge(draw, 625, y + 7, row[4], GREEN if row[4] == "Active" else GOLD, 78)
        text(draw, (762, y + 19), row[5], MUTED, F10, "lm")
    if phase == 2:
        rounded(draw, (520, 150, 890, 440), 16, "#0d1713", GREEN, 1)
        text(draw, (545, 178), "Customer profile", TEXT, F16B)
        avatar(draw, 545, 213, "R")
        text(draw, (594, 220), "Rohan Mehta", TEXT, F14B)
        text(draw, (594, 242), "+91 99••• 1172", MUTED, F11)
        text(draw, (545, 285), "Messaging eligibility", MUTED, F10)
        badge(draw, 545, 305, "Consent review required", GOLD, 160)
        button(draw, (545, 372, 725, 414), "Open conversation")
    targets = [(777, 129), (700, 290), (650, 390)]
    cursor(draw, *targets[phase], pulse=math.sin(p * math.pi) ** 2)


def campaigns(draw, phase, p):
    shell(draw, "Campaigns", "Campaigns")
    if phase == 0:
        rounded(draw, (210, 105, 922, 470), 14, PANEL, LINE, 1)
        text(draw, (235, 132), "Create campaign", TEXT, F16B)
        text(draw, (235, 168), "1. Choose an audience", GREEN, F12B)
        cards = [("Recent customers", "1,248 contacts"), ("Opted-in prospects", "682 contacts"), ("VIP customers", "94 contacts")]
        for i, (label, count) in enumerate(cards):
            x = 235 + i * 216
            rounded(draw, (x, 205, x + 192, 325), 12, GREEN + "15" if i == 1 else PANEL_2, GREEN if i == 1 else LINE, 1)
            text(draw, (x + 16, 229), label, TEXT, F12B)
            text(draw, (x + 16, 257), count, MUTED, F11)
            badge(draw, x + 16, 283, "Eligible", GREEN, 68)
        button(draw, (704, 395, 890, 438), "Continue")
        cursor(draw, 547, 260, math.sin(p * math.pi) ** 2)
    elif phase == 1:
        rounded(draw, (210, 105, 922, 470), 14, PANEL, LINE, 1)
        text(draw, (235, 132), "2. Select an approved template", GREEN, F12B)
        rounded(draw, (235, 174, 610, 418), 12, PANEL_2, LINE, 1)
        text(draw, (255, 200), "order_update_en", TEXT, F14B)
        badge(draw, 486, 190, "Approved", GREEN, 88)
        rounded(draw, (255, 240, 585, 324), 10, GREEN + "18", LINE, 1)
        text(draw, (272, 260), "Hi {{1}}, your order {{2}} is ready.", TEXT, F11)
        button(draw, (255, 350, 405, 392), "Use template")
        rounded(draw, (635, 174, 895, 418), 12, "#0a1511", LINE, 1)
        text(draw, (655, 205), "Campaign summary", TEXT, F13)
        text(draw, (655, 246), "Audience", MUTED, F10); text(draw, (855, 246), "682", TEXT, F11B, "rm")
        text(draw, (655, 280), "Template", MUTED, F10); text(draw, (855, 280), "Approved", GREEN, F11B, "rm")
        cursor(draw, 338, 371, math.sin(p * math.pi) ** 2)
    else:
        rounded(draw, (210, 105, 922, 470), 14, PANEL, LINE, 1)
        text(draw, (235, 132), "Campaign performance", TEXT, F16B)
        for i, (label, value, color) in enumerate([("Delivered", "94%", GREEN), ("Read", "78%", GREEN), ("Replies", "21%", GOLD)]):
            x = 235 + i * 215
            rounded(draw, (x, 178, x + 190, 280), 12, PANEL_2, LINE, 1)
            text(draw, (x + 18, 201), label, MUTED, F11)
            text(draw, (x + 18, 235), value, color, F24B)
        draw.line((250, 402, 880, 402), fill=LINE, width=2)
        pts = [(260, 382), (365, 355), (470, 365), (575, 310), (680, 327), (785, 260), (875, 285)]
        draw.line(pts, fill=GREEN, width=4, joint="curve")
        for x, y in pts: draw.ellipse((x - 4, y - 4, x + 4, y + 4), fill=GREEN)
        cursor(draw, 785, 260, math.sin(p * math.pi) ** 2)


def templates(draw, phase, p):
    shell(draw, "Message templates", "Templates")
    rounded(draw, (210, 105, 922, 470), 14, PANEL, LINE, 1)
    text(draw, (232, 130), ["Create a reusable message", "Submit for Meta review", "Use approved templates"][phase], TEXT, F16B)
    rounded(draw, (232, 172, 560, 438), 12, PANEL_2, LINE, 1)
    text(draw, (252, 198), "Template editor", MUTED, F11)
    text(draw, (252, 232), "Order update", TEXT, F13B)
    rounded(draw, (252, 260, 540, 350), 10, "#0b1511", LINE, 1)
    text(draw, (270, 282), "Hi {{1}}, your order {{2}} is ready", TEXT, F11)
    text(draw, (270, 307), "for collection. Reply HELP for support.", TEXT, F11)
    button(draw, (252, 376, 392, 418), "Save draft", False)
    button(draw, (402, 376, 540, 418), "Submit")
    rounded(draw, (585, 172, 896, 438), 12, "#0a1511", LINE, 1)
    text(draw, (608, 199), "Status", MUTED, F11)
    status = ["Draft", "In review", "Approved"][phase]
    badge(draw, 608, 224, status, [GOLD, GOLD, GREEN][phase], 96)
    text(draw, (608, 276), "Category", MUTED, F10); text(draw, (856, 276), "Utility", TEXT, F11B, "rm")
    text(draw, (608, 310), "Language", MUTED, F10); text(draw, (856, 310), "English", TEXT, F11B, "rm")
    text(draw, (608, 344), "Reusable in", MUTED, F10); text(draw, (856, 344), "Inbox + Campaigns", TEXT, F11B, "rm")
    cursor(draw, *[(468, 396), (470, 396), (735, 238)][phase], pulse=math.sin(p * math.pi) ** 2)


def flows(draw, phase, p):
    shell(draw, "Flows & automation", "Flows")
    rounded(draw, (210, 105, 922, 470), 14, "#0a1410", LINE, 1)
    text(draw, (232, 128), ["Add a trigger", "Connect the journey", "Publish the automation"][phase], TEXT, F16B)
    nodes = [(270, 220, "Customer message", GREEN), (505, 165, "Send reply", GOLD), (505, 300, "Assign team", GREEN), (745, 230, "Complete", GREEN)]
    connections = [((410, 250), (505, 195)), ((410, 250), (505, 330)), ((645, 195), (745, 260)), ((645, 330), (745, 260))]
    for i, (start, end) in enumerate(connections):
        if phase >= 1 or i == 0:
            draw.line((start, end), fill=GREEN if phase == 2 else LINE, width=3)
            draw.ellipse((end[0] - 4, end[1] - 4, end[0] + 4, end[1] + 4), fill=GREEN)
    for x, y, label, color in nodes:
        rounded(draw, (x, y, x + 140, y + 62), 12, PANEL_2, color if phase == 2 else LINE, 1)
        draw.ellipse((x + 14, y + 21, x + 28, y + 35), fill=color)
        text(draw, (x + 38, y + 31), label, TEXT, F11B, "lm")
    button(draw, (760, 118, 895, 158), "Publish")
    cursor(draw, *[(325, 242), (520, 213), (827, 138)][phase], pulse=math.sin(p * math.pi) ** 2)


def analytics(draw, phase, p):
    shell(draw, "Analytics", "Analytics")
    metrics = [("Conversations", "1,284"), ("Messages", "8,492"), ("Resolution", "91%")]
    for i, (label, value) in enumerate(metrics):
        x = 210 + i * 238
        rounded(draw, (x, 105, x + 218, 195), 12, PANEL, GREEN if i == phase else LINE, 1)
        text(draw, (x + 18, 128), label, MUTED, F11)
        text(draw, (x + 18, 158), value, TEXT, F20B)
    rounded(draw, (210, 215, 690, 470), 14, PANEL, LINE, 1)
    text(draw, (230, 238), "Conversation volume", TEXT, F13B)
    draw.line((245, 425, 662, 425), fill=LINE, width=2)
    values = [35, 62, 48, 74, 57, 91, 78, 105, 86]
    pts = []
    for i, value in enumerate(values):
        x = 250 + i * 49
        y = 420 - value * (1 + .08 * math.sin(p * math.pi))
        pts.append((x, y))
    draw.line(pts, fill=GREEN, width=4, joint="curve")
    for x, y in pts: draw.ellipse((x - 4, y - 4, x + 4, y + 4), fill=GREEN)
    rounded(draw, (710, 215, 922, 470), 14, PANEL, LINE, 1)
    text(draw, (730, 238), "Channel health", TEXT, F13B)
    for i, (label, val, color) in enumerate([("Delivered", "97%", GREEN), ("Read", "82%", GREEN), ("Failed", "1.2%", RED)]):
        y = 286 + i * 52
        text(draw, (730, y), label, MUTED, F11)
        text(draw, (890, y), val, color, F12B, "rm")
        line(draw, (730, y + 22, 890, y + 28), LINE, 3)
        line(draw, (730, y + 22, 730 + int(160 * min(float(val.strip('%')) / 100, 1)), y + 28), color, 3)
    cursor(draw, *[(270, 160), (500, 350), (830, 390)][phase], pulse=math.sin(p * math.pi) ** 2)


FEATURES = {
    "team-inbox": (inbox, ["Choose a customer conversation", "Review the full message context", "Reply and keep ownership clear"]),
    "contacts": (contacts, ["Search the customer directory", "Review consent and eligibility", "Open the complete customer profile"]),
    "campaigns": (campaigns, ["Choose an eligible audience", "Select an approved template", "Track campaign performance"]),
    "templates": (templates, ["Create a reusable message", "Submit it for Meta review", "Use the approved template anywhere"]),
    "flows": (flows, ["Start with a customer trigger", "Connect messages and actions", "Publish the finished automation"]),
    "analytics": (analytics, ["Review the headline metrics", "Understand messaging trends", "Monitor delivery health"]),
}


def render_frame(renderer, captions, frame_index):
    t = frame_index / FPS
    phase = min(2, int(t // 3))
    local = (t % 3) / 3
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)
    renderer(draw, phase, local)
    rounded(draw, (210, 482, 922, 525), 12, "#08120e", GREEN + "55", 1)
    badge(draw, 226, 492, f"STEP {phase + 1} OF 3", GREEN, 84)
    text(draw, (326, 503), captions[phase], TEXT, F13B, "lm")
    progress = max(0.02, min(1, (frame_index + 1) / (FPS * SECONDS)))
    line(draw, (210, 532, 922, 536), LINE, 2)
    line(draw, (210, 532, 210 + int(712 * progress), 536), GREEN, 2)
    return img


def make_video(name, renderer, captions):
    target = OUT / f"{name}.mp4"
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    command = [
        ffmpeg, "-y", "-f", "rawvideo", "-vcodec", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{WIDTH}x{HEIGHT}", "-r", str(FPS), "-i", "-", "-an", "-vcodec", "libx264",
        "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "23", "-movflags", "+faststart", str(target),
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    assert process.stdin is not None
    for frame_index in range(FPS * SECONDS):
        process.stdin.write(render_frame(renderer, captions, frame_index).tobytes())
    process.stdin.close()
    stderr = process.stderr.read().decode("utf-8", "replace") if process.stderr else ""
    code = process.wait()
    if code:
        raise RuntimeError(f"ffmpeg failed for {name}: {stderr}")
    print(f"Created {target.relative_to(ROOT)} ({target.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    for feature_name, (feature_renderer, feature_captions) in FEATURES.items():
        make_video(feature_name, feature_renderer, feature_captions)
