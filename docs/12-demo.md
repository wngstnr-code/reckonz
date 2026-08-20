# Video demo

Ditulis 2026-08-20. Bukan syarat submission: Google Form-nya delapan field dan tidak satu pun
video (`00-hackathon.md`, dibaca 2026-08-14). Tetap layak dibuat, karena deskripsi submission bisa
menaut ke luar, dan juri yang menonton sembilan puluh detik fill sungguhan sudah melihat sesuatu
yang tidak bisa diklaim paragraf mana pun.

> **Catatan bahasa.** Panduan di file ini berbahasa Indonesia, karena ini dokumen kerja untuk kami
> berdua dan bukan barang yang dibaca juri. **Semua yang masuk ke video tetap bahasa Inggris**:
> naskah narasi, teks di layar, caption, judul, dan deskripsi. Blockquote di bawah adalah naskah,
> jadi jangan diterjemahkan.

Dua aturan yang mengalahkan apa pun di bawah ini.

**Tanpa em-dash.** Tidak di narasi, tidak di teks layar, tidak di caption, tidak di deskripsi
video. Suara rumah yang sama dengan `docs/10-submission.md`.

**Tidak ada yang dipanggungkan.** Setiap angka di layar diukur pada hari perekaman, setiap perintah
benar-benar dijalankan, dan satu fill di video itu settle di mainnet. Kalau ada run yang menolak
sesuatu, biarkan. Penolakan itu produknya, dan demo yang isinya hijau semua sedang berdebat dengan
dirinya sendiri.

---

## Argumennya dulu, sebelum shot list

Video ini membuat satu argumen dalam empat langkah. Selebihnya hiasan dan boleh dipotong.

1. **Ada pasar ekuitas tertokenisasi yang hidup di X Layer tanpa lapisan aplikasi di atasnya.**
   Tiga puluh xStock diperdagangkan sebagai ERC-20, dan tidak ada apa pun di atasnya yang
   menakar, memberi harga, atau menolak.
2. **Kami menakar ke apa yang benar-benar sanggup ditelan pool, dan sisanya dikembalikan.** Minta
   $250,000, dapat beberapa ribu, dan angka yang tidak kamu dapat diucapkan terang-terangan.
3. **Penolakan itu ditegakkan kontrak, di dalam transaksi trade-nya sendiri.** Bukan peringatan
   sesudahnya. `PolicyGuard` revert, dan dia membatasi berdasarkan kondisi pasar, bukan cuma
   tujuan dan ukuran.
4. **Chain-nya adalah buktinya.** Receipt di registry append-only, masing-masing membawa hash dari
   quote, pembacaan oracle, dan verdict guard yang persis dipakai, dipublikasikan sebelum apa pun
   ditandatangani, dan bisa diturunkan ulang siapa saja dari bundle yang diarsipkan.

### Yang harus disebut

- Tokenised real world assets, di sepuluh detik pertama. Cuma itu yang menempatkan ini di track
  AI-RWA (lihat catatan di kepala `10-submission.md`).
- Non-custodial. Dana tidak pernah keluar dari dompet penonton, di titik mana pun.
- Angka capacity beserta tanggalnya, dan pembacaan sebelumnya di sebelahnya. Angka itu bergerak ke
  dua arah, dan mengatakannya adalah demonstrasinya.

### Yang jangan disebut

Tiga klaim sudah mati dan mengulanginya memakan kredibilitas di depan siapa pun yang paham ruang
ini (D49):

- "Tidak ada yang mempublikasikan fair value dengan uncertainty." Pyth melakukannya, dengan data
  Nasdaq di belakangnya.
- "Eksekusi agent yang dibatasi itu baru." Giza sudah memproses miliaran di bawah pola itu.
- "Market-hours gap itu masalah industri." Itu kondisi venue ini.

Jangan juga bilang "AI trading agent", jangan menyebutnya assistant, dan jangan mengklaim ada agent
yang memakai API-nya. Belum ada.

---

## Keputusan format

| Keputusan | Nilai | Alasan |
|---|---|---|
| Durasi | **2:45 sampai 3:10**, target 3:00 | Cukup panjang untuk satu fill sungguhan, cukup pendek untuk diselesaikan juri |
| Rasio | 16:9, 1920x1080, 60fps | Rekam di 2560x1440 lalu turunkan, supaya tipografi rapatnya tetap tajam |
| Suara | Satu narator, terdengar tidak dibacakan, tanpa musik di bawah suara | UI-nya instrumen, dan bed musik terbaca sebagai iklan produk |
| Caption | Burned in, selalu tampil | Kebanyakan juri menonton tanpa suara di kali pertama |
| Kursor | Terlihat, tanpa efek klik, tanpa overlay ketikan | Antarmukanya sudah cukup padat |
| Kecepatan | Real time kecuali yang ditandai, dengan badge kecepatan yang terlihat | Jujur soal latensi, lihat di bawah |

