# Firebot Raid Chat Alert Custom Script

### Setup

1. `git clone https://github.com/Wissididom/Firebot-Raid-Chat-Alert.git` or just download the repo and cd into it.
2. `npm install` or `npm i`

### Building

Dev:

1. `npm run build:dev`

- Automatically copies the compiled .js to Firebot's scripts folder.

Release:

1. `npm run build`

- Copy .js from `/dist`

### Note

- Keep the script definition object (that contains the `run`, `getScriptManifest`, and `getDefaultParameters` funcs) in the `main.ts` file as it's important those function names don't get minimized.
- Edit the `"scriptOutputName"` property in `package.json` to change the filename of the outputted script.

### API Infos

[Firebotpy Source Code](https://github.com/dadthegamer/Firebotpy/blob/main/Firebot.py)

[API Documentation](https://github.com/crowbartools/Firebot/wiki/API-Documentation)
