# WraithLog data

- `message.json`: pesan yang berhasil diterima dan disimpan.
- `deleted.json`: pesan yang terdeteksi dihapus melalui event revoke.
- `settings.json`: batas jumlah record.
- `auth/`: session credentials Baileys setelah pairing. Jangan dibagikan.

Isi `auth/` dibuat otomatis saat pairing berhasil. File JSON ini berisi data lokal dan dapat memuat informasi privat.