**Soal mempercepat.** Pipeline-nya lambat karena alasan nyata: panggilan LLM, RPC publik yang
di-throttle, tiga puluh pasar referensi. Ada tiga tempat di cut ini yang berjalan lebih cepat dari
aslinya. Setiap satunya membawa badge kecil di pojok yang menyebut pengalinya dan berapa lama
sebenarnya, misalnya `4x, real time 38s`. Memotong latensi diam-diam adalah satu-satunya hal tidak
jujur yang bisa ada di video ini.

---

## Cut yang perlu dibuat

| Cut | Durasi | Untuk di mana |
|---|---|---|
| **Utama** | 3:00 | Ditaut dari situs dan dari deskripsi submission |
| **Pendek** | 0:60 | Diposting dari `@reckonz_xyz`, lihat `docs/11-social.md` |
| **Loop diam** | 0:20 | Slider capacity yang runtuh dan verdict guard, tanpa suara, untuk hero situs |

Cut pendek bukan cut utama yang dipangkas. Itu adegan 4, 5 dan 6 disusun ulang dengan tiga kalimat
narasi, dan landing-nya dibuang sama sekali: penonton yang sudah ada di dalam sebuah post tidak
perlu diantar ke pintu depan. Memangkas cut utama menghasilkan video yang membuka di halaman
marketing dan tidak pernah sampai ke satu angka pun.

**Ada rumah keempat untuk rekaman, dan sudah dibangun.** `Approach` di landing menerima `videoSrc`
dan kartu yang terbang masuk itu player yang menunggu isi, dengan caption *the recorded run lands
here*. `app/page.tsx` belum mengopernya. Yang pantas masuk ke kartu itu adalah rekaman **satu run**,
adegan 5 berdiri sendiri tanpa narasi, bukan video ini: halaman yang membuka dengan memutar tur
tentang dirinya sendiri sedang berdebat dengan layar pertamanya. Itu milik FE, jadi tiket, bukan
editan.

---

## Pre-flight, di hari perekaman

Kerjakan semuanya. Cara paling mungkin video ini gagal adalah oracle yang basi menolak fill di
depan kamera, dan itu cuma pengecekan dua puluh detik.

```bash
cd /Users/mac/Desktop/okxai
set -a && source .env && set +a
git status --short                      # tree bersih; diff kotor di kamera itu pertanyaan yang tidak kamu mau
pnpm typecheck && pnpm test             # harapkan bersih, lalu 296 unit dan 106 Foundry
curl -s https://reckonz.xyz/api/health | jq   # jangan sampai `down`, lihat di bawah
```

**`GET /api/health` adalah gerbangnya.** Kalau jawabannya `down`, tidak ada yang bisa dieksekusi
dan adegan fill akan gagal di depan kamera. `degraded` biasanya masih aman dan memang menjawab 200,
tapi baca body-nya dan cari tahu aset mana yang basi sebelum kamu mengarahkan fill ke sana. Route
ini kebenaran operasionalnya (D81), bukan fakta bahwa situsnya terbuka.

Lalu segarkan setiap angka yang akan disebut video:

```bash
pnpm capacity                  # angka universe, di 0.5%, dan tanggal hari ini
pnpm plan 250000               # set asked / placed / refused / avoided-impact, keempatnya dari SATU run
pnpm check:tests               # dua angka test, diadu dengan dokumennya
pnpm index                     # bikin observations/registry.jsonl current sebelum membaca jumlah receipt
```

Ambil keempat angka plan dari satu `pnpm plan 250000` yang sama. `pnpm showcase` menakar basket
yang sedikit berbeda dan pernah menjawab angka lain untuk pertanyaan yang sama dalam selang
menit. Keduanya jujur; kalimat yang mencampur keduanya tidak.

Tulis keempat angka itu di sticky note. Angka itu masuk ke narasi, ke lower third, dan ke deskripsi
video, dan ketiganya harus sama.

### Gas dan dana

Video ini menulis ke mainnet **dua kali**, bukan sekali: `publishThesis` di adegan 5 dan `execute`
di adegan 6. Anggarannya:

- **0.5 USDG** untuk belinya, ukuran yang dipakai semua fill sungguhan sebelumnya.
- **OKB mainnet** untuk gas di deployer, untuk dua transaksi, plus margin untuk satu retry di
  masing-masing. Baca saldonya dari chain, jangan dari `05-status.md`, yang basi begitu ditulis.
- Publish tesisnya murah tapi tidak gratis, dan dia ada di jalur kritis: tanpa id, tombol **Take it
  to the trade page** tidak pernah muncul dan adegan 6 tidak punya jalan masuk.
- Jangan sentuh publisher. Jangan menjalankan publish untuk video; gas publisher itu sumber daya
  yang langka dan worker membutuhkannya.

