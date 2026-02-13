# -*- coding: utf-8 -*-
"""Copy user's policy documents from Telegram Desktop to assets/docs."""
import shutil
import os

SOURCE_DIR = r"c:\Users\Daniel\Downloads\Telegram Desktop"
DEST_DIR = os.path.dirname(os.path.abspath(__file__))

# Exact filenames as in Telegram Desktop folder
SOURCES = [
    (os.path.join(SOURCE_DIR, "Согласие_на_обработку_перс_данных.doc"), "soglasie-personalnye-dannye.doc"),
    (os.path.join(SOURCE_DIR, "Политика перс. данные.docx"), "politika-personalnye-dannye.docx"),
]

def main():
    for src, dest_name in SOURCES:
        dst = os.path.join(DEST_DIR, dest_name)
        if not os.path.isfile(src):
            print("NOT FOUND:", src)
            continue
        shutil.copy2(src, dst)
        print("OK:", dest_name)

if __name__ == "__main__":
    main()
