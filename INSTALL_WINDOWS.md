# Eva Wolf Edge Extension: Download + Install (Windows)

## Why you saw the red error
The red **"Binary files are not supported"** message is from the Codex/Git diff viewer.
It means this UI cannot handle `.zip` files in a PR diff.

## What to do instead
Use the plain folder `edge-extension` (no zip needed).

1. Open/clone/download this repository on your computer.
2. Open Microsoft Edge and go to `edge://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. In the folder picker, choose the folder named **`edge-extension`** (the one that contains `manifest.json`).

## Optional: make your own zip locally
If you want a zip backup, create it on your own machine *after* downloading the repo.

PowerShell example:
```powershell
Compress-Archive -Path .\edge-extension -DestinationPath .\eva-wolf-edge-extension.zip -Force
```

## If Edge says invalid extension
- Make sure you selected `edge-extension` directly, not the parent folder.
- Confirm `manifest.json` is inside the selected folder.