Kalau USDG kurang, rekam adegan fill di **testnet** dan katakan itu di layar. Testnet tidak bisa
swap (factory v3 tidak punya kode di sana), jadi yang jujur bisa direkam di 1952 adalah publish
tesis, mandate, trigger, dan breaker, bukan fill-nya. `ThesisRegistry` ada di 1952, jadi separuh
serah terima itu tetap nyata di sana. Satu fill mainnet sungguhan lebih baik daripada tiga layar
testnet.

### Desktop

- Profil browser baru, tanpa bookmark bar, tanpa extension yang terlihat selain wallet.
- Wallet hanya berisi dana demo. Jangan pernah menampilkan seed phrase, private key, `.env`, atau
  `~/.zsh_history` utuh. Berhenti sejenak sebelum tiap adegan terminal dan cek apa yang ada di atas
  prompt.
- Do Not Disturb menyala. Notifikasi yang masuk frame berarti rekam ulang.
- Terminal dengan font besar, gelap, tanpa username atau hostname di prompt kalau itu membawa
  sesuatu yang pribadi.
- Browser di lebar logis 1440. Console-nya memang padat dan tabelnya butuh ruang.

---

## Shot list dan naskah

**Golden flow, dan tiap perpindahannya klik sungguhan.** Landing, `/assets`, `/idea`, `/trade`,
`/receipts`. Tidak ada yang dikunjungi dua kali, tidak ada cut ke halaman baru, dan video tidak
pernah naik level lagi. Penonton yang harus diberi tahu dia sedang di mana sudah berhenti
mendengarkan argumennya.

`/assets` jadi pintu masuknya, bukan `/idea`, dan itu pilihan produknya sendiri bukan selera:
wordmark dan tombol di top bar dua-duanya menuju ke sana. Itu juga urutan berargumen yang lebih
baik. Papan itu menegakkan dulu pasarnya dan betapa sedikit isinya, lalu tiap klaim sesudahnya
mendarat di atas angka yang sudah dilihat penonton.

**Perpindahan Idea ke Trade adalah serah terima sungguhan, bukan sekadar klik nav.** Setelah run
selesai, `PublishThesis` muncul di bawah hasilnya dengan dua tombol berurutan. **Publish this
thesis** menandatangani dan menaruh hash klaimnya di `ThesisRegistry`. Baru setelah id-nya ada,
**Take it to the trade page** muncul: dia memuat simbol basketnya, mempersenjatai fill dengan hash
itu, lalu `router.push('/trade')`.

Itu bukan navigasi, itu argumennya sendiri berjalan di depan kamera. Klaimnya naik ke chain
**sebelum** ada yang ditandatangani untuk ditukar, dan hash yang dibawanya itulah yang nanti
membuat receipt bisa dicocokkan balik ke penalarannya. Adegan `/receipts` di akhir video menagih
janji yang dibuat di sini.

Dua perpindahan lain lewat nav console, yang berisi Assets, Idea, Receipts, Trade dan muncul di
keempat halaman: landing ke `/assets` lewat tombol di top bar, lalu `/trade` ke `/receipts`. Yang
memang **tidak** ada adalah tautan dari hasil fill ke `/receipts`; fill yang settle menaut ke
explorer. Jadi langkah terakhir itu nav bar, dan jangan menaskahkannya sebagai tombol.

**`/assets/[symbol]` sengaja tidak masuk.** Halaman itu bagus dan membuktikan verdict di papan
memang diukur, tapi masuk ke sana berarti turun satu level lalu naik lagi, satu-satunya gerakan
mundur di seluruh video. Poin ketelitian yang sama dibuat lebih kuat oleh `pnpm evidence` di
adegan 7, jadi dua belas detiknya lebih baik diberikan ke `/trade`, adegan dengan paling banyak
yang harus ditunjukkan dan paling sedikit ruang.

**Harga memulai dari landing, dan cara membayarnya.** Video yang benar-benar berurutan tidak bisa
membuka di frame terkuat proyek ini, yaitu notional yang ditolak. Jadi urutan layarnya tetap
berurutan dan **suaranya** yang memimpin: angkanya diucapkan di sepuluh detik pertama, di atas
hero, dan satu lower third menaruhnya di layar di situ juga. Overlay bukan perpindahan layar, jadi
tidak ada urutan yang dibengkokkan.

**Landing dijatah 46 detik dan tidak lebih sedetik pun.** Ini pembuka, bukan tur. Tiga beat, lalu
klik masuk ke app. Mode gagal setiap video demo yang pernah dibuat adalah menghabiskan menit
pertama menggulir halaman marketing, dan halaman ini punya glide Lenis yang masih bergerak hampir
sedetik setelah tiap wheel, jadi satu pass santai menuruninya sendiri sudah lewat semenit.

