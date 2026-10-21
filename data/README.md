# WraithLog data

- `message.json`: messages received and stored by WraithLog.
- `deleted.json`: messages detected as deleted through supported revoke events.
- `settings.json`: storage limits.
- `auth/`: Baileys authentication session files created after pairing. Never share this directory.

The JSON files contain local runtime data and may include private messages. Keep them out of public repositories when they contain real account data.
