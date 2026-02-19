# -*- coding: utf-8 -*-
import shutil
import os

src = r"c:\Users\Daniel\Downloads\Telegram Desktop\Политика перс. данные.docx"
dest_dir = os.path.dirname(os.path.abspath(__file__))
dst = os.path.join(dest_dir, "politika-personalnye-dannye.docx")

if not os.path.isfile(src):
    print("SOURCE NOT FOUND:", src)
    # List what is in the folder
    folder = os.path.dirname(src)
    if os.path.isdir(folder):
        for f in os.listdir(folder):
            if "olitik" in f or "олитик" in f or f.endswith(".docx"):
                print("  Found:", f)
else:
    size_src = os.path.getsize(src)
    shutil.copy2(src, dst)
    size_dst = os.path.getsize(dst)
    print("Copied. Source size:", size_src, "bytes. Dest size:", size_dst, "bytes.")
    if size_src != size_dst:
        print("WARNING: sizes differ!")
    elif size_src < 10000:
        print("WARNING: file is small (maybe placeholder?). Full policy is usually 50KB+")