Dua kolom di bawah: apa yang dilihat penonton, dan apa yang diucapkan narator. **Naskahnya bahasa
Inggris dan ditulis untuk diucapkan, bukan dibaca.** Sekitar 140 kata semenit, jadi kira-kira 420
kata total. Baca keras sekali sebelum merekam; kalimat yang bikin kamu tersandung itu kalimat yang
harus ditulis ulang, bukan dilatih.

Catatan dalam kurung siku adalah arahan dan tidak pernah diucapkan.

---

### Adegan 1. Landing, dan klaimnya (0:00 sampai 0:20)

**Layar.** `reckonz.xyz` di posisi paling atas, sudah termuat, wall sudah berjalan. Tanpa title
card, tanpa logo sting. Tahan dua detik sebelum kata pertama, lalu gerakkan pointer pelan
menyeberang wall supaya sumurnya membuka di bawahnya dan barisnya mengerem berhenti.

Di 0:06 satu lower third membawa angka penolakan dalam teks, selagi pointer masih di atas wall.

**Narasi.**

> Thirty US stocks are tokenised on X Layer, and they trade as ordinary ERC-20 tokens. Apple,
> Nvidia, Tesla, and twenty seven more.
> Ask this system for two hundred and fifty thousand dollars of them and it will tell you that
> about seventeen hundred fits, and hand the rest back.
> That refusal is the product. Everything after this is how it arrives at the number.

[Pakai angka placed sungguhan dari `pnpm plan 250000` hari itu. Pasti sudah bergeser.]

[Wall adalah benda terkuat di halaman ini dan juga satu-satunya shot yang tidak butuh penjelasan,
jadi biarkan berjalan di bawah kalimatnya alih-alih memotong ke tempat lain untuk berbicara di atas
sesuatu yang lain.]

---

### Adegan 2. Apa yang dilakukannya, dalam satu paragraf (0:20 sampai 0:34)

**Layar.** Scroll masuk ke `Approach`. Paragrafnya datang, stroke-nya menggambar dirinya sendiri di
bawah heading, dan kartunya terbang dari celah di samping prosa lalu mendarat jadi panel. Atur
waktu scroll supaya pendaratan kartunya terjadi di kamera; itu satu-satunya gerakan di halaman ini
yang layak dapat shot sendiri.

**Narasi.**

> You type a thesis in plain language. It gets mapped onto the thirty tokens that actually trade
> here, every leg is sized by walking real pool depth, and whatever the market cannot take is
> refused.
> Your funds never leave your wallet, at any point in this video.

---

### Adegan 3. Empat permukaan, lalu masuk (0:34 sampai 0:46)

**Layar.** Scroll ke `HowItWorks`. Empat kartu, masing-masing memutar dua screenshot asli dengan
jamnya sendiri. Diamkan sekitar delapan detik supaya paling tidak satu kartu terlihat berganti.
Lalu naik ke top bar dan klik masuk ke app. **Jangan cut ke `/assets`. Klik tombolnya dan biarkan
halamannya termuat.**

**Narasi.**

> Four surfaces, in the order you would use them: what the market can take, the sentence you write
> against it, what the chain kept afterwards, and the part that needs your wallet.
> Those are real screens, so let us open the real thing.

[Klik itu sambungan antara pitch dan produk dan harus terlihat. Cut di sini akan meninggalkan
penonton tidak yakin apakah sisa videonya masih situs yang sama.]

---

### Adegan 4. Papannya, dan keruntuhannya (0:46 sampai 1:08)

**Layar.** `/assets` waktu termuat, membawa angka bukan spinner. Tampilan tabel. Lalu geser slider
ukuran melewati anak tangga terukurnya: $25, $1,000, $5,000, $10,000. Biarkan kolom verdict runtuh
dari allowed ke refused sepanjang jalan. Tahan sedetik di anak tangga terakhir, lalu klik **Idea**
di nav.

**Narasi.**

> All thirty markets, with a price we can defend, how risky the overnight gap is, and how much
> each one can actually absorb.
> The slider is not a model. Those are ten measured rungs of real depth. At twenty five dollars
> nearly every market with liquidity is fine. By five thousand, four are. Past ten thousand, one.
> That collapse is the thing nobody else on this chain is measuring, and it is why the whole
> product is built to say no.

---

### Adegan 5. Tesisnya, enam stage, dan klaim yang naik ke chain (1:08 sampai 1:52)

**Layar.** `/idea` termuat dari klik di adegan sebelumnya. Ketik tesisnya dengan tangan, kecepatan
normal. Pakai yang sudah terekam di `observations/showcase.json` supaya run-nya bisa direproduksi:

> Stablecoin settlement volume keeps compounding onchain, so the issuers and the exchanges that
> clear it capture more of the payments margin than the incumbent card networks do.

Tekan run. Enam stage muncul kelabu sebelum berjalan: compile, universe, allocate, triggers,
capacity, guard. Biarkan compile dan universe berjalan real time, percepat bagian tengahnya 4x
dengan badge menyala, lalu mendarat di stage capacity yang terbuka dengan notional yang ditolak di
ukuran display.

