# MIMO 1.0 Christmas screens: design and background

The MIMO 1.0 (CV-001) Christmas code-entry, printing, summary and error screens re-implement the design from the
owner's friend's repository, github.com/Saketsasanka30/MIMO, used with the owner's permission.

- tree-bg.jpg: `public/assets/aistudio/Bg2_d42c6f07.png` from that repository (4096x2287 PNG, 14.7 MB), resized to
  2560 px wide and saved as JPEG q86 (about 655 KB) for the kiosk tablet.
- Layout, colours, type (Outfit / Plus Jakarta Sans), card, keypad, code slots, dial, dispenser and error card follow
  that repository's CodeEntryScreen / PrintingScreen / SummaryScreen / SystemErrorScreen CSS, scaled from its 1000 px
  landscape stage to the 1.0 1440x810 canvas (x 0.81). Glass blur is replaced by an opaque card for the tablet.
