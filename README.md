# WraithLog

WraithLog is a terminal-based WhatsApp Web-compatible message monitor by **NullKat Development**. The complete application logic—CLI, pairing-code authentication, Baileys connection, JSON storage, search, group support, and deletion monitoring—is contained in `index.js`.

## Project structure

```text
WraithLog/
├── index.js          # complete application
├── package.json      # dependencies and npm scripts
├── package-lock.json
├── .gitignore
├── README.md
└── data/
    ├── message.json
    ├── deleted.json
    ├── settings.json
    ├── README.md
    └── auth/
        └── .gitkeep
```

The `data/` directory is inside the project. `message.json`, `deleted.json`, and `settings.json` are created on first startup. `data/auth/` is populated by Baileys after pairing and contains authentication session data. Never share it.

## Installation and startup

Requirement: Node.js 20 or newer.

### Termux

```bash
pkg update
pkg install nodejs-lts
cd WraithLog
npm install
node index.js
```

### Debian, Ubuntu, or Linux

```bash
sudo apt update
sudo apt install -y nodejs npm
cd WraithLog
npm install
node index.js
```

You can also use:

```bash
npm start
```

## WhatsApp pairing

1. Run `node index.js`.
2. Select menu option `3`.
3. Enter your own WhatsApp number with the country code, for example `628123456789`.
4. Copy the pairing code returned by WhatsApp.
5. In WhatsApp, open **Linked devices → Link a device → Link with phone number**.
6. Enter the code.
7. Monitoring begins only after `[CONNECTED]` appears.

WraithLog never creates, prints, or uses a QR code. Authentication sessions are stored separately in `data/auth/`.

## Menu and live dashboards

```text
[1] Latest Messages
[2] Deleted Messages
[3] Link WhatsApp
[4] Credits
[5] Exit
```

Menus `1` and `2` are live dashboards. New messages and deletion records are redrawn automatically while the dashboard is open. All stored records are shown, and newer messages are appended at the bottom. Deleted messages remain visible in menu `1` in red and are also available in menu `2`.

Supported commands are `search`, `refresh`, `help`, `out`, and `exit`. The `out` command returns to the main menu. Group records include the group name, group JID, and the participant phone number when WhatsApp/Baileys provides it. Deletion records are deduplicated by chat JID and message ID. Deletion notifications are silent outside menu `2`.

## Data files

- `data/message.json`: received message records.
- `data/deleted.json`: deletion records detected through supported revoke events.
- `data/settings.json`: storage limits.
- `data/auth/`: Baileys authentication session files.

The default limits are 5,000 message records and 5,000 deletion records. Do not publish or share the contents of `data/auth/`, `message.json`, or `deleted.json` if they contain private data.

## Important limitations

WraithLog can only preserve original content when the message was received and stored before its revoke event arrived. A message deleted before the application received it cannot be recovered. Participant numbers, group names, reply context, timestamps, and other metadata depend on the event data provided by WhatsApp and Baileys. Live testing requires an account and groups owned or authorized by the operator.

Baileys is an unofficial library and is not affiliated with WhatsApp. Use WraithLog only with accounts and conversations you own or are authorized to monitor.