Lalu turun ke `PublishThesis` di bawah hasilnya. **Publish this thesis**, tanda tangan di wallet,
tunggu sampai id-nya kembali. Percepat penambangannya dengan badge. Begitu id-nya ada, **Take it to
the trade page** muncul di bawah satu kalimat yang menyebut simbol apa saja yang akan dimuatnya.
Klik tombol itu.

**Sebelum merekam, cek tesisnya belum pernah dipublikasikan.** Hash-nya menutup basket yang
dikompilasi, bukan kalimatnya, jadi tesis showcase kemungkinan besar sudah ada di registry dan
panel akan menjawab *Already published as thesis #N*. Tombol Take it to the trade page tetap muncul
di keadaan itu dan alurnya tetap jalan, tapi publish yang segar adalah frame yang lebih kuat. Kalau
kamu memilih membiarkan keadaan itu, narasikan apa adanya: sebuah klaim hanya bisa dibuat sekali,
dan itu memang intinya.

**Narasi.**

> Now the thesis. No form, no tickers, no allocation, just a sentence.
> The model turns that into a falsifiable claim and into the conditions you said would change your
> mind. Those become triggers a contract enforces, and the ones nothing on chain can measure are
> handed back to you to watch yourself instead of quietly becoming a rule that can never fire.
> Then it sizes against the depth you just saw. Two legs fit. Two hundred and forty eight thousand
> goes back.
> And here is the cost of not doing that. Pushing the whole amount through in one shot would have
> paid about a hundred and fifty three thousand dollars in price impact. The part that fits pays
> under eight.
> Now the claim goes on chain, before anything is traded against it. That is the order that matters.
> Nobody can rewrite what they said they believed once the trade has gone badly.
> And this hands the whole thing to the trade page, carrying that hash.

[Keempat angka dari satu run. Lower third mengulanginya dalam teks, rata kanan, mono.]

---

### Adegan 6. Fill-nya, dan tanda tangannya (1:52 sampai 2:28)

**Layar.** `/trade` termuat dari **Take it to the trade page**, sudah membawa basket tesisnya dan
sudah dipersenjatai dengan hash-nya. Tunjukkan itu dulu, sebentar saja: halaman ini tidak dibuka
kosong. Wallet-nya sudah tersambung dari publish di adegan sebelumnya. Mandate-nya sudah hidup:
satu dolar per trade, dua belas fill per dua puluh empat jam, empat aset yang diizinkan. Lalu kartu fill: quote, verdict guard,
approval Permit2, dialog tanda tangan, transaksinya. Potong waktu tunggu konfirmasi dan beri badge.
Mendarat di receipt-nya dengan tautan explorer, lalu klik **Receipts** di nav.

Dua belas detik yang dibebaskan dari halaman detail aset masuk ke sini. Pakai untuk menahan dialog
tanda tangan lebih lama: jumlah, token, dan masa berlakunya adalah klaim non-custodial yang
sebenarnya, dan itu satu-satunya frame yang membuktikannya.

**Narasi.**

> The mandate is the blast radius, and it lives on chain: a cap per trade, a cap per day, and the
> assets it is allowed to touch.
> The server quotes, checks the guard, and hands back a plan that cannot do anything on its own.
> It only moves when you sign, and what you are signing is narrow: one token, a capped amount,
> twenty minutes.
> No key on our side can move your money, and there is no function anywhere in this system that
> lets the model rebalance you.
> That is a real fill, on X Layer mainnet, and the guard checked it inside the same transaction
> that moved the funds.

---

### Adegan 7. Bukti yang bisa diturunkan ulang siapa saja (2:28 sampai 2:50)

**Layar.** `/receipts` termuat dari klik di adegan sebelumnya, receipt baru di paling atas dengan
hash evidence-nya. Lalu cut ke terminal,
layar penuh, dan jalankan:

```bash
pnpm evidence <hash>
```

Biarkan mencetak. Jangan percepat yang ini. Ini dua puluh detik paling meyakinkan di seluruh video
dan sudah pendek dari sananya.

**Narasi.**

> There is the fill, sitting under the thesis it was made for. That is the hash from two minutes
> ago, and it is what ties the trade back to the reasoning that produced it.
> The receipt also carries a hash of the exact quote, the oracle reading and the guard verdict it
> was decided on. That one goes on chain before anything is signed, and the bundle is archived
> where anyone can fetch it.
> So this is not us showing you a log. This is the bundle being pulled back down and the hash being
> derived again from it, and matching. Losses stay on that page as long as the wins do.

---

### Adegan 8. Penutup (2:50 sampai 3:00)

**Layar.** Tetap di terminal, jalankan `pnpm capacity`, biarkan angka universe-nya mendarat dengan
tanggal hari itu. Lalu satu frame diam: wordmark, `reckonz.xyz`, `@reckonz_xyz`, URL GitHub,
`Built on X Layer`.

