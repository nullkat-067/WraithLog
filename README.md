# WraithLog

WraithLog adalah aplikasi terminal WhatsApp Web-compatible dari **NullKat Development**. Semua logika utama—CLI, pairing code, koneksi Baileys, storage JSON, pencarian, dukungan grup, dan deteksi deletion—berada di satu file: `index.js`.

## Struktur file

```text
WraithLog/
├── index.js          # seluruh aplikasi WraithLog
├── package.json      # dependency dan script start
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

Folder `data/` berada langsung di dalam proyek. File `message.json`, `deleted.json`, dan `settings.json` sudah tersedia sejak awal. Folder `data/auth/` akan diisi otomatis oleh Baileys setelah pairing dan berisi sesi autentikasi; jangan membagikan isinya.

## Instalasi dan menjalankan

Persyaratan: Node.js 20 atau lebih baru.

### Termux

```bash
pkg update
pkg install nodejs-lts
cd WraithLog
npm install
node index.js
```

### Debian/Ubuntu/Linux

```bash
sudo apt update
sudo apt install -y nodejs npm
cd WraithLog
npm install
node index.js
```

Alternatif melalui script npm:

```bash
npm start
```

## Pairing WhatsApp

1. Jalankan `node index.js`.
2. Pilih menu `3`.
3. Masukkan nomor akun sendiri dengan kode negara, misalnya `628123456789`.
4. Salin pairing code yang diberikan WhatsApp.
5. Di WhatsApp buka **Perangkat tertaut → Tautkan perangkat → Tautkan dengan nomor telepon**.
6. Masukkan kode tersebut.
7. Monitoring mulai setelah `[CONNECTED]` muncul.

WraithLog tidak membuat, mencetak, atau menggunakan QR code. Sesi autentikasi disimpan terpisah di `~/.wraithlog/auth/`.

## Menu

```text
[1] Latest Messages
[2] Deleted Messages
[3] Link WhatsApp
[4] Credits
[5] Exit
```

Menu `1` dan `2` adalah dashboard live. Saat menu terbuka, pesan baru atau deletion record baru langsung dirender ulang tanpa perlu mengetik `refresh`, dan seluruh record tersimpan ditampilkan, bukan hanya beberapa item terakhir. Pesan baru ditambahkan di bagian bawah; pesan yang sudah terhapus tetap terlihat di menu `1` dengan warna merah, dan juga tersedia khusus di menu `2`. Gunakan `search`, `refresh`, `help`, `out`, atau `exit`; `out` kembali ke menu utama. Pesan grup menyimpan nama grup, group JID, dan nomor participant aktual bila WhatsApp/Baileys menyediakannya. Deletion record dideduplikasi berdasarkan chat JID dan message ID. Notifikasi deletion tidak dicetak saat pengguna berada di menu lain; record akan terlihat saat menu `2` dibuka.

## Batasan penting

WraithLog hanya dapat menyimpan isi pesan yang sudah diterima dan disimpan sebelum event revoke diterima. Pesan yang dihapus sebelum aplikasi menerimanya tidak dapat dipulihkan. Ketersediaan participant, nama grup, reply context, timestamp, dan metadata bergantung pada event yang dikirim WhatsApp/Baileys. Pengujian live memerlukan akun dan grup yang dimiliki atau diotorisasi pengguna.

Baileys adalah library tidak resmi dan tidak berafiliasi dengan WhatsApp. Gunakan hanya pada akun dan percakapan yang Anda miliki atau berwenang untuk monitor.