**Narasi.**

> One last number, and it is the weakest one we have. The whole xStock universe on X Layer absorbs
> about thirty eight thousand dollars today at half a percent of impact. It was ninety seven
> thousand five days ago.
> We publish it with the date because it is a reading of the pools, not a property of them. Thin,
> moving depth is exactly why this refuses size, and exactly why it never takes custody.

[Ganti kedua angkanya dengan keluaran `pnpm capacity` hari itu dan pembacaan sebelumnya.]

---

## Panduan pengambilan, adegan per adegan

Rekam tiap adegan sebagai take-nya sendiri. Jangan mencoba satu pass menerus. Adegan fill pasti
butuh beberapa percobaan dan kamu tidak mau mengulang landing gara-gara itu.

**Empat perpindahan, dan semuanya direkam di akhir adegan pemiliknya.** Landing ke `/assets` lewat
tombol di top bar, Assets ke Idea lewat nav, Idea ke Trade lewat **Take it to the trade page**,
Trade ke Receipts lewat nav. Merekamnya di akhir adegan asal, bukan di awal adegan tujuan, berarti
rekam ulang adegan berikutnya tidak ikut membuang kliknya. Sisakan setengah detik setelah tiap
perpindahan supaya editor punya bahan untuk memotong ke halaman yang termuat.

**Yang ketiga tidak bisa direkam ulang sendirian.** Take it to the trade page baru ada setelah
tesisnya punya id, dan id itu lahir dari transaksi. Kalau adegan 6 harus diulang, kamu masuk ke
`/trade` lagi lewat nav dan kehilangan status bersenjatanya, atau kamu publish tesis kedua. Jadi
rekam adegan 5 sampai tuntas, lalu berhenti dan cek hasilnya sebelum menyentuh adegan 6.

| Adegan | URL atau perintah | Yang harus dijaga |
|---|---|---|
| 1 | `reckonz.xyz`, paling atas | Gerakkan pointer menyeberang wall pelan-pelan. Barisnya mengerem berhenti di bawahnya dan itulah shot-nya |
| 2 | landing, `Approach` | Atur waktu scroll supaya kartunya mendarat di kamera. Gerakan wheel kecil dan disengaja; Lenis meluncur sekitar sedetik setelah tiap satu |
| 3 | landing, `HowItWorks` | Diamkan sekitar delapan detik supaya satu kartu terlihat berganti. Akhiri dengan klik masuk ke app |
| 4 | `/assets`, tampilan tabel | Geser slider pelan, satu anak tangga per ketukan. Akhiri dengan klik **Idea** |
| 5 | `/idea` | Ketik dengan kecepatan manusia. `/api/run` dibatasi 3 burst dan 6 per menit (D78), jadi jangan memberondong take ulang. Cek dulu tesisnya belum ada di registry. Akhiri dengan **Take it to the trade page** |
| 6 | `/trade` | Health check dulu. Wallet di chain 196. Tampilkan saldo demo, jangan mengaburkan saldo asli. Akhiri dengan klik **Receipts** di nav |
| 7 | `/receipts`, lalu `pnpm evidence <hash>` | Riwayat scroll bersih di atas prompt |
| 8 | `pnpm capacity` | Butuh waktu. Biarkan jalan dan pakai bagian ekornya |

**Tab aktif di nav berpindah di tiap perpindahan,** termasuk yang lewat Take it to the trade page,
karena itu `router.push` biasa. Itu yang membuktikan ini satu app dan bukan empat screenshot, jadi
biarkan nav-nya terlihat di frame; jangan crop ke area kontennya saja.

**Landing direkam paling akhir, atau paling tidak setelah `/idea`.** Adegan 1 mengucapkan angka
penolakan, dan angka itu keluar dari run di adegan 5. Merekam pembukanya duluan berarti merekamnya
melawan angka yang belum kamu ukur.

**Selalu dua take ekstra.** Rekam slider adegan 4 dua kali dan terminal adegan 7 dua kali. Itu dua
shot yang paling mungkin dirusak notifikasi nyasar, dan dua yang paling sulit direproduksi
belakangan karena angka di bawahnya bergerak.

**Satu hal yang akan kamu temui di landing.** Asset wall berjalan pada siklus tetap dan barisnya
berbeda fase satu sama lain, jadi tidak ada dua take hero yang terlihat sama. Itu wajar, dan layak
satu take ekstra untuk memilih framing yang kamu suka, bukan sesuatu yang perlu dilawan.

---

## Panduan pengeditan

### Perkakas

Apa pun yang punya timeline bisa. DaVinci Resolve kalau mau grading gratis dan tool teks yang bagus,
Final Cut kalau sudah terpasang, CapCut hanya untuk cut sosial vertikal. Rekam layar dengan
perekam bawaan OS di 60fps, bukan extension browser, yang akan menjatuhkan frame di tabel-tabel
rapat itu.

### Urutan perakitan

1. **Taruh narasinya dulu.** Rekam suara kedelapan adegan dalam satu duduk, satu file, dengan
   tepukan atau penanda di antara adegan. Potong jadi delapan klip dan tata jaraknya di timeline
   sebelum satu gambar pun turun. Video ini sebuah argumen, dan argumennya hidup di suara.
2. **Turunkan gambarnya di bawahnya.** Gambar tiap adegan dipangkas mengikuti narasi, bukan
   sebaliknya. Kalau shot-nya terlalu pendek, tahan frame terakhirnya, jangan melambatkan seluruh
   klip.
3. **Baru pangkas keheningannya.** Potong tarikan napas ke sekitar 250ms dan jeda antar adegan ke
   sekitar 400ms. Jangan buang semua jeda; angka butuh satu ketukan sesudahnya.

### Aturan memotong

- **Tanpa transisi.** Hard cut sepanjang video. Satu pengecualian: dissolve 6 frame masuk ke frame
  diam penutup, dan itu pun hanya karena hard cut ke kartu statis terbaca seperti crash.
- **Potong di gerakannya**, bukan sesudahnya. Frame tempat slider berhenti itu frame yang ditahan.
- **Jangan pernah memotong di tengah angka yang sedang diucapkan.**
- **Minimal dua detik** untuk frame mana pun yang memuat angka yang diharapkan dibaca penonton.
- Hening di atas layar yang tidak berubah adalah tanda gambarnya harus dipendekkan, bukan tanda
  perlu ditambah musik.

### Zoom dan penekanan

Console-nya padat, jadi kebanyakan angka butuh bantuan.

- Pakai **punch-in**, skala statis sekitar 130% yang ditahan selama durasinya, bukan zoom yang
  bergerak. Merekam di lebar 2560 itulah yang membuat ini tetap tajam di 1080p.
- Punch-in tepat di empat tempat: kolom verdict yang runtuh (adegan 4), baris notional yang ditolak
  (adegan 5), jumlah dan masa berlaku di dialog tanda tangan (adegan 6), dan hash yang cocok
  (adegan 7). Empat punch-in dalam tiga menit. Yang kelima mulai terasa seperti video jualan.
- **Tidak satu pun di landing.** Adegan 1 sampai 3 adalah satu-satunya bentangan video ini yang
  tidak punya angka untuk dibaca, dan itulah yang membuatnya pembuka dan bukan tur. Punch-in di
  sana adalah penekanan atas ketiadaan.
- Tanpa lingkaran penanda, tanpa panah, tanpa drop shadow di callout.

### Teks di layar

Ikuti `docs/09-design.md`, karena video ini akan duduk bersebelahan dengan produknya.

- Monospace untuk tiap angka, tabular figures, rata kanan.
- Lower third berupa panel tipis di atas near black dengan border setipis rambut. Tanpa gradien,
  tanpa glass, tanpa drop shadow.
- Semantik warnanya milik app dan bukan konvensi trading. `signal` untuk allowed, `caution` untuk
  penolakan beserta alasannya dalam kata, dan merah `refuse` hanya kalau run-nya sendiri yang
  rusak. **Penolakan di sini bukan merah.** Kalau satu frame dari run normal isinya merah semua,
  grading-nya yang salah, bukan run-nya.
- Setiap penolakan di layar membawa alasannya. `REJECT PRICE_IMPACT, 90bp against a 50bp limit`,
  bukan `REJECT`.
- Tanpa em-dash di kartu, caption, atau lower third mana pun.

### Badge kecepatan

Tiga ramp, dan hanya tiga: stage tengah dari run (adegan 5), tunggu konfirmasi (adegan 6), dan
jalannya `pnpm capacity` (adegan 8). Masing-masing membawa badge di kanan bawah:
`4x, real time 38s`. Tipografi sama dengan lower third, tanpa kotak, opasitas 60%. Badge muncul
bersama ramp-nya dan pergi bersamanya.

### Suara

- Suara direkam dengan mikrofon sungguhan di ruang yang tidak menggema, bukan mikrofon laptop. Satu
  pass, lalu satu pass kedua khusus kalimat-kalimat yang tersandung.
- High-pass di 80Hz, kompresi ringan, normalisasi ke sekitar -16 LUFS integrated dengan true peak
  di bawah -1dB.
- Tanpa musik di bawah narasi. Kalau pembukanya terasa kosong, bed yang sangat pelan di adegan 1
  dan 2 saja, di-duck 18dB di bawah suara, habis di 0:34.
- Jauhkan suara UI-nya sendiri. Matikan audio sistem selama perekaman.

### Caption

- Burn in, maksimal dua baris, bawah tengah, di atas lower third.
- Caption apa yang benar-benar diucapkan, termasuk tersandung yang kamu pertahankan.
- Ekspor juga `.srt` di sebelahnya, untuk platform yang memintanya.
- Angka sebagai digit di caption, bahkan di tempat narasi mengucapkannya sebagai kata. `$248,298`
  terbaca lebih cepat daripada bentuk ucapannya.

### Ekspor

| Setelan | Nilai |
|---|---|
| Resolusi | 1920x1080 |
| Frame rate | 60fps, mengikuti rekaman |
| Codec | H.264, high profile |
| Bitrate | 16 sampai 20 Mbps VBR, dua pass |
| Audio | AAC 320kbps stereo |
| Warna | Rec.709, tanpa LUT, tanpa grading selain sedikit lift di adegan terminal kalau terbaca gepeng |

Cek hasil ekspornya di ponsel sebelum dipublikasikan. Tabel adalah bagian yang gagal di sana, dan
kalau ada angka yang tidak terbaca di ponsel berarti dia butuh punch-in yang belum dia dapat.

---

## Kalau ada yang rusak di depan kamera

Pasti ada. Posisi rumah kami: sistem sungguhan yang berulah di kamera lebih berharga daripada
sistem yang dipanggungkan dan berkelakuan baik, asalkan kamu mengatakan apa yang terjadi.

| Yang terjadi | Yang dilakukan |
|---|---|
| Guard menolak fill-nya | **Pertahankan.** Rekam ulang narasi adegan itu untuk menyebut apa yang ditolak dan kenapa. Ini produknya sedang bekerja, dan itu adegan yang lebih bagus daripada yang kamu rencanakan |
| Oracle basi dan tidak ada yang bisa dieksekusi | Berhenti. Cek `/api/health`, tunggu publisher, kembali lagi. Jangan merekam fill melawan harga yang sistemnya sendiri tidak mau bela |
| Run mengembalikan leg lebih sedikit dari perkiraan | Pertahankan dan sesuaikan angkanya. Jangan mengulang run sampai basketnya terlihat bagus; itu mengubah pengukuran jadi seleksi |
| Extension wallet menggantung | Reload, sambungkan lagi. Koneksinya memang dirancang selamat dari reload |
| `/api/run` mulai menjawab 429 | Kamu terlalu cepat mengulang take. Tunggu semenit. Limiter-nya per instance dan memang disengaja (D78) |
| Angka di layar berbeda dengan narasi | Rekam ulang kalimatnya, bukan shot-nya. Jangan pernah biarkan keduanya berbeda, itu satu-satunya hal di sini yang bisa dipatahkan juri dalam semenit |

---

## Checklist sebelum publikasi

- [ ] Tiap angka yang diucapkan sama dengan tiap angka di layar sama dengan deskripsi video
- [ ] Semua angka plan berasal dari satu run `pnpm plan 250000`
- [ ] Angka capacity membawa tanggalnya dan pembacaan sebelumnya
- [ ] Tanpa em-dash di mana pun: narasi, caption, lower third, judul, deskripsi
- [ ] Tidak ada key, seed, `.env`, atau alamat privat di frame mana pun. Sisir adegan terminal
      frame demi frame
- [ ] Jumlah test, jumlah receipt dan jumlah kontrak cocok dengan `pnpm check:tests` dan pembacaan
      `count()`
- [ ] Jumlah kontrak disebut sebagai tujuh di mainnet plus tujuh di testnet, jangan pernah empat
      belas di mainnet
- [ ] Caption sudah burned in, `.srt` sudah diekspor
- [ ] Sudah dicek di ponsel
- [ ] Thumbnail-nya frame notional yang ditolak, bukan logo
- [ ] Judulnya menyebut tokenised real world assets
- [ ] Sudah ditaut dari situs, dari deskripsi di `10-submission.md` kalau field-nya mengizinkan
      tautan, dan diposting dari `@reckonz_xyz` sesuai `11-social.md`
- [ ] `05-status.md` diperbarui: item video demo pindah keluar dari "Blocking for a credible demo"

---

## Usulan judul dan deskripsi

Keduanya dipublikasikan, jadi keduanya bahasa Inggris.

**Judul**

> Reckonz: tokenised stocks on X Layer, sized to what the market can actually absorb

**Deskripsi**

> Reckonz turns an investment thesis into on-chain positions in tokenised real world assets, sized
> to what the market can actually absorb, and into the exit rules that close them. The assets are
> xStocks: tokenised US equities trading as ERC-20s on X Layer. Funds never leave your wallet.
>
> In this video: a thesis compiled into a falsifiable claim, a $250,000 request sized down to what
> the pools can take, the guard refusing inside the trade's own transaction, one real fill on X
> Layer mainnet, and an evidence bundle fetched from the archive with its hash re-derived.
>
> Figures measured on [DATE]. Re-run them yourself: `pnpm capacity`, `pnpm plan 250000`.
>
> reckonz.xyz
> github.com/wngstnr-code/reckonz
> @reckonz_xyz
